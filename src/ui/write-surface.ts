/**
 * Write surface for The Disappearing Draft (plan task T9) — the product's
 * heart: the presiding split-flap countdown and the dying text.
 *
 * Design authority: docs/ultron/design-brief.md §3 + §6 (focal moment = the
 * fade: text paling under an amber hairline band while seconds tick; the
 * countdown presides top-center at large scale; single-column console; the
 * fixed charcoal ground never repaints — threat rides as one overlay) and the
 * brief's raised lines (amber-before-red lamps; warning color confined to a
 * hairline edge band while the field stays achromatic; glow/flap motion as
 * capability layers off under reduced motion; tabular numerals, zero layout
 * shift). Faces per R4: the board in B612 Mono (equal-advance digits by
 * construction — the per-digit fixed-width slots are belt-and-braces), the
 * draft in Source Sans 3. Styling lives in src/styles/write.css over the T8
 * tokens; this module owns structure + behavior only.
 *
 * SPLIT-FLAP TECHNIQUE (R2, committed — docs/ultron/research/R2-…, option a):
 * per-digit fixed-width slots, each carrying four glyph surfaces — two static
 * halves and two rotating leaves. On a digit change the top leaf (showing the
 * OLD glyph's top half) rotates rotateX(0 → −90deg) falling away while the
 * bottom leaf (already loaded with the NEW glyph's bottom half) rotates
 * rotateX(90 → 0deg) rising into place; the static top half is loaded with
 * the NEW glyph at flip start (revealed as the old top falls) and the static
 * bottom half is swapped at flip completion. Transitions are transform-only
 * (compositor-side, `--dur-flap`/`--ease-flap`); TS adds/removes the
 * `data-flipping`/`data-reset` attributes and swaps glyphs at the flip
 * boundary, exactly the committed division of labor. Ticks are never
 * self-scheduled: every recompute of the T3 controller (rAF frame, input,
 * return-event, boundary timer) arrives on `update()` and the board diffs
 * the formatted `MM:SS` string — wall-clock-driven by construction (R2 risk
 * R5), flips only the digits that changed.
 *
 * ACCESSIBILITY PAIRING (R2): the board wrapper is `role="timer"` (implicit
 * `aria-live: off` — no per-second announcement spam) with `aria-label` +
 * `aria-atomic="true"`; one visually-hidden text node inside it carries the
 * full time per tick; every visible flap/glyph node is `aria-hidden`. At the
 * final-minute and final-10-second milestones the wrapper is TEMPORARILY
 * promoted to `role="alert"` for ~1 s (MDN's egg-timer pattern) so the moment
 * is announced; `aria-live` is never combined with it (VoiceOver iOS
 * double-speaking). A separate empty polite live region (`data-fade-announcement`)
 * exists from mount — R2 requires the region exist before content changes.
 * T12 owns its content: the armed→fading transition writes the fade-start
 * announcement ONCE per fade onset and the fading→armed restore clears it —
 * an empty region guarantees the next fade onset is a real content change
 * (live regions announce changes, not repeated identical text; the
 * timing-fragile clear-and-reinject dance is avoided by clearing only on
 * restore, when there is nothing to announce).
 *
 * REDUCED MOTION (brief §3, settled): no flap animation, no animated
 * opacity, no glow — the board updates by static per-digit swap (the same
 * path as the `@supports not (transform-style: preserve-3d)` fallback), the
 * engine's per-frame opacity is NEVER applied to the editor, and a static
 * amber caution placard + numeric inactivity countdown (T2 `deletesInMs`)
 * replace the fade as the threat signal. Lamp colors are state, not motion:
 * they switch in both modes. The reduced/full decision is read once, from
 * T8's `--motion-level` token via getComputedStyle (the committed JS seam).
 *
 * R3 SEAM: the surface exposes `destroy()` (cancels every pending flip /
 * milestone timer — the router calls it in `teardownSession` BEFORE dropping
 * the editor reference) and is mounted fresh per session by the router's
 * `startSession`; the editor is a plain `<textarea>` NEVER wrapped in a
 * `<form>` (tests assert both).
 */

import type { TimerScheduler } from '../engine/controller'
import type { TimingPhase, TimingState } from '../engine/timing'

// ---------------------------------------------------------------------------
// Public types + pure formatters.
// ---------------------------------------------------------------------------

export interface WriteSurfaceDeps {
  doc: Document
  /** Total session length ms — fixes the board's minute-slot count (zero layout shift). */
  totalSessionMs: number
  /** setTimeout seam (flip completion + milestone alert revert); default window.setTimeout. */
  timer?: TimerScheduler
  /**
   * Motion capability probe: 'reduced' selects the static path. Default reads
   * T8's `--motion-level` token from the document element's computed style.
   */
  motionPreference?: () => 'full' | 'reduced'
  /** 3D capability probe for the flap technique (R2); default CSS.supports. */
  supports3d?: () => boolean
}

export interface WriteSurface {
  /** The `<section data-phase="write">` element (the router swaps it into the mount). */
  getElement(): HTMLElement
  /** The editor textarea — the controller binds its input listeners to this node. */
  getEditor(): HTMLTextAreaElement
  /** Project one controller recompute (every onState emission — per frame while fading). */
  update(state: TimingState): void
  /** Cancel pending flip/milestone timers (call before dropping references). Idempotent. */
  destroy(): void
}

/**
 * Countdown readout formatting: ceil-to-next-second `M:SS` ("5:00" → "0:00").
 * The authoritative SR text and the reduced-motion inactivity countdown both
 * use it; negative inputs clamp to 0:00.
 */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Board formatting: zero-padded `MM:SS` with the minute field padded to the
 * session's fixed slot width (`minuteDigits`, decided once at mount from the
 * session length) — the slot count can never change mid-session, which is
 * what makes the flap board zero-layout-shift by construction.
 */
export function formatBoardClock(ms: number, minuteDigits: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = String(Math.floor(seconds / 60)).padStart(minuteDigits, '0')
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** Status line copy per phase — the console's voice, one small placard line. */
function statusLine(phase: TimingPhase): string {
  switch (phase) {
    case 'pre-arm':
      return 'PRE-ARM'
    case 'armed':
      return 'THREAT ARMED — keep typing'
    case 'fading':
      return 'FADING — type to restore'
    case 'deleted':
      return 'DELETED'
    case 'survived':
      return 'DISARMED'
  }
}

/** Milestone announcements (R2): fired once, at the final minute and final 10 s. */
const MILESTONE_FINAL_MINUTE = 'One minute remaining.'
const MILESTONE_FINAL_TEN = 'Ten seconds remaining.'

/**
 * T12 fade-start announcement (polite, once per fade onset) — the fade is
 * invisible to assistive technology, so the moment the threat begins is
 * spoken in the room's voice instead.
 */
export const FADE_START_ANNOUNCEMENT =
  'Signal fading — the draft is starting to pale. Keep typing to restore it.'
/** Seconds-of-remaining thresholds that trigger a milestone announcement. */
const MILESTONE_MINUTE_SECONDS = 60
const MILESTONE_TEN_SECONDS = 10

/**
 * JS twin of the CSS `--dur-flap` token (300 ms) — the flip-completion timer.
 * Kept as a named constant so the coupling to tokens.css is explicit.
 * Exported for the setup console's duration board (R1), which reuses the same
 * flip sequence on the same write.css classes.
 */
export const FLIP_SETTLE_MS = 300
/** How long the timer wrapper stays promoted to role="alert" (R2: ~1 s). */
const MILESTONE_ALERT_MS = 1_000

// ---------------------------------------------------------------------------
// One flap digit slot.
// ---------------------------------------------------------------------------

interface DigitSlot {
  slot: HTMLElement
  staticTop: HTMLElement
  staticBottom: HTMLElement
  leafTop: HTMLElement
  leafBottom: HTMLElement
  /** The settled, displayed digit. */
  displayed: string
  /** Target of an in-flight flip (null when idle). */
  settling: string | null
  settleTimer: unknown | null
}

// ---------------------------------------------------------------------------
// The surface.
// ---------------------------------------------------------------------------

class Surface implements WriteSurface {
  private readonly section: HTMLElement
  private readonly editor: HTMLTextAreaElement
  private readonly timer: TimerScheduler

  private readonly boardTime: HTMLElement // role="timer" wrapper (data-countdown)
  private readonly srTime: HTMLElement // visually-hidden per-tick text (data-countdown-text)
  private readonly liveLamp: HTMLElement
  private readonly fadeLamp: HTMLElement
  private readonly status: HTMLElement
  private readonly inactivityCountdown: HTMLElement
  private readonly fadeAnnouncement: HTMLElement // T12 polite region (data-fade-announcement)

  private readonly slots: DigitSlot[]
  private readonly minuteDigits: number
  private readonly flapMode: boolean

  private lastBoardText: string
  private lastTimeText: string
  private prevSeconds: number | null = null
  /** Phase of the previous update — drives the once-per-fade-onset announcement. */
  private prevPhase: TimingPhase = 'armed'
  private minuteFired = false
  private tenFired = false
  private announcing = false
  private announceTimer: unknown | null = null
  private destroyed = false

  constructor(deps: WriteSurfaceDeps) {
    const doc = deps.doc
    const win = doc.defaultView
    this.timer =
      deps.timer ??
      {
        schedule: (callback, delayMs) => win?.setTimeout(callback, delayMs),
        cancel: (handle) => win?.clearTimeout(handle as number),
      }

    const motion: 'full' | 'reduced' =
      deps.motionPreference?.() ?? defaultMotionPreference(doc)
    const supports3d: boolean = deps.supports3d?.() ?? defaultSupports3d()
    // Flap capability needs BOTH gates (R2 + brief): no-preference motion AND
    // preserve-3d. Either failing → static per-digit swap, same SR pattern.
    this.flapMode = motion === 'full' && supports3d

    this.minuteDigits = Math.max(2, String(Math.floor(deps.totalSessionMs / 60_000)).length)
    this.lastBoardText = formatBoardClock(deps.totalSessionMs, this.minuteDigits)
    this.lastTimeText = formatClock(deps.totalSessionMs)

    // -- section shell ------------------------------------------------------------

    this.section = doc.createElement('section')
    this.section.dataset.phase = 'write'
    this.section.className = 'write'
    this.section.dataset.threat = 'armed' // first paint matches the armed state

    // T12: every phase carries exactly one h1 (the console is an SPA — each
    // screen IS the page). Visually hidden; the board presides visually.
    const heading = doc.createElement('h1')
    heading.className = 'vh'
    heading.dataset.phaseHeading = ''
    heading.textContent = 'Writing session'

    // -- the presiding flap board (top-center) --------------------------------------

    const head = doc.createElement('header')
    head.className = 'write-board'

    const board = doc.createElement('div')
    board.className = 'flap-board'
    board.setAttribute('role', 'timer')
    board.setAttribute('aria-label', 'Time remaining in session')
    board.setAttribute('aria-atomic', 'true')
    board.dataset.countdown = ''

    const glyphs = doc.createElement('span')
    glyphs.className = 'flap-glyphs'
    glyphs.setAttribute('aria-hidden', 'true') // every visible board node is decorative duplication

    const prefix = doc.createElement('span')
    prefix.className = 'flap-prefix'
    prefix.textContent = 'T–'
    glyphs.append(prefix)

    this.slots = []
    // Walk the full board string (digits AND the fixed colon cell) so the
    // slot/colon layout is built in display order.
    for (const char of this.lastBoardText) {
      if (char === ':') {
        const colon = doc.createElement('span')
        colon.className = 'flap-colon'
        colon.textContent = ':'
        glyphs.append(colon)
        continue
      }
      glyphs.append(this.createSlot(doc, char))
    }

    const srTime = doc.createElement('span')
    srTime.className = 'vh'
    srTime.dataset.countdownText = ''
    srTime.textContent = this.lastTimeText
    board.append(glyphs, srTime)
    this.boardTime = board
    this.srTime = srTime

    // -- lamps + status strip under the board -----------------------------------------

    const strip = doc.createElement('p')
    strip.className = 'write-statusline'

    const liveLamp = doc.createElement('span')
    liveLamp.className = 'lamp'
    liveLamp.dataset.lamp = 'live'
    liveLamp.setAttribute('aria-hidden', 'true') // the status text carries the state for SR
    const liveDome = doc.createElement('span')
    liveDome.className = 'lamp-dome'
    const liveName = doc.createElement('span')
    liveName.className = 'lamp-name'
    liveName.textContent = 'LIVE'
    liveLamp.append(liveDome, liveName)
    liveLamp.dataset.lit = '' // armed at mount

    const status = doc.createElement('span')
    status.className = 'write-status'
    status.dataset.status = ''
    status.textContent = statusLine('armed')

    const fadeLamp = doc.createElement('span')
    fadeLamp.className = 'lamp'
    fadeLamp.dataset.lamp = 'fade'
    fadeLamp.setAttribute('aria-hidden', 'true')
    const fadeDome = doc.createElement('span')
    fadeDome.className = 'lamp-dome'
    const fadeName = doc.createElement('span')
    fadeName.className = 'lamp-name'
    fadeName.textContent = 'FADE'
    fadeLamp.append(fadeDome, fadeName)

    strip.append(liveLamp, status, fadeLamp)
    this.liveLamp = liveLamp
    this.fadeLamp = fadeLamp
    this.status = status

    head.append(board, strip)

    // -- reduced-motion caution placard (display-gated by CSS, reduce-only) ------------

    const caution = doc.createElement('div')
    caution.className = 'write-caution'
    caution.dataset.reducedBanner = ''
    const cautionTitle = doc.createElement('p')
    cautionTitle.className = 'write-caution-title'
    cautionTitle.textContent = 'SIGNAL FADING — KEEP TYPING'
    const cautionCount = doc.createElement('p')
    cautionCount.className = 'write-caution-count'
    const cautionLabel = doc.createElement('span')
    cautionLabel.className = 'write-caution-label'
    cautionLabel.textContent = 'DELETION IN'
    const cautionNumber = doc.createElement('span')
    cautionNumber.className = 'write-caution-number'
    cautionNumber.dataset.inactivityCountdown = ''
    // No ' ' between label and number: .write-caution-count is an inline-flex
    // whose gap separates them — a whitespace-only flex child is never
    // rendered (orphan node removed, refinement R4).
    cautionCount.append(cautionLabel, cautionNumber)
    caution.append(cautionTitle, cautionCount)
    this.inactivityCountdown = cautionNumber

    // -- the text column (the editor owns the viewport's middle) ------------------------

    const column = doc.createElement('div')
    column.className = 'write-column'
    const editor = doc.createElement('textarea')
    editor.className = 'write-editor'
    editor.dataset.editor = ''
    editor.rows = 10
    editor.cols = 72
    editor.placeholder = 'Keep typing. The clock does not wait.'
    editor.setAttribute('aria-label', 'Draft')
    column.append(editor)
    this.editor = editor

    // -- fade-announcement region (exists EMPTY from mount; T12 fills it once
    //    per fade onset and clears it on restore — see update()) ---------------

    const fadeAnnouncement = doc.createElement('p')
    fadeAnnouncement.className = 'vh'
    fadeAnnouncement.dataset.fadeAnnouncement = ''
    fadeAnnouncement.setAttribute('aria-live', 'polite')
    this.fadeAnnouncement = fadeAnnouncement

    this.section.append(heading, head, caution, column, fadeAnnouncement)
  }

  // -- public API ---------------------------------------------------------------

  getElement(): HTMLElement {
    return this.section
  }

  getEditor(): HTMLTextAreaElement {
    return this.editor
  }

  update(state: TimingState): void {
    if (this.destroyed) return

    // Threat state: one attribute drives lamps, band, and status color (CSS).
    this.section.dataset.threat = state.phase
    setLit(this.liveLamp, state.phase === 'armed')
    setLit(this.fadeLamp, state.phase === 'fading')
    this.status.textContent = statusLine(state.phase)

    // T12 fade announcement: the armed→fading transition is the one moment
    // the threat begins — announce it once; the restore transition clears the
    // region so the NEXT fade onset is a real content change (see docstring).
    if (state.phase !== this.prevPhase) {
      if (this.prevPhase === 'armed' && state.phase === 'fading') {
        this.fadeAnnouncement.textContent = FADE_START_ANNOUNCEMENT
      } else if (state.phase === 'armed') {
        this.fadeAnnouncement.textContent = ''
      }
      this.prevPhase = state.phase
    }

    // Session clock: board diff (flips only changed digits) + SR text per tick.
    this.lastTimeText = formatClock(state.remainingMs)
    const boardText = formatBoardClock(state.remainingMs, this.minuteDigits)
    if (boardText !== this.lastBoardText) {
      this.lastBoardText = boardText
      this.setBoardTime(boardText)
    }
    // While the milestone alert owns the region, per-tick text is suppressed
    // (a second content change mid-alert would re-announce / spam).
    if (!this.announcing) this.srTime.textContent = this.lastTimeText

    if (state.phase === 'armed' || state.phase === 'fading') {
      this.checkMilestone(state.remainingMs)
    }

    // The fade: rAF-driven opacity straight from the engine's per-frame
    // output — full-motion capability ONLY (reduced motion never animates it;
    // the caution placard + numeric countdown carry the threat instead).
    if (this.flapMode) this.editor.style.opacity = String(state.opacity)

    // Numeric inactivity countdown (reduced-motion instrument; T2 deletesInMs).
    // Updated in both modes — it is CSS-hidden unless reduce+fading.
    this.inactivityCountdown.textContent = formatClock(state.deletesInMs)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const slot of this.slots) {
      if (slot.settleTimer !== null) this.timer.cancel(slot.settleTimer)
      slot.settleTimer = null
    }
    if (this.announceTimer !== null) this.timer.cancel(this.announceTimer)
    this.announceTimer = null
    this.announcing = false
  }

  // -- board ----------------------------------------------------------------------

  private createSlot(doc: Document, initial: string): HTMLElement {
    const slot = doc.createElement('span')
    slot.className = 'flap-slot'
    slot.dataset.digitSlot = ''

    const makeHalf = (variant: string, hook: string): { shell: HTMLElement; glyph: HTMLElement } => {
      const shell = doc.createElement('span')
      shell.className = `flap-half flap-half-${variant}`
      const glyph = doc.createElement('span')
      glyph.className = 'flap-glyph'
      glyph.dataset.glyph = hook
      glyph.textContent = initial
      shell.append(glyph)
      return { shell, glyph }
    }
    const makeLeaf = (variant: string, hook: string): { shell: HTMLElement; glyph: HTMLElement } => {
      const shell = doc.createElement('span')
      shell.className = `flap-leaf flap-leaf-${variant}`
      const glyph = doc.createElement('span')
      glyph.className = 'flap-glyph'
      glyph.dataset.glyph = hook
      glyph.textContent = initial
      shell.append(glyph)
      return { shell, glyph }
    }

    const staticTop = makeHalf('top', 'static-top')
    const staticBottom = makeHalf('bottom', 'static-bottom')
    const leafTop = makeLeaf('top', 'leaf-top')
    const leafBottom = makeLeaf('bottom', 'leaf-bottom')
    slot.append(staticTop.shell, staticBottom.shell, leafTop.shell, leafBottom.shell)

    this.slots.push({
      slot,
      staticTop: staticTop.glyph,
      staticBottom: staticBottom.glyph,
      leafTop: leafTop.glyph,
      leafBottom: leafBottom.glyph,
      displayed: initial,
      settling: null,
      settleTimer: null,
    })
    return slot
  }

  /** Diff a new `MM:SS` board string and flip/settle exactly the changed digits. */
  private setBoardTime(boardText: string): void {
    const digits = boardDigits(boardText)
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      const next = digits[i]
      if (slot === undefined || next === undefined) continue
      if (this.flapMode) this.flipTo(slot, next)
      else this.setStatically(slot, next)
    }
  }

  /**
   * The committed flip sequence (R2 geometry): static-top + leaf-bottom load
   * the NEW glyph, the top leaf falls (0 → −90deg) while the bottom leaf
   * rises (90 → 0deg), and completion settles static-bottom + leaf-top.
   * A flip interrupted by a newer digit completes the old one instantly first.
   */
  private flipTo(slot: DigitSlot, next: string): void {
    if (slot.settling !== null) this.finishFlip(slot) // interrupted: settle instantly
    if (slot.displayed === next) return
    slot.settling = next
    slot.staticTop.textContent = next // revealed as the old top leaf falls
    slot.leafBottom.textContent = next // rises into view over the old bottom
    slot.slot.removeAttribute('data-reset') // re-enable the transform transition
    slot.slot.dataset.flipping = ''
    slot.settleTimer = this.timer.schedule(() => {
      slot.settleTimer = null
      this.finishFlip(slot)
    }, FLIP_SETTLE_MS)
  }

  private finishFlip(slot: DigitSlot): void {
    if (slot.settleTimer !== null) {
      this.timer.cancel(slot.settleTimer)
      slot.settleTimer = null
    }
    if (slot.settling === null) return
    slot.displayed = slot.settling
    slot.settling = null
    slot.staticBottom.textContent = slot.displayed
    slot.leafTop.textContent = slot.displayed
    slot.slot.dataset.reset = '' // transition:none while the leaves snap home
    delete slot.slot.dataset.flipping
  }

  /** Static per-digit swap — the @supports fallback and the reduced-motion path. */
  private setStatically(slot: DigitSlot, next: string): void {
    if (slot.settling !== null) this.finishFlip(slot) // defensive; static mode never flips
    if (slot.displayed === next) return
    slot.displayed = next
    slot.staticTop.textContent = next
    slot.staticBottom.textContent = next
    slot.leafTop.textContent = next // visible top surface when leaves render
  }

  // -- milestones -------------------------------------------------------------------

  private checkMilestone(remainingMs: number): void {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
    if (this.prevSeconds !== null) {
      // The NEARER milestone wins a single recompute that jumps past both
      // (e.g. a hidden-tab return): ten seconds is checked first.
      if (!this.tenFired && this.prevSeconds > MILESTONE_TEN_SECONDS && seconds <= MILESTONE_TEN_SECONDS) {
        this.tenFired = true
        this.announce(MILESTONE_FINAL_TEN)
      } else if (!this.minuteFired && this.prevSeconds > MILESTONE_MINUTE_SECONDS && seconds <= MILESTONE_MINUTE_SECONDS) {
        this.minuteFired = true
        this.announce(MILESTONE_FINAL_MINUTE)
      }
    }
    this.prevSeconds = seconds
  }

  /**
   * MDN egg-timer promotion (R2): the timer wrapper becomes `role="alert"`
   * for ~1 s so the milestone is announced despite the timer role's implicit
   * aria-live: off. No aria-live attribute is ever combined with the alert.
   */
  private announce(message: string): void {
    this.announcing = true
    this.boardTime.setAttribute('role', 'alert')
    this.srTime.textContent = message
    if (this.announceTimer !== null) this.timer.cancel(this.announceTimer)
    this.announceTimer = this.timer.schedule(() => {
      this.announceTimer = null
      this.announcing = false
      this.boardTime.setAttribute('role', 'timer')
      this.srTime.textContent = this.lastTimeText
    }, MILESTONE_ALERT_MS)
  }
}

/** Digits of a board string in slot order (the colon is a fixed non-flapping cell). */
function boardDigits(boardText: string): string[] {
  return [...boardText].filter((char) => char !== ':')
}

function setLit(lamp: HTMLElement, lit: boolean): void {
  if (lit) lamp.dataset.lit = ''
  else delete lamp.dataset.lit
}

// ---------------------------------------------------------------------------
// Capability probes — injectable, with the committed production defaults.
// ---------------------------------------------------------------------------

/** T8's committed JS seam: the `--motion-level` token flips under reduce.
 *  Exported for the setup console's duration board (R1), which applies the
 *  same capability gates before flipping digits. */
export function defaultMotionPreference(doc: Document): 'full' | 'reduced' {
  try {
    const level = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue('--motion-level')
    return level?.trim() === 'reduced' ? 'reduced' : 'full'
  } catch {
    return 'full'
  }
}

/** R2's capability gate for the 3D flap path. Exported for the same R1 reuse. */
export function defaultSupports3d(): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      ? CSS.supports('transform-style', 'preserve-3d')
      : false
  } catch {
    return false
  }
}

export function createWriteSurface(deps: WriteSurfaceDeps): WriteSurface {
  return new Surface(deps)
}
