/**
 * Session phase router for The Disappearing Draft (plan task T5).
 *
 * ONE console, five phases: setup → write → deleted | wind-down → archive.
 * The router owns the screen swap inside a single mount element and the
 * session lifecycle around the T3 inactivity controller:
 *
 * - ARM (setup) → fresh controller + fresh editor, armed with T2's
 *   `sessionEndAt` helper; the write screen is T9's committed surface
 *   (src/ui/write-surface.ts — split-flap board, lamps/band, dying text),
 *   a pure projection of the controller's `onState` channel.
 * - `deleted` transition → the T4 permanence sequence (R3: blur → value AND
 *   defaultValue scrub → editor node DETACH → drop refs, plus the
 *   deleted-phase historyUndo/historyRedo interceptor), then controller
 *   teardown via T3's `destroy()` seam and the SIGNAL LOST board (T10's
 *   committed outcome screen — src/ui/outcome-screens.ts); RE-ARM is
 *   FOCUSED the moment the board mounts and (refinement R2 — the one-motion
 *   restart) starts the NEXT session immediately on the last-used
 *   calibration via this same `startSession`: fresh controller + fresh
 *   editor, countdown from the top, editor focused. The plate itself carries
 *   the recalled parameters ("RE-ARM — 10 MIN · STANDARD" — pre-session,
 *   never HUD), and RECONFIGURE (the secondary plate) returns to the setup
 *   console, which stays the full configuration surface. The interceptor
 *   disarms on either exit; it is never reused, and the editor is never
 *   reused either (R3: re-arm is always a fresh instance — arm on a
 *   destroyed controller throws; the editor is never wrapped in a `<form>`).
 * - `survived` transition (disarm at 0:00) → disarm-time archive write via
 *   T6 `save`, then the wind-down screen (T10's committed outcome screen)
 *   with the draft still editable, the frozen 0:00 board flipped to its
 *   DOWN SAFE side, post-session stats (live word count + run time), and
 *   copy/download of the current draft; DONE finalizes the entry via T6
 *   `update` (entry written at disarm, Done updates it — closing without
 *   DONE leaves the disarm-time entry in place) and lands on the archive
 *   view. R3 guards the disarm beat: DONE's KEYBOARD activation is held for
 *   a short window after disarm (a mid-sentence keystroke must not finalize
 *   the session), while the plate stays clickable.
 * - archive screen: the T11 flight-log binder (src/ui/archive-screen.ts) —
 *   newest-first rows, textContent-only rendering throughout, per-entry
 *   view/copy/download/delete (R3: single delete is a two-step plate —
 *   DELETE arms CONFIRM DELETE in the destruct red; Escape or a lapse
 *   cancels), clear-all behind an in-DOM confirm.
 *
 * T12 accessibility contracts owned HERE:
 * - STATE ANNOUNCEMENTS: two live regions created once in the constructor and
 *   MOUNTED FOREVER AFTER THE SCREEN SECTION (they survive every screen swap —
 *   the write surface's own fade region dies with its section, so terminal
 *   events need a region that outlives it): `role="status"` (polite) for the
 *   disarm announcement, `role="alert"` (assertive) for the deletion
 *   announcement. The regions exist EMPTY from construction (MDN: a live
 *   region must exist before its content changes) and are CLEARED at every
 *   phase boundary that leaves their screen (`startSession`,
 *   `resetToSetup`) — an empty region makes the next same-text announcement
 *   a real content change (live regions announce changes, not repeated
 *   identical text). The per-tick timer never touches these regions (that is
 *   the flap board's own `role="timer"` + milestone pattern, R2).
 * - FOCUS MANAGEMENT: every screen swap moves focus deliberately — ARM → the
 *   editor (the writer's hands go to the text; the threat clock is tied to
 *   typing), deletion → RE-ARM (R3: no undo target ever regains focus), disarm →
 *   DONE (the console's primary circuit; the editor stays one Tab away — and
 *   refinement R3 holds DONE's KEYBOARD activation for a beat after disarm so
 *   a mid-sentence Space/Enter cannot prematurely finalize; clicking always
 *   works), Done → the finalized entry's VIEW on the archive (the payoff
 *   first; Tab continues the row's actions),
 *   VIEW ARCHIVE / NEW SESSION → the destination's primary action
 *   (ARM / NEW SESSION). RE-ARM is itself a session start (refinement R2),
 *   so it lands on the editor exactly like ARM — the restart funnels
 *   straight into writing, never into configuration. Focus is always set
 *   AFTER the section is mounted — focusing a detached node is a no-op.
 *
 * - Setup console (T7 function; R1 builds the committed front door on the
 *   placard hooks in setup.css): duration as ONE radio group (3/5/10/15 preset
 *   placards + a CUSTOM minutes field,
 *   validated 1–120 against T2's `isValidSessionMinutes`), difficulty as a
 *   second radio group of three placards each printing its preset's FADE/LOSS
 *   limits straight from the T2 table. Invalid custom minutes DISABLES ARM with
 *   an inline message + `aria-invalid` (disable-with-feedback, not revert — the
 *   writer's input stays visible for correction); choosing a preset duration
 *   clears the field and re-enables. Arrow-key roving is owned in code (native
 *   radios already rove in browsers; `preventDefault` + manual rove keeps the
 *   behavior single-application and assertable), and arrows on the number input
 *   are left to the input. Every control is a native form control — radio
 *   groups (Tab/arrows/Space), number field, buttons (Enter/Space).
 *   R1 adds the visual console AND the guarded ARM gesture: ARM sits under a
 *   physical cover (LIFT COVER → ARM — one deliberate motion, two physical
 *   steps, keyboard-complete via Enter/Escape). The cover owns the tab order
 *   while closed (ARM carries tabindex="-1" — still directly clickable, which
 *   the router's deliberate RE-ARM focus path relies on: focus on ARM lifts
 *   the cover itself, so the restart loop stays one motion).
 *
 * Every engine dependency is constructor-injected exactly like T3's
 * ControllerDeps — clock / rAF frame scheduler / boundary-timer scheduler —
 * plus the archive storage adapter. Tests therefore drive the ENTIRE loop
 * with fake clocks through real DOM events, with no test-only hooks in any
 * production path; `main.ts` passes only root/window/document and gets
 * Date.now + rAF + setTimeout + localStorage.
 *
 * Styling arrives per screen on the data-* hooks (T8 tokens; T9 write.css,
 * T10 outcome.css, T11 archive.css; R1 setup.css — the setup console is
 * styled by the refinement pass on the committed T7 hooks). The DOM
 * is semantic and data-attribute-addressable (`data-phase`, `data-action`,
 * `data-editor`, `data-countdown`, …) so later tasks restyle in place.
 */

import {
  createInactivityController,
  type FrameScheduler,
  type InactivityController,
  type TimerScheduler,
  type Unsubscribe,
} from '../engine/controller'
import { createPermanenceGuard, type PermanenceGuard } from '../engine/permanence'
import {
  DURATION_PRESET_MINUTES,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  MS_PER_MINUTE,
  PRESETS,
  isValidSessionMinutes,
  sessionEndAt as computeSessionEndAt,
  type PresetId,
  type TimingState,
} from '../engine/timing'
import {
  createArchive,
  type ArchiveFailure,
  type ArchiveFailureKind,
  type ArchiveStore,
  type StorageAdapter,
} from '../data/archive'
import { createLastConfigStore, type LastConfigStore } from '../data/last-config'
import {
  createArchiveScreen,
  type ClipboardWriter,
  type ObjectUrlSeam,
} from './archive-screen'
import { createDeletedScreen, createWindDownScreen } from './outcome-screens'
import {
  createWriteSurface,
  defaultMotionPreference,
  defaultSupports3d,
  FLIP_SETTLE_MS,
  formatBoardClock,
  formatClock,
  type WriteSurface,
} from './write-surface'

/** The five phases of the one console (screen ids double as `data-phase` values). */
export type ScreenId = 'setup' | 'write' | 'deleted' | 'wind-down' | 'archive'

/** What the setup console hands to `startSession` (the T7 console reads this off its radio groups). */
export interface SessionConfig {
  preset: PresetId
  minutes: number
}

export interface RouterDeps {
  /** The console's mount element; the router swaps exactly one screen inside it. */
  root: HTMLElement
  window: Window
  document: Document
  /** Wall-clock source; production default is `() => Date.now()` (R1). */
  clock?: () => number
  /** rAF seam; production default is window.requestAnimationFrame. */
  frame?: FrameScheduler
  /** setTimeout seam; production default is window.setTimeout. */
  timer?: TimerScheduler
  /** Archive persistence; production default is localStorage. */
  storage?: StorageAdapter
  /** Motion capability for the write surface; default reads T8's --motion-level token. */
  motionPreference?: () => 'full' | 'reduced'
  /** 3D capability for the flap technique (R2); default CSS.supports. */
  supports3d?: () => boolean
  /** Wind-down COPY: async clipboard writer; null when unavailable. Default: navigator.clipboard, if present. */
  clipboard?: ClipboardWriter | null
  /** Wind-down COPY legacy path. Default: document.execCommand('copy'), if present. */
  execCommand?: (command: 'copy') => boolean
  /** Wind-down DOWNLOAD .TXT: Blob → object-URL seam; null when unavailable. Default: URL statics, if present. */
  objectUrls?: ObjectUrlSeam | null
}

export interface SessionRouter {
  currentScreen(): ScreenId
  /**
   * Start a session with explicit config (the setup ARM button and tests use
   * this). Throws RangeError on invalid minutes (same contract as the engine)
   * and always mounts a fresh controller + editor.
   */
  startSession(config: SessionConfig): void
  /** Finalize the wind-down draft into the archive (DONE button). */
  finishWindDown(): void
  /**
   * RE-ARM (deleted board, refinement R2): start the NEXT session immediately
   * with the last-used duration + difficulty — one motion, zero
   * re-configuration; a fresh controller + fresh editor, threat from the top.
   * Falls back to the setup console only when no valid calibration is on
   * record (nothing armed this page-load AND no readable persisted config).
   */
  reArm(): void
  /** Archive navigation from the setup console. */
  viewArchive(): void
  /** Archive screen → back to setup. */
  newSession(): void
  /** Full teardown: live session, listeners, screens. `startSession` afterwards throws. */
  destroy(): void
}

/** Countdown readout formatting lives with the write surface (T9); re-exported
 *  here for API stability (router tests and future screens consume it). */
export { formatClock }

interface ActiveSession {
  preset: PresetId
  minutes: number
  armedAt: number
  endedAt: number
  /** Archive entry id once the disarm-time save succeeded (null → Done retries the save). */
  entryId: string | null
}

interface WriteRefs {
  editor: HTMLTextAreaElement
  surface: WriteSurface
}

interface WindDownRefs {
  textarea: HTMLTextAreaElement
  note: HTMLElement
}

class Router implements SessionRouter {
  private readonly root: HTMLElement
  private readonly win: Window
  private readonly doc: Document
  private readonly clock: () => number
  private readonly frame: FrameScheduler
  private readonly timer: TimerScheduler
  private readonly motionPreference?: () => 'full' | 'reduced'
  private readonly supports3d?: () => boolean
  private readonly clipboard?: ClipboardWriter | null
  private readonly execCommand?: (command: 'copy') => boolean
  private readonly objectUrls?: ObjectUrlSeam | null
  private readonly archive: ArchiveStore
  /** Refinement R2: the calibration RE-ARM restarts with (last-armed config). */
  private readonly lastConfig: LastConfigStore
  /** T4: the R3 permanence sequence + deleted-phase undo interceptor. */
  private readonly permanence: PermanenceGuard

  private screen: ScreenId = 'setup'
  private controller: InactivityController | null = null
  private offState: Unsubscribe | null = null
  private offTransition: Unsubscribe | null = null
  private session: ActiveSession | null = null
  private writeRefs: WriteRefs | null = null
  private windDownRefs: WindDownRefs | null = null
  /** R1: the setup console's duration board (fresh per renderSetup; its flip
   *  timers are cancelled by destroySetupBoard when the screen is left). */
  private setupBoard: SetupBoard | null = null
  private destroyed = false
  /** T12: polite region for state announcements (survive every screen swap). */
  private readonly announceStatus: HTMLElement
  /** T12: assertive region for the deletion announcement. */
  private readonly announceAlert: HTMLElement

  constructor(deps: RouterDeps) {
    this.root = deps.root
    this.win = deps.window
    this.doc = deps.document
    this.clock = deps.clock ?? (() => Date.now())
    this.frame =
      deps.frame ?? {
        request: (callback) => this.win.requestAnimationFrame(callback),
        cancel: (handle) => this.win.cancelAnimationFrame(handle as number),
      }
    this.timer = deps.timer ?? {
      schedule: (callback, delayMs) => this.win.setTimeout(callback, delayMs),
      cancel: (handle) => this.win.clearTimeout(handle as number),
    }
    this.motionPreference = deps.motionPreference
    this.supports3d = deps.supports3d
    this.clipboard = deps.clipboard
    this.execCommand = deps.execCommand
    this.objectUrls = deps.objectUrls
    this.archive = createArchive(deps.storage)
    // R2: recall over the SAME adapter, its own versioned key — config is not
    // user content, and it never touches the archive's envelope.
    this.lastConfig = createLastConfigStore(deps.storage)
    this.permanence = createPermanenceGuard({ root: deps.root })
    // T12: the two state-announcement regions, created BEFORE any screen so
    // they exist (empty, connected) ahead of their first content change.
    this.announceStatus = this.createAnnouncementRegion('status')
    this.announceAlert = this.createAnnouncementRegion('alert')
    this.renderSetup()
  }

  /** T12: one persistent live region (role=status → polite, role=alert → assertive). */
  private createAnnouncementRegion(kind: 'status' | 'alert'): HTMLElement {
    const region = this.doc.createElement('p')
    region.className = 'vh'
    region.dataset.announcements = kind
    region.setAttribute('role', kind) // status ⇒ aria-live polite; alert ⇒ assertive
    return region
  }

  /**
   * T12: mount a screen — the section first, the persistent announcement
   * regions after it (they survive the swap; `firstElementChild` stays the
   * section). Both regions are cleared here: entering a screen with empty
   * regions guarantees the next transition's announcement is a content change.
   */
  private mountScreen(section: HTMLElement): void {
    this.announceStatus.textContent = ''
    this.announceAlert.textContent = ''
    this.root.replaceChildren(section, this.announceStatus, this.announceAlert)
  }

  /** T12: write a state announcement (call AFTER the screen is mounted). */
  private announce(kind: 'status' | 'alert', message: string): void {
    const region = kind === 'alert' ? this.announceAlert : this.announceStatus
    region.textContent = message
  }

  // -- public API -------------------------------------------------------------

  currentScreen(): ScreenId {
    return this.screen
  }

  startSession(config: SessionConfig): void {
    this.assertNotDestroyed()
    if (!isValidSessionMinutes(config.minutes)) {
      throw RangeError(
        `session length must be ${MIN_SESSION_MINUTES}-${MAX_SESSION_MINUTES} minutes, got ${config.minutes}`,
      )
    }
    // R2: every armed session records its calibration — this is what the
    // deleted board's RE-ARM restarts with (and what its plate prints).
    // Best-effort by contract: a failed persist never blocks arming.
    this.lastConfig.remember({ preset: config.preset, minutes: config.minutes })
    this.destroySetupBoard() // R1: the setup board's flips die with its screen
    this.teardownSession() // defensive: never two live sessions
    // Structural guarantee: no write session EVER runs with the undo
    // interceptor armed (it is deleted-phase only — blocking Ctrl+Z during
    // live writing would be a permanence bug in reverse).
    this.permanence.disarmUndoInterceptor()
    const armedAt = this.clock()
    const session: ActiveSession = {
      preset: config.preset,
      minutes: config.minutes,
      armedAt,
      endedAt: computeSessionEndAt(armedAt, config.minutes),
      entryId: null,
    }
    this.session = session

    // Write screen first — the controller binds its input listeners to the
    // editor element at construction.
    this.writeRefs = this.renderWrite(session)

    const controller = createInactivityController({
      editor: this.writeRefs.editor,
      window: this.win,
      document: this.doc,
      clock: this.clock,
      frame: this.frame,
      timer: this.timer,
    })
    this.controller = controller
    this.offState = controller.onState((state) => this.onWriteState(state))
    this.offTransition = controller.onTransition((state) => this.onTransition(state))
    controller.arm(PRESETS[session.preset], session.endedAt) // emits synchronously
    // T12: the writer's hands go to the text — the threat clock is tied to
    // typing, so the session starts with the editor focused.
    this.writeRefs.editor.focus()
  }

  finishWindDown(): void {
    this.assertNotDestroyed()
    if (this.screen !== 'wind-down' || this.windDownRefs === null) return
    const text = this.windDownRefs.textarea.value
    const session = this.session
    if (session === null) {
      // Nothing to finalize (defensive) — still show the archive honestly.
      this.windDownRefs = null
      this.renderArchive()
      return
    }
    const failure: ArchiveFailure | null = session.entryId !== null
      ? foldResult(this.archive.update(session.entryId, { text }))
      : foldResult(
          this.archive.save({
            createdAt: session.armedAt,
            endedAt: session.endedAt,
            durationSec: Math.round(session.minutes * 60),
            preset: session.preset,
            text,
          }),
          (entry) => {
            session.entryId = entry.id
          },
        )
    if (failure !== null) {
      // The draft survives in the editor; the writer can retry DONE.
      this.windDownRefs.note.textContent = saveFailureMessage(failure.kind)
      return
    }
    const finalizedEntryId = session.entryId
    this.session = null
    this.windDownRefs = null
    // T12: land focus on the finalized entry's VIEW — the payoff first.
    this.renderArchive({ entryId: finalizedEntryId })
  }

  reArm(): void {
    this.assertNotDestroyed()
    // The threat cannot be navigated away from: mid-write there is no exit.
    if (this.screen !== 'deleted') return
    // R2 — the one-motion restart: straight into the next session on the
    // last-used calibration. `startSession` does the whole job — fresh
    // controller + fresh editor (never the destroyed ones), the interceptor
    // disarmed (leaving the deleted board ends its lifetime), countdown from
    // the top, editor focused. With no valid calibration on record (nothing
    // armed this page-load and an unreadable persisted config), the setup
    // console is still the configuration surface — fall back to it.
    const config = this.lastConfig.recall()
    if (config === null) this.resetToSetup()
    else this.startSession(config)
  }

  viewArchive(): void {
    this.assertNotDestroyed()
    // Navigation is a setup-console affordance; a live threat is never escapable.
    if (this.screen !== 'setup') return
    this.destroySetupBoard() // R1: leaving setup kills the board's flip timers
    // T12: focus the destination's primary action — the VIEW ARCHIVE button
    // the keyboard user pressed is detached by the swap.
    this.renderArchive()
  }

  newSession(): void {
    this.resetToSetup()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.permanence.disarmUndoInterceptor()
    this.teardownSession()
    this.destroySetupBoard()
    this.session = null
    this.windDownRefs = null
    this.root.replaceChildren() // the announcement regions die with the console
  }

  // -- controller wiring --------------------------------------------------------

  private readonly onWriteState = (state: TimingState): void => {
    const refs = this.writeRefs
    if (refs === null) return
    // T9's committed write surface: the presiding flap board, lamps/band, the
    // dying text's per-frame opacity, and the reduced-motion placard are all
    // pure projections of the controller's per-recompute state channel.
    refs.surface.update(state)
  }

  private readonly onTransition = (state: TimingState): void => {
    if (state.phase === 'deleted') this.handleDeleted()
    else if (state.phase === 'survived') this.handleSurvived()
    // armed/fading transitions are projected continuously via onState.
  }

  private handleDeleted(): void {
    // T4 permanence (R3, load-bearing order): blur → value AND defaultValue
    // scrub (child text / form.reset vector) → node DETACH → drop refs, then
    // arm the deleted-phase undo interceptor before the board renders. Must
    // run while the editor reference is still live (before teardownSession
    // drops it). jsdom proves this sequence; physical undo is T13's protocol.
    const editor = this.writeRefs?.editor ?? null
    if (editor !== null) this.permanence.destroyEditor(editor)
    this.permanence.armUndoInterceptor()
    this.teardownSession() // destroys the controller and drops the editor ref
    this.session = null
    this.renderDeleted()
    // T12: assertive announcement of the terminal event — the region was
    // emptied by mountScreen, so this is a real content change (announced).
    this.announce('alert', DELETION_ANNOUNCEMENT)
  }

  private handleSurvived(): void {
    const session = this.session
    const editor = this.writeRefs?.editor ?? null
    const text = editor !== null ? editor.value : ''
    let saveError: ArchiveFailureKind | null = null
    if (session !== null) {
      // Entry written at disarm (endedAt = the 0:00 instant itself); DONE later
      // updates it with any wind-down edits (T10's committed flow).
      const result = this.archive.save({
        createdAt: session.armedAt,
        endedAt: session.endedAt,
        durationSec: Math.round(session.minutes * 60),
        preset: session.preset,
        text,
      })
      if (result.ok) session.entryId = result.value.id
      else saveError = result.kind
    }
    this.teardownSession()
    this.renderWindDown(text, saveError)
    // T12: polite announcement of the survival — assertive is reserved for
    // loss; the honest failure variant names the retry path.
    this.announce('status', saveError === null ? DISARM_ANNOUNCEMENT : DISARM_FAILURE_ANNOUNCEMENT)
  }

  private teardownSession(): void {
    if (this.offState !== null) {
      this.offState()
      this.offState = null
    }
    if (this.offTransition !== null) {
      this.offTransition()
      this.offTransition = null
    }
    if (this.controller !== null) {
      this.controller.destroy()
      this.controller = null
    }
    // T9/R3 seam: cancel the surface's pending flip/milestone timers before
    // dropping it with the screen swap — the editor node then dies with the
    // section (permanence detaches it on deletion; RE-ARM mounts fresh).
    if (this.writeRefs !== null) {
      this.writeRefs.surface.destroy()
      this.writeRefs = null
    }
  }

  private resetToSetup(): void {
    this.assertNotDestroyed()
    // The threat cannot be navigated away from: mid-write there is no exit.
    if (this.screen === 'write') return
    // R3: the interceptor's lifetime is deletion → leaving the board. Exiting
    // via RECONFIGURE (or the config-less RE-ARM fallback) disarms it, same
    // as the restart itself does inside startSession.
    this.permanence.disarmUndoInterceptor()
    this.teardownSession()
    this.session = null
    this.windDownRefs = null
    this.renderSetup()
    // T12: the arriving button (RECONFIGURE / NEW SESSION) is detached by the
    // swap — focus the console's primary action so configuration is one
    // motion: Enter (ARM) → the editor. The deliberate focus lifts the
    // MASTER ARM cover by itself (R1).
    this.root.querySelector<HTMLElement>('[data-action="arm"]')?.focus()
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) throw new Error('router is destroyed — create a fresh instance')
  }

  // -- screens (semantic DOM; T8–T11 + R1 restyle in place on the data-* hooks) --

  /** Both capability gates for flap motion — the same seams the write surface
   *  applies (R2): no-preference motion AND preserve-3d. */
  private flapCapable(): boolean {
    const motion = this.motionPreference?.() ?? defaultMotionPreference(this.doc)
    return motion === 'full' && (this.supports3d?.() ?? defaultSupports3d())
  }

  /** Cancel the setup board's pending flip timers when the setup screen is
   *  left (startSession / viewArchive) — the nodes die with the swap, the
   *  scheduled settles must not outlive them. */
  private destroySetupBoard(): void {
    this.setupBoard?.destroy()
    this.setupBoard = null
  }

  private renderSetup(): void {
    const doc = this.doc
    this.destroySetupBoard()
    const section = doc.createElement('section')
    section.dataset.phase = 'setup'
    section.className = 'setup'

    const heading = doc.createElement('h1')
    heading.className = 'setup-title'
    heading.textContent = 'The Disappearing Draft'
    const intro = doc.createElement('p')
    intro.className = 'setup-intro'
    intro.textContent =
      'Arm a timed session. Stop typing and the draft starts fading; stop long enough and it is deleted for good. Reach 0:00 and it is safe.'

    // -- the presiding duration board (R1): the FIRST VIEWPORT's flap board,
    //    echoing the console's selection on the write surface's instrument.
    const boardHead = doc.createElement('header')
    boardHead.className = 'setup-board'
    const board = createSetupFlapBoard({
      doc,
      minutes: 5, // the default checked preset below
      timer: this.timer,
      flap: this.flapCapable(),
    })
    this.setupBoard = board
    const boardLabel = doc.createElement('p')
    boardLabel.className = 'setup-board-label'
    boardLabel.textContent = 'SESSION LENGTH'
    boardHead.append(board.root, boardLabel)

    // Duration: ONE radio group — the four planned presets + a CUSTOM placard
    // carrying the minutes field. Fieldset/legend name the group for free.
    const durationGroup = doc.createElement('fieldset')
    durationGroup.dataset.durationGroup = ''
    const durationLegend = doc.createElement('legend')
    durationLegend.textContent = 'Duration'
    durationGroup.append(durationLegend)
    const durationRow = doc.createElement('div')
    durationRow.className = 'placards'
    for (const minutes of DURATION_PRESET_MINUTES) {
      const label = doc.createElement('label')
      label.className = 'placard'
      const radio = doc.createElement('input')
      radio.type = 'radio'
      radio.className = 'placard-radio'
      radio.name = 'setup-duration'
      radio.value = String(minutes)
      radio.dataset.durationOption = String(minutes)
      if (minutes === 5) radio.checked = true
      const face = doc.createElement('span')
      face.className = 'placard-face'
      const value = doc.createElement('span')
      value.className = 'placard-value'
      value.textContent = String(minutes)
      const unit = doc.createElement('span')
      unit.className = 'placard-unit'
      unit.textContent = 'MIN'
      face.append(value, unit)
      label.append(radio, face)
      durationRow.append(label)
    }
    // The CUSTOM placard: radio + minutes field in one label. The radio covers
    // the placard; the field rides above it (clicks on the field never toggle
    // the radio — interactive descendants are exempt from label activation);
    // typing in the field selects custom mode in code.
    const customLabel = doc.createElement('label')
    customLabel.className = 'placard placard-custom'
    const customRadio = doc.createElement('input')
    customRadio.type = 'radio'
    customRadio.className = 'placard-radio'
    customRadio.name = 'setup-duration'
    customRadio.value = 'custom'
    customRadio.dataset.durationCustom = ''
    const customFace = doc.createElement('span')
    customFace.className = 'placard-face'
    const customName = doc.createElement('span')
    customName.className = 'placard-name'
    customName.textContent = 'CUSTOM'
    const customRow = doc.createElement('span')
    customRow.className = 'placard-custom-row'
    const customInput = doc.createElement('input')
    customInput.type = 'number'
    customInput.className = 'setup-custom-input'
    customInput.dataset.customMinutes = ''
    customInput.min = String(MIN_SESSION_MINUTES)
    customInput.max = String(MAX_SESSION_MINUTES)
    customInput.placeholder = `${MIN_SESSION_MINUTES}–${MAX_SESSION_MINUTES}`
    customInput.setAttribute('aria-label', 'Custom duration in minutes')
    const customUnit = doc.createElement('span')
    customUnit.className = 'placard-unit'
    customUnit.textContent = 'MIN'
    customRow.append(customInput, customUnit)
    customFace.append(customName, customRow)
    customLabel.append(customRadio, customFace)
    durationRow.append(customLabel)
    durationGroup.append(durationRow)

    // Difficulty placards: the T2 preset table printed on each — FADE/LOSS limits.
    const presetGroup = doc.createElement('fieldset')
    presetGroup.dataset.presetGroup = ''
    const presetLegend = doc.createElement('legend')
    presetLegend.textContent = 'Difficulty'
    presetGroup.append(presetLegend)
    const presetRow = doc.createElement('div')
    presetRow.className = 'placards'
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      const preset = PRESETS[id]
      const label = doc.createElement('label')
      label.className = 'placard'
      const radio = doc.createElement('input')
      radio.type = 'radio'
      radio.className = 'placard-radio'
      radio.name = 'setup-preset'
      radio.value = id
      radio.dataset.presetOption = id
      if (id === 'STANDARD') radio.checked = true
      const face = doc.createElement('span')
      face.className = 'placard-face'
      const name = doc.createElement('span')
      name.className = 'placard-name'
      name.textContent = id
      const limits = doc.createElement('span')
      limits.className = 'placard-limits'
      const fadeLine = doc.createElement('span')
      fadeLine.textContent = `FADE ${preset.fadeDelayMs / 1000}s`
      const lossLine = doc.createElement('span')
      lossLine.textContent = `LOSS ${preset.deleteThresholdMs / 1000}s`
      limits.append(fadeLine, lossLine)
      face.append(name, limits)
      label.append(radio, face)
      presetRow.append(label)
    }
    presetGroup.append(presetRow)

    const errorLine = doc.createElement('p')
    errorLine.className = 'setup-error'
    errorLine.dataset.error = ''
    // T12 (T7 follow-up): the validation message is announced politely when
    // it appears — a screen reader hears WHY ARM disabled, not just silence.
    errorLine.setAttribute('role', 'status')

    // -- the guarded ARM (R1): the room's one primary action, low and isolated,
    //    under a physical cover. One deliberate motion, two physical steps:
    //    LIFT COVER, then ARM. Keyboard-complete (Enter lifts + focuses ARM,
    //    Escape re-covers); while closed the cover owns the tab order and ARM
    //    carries tabindex="-1" — still clickable, and the router's deliberate
    //    focus (the RE-ARM loop's one-motion restart) lifts the cover itself.
    const armStation = doc.createElement('div')
    armStation.className = 'setup-arm'
    armStation.dataset.armStation = ''
    const armLegend = doc.createElement('p')
    armLegend.className = 'setup-arm-legend'
    armLegend.textContent = 'MASTER ARM'
    const armSocket = doc.createElement('div')
    armSocket.className = 'arm-socket'
    const armButton = doc.createElement('button')
    armButton.type = 'button'
    armButton.className = 'plate plate-primary setup-arm-trigger'
    armButton.dataset.action = 'arm'
    armButton.textContent = 'ARM'
    armButton.tabIndex = -1 // covered at rest — the ritual's second step
    const armCover = doc.createElement('button')
    armCover.type = 'button'
    armCover.className = 'plate arm-cover'
    armCover.dataset.action = 'arm-cover'
    armCover.textContent = 'LIFT COVER'
    armSocket.append(armButton, armCover)
    const armNote = doc.createElement('p')
    armNote.className = 'setup-arm-note'
    armNote.textContent = 'NO PAUSE — NO RECOVERY'
    armStation.append(armLegend, armSocket, armNote)

    const archiveButton = doc.createElement('button')
    archiveButton.type = 'button'
    archiveButton.className = 'plate'
    archiveButton.dataset.action = 'view-archive'
    archiveButton.textContent = 'VIEW ARCHIVE'

    // -- operable logic (T7; board echo + arm guard from R1) ----------------------

    const readConfig = (): { preset: PresetId; minutes: number; error: string | null } => {
      const checkedPreset = presetGroup.querySelector<HTMLInputElement>('input:checked')
      const preset = (checkedPreset?.value ?? 'STANDARD') as PresetId
      if (!customRadio.checked) {
        const checked = durationGroup.querySelector<HTMLInputElement>('[data-duration-option]:checked')
        return { preset, minutes: Number(checked?.value ?? '5'), error: null }
      }
      const raw = customInput.value.trim()
      if (raw === '') {
        return {
          preset,
          minutes: Number.NaN,
          error: `Enter custom minutes (${MIN_SESSION_MINUTES}–${MAX_SESSION_MINUTES}).`,
        }
      }
      // Number('abc') → NaN (finite check below rejects it) — blocked even if a
      // non-numeric literal slipped past the number input's sanitization.
      const minutes = Number(raw)
      return {
        preset,
        minutes,
        error: isValidSessionMinutes(minutes)
          ? null
          : `Custom minutes must be ${MIN_SESSION_MINUTES}–${MAX_SESSION_MINUTES}.`,
      }
    }

    // Invalid-UX decision (stated in production-log): DISABLE ARM with feedback,
    // never revert — the writer's input stays in the field for correction.
    // The board echoes the selection honestly (an out-of-range entry shows what
    // was typed; a cleared custom field dashes the wells).
    const refresh = (): void => {
      const { minutes, error } = readConfig()
      armButton.disabled = error !== null
      errorLine.textContent = error ?? ''
      board.setMinutes(Number.isFinite(minutes) ? minutes : null)
      if (error === null) customInput.removeAttribute('aria-invalid')
      else customInput.setAttribute('aria-invalid', 'true')
    }

    const openCover = (refocus: boolean): void => {
      armStation.dataset.open = ''
      armButton.removeAttribute('tabindex')
      armCover.tabIndex = -1
      if (refocus) armButton.focus()
    }

    const closeCover = (): void => {
      delete armStation.dataset.open
      armButton.tabIndex = -1
      armCover.removeAttribute('tabindex')
      armCover.focus()
    }

    // Typing in the minutes field IS choosing the custom duration.
    customInput.addEventListener('input', () => {
      customRadio.checked = true
      refresh()
    })
    // Delegated radio changes: a preset duration clears the custom field (and
    // re-enables ARM); landing on the custom radio focuses its field.
    durationGroup.addEventListener('change', (event) => {
      const target = event.target
      if (target instanceof HTMLInputElement && target.dataset.durationOption !== undefined) {
        customInput.value = ''
      }
      if (target === customRadio) customInput.focus()
      refresh()
    })
    presetGroup.addEventListener('change', refresh)

    // Arrow-key roving inside each radio group, wrapping. Native radios already
    // do this in browsers — owning it in code (with preventDefault, so the
    // default never double-applies) keeps the behavior exact and assertable.
    // Arrows on the number input are left to the input itself.
    const rove = (group: HTMLFieldSetElement, event: KeyboardEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return
      const step =
        event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : event.key === 'ArrowDown' || event.key === 'ArrowRight'
            ? 1
            : 0
      if (step === 0) return
      event.preventDefault()
      const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      const index = radios.indexOf(target)
      if (index === -1 || radios.length === 0) return
      const next = radios[(index + step + radios.length) % radios.length]
      if (next === undefined || next === target) return
      next.checked = true
      next.focus()
      next.dispatchEvent(new Event('change', { bubbles: true }))
    }
    durationGroup.addEventListener('keydown', (event) => rove(durationGroup, event))
    presetGroup.addEventListener('keydown', (event) => rove(presetGroup, event))

    // The arm ritual: the cover lifts (one motion), ARM confirms (second step).
    armCover.addEventListener('click', () => openCover(true))
    // Deliberate focus on ARM — the router's RE-ARM path — lifts the cover by
    // itself, keeping the restart loop one motion (T12's committed decision).
    armButton.addEventListener('focus', () => openCover(false))
    armStation.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && armStation.hasAttribute('data-open')) closeCover()
    })

    armButton.addEventListener('click', () => {
      const { preset, minutes, error } = readConfig()
      if (error !== null) return
      this.startSession({ preset, minutes })
    })
    archiveButton.addEventListener('click', () => this.viewArchive())
    refresh()

    section.append(heading, intro, boardHead, durationGroup, presetGroup, errorLine, armStation, archiveButton)
    this.screen = 'setup'
    this.mountScreen(section)
  }

  private renderWrite(session: ActiveSession): WriteRefs {
    // T9 — the committed write surface (src/ui/write-surface.ts): the
    // presiding split-flap board (R2 technique), lamps + status strip, the
    // dying-text column, the reduced-motion caution placard, and the T12
    // fade-announcement hook. Fresh instance per session (R3 seam); the
    // editor is a bare textarea, never inside a <form>.
    const surface = createWriteSurface({
      doc: this.doc,
      totalSessionMs: session.endedAt - session.armedAt,
      timer: this.timer,
      motionPreference: this.motionPreference,
      supports3d: this.supports3d,
    })
    this.screen = 'write'
    this.mountScreen(surface.getElement())
    return { editor: surface.getEditor(), surface }
  }

  private renderDeleted(): void {
    // T10 — the committed SIGNAL LOST board (src/ui/outcome-screens.ts): the
    // console empties around the destruct annunciator; DSEG14 readout at
    // display size (R4: this board only), red LOSS lamp latching once,
    // honest copy, RE-ARM focused the moment the board mounts (R3: the
    // interceptor stays armed until RE-ARM leaves the board). R2: the plate
    // prints the calibration RE-ARM will restart with — read from the same
    // recall store the restart consumes, so the plate can never promise a
    // configuration the button will not deliver — and RECONFIGURE keeps the
    // setup console reachable without a surviving session in between.
    const screen = createDeletedScreen({
      doc: this.doc,
      config: this.lastConfig.recall(),
      onReArm: () => this.reArm(),
      onReconfigure: () => this.resetToSetup(),
    })
    this.screen = 'deleted'
    this.mountScreen(screen.section)
    screen.focusReArm()
  }

  private renderWindDown(text: string, saveError: ArchiveFailureKind | null): void {
    // T10 — the committed DOWN SAFE board (src/ui/outcome-screens.ts): the
    // session board flipped to its second side (frozen 0:00 + green SAFE
    // lamp), the draft still editable (the controller is already destroyed —
    // no threat), post-session stats (live word count + right-margin run
    // time), copy/download of the CURRENT draft, DONE finalizing the
    // disarm-time entry via finishWindDown (T6 update — never a second save
    // unless the disarm save failed).
    const session = this.session
    const screen = createWindDownScreen({
      doc: this.doc,
      text,
      durationSec: session !== null ? Math.round(session.minutes * 60) : 0,
      totalSessionMs: session !== null ? session.endedAt - session.armedAt : 0,
      endedAt: session !== null ? session.endedAt : this.clock(),
      note:
        saveError === null
          ? 'The 0:00 draft is archived. Edits here are safe until you press DONE.'
          : saveFailureMessage(saveError),
      onDone: () => this.finishWindDown(),
      timer: this.timer,
      clipboard: this.clipboard,
      execCommand: this.execCommand,
      objectUrls: this.objectUrls,
    })
    this.screen = 'wind-down'
    this.mountScreen(screen.section)
    this.windDownRefs = { textarea: screen.textarea, note: screen.note }
    screen.focusDone() // T12: the disarm swap lands on the console's primary circuit
  }

  /** T12: where archive-entry focus lands — the finalized entry, else the primary action. */
  private renderArchive(focus?: { entryId: string | null }): void {
    // T11 — the flight-log binder (src/ui/archive-screen.ts): newest-first
    // rows with Zulu timestamps + excerpts + right-aligned B612 Mono running
    // times, per-entry view/copy/download/delete, clear-all behind an in-DOM
    // confirm panel, and the honest empty state. All user-derived strings
    // render textContent-only inside that module.
    this.screen = 'archive'
    const section = createArchiveScreen({
      doc: this.doc,
      archive: this.archive,
      onNewSession: () => this.newSession(),
      // R3: the DELETE arm's auto-revert rides the router's timer seam so the
      // whole console (and its tests) run on the one injected clock.
      timer: this.timer,
    })
    this.mountScreen(section)
    // T12 focus: after DONE, the finalized entry's VIEW (the payoff — Tab
    // continues the row's copy/download/delete); arriving from setup, the
    // NEW SESSION plate (the pressed button is gone). Entry ids are UUIDs —
    // safe inside a quoted attribute selector.
    let target: HTMLElement | null = null
    if (focus?.entryId !== null && focus?.entryId !== undefined) {
      target = section.querySelector<HTMLElement>(
        `[data-entry-id="${focus.entryId}"] [data-entry-action="view"]`,
      )
    }
    target ??= section.querySelector<HTMLElement>('[data-action="new-session"]')
    target?.focus()
  }
}

/** T12: assertive announcement for the deletion transition — the world's
 *  voice, honest about what did NOT happen and what does not exist.
 *  Exported so tests assert the exact spoken text (single source). */
export const DELETION_ANNOUNCEMENT =
  'Signal lost — the draft was deleted. Nothing was archived. There is no recovery.'

/** T12: polite announcement for the disarm transition (success variant). */
export const DISARM_ANNOUNCEMENT =
  'Down safe — threat disarmed. The draft is archived.'

/** T12: polite announcement for the disarm transition (honest failure variant). */
export const DISARM_FAILURE_ANNOUNCEMENT =
  'Down safe — threat disarmed. The archive write failed; your draft is safe. Press DONE to retry.'

function saveFailureMessage(kind: ArchiveFailureKind): string {
  return `Archive write failed (${kind}). Your draft is safe in this editor — press DONE to retry.`
}

function foldResult<T>(
  result: { ok: true; value: T } | ArchiveFailure,
  onOk?: (value: T) => void,
): ArchiveFailure | null {
  if (result.ok) {
    onOk?.(result.value)
    return null
  }
  return result
}

// ---------------------------------------------------------------------------
// THE SETUP DURATION BOARD (R1) — the write surface's flap instrument, second
// engagement. Same classnames from write.css (.flap-board/.flap-glyphs/
// .flap-prefix/.flap-slot/… — reused, not forked), same four-surface slots and
// the same flip sequence (data-flipping/data-reset over FLIP_SETTLE_MS), same
// capability gates (no-preference motion AND preserve-3d, else static swap).
// Setup's own differences: a FIXED three-digit minute field (every legal
// session length 1–120 fits, so wells never appear or disappear when the
// selection changes — zero layout shift), role="img" with a plain-language
// label (nothing is counting here; the board echoes the console's selection),
// and updates driven by the setup refresh() instead of a live controller.
// ---------------------------------------------------------------------------

/** Fixed minute-well count: 3 digits hold every legal length 1–120. */
const SETUP_BOARD_MINUTE_WELLS = 3

interface FlapSlotState {
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

export interface SetupBoard {
  /** The `.flap-board` element (`[data-setup-board]`, role="img"). */
  root: HTMLElement
  /** Project one duration selection (null = no valid selection: dashed wells). */
  setMinutes(minutes: number | null): void
  /** Cancel pending flip-settle timers (call when the setup screen is left). */
  destroy(): void
}

/** Board text for a selection: zero-padded `MMM:SS`, or dashed wells when the
 *  console holds no valid duration (empty custom field). */
function setupBoardText(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return `${'-'.repeat(SETUP_BOARD_MINUTE_WELLS)}:--`
  }
  return formatBoardClock(minutes * MS_PER_MINUTE, SETUP_BOARD_MINUTE_WELLS)
}

/** The board's accessible name — plain language, never a raw "005:00". */
function setupBoardLabel(minutes: number | null): string {
  return minutes !== null && Number.isFinite(minutes)
    ? `Session length ${minutes} minutes`
    : 'Session length not set'
}

function createSetupFlapBoard(deps: {
  doc: Document
  minutes: number | null
  timer: TimerScheduler
  flap: boolean
}): SetupBoard {
  const { doc, timer, flap } = deps
  const slots: FlapSlotState[] = []
  let lastText = setupBoardText(deps.minutes)
  let destroyed = false

  const root = doc.createElement('div')
  root.className = 'flap-board'
  root.dataset.setupBoard = ''
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', setupBoardLabel(deps.minutes))

  const glyphs = doc.createElement('span')
  glyphs.className = 'flap-glyphs'
  glyphs.setAttribute('aria-hidden', 'true') // the label carries the reading

  const prefix = doc.createElement('span')
  prefix.className = 'flap-prefix'
  prefix.textContent = 'T–'
  glyphs.append(prefix)
  for (const char of lastText) {
    if (char === ':') {
      const colon = doc.createElement('span')
      colon.className = 'flap-colon'
      colon.textContent = ':'
      glyphs.append(colon)
      continue
    }
    glyphs.append(createSlot(doc, char))
  }
  root.append(glyphs)

  function createSlot(doc: Document, initial: string): HTMLElement {
    // Exactly the write surface's slot anatomy (write-surface.ts createSlot):
    // two static halves + two rotating leaves, glyph boxes slot-sized.
    const slot = doc.createElement('span')
    slot.className = 'flap-slot'
    slot.dataset.setupSlot = ''
    const makeSurface = (shellClass: string, hook: string): HTMLElement => {
      const shell = doc.createElement('span')
      shell.className = shellClass
      const glyph = doc.createElement('span')
      glyph.className = 'flap-glyph'
      glyph.dataset.glyph = hook
      glyph.textContent = initial
      shell.append(glyph)
      return shell
    }
    const staticTop = makeSurface('flap-half flap-half-top', 'static-top')
    const staticBottom = makeSurface('flap-half flap-half-bottom', 'static-bottom')
    const leafTop = makeSurface('flap-leaf flap-leaf-top', 'leaf-top')
    const leafBottom = makeSurface('flap-leaf flap-leaf-bottom', 'leaf-bottom')
    slot.append(staticTop, staticBottom, leafTop, leafBottom)
    const glyphOf = (shell: HTMLElement): HTMLElement => shell.firstElementChild as HTMLElement
    slots.push({
      slot,
      staticTop: glyphOf(staticTop),
      staticBottom: glyphOf(staticBottom),
      leafTop: glyphOf(leafTop),
      leafBottom: glyphOf(leafBottom),
      displayed: initial,
      settling: null,
      settleTimer: null,
    })
    return slot
  }

  /** The committed flip sequence (identical to the write surface's). */
  function flipTo(state: FlapSlotState, next: string): void {
    if (state.settling !== null) finishFlip(state) // interrupted: settle instantly
    if (state.displayed === next) return
    state.settling = next
    state.staticTop.textContent = next // revealed as the old top leaf falls
    state.leafBottom.textContent = next // rises into view over the old bottom
    state.slot.removeAttribute('data-reset') // re-enable the transform transition
    state.slot.dataset.flipping = ''
    state.settleTimer = timer.schedule(() => {
      state.settleTimer = null
      finishFlip(state)
    }, FLIP_SETTLE_MS)
  }

  function finishFlip(state: FlapSlotState): void {
    if (state.settleTimer !== null) {
      timer.cancel(state.settleTimer)
      state.settleTimer = null
    }
    if (state.settling === null) return
    state.displayed = state.settling
    state.settling = null
    state.staticBottom.textContent = state.displayed
    state.leafTop.textContent = state.displayed
    state.slot.dataset.reset = '' // transition:none while the leaves snap home
    delete state.slot.dataset.flipping
  }

  /** Static per-digit swap — the reduced-motion / no-preserve-3d path. */
  function setStatically(state: FlapSlotState, next: string): void {
    if (state.settling !== null) finishFlip(state) // defensive
    if (state.displayed === next) return
    state.displayed = next
    state.staticTop.textContent = next
    state.staticBottom.textContent = next
    state.leafTop.textContent = next // visible top surface when leaves render
  }

  return {
    root,
    setMinutes(minutes: number | null): void {
      if (destroyed) return
      root.setAttribute('aria-label', setupBoardLabel(minutes))
      const text = setupBoardText(minutes)
      if (text === lastText) return
      lastText = text
      const digits = [...text].filter((char) => char !== ':')
      for (let i = 0; i < slots.length; i++) {
        const state = slots[i]
        const next = digits[i] ?? '-'
        if (state === undefined || next === undefined) continue
        if (flap) flipTo(state, next)
        else setStatically(state, next)
      }
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      for (const state of slots) {
        if (state.settleTimer !== null) timer.cancel(state.settleTimer)
        state.settleTimer = null
      }
    },
  }
}

export function createSessionRouter(deps: RouterDeps): SessionRouter {
  return new Router(deps)
}
