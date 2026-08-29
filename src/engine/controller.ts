/**
 * Inactivity controller for The Disappearing Draft (plan task T3).
 *
 * The live loop around T2's pure `deriveTimingState`. Architecture is locked
 * by R1 (docs/ultron/research/R1-hidden-tab-throttling.md, Option C):
 *
 * - ONE idempotent `reconcile()` recompute. `visibilitychange` (gated on
 *   `document.visibilityState === 'visible'`, not the event alone), `focus`,
 *   `pageshow` (bfcache restore) and a boundary `setTimeout` fallback all
 *   funnel into it. Handlers are interchangeable triggers with no ordering
 *   assumptions — focus-before-or-after-visibilitychange cannot matter
 *   because state is derived from wall clock, never accumulated.
 * - Every wall-clock anchor is the injected clock (`() => Date.now()` in
 *   production — NEVER `performance.now()` deltas: Chrome can freeze that
 *   counter during page freeze and silently under-count a hidden overstay).
 *   Backwards clock jumps are clamped to a no-op (R1 §7).
 * - Transitions are phase-checked: a transition is emitted only when the
 *   derived phase VALUE changes, and the boundary timer is cleared before
 *   any emission, so a late throttled timer firing after the visibility
 *   handler already deleted is structurally a no-op — `deleted` and
 *   `survived` are terminal and emit exactly once per session.
 * - rAF is the FOREGROUND tick only (browsers pause it while hidden). The
 *   boundary timer exists so fade/delete can still land while hidden in
 *   Chrome's ~1s / 1-per-minute throttling tiers; when the timer never runs
 *   (WebKit suspension, Chrome freeze, Firefox-Android clamp) the return
 *   events are the guarantee. State is a pure function of wall clock, so a
 *   single post-overstay recompute is historically correct.
 * - Zero accumulated ticks: at most ONE boundary timer and ONE frame request
 *   are pending at any instant (asserted in tests), and the timer is only
 *   rescheduled when its wall-clock target actually moves — foreground
 *   frames never churn it.
 *
 * Text-changing input only: `beforeinput` / `input` (typing, paste, cut,
 * drag-drop, autocorrect `insertReplacementText`, IME `insertCompositionText`,
 * undo/redo) and `compositionupdate` stamp `lastInputAt` and reconcile
 * immediately — no frame wait. Navigation keys, clicks and scroll never fire
 * these events, so they are excluded structurally; explicit non-text
 * `inputType`s (rich-text `format*`) are filtered out.
 *
 * Session disarm at 0:00 is not a special case: `deriveTimingState` flips to
 * `survived` at `sessionEndAt` (winning exact ties), and this controller
 * stops the loop and the boundary timer on any terminal phase — no threat
 * transition can fire at or after disarm. R3 seam: `destroy()` fully unwires
 * the editor listeners so T4/T10 can replace the editor node; re-arm after
 * `deleted` belongs to a FRESH controller instance (arm on a destroyed
 * controller throws).
 */

import { deriveTimingState, type TimingConfig, type TimingPhase, type TimingState } from './timing'

// ---------------------------------------------------------------------------
// Text-changing input classification.
// ---------------------------------------------------------------------------

/**
 * Does this `InputEvent.inputType` mutate the editor's text?
 *
 * Absent/empty inputTypes count as text-changing (legacy engines: the
 * `beforeinput`/`input` event itself implies a value mutation). Every
 * mutation type in the Input Events spec and its engine extensions starts
 * with `insert` / `delete` / `history` (undo/redo changes text); `format*`
 * types (rich-text formatting — never fired by a textarea) do not change
 * text and are excluded. The failure asymmetry is deliberate: a missed
 * classification would delete text out from under active writing
 * (catastrophic), while an overly generous one merely grants a moment of
 * leniency.
 */
export function isTextChangingInputType(inputType: string | undefined): boolean {
  if (inputType === undefined || inputType === '') return true
  return (
    inputType.startsWith('insert') ||
    inputType.startsWith('delete') ||
    inputType.startsWith('history')
  )
}

// ---------------------------------------------------------------------------
// Injectable seams — every dependency is constructor-injected for tests.
// ---------------------------------------------------------------------------

/** rAF seam: the foreground tick. */
export interface FrameScheduler {
  request(callback: () => void): unknown
  cancel(handle: unknown): void
}

/** setTimeout seam: the boundary fallback timer. */
export interface TimerScheduler {
  schedule(callback: () => void, delayMs: number): unknown
  cancel(handle: unknown): void
}

export interface ControllerDeps {
  /** The editor whose text-changing input disarms the threat (a textarea). */
  editor: HTMLTextAreaElement
  window: Window
  document: Document
  /** Wall-clock source; production default is `() => Date.now()` (R1). */
  clock?: () => number
  frame?: FrameScheduler
  timer?: TimerScheduler
}

export type Unsubscribe = () => void

export interface InactivityController {
  /**
   * Start (or restart) a session. Validates the config (RangeError like
   * timing.ts), resets both threat triggers to the arm instant, starts the
   * foreground loop and emits the `armed` transition synchronously.
   */
  arm(config: TimingConfig, sessionEndAt: number): void
  /** Latest derived state; null before the first successful `arm()`. */
  getState(): TimingState | null
  /** Wall-clock ms of the last text-changing input; null while unarmed. */
  getLastInputAt(): number | null
  /**
   * Every state recompute (frame tick, input, return-event, boundary timer).
   * T9's per-frame opacity source — fires immediately on input, never waits
   * for a frame.
   */
  onState(listener: (state: TimingState) => void): Unsubscribe
  /**
   * Phase CHANGES only — the exactly-once guarantee for the `deleted` and
   * `survived` beats (T4 permanence, T5 routing, T10 boards).
   */
  onTransition(listener: (state: TimingState) => void): Unsubscribe
  /**
   * Full teardown (R3 seam): unwires every listener on the editor, document
   * and window, stops the loop and the boundary timer. The editor node can
   * then be replaced; `arm` on a destroyed controller throws.
   */
  destroy(): void
  isDestroyed(): boolean
}

class Controller implements InactivityController {
  private readonly editor: HTMLTextAreaElement
  private readonly win: Window
  private readonly doc: Document
  private readonly clock: () => number
  private readonly frame: FrameScheduler
  private readonly timer: TimerScheduler

  private fadeDelayMs = 0
  private deleteThresholdMs = 0
  private sessionEndAt: number | null = null
  private lastInputAt = 0
  private phase: TimingPhase | null = null
  private lastState: TimingState | null = null

  private looping = false
  private frameHandle: unknown = null
  private timerHandle: unknown = null
  private timerTarget: number | null = null
  private destroyed = false

  private readonly stateListeners = new Set<(state: TimingState) => void>()
  private readonly transitionListeners = new Set<(state: TimingState) => void>()

  // -- event handlers (stable refs so removeEventListener unwires exactly these) --

  private readonly onBeforeInput = (event: Event): void => {
    // beforeinput precedes a value mutation by definition; filter only
    // explicit non-text inputTypes (format*).
    if (!isTextChangingInputType((event as InputEvent).inputType)) return
    this.registerInput()
  }

  private readonly onInput = (event: Event): void => {
    // `input` fires only on actual value mutation, so an absent inputType
    // (legacy engines) still counts; explicit non-text types do not.
    const inputType = (event as InputEvent).inputType
    if (inputType !== undefined && !isTextChangingInputType(inputType)) return
    this.registerInput()
  }

  private readonly onCompositionUpdate = (): void => {
    // IME composition — text is changing under the user's hands, so it must
    // disarm the threat even on engines that under-report input events here.
    this.registerInput()
  }

  private readonly onVisibilityChange = (): void => {
    // Gate on state, not the event (R1 §5.2): iOS can fire stale changes.
    if (this.doc.visibilityState === 'visible') this.reconcile()
  }

  /**
   * The ONE idempotent recompute (R1 Option C). Focus and pageshow listeners
   * pass this directly; visibilitychange and the boundary timer funnel here
   * too. Re-entrant safe: derived state cannot regress, terminal phases
   * absorb every later trigger.
   */
  private readonly reconcile = (): void => {
    if (this.destroyed || this.sessionEndAt === null) return
    const now = this.clock()
    if (now < this.lastInputAt) return // backwards clock jump → no-op (R1 §7)
    const endAt = this.sessionEndAt
    const state = deriveTimingState(now, this.lastInputAt, this.fadeDelayMs, this.deleteThresholdMs, endAt)
    this.lastState = state

    const terminal = state.phase === 'deleted' || state.phase === 'survived'
    if (terminal) {
      this.stopLoop()
      this.clearBoundaryTimer()
    }

    if (state.phase !== this.phase) {
      this.phase = state.phase
      if (!terminal) this.clearBoundaryTimer() // R1 §5.5: clearTimeout precedes emission
      for (const listener of [...this.transitionListeners]) listener(state)
    }

    if (!terminal) {
      // Next wall-clock boundary; all candidates are strictly future in the
      // armed/fading phases (T2 invariants), so the delay is always > 0 and
      // a fired timer can never reschedule itself at the same target.
      const candidates =
        state.phase === 'armed'
          ? [this.lastInputAt + this.fadeDelayMs, this.lastInputAt + this.deleteThresholdMs, endAt]
          : [this.lastInputAt + this.deleteThresholdMs, endAt]
      this.scheduleBoundaryAt(Math.min(...candidates), now)
    }

    for (const listener of [...this.stateListeners]) listener(state)
  }

  private readonly tick = (): void => {
    if (this.destroyed || !this.looping) return
    // Foreground tick only: reconcile before painting while visible. While
    // hidden the browser pauses rAF delivery entirely; the boundary timer
    // plus the return events carry the reconciliation. Scheduling continues
    // either way (R1 §5.3) — the browser simply holds the next frame until
    // the page is visible again.
    if (this.doc.visibilityState === 'visible') this.reconcile()
    if (this.looping && !this.destroyed) this.frameHandle = this.frame.request(this.tick)
  }

  constructor(deps: ControllerDeps) {
    this.editor = deps.editor
    this.win = deps.window
    this.doc = deps.document
    this.clock = deps.clock ?? (() => Date.now())
    this.frame =
      deps.frame ??
      {
        request: (callback) => this.win.requestAnimationFrame(callback),
        cancel: (handle) => this.win.cancelAnimationFrame(handle as number),
      }
    this.timer =
      deps.timer ??
      {
        schedule: (callback, delayMs) => this.win.setTimeout(callback, delayMs),
        cancel: (handle) => this.win.clearTimeout(handle as number),
      }

    this.editor.addEventListener('beforeinput', this.onBeforeInput)
    this.editor.addEventListener('input', this.onInput)
    this.editor.addEventListener('compositionupdate', this.onCompositionUpdate)
    this.doc.addEventListener('visibilitychange', this.onVisibilityChange)
    this.win.addEventListener('focus', this.reconcile)
    this.win.addEventListener('pageshow', this.reconcile)
  }

  arm(config: TimingConfig, sessionEndAt: number): void {
    if (this.destroyed) {
      throw new Error('controller is destroyed — create a fresh instance (R3 re-arm seam)')
    }
    if (!Number.isFinite(sessionEndAt)) {
      throw new RangeError(`sessionEndAt must be finite epoch ms, got ${sessionEndAt}`)
    }
    const now = this.clock()
    // Dry run: validates the config (RangeError) before any state mutates,
    // so a failed arm cannot leave a half-armed session behind.
    deriveTimingState(now, now, config.fadeDelayMs, config.deleteThresholdMs, sessionEndAt)

    this.fadeDelayMs = config.fadeDelayMs
    this.deleteThresholdMs = config.deleteThresholdMs
    this.sessionEndAt = sessionEndAt
    this.lastInputAt = now
    this.phase = null // fresh session: transitions emit from scratch, terminal states reset
    this.lastState = null
    this.stopLoop()
    this.clearBoundaryTimer()
    this.startLoop()
    this.reconcile()
  }

  getState(): TimingState | null {
    return this.lastState
  }

  getLastInputAt(): number | null {
    return this.sessionEndAt === null ? null : this.lastInputAt
  }

  onState(listener: (state: TimingState) => void): Unsubscribe {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  onTransition(listener: (state: TimingState) => void): Unsubscribe {
    this.transitionListeners.add(listener)
    return () => {
      this.transitionListeners.delete(listener)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.editor.removeEventListener('beforeinput', this.onBeforeInput)
    this.editor.removeEventListener('input', this.onInput)
    this.editor.removeEventListener('compositionupdate', this.onCompositionUpdate)
    this.doc.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.win.removeEventListener('focus', this.reconcile)
    this.win.removeEventListener('pageshow', this.reconcile)
    this.stopLoop()
    this.clearBoundaryTimer()
    this.sessionEndAt = null
    this.lastState = null
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  // -- internals --------------------------------------------------------------

  private registerInput(): void {
    if (this.destroyed || this.sessionEndAt === null) return
    const now = this.clock()
    if (now < this.lastInputAt) return // never move the anchor backwards
    this.lastInputAt = now
    this.reconcile() // instant reset of both triggers — no frame wait
  }

  private startLoop(): void {
    if (this.looping || this.destroyed) return
    this.looping = true
    this.frameHandle = this.frame.request(this.tick)
  }

  private stopLoop(): void {
    if (this.frameHandle !== null) this.frame.cancel(this.frameHandle)
    this.frameHandle = null
    this.looping = false
  }

  private clearBoundaryTimer(): void {
    if (this.timerHandle !== null) this.timer.cancel(this.timerHandle)
    this.timerHandle = null
    this.timerTarget = null
  }

  private scheduleBoundaryAt(target: number, now: number): void {
    // Same wall-clock boundary → the pending timer already covers it. This
    // is what keeps foreground frames from churning the fallback timer.
    if (this.timerTarget === target) return
    this.clearBoundaryTimer()
    this.timerTarget = target
    this.timerHandle = this.timer.schedule(() => {
      this.timerHandle = null
      this.timerTarget = null
      // Derive from the CURRENT wall clock: a late (throttled) wake-up
      // self-corrects, and the phase check absorbs anything already applied.
      this.reconcile()
    }, Math.max(0, target - now))
  }
}

export function createInactivityController(deps: ControllerDeps): InactivityController {
  return new Controller(deps)
}
