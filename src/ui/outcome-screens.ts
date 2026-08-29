/**
 * Outcome screens for The Disappearing Draft (plan task T10) — both ends of
 * a session on the one console.
 *
 * DELETED — SIGNAL LOST. The console empties: no editor anywhere (the T4
 * permanence sequence and the controller teardown have already run — the
 * router mounts this screen AFTER both, so the beat is one deliberate
 * sequence with no flash of content). The board is the room's destruct
 * annunciator: `SIGNAL LOST` as the instrument readout in DSEG14 Classic
 * (R4: condition-gated to THIS board and display size — never the animated
 * flap countdown; the font stack falls back to B612 Mono when DSEG14 is
 * missing, per the --font-instrument token), one red LOSS lamp lit, and the
 * single red beat: the lamp LATCHES — hard on/off steps, three flashes then
 * steady, the way a real annunciator latches a new fault. Lamps switch, they
 * never fade. Under reduced motion the animation simply does not exist (the
 * whole keyframe block lives inside `prefers-reduced-motion: no-preference`)
 * and the board arrives fully lit. RE-ARM is focused the moment the board
 * mounts (R3: no undo target ever regains focus; the interceptor stays armed
 * until RE-ARM leaves the board). Refinement R2 — the one-motion restart:
 * RE-ARM starts the next session IMMEDIATELY on the last-used calibration,
 * and the plate itself prints it ("RE-ARM — 10 MIN · STANDARD") so the
 * recall can never surprise — the parameters ride the control that will
 * re-run them, pre-session rather than HUD (the write surface stays
 * time-only by commitment). RECONFIGURE, the standard secondary plate, is
 * the escape hatch that keeps the setup console reachable without first
 * surviving a whole session — the full configuration surface is one motion
 * away at the exact moment calibration is most likely to want changing.
 * Copy is honest, in the console's placard voice: what happened, what was
 * not archived, that there is no recovery — no snark, no fake telemetry.
 *
 * WIND-DOWN — DOWN SAFE. The session/wind-down are two hard sides of one
 * board (j-card raised line): the board the writer watched for the whole
 * session turns over — a damped rotateX side-change, NOT a fade
 * cross-fade — and comes to rest as the frozen countdown at 0:00 with the
 * green SAFE lamp lit and the verdict DOWN SAFE. The draft stays editable
 * (a fresh textarea seeded with the disarm text; the controller is already
 * destroyed — there is no threat), and the session stats that are banned
 * during the write phase are allowed HERE ONLY, post-session: a live word
 * count (T6's own trim-split semantics — the number DONE will persist) and
 * the running time flush against the right margin (j-card). COPY and
 * DOWNLOAD .TXT operate on the CURRENT draft — wind-down edits included —
 * before DONE is pressed; DONE finalizes the disarm-time archive entry via
 * T6 `update` (the entry already exists — written at disarm; closing
 * without DONE leaves that 0:00 entry in place) and returns to the archive
 * view. Both actions name failures honestly through a polite live region.
 *
 * Refinement R3 (critique F3) — the DONE keystroke guard. Disarm moves
 * focus to DONE deliberately (T12's committed focus map), but the writer
 * may still be mid-sentence: their next Space/Enter — meant for the
 * sentence — would activate the focused plate and finalize the session out
 * from under them. For DONE_KEY_GUARD_MS after disarm, keyboard activation
 * of DONE is HELD (Enter/Space keydowns and their synthesized clicks are
 * swallowed) while the plate stays fully clickable — a deliberate focus
 * onto DONE (Tab away and back, screen-reader navigation) lifts the hold
 * immediately. The focus map itself is untouched, so the T12 focus and
 * announcement contract holds; Enter inside the wind-down editor can never
 * submit to DONE because no `<form>` ever exists on this console (buttons
 * are type="button" throughout).
 *
 * Structure mirrors the established screens: every environment dependency
 * is injectable (clipboard / execCommand / object URLs / timer) exactly
 * like archive-screen.ts, all user-derived strings render textContent-only,
 * and the visual grammar is the console's own — `.flap-board` / `.flap-slot`
 * / `.write-column` / `.write-editor` reused from write.css (the same
 * instrument, the same prose column), `.plate` controls from archive.css
 * (the console's one button vocabulary). Styling lives in
 * src/styles/outcome.css over the T8 tokens.
 */

import type { TimerScheduler } from '../engine/controller'
import { deriveWordCount } from '../data/archive'
import type { LastSessionConfig } from '../data/last-config'
import { formatBoardClock } from './write-surface'
import {
  formatRun,
  type ClipboardWriter,
  type ObjectUrlSeam,
} from './archive-screen'

// ---------------------------------------------------------------------------
// DELETED — the SIGNAL LOST board.
// ---------------------------------------------------------------------------

export interface DeletedScreenDeps {
  doc: Document
  /**
   * The calibration RE-ARM will restart with (the router's last-config
   * recall — the same read the restart consumes, so the plate can never
   * promise a configuration the button will not deliver). Null when nothing
   * valid is on record; the plate then reads plain "RE-ARM" and the router
   * falls back to the setup console.
   */
  config: LastSessionConfig | null
  /** RE-ARM — restart immediately on the recalled calibration (router-owned). */
  onReArm: () => void
  /** RECONFIGURE — leave for the setup console, the full configuration surface. */
  onReconfigure: () => void
}

export interface DeletedScreen {
  /** The `<section data-phase="deleted">` element. */
  section: HTMLElement
  /**
   * Focus the RE-ARM action. Call AFTER the section is mounted — focusing a
   * detached node is a no-op. R3: the console's next actionable circuit is
   * live the moment the board lands; RE-ARM is the first of exactly two
   * focusable controls on the emptied board (RECONFIGURE follows it).
   */
  focusReArm(): void
}

/**
 * The RE-ARM plate's reading (refinement R2): the recalled calibration on
 * the control that will re-run it — pre-session, never HUD. Exported so
 * tests assert the exact plate text (single source).
 */
export function reArmPlateLabel(config: LastSessionConfig): string {
  return `RE-ARM — ${config.minutes} MIN · ${config.preset}`
}

export function createDeletedScreen(deps: DeletedScreenDeps): DeletedScreen {
  const doc = deps.doc

  const section = doc.createElement('section')
  section.dataset.phase = 'deleted'
  section.className = 'outcome outcome-deleted'

  // T12: one h1 per phase (each screen IS the page on this console). Visually
  // hidden — the DSEG14 readout presides visually; SIGNAL LOST stays the h2
  // beneath it, so the heading tree reads exactly like the beat.
  const heading = doc.createElement('h1')
  heading.className = 'vh'
  heading.dataset.phaseHeading = ''
  heading.textContent = 'Session deleted'

  // -- the annunciator: readout bed + loss lamp + verdict -----------------------

  const wrap = doc.createElement('header')
  wrap.className = 'outcome-boardwrap'

  const instrument = doc.createElement('div')
  instrument.className = 'outcome-instrument'
  instrument.dataset.deletedBoard = ''

  const readout = doc.createElement('h2')
  readout.className = 'outcome-readout'
  readout.dataset.signalLost = ''
  readout.textContent = 'SIGNAL LOST'

  const strip = doc.createElement('p')
  strip.className = 'outcome-strip'
  const lossLamp = outcomeLamp(doc, 'loss', 'LOSS', true)
  const verdict = doc.createElement('span')
  verdict.className = 'outcome-verdict'
  verdict.dataset.verdict = ''
  verdict.textContent = 'DRAFT DELETED'
  strip.append(lossLamp, verdict)

  instrument.append(readout, strip)
  wrap.append(instrument)

  // -- honest copy, placard voice ------------------------------------------------

  const copy = doc.createElement('p')
  copy.className = 'outcome-copy'
  copy.dataset.deletedCopy = ''
  copy.textContent =
    'The draft was deleted when the signal went quiet past the loss limit. Nothing was archived. There is no recovery.'

  // -- the two actions ------------------------------------------------------------
  // R2: the plate carries the calibration so the restart never surprises;
  // RECONFIGURE is the standard secondary plate, the setup console's door.

  const actions = doc.createElement('div')
  actions.className = 'outcome-actions'
  const reArm = doc.createElement('button')
  reArm.type = 'button'
  reArm.className = 'plate plate-primary'
  reArm.dataset.action = 'rearm'
  reArm.textContent = deps.config !== null ? reArmPlateLabel(deps.config) : 'RE-ARM'
  reArm.addEventListener('click', () => deps.onReArm())
  const reconfigure = doc.createElement('button')
  reconfigure.type = 'button'
  reconfigure.className = 'plate'
  reconfigure.dataset.action = 'reconfigure'
  reconfigure.textContent = 'RECONFIGURE'
  reconfigure.addEventListener('click', () => deps.onReconfigure())
  actions.append(reArm, reconfigure)

  section.append(heading, wrap, copy, actions)
  return {
    section,
    focusReArm: () => reArm.focus(),
  }
}

// ---------------------------------------------------------------------------
// WIND-DOWN — the DOWN SAFE side of the board.
// ---------------------------------------------------------------------------

export interface WindDownScreenDeps {
  doc: Document
  /** The draft as it stood at disarm — seeds the wind-down editor. */
  text: string
  /** Session running time in whole seconds (the RUN stat). */
  durationSec: number
  /** Total session length ms — fixes the frozen board's minute-slot count. */
  totalSessionMs: number
  /** Disarm instant (epoch ms) — the archive entry's endedAt + the download filename's source. */
  endedAt: number
  /** Honest archive status (success line or the named failure kind). */
  note: string
  /** DONE — finalize the disarm-time archive entry (router-owned data flow). */
  onDone: () => void
  /** setTimeout seam (the transient COPY state reverts); default window.setTimeout. */
  timer?: TimerScheduler
  /** Clipboard writer; null when unavailable. Default: navigator.clipboard, if present. */
  clipboard?: ClipboardWriter | null
  /** Legacy copy path. Default: document.execCommand('copy'), if present. */
  execCommand?: (command: 'copy') => boolean
  /** Object-URL factory; null when unavailable. Default: URL statics, if present. */
  objectUrls?: ObjectUrlSeam | null
}

export interface WindDownScreen {
  /** The `<section data-phase="wind-down">` element. */
  section: HTMLElement
  /** The editable draft (the router's DONE path reads the final value from it). */
  textarea: HTMLTextAreaElement
  /** The archive status line (the router rewrites it when DONE retries are needed). */
  note: HTMLElement
  /**
   * Focus the DONE action. Call AFTER the section is mounted — T12 focus
   * management: the writer's hands were on the draft; on the disarm swap the
   * console's primary circuit (finalize) receives focus so the outcome is
   * announced from a deliberate position, and the editor stays one Tab away.
   *
   * R3 guard: focusing DONE at disarm STARTS the keystroke hold — the very
   * next Space/Enter (a mid-sentence keystroke aimed at the editor the
   * writer just lost focus to) must not finalize the session. A LATER focus
   * on the plate (Tab away and back) is deliberate intent and lifts the
   * hold; the hold also expires on its own after DONE_KEY_GUARD_MS. Pointer
   * clicks always work.
   */
  focusDone(): void
}

/**
 * Refinement R3 (critique F3): how long after disarm DONE holds KEYBOARD
 * activation — a mid-sentence writer's next Space/Enter lands on the
 * deliberately focused plate and would prematurely finalize the session.
 * 1000ms sits inside the entry's 750–1500ms band: longer than the tail of a
 * typing burst (inter-key intervals at 60–100 WPM run 100–250ms), shorter
 * than any deliberate pause before pressing DONE a second time. Clicks are
 * never held; fresh focus on the plate lifts the hold at once.
 */
export const DONE_KEY_GUARD_MS = 1000

/** How long a COPY button wears its COPIED / COPY FAILED state. */
const TRANSIENT_STATE_MS = 2400

/**
 * Code-derived download filename from the disarm instant (UTC) — deliberately
 * never built from the draft text, so user input has no path/filename surface.
 * Same convention as the archive screen's `downloadFileName`.
 */
export function windDownFileName(endedAt: number): string {
  const iso = new Date(endedAt).toISOString()
  const day = iso.slice(0, 10).replace(/-/g, '')
  const time = iso.slice(11, 16).replace(/:/g, '')
  return `draft-${day}T${time}Z.txt`
}

export function createWindDownScreen(deps: WindDownScreenDeps): WindDownScreen {
  const doc = deps.doc
  const win = doc.defaultView
  const timer: TimerScheduler =
    deps.timer ?? {
      schedule: (fn, delayMs) => win?.setTimeout(fn, delayMs),
      cancel: (handle) => win?.clearTimeout(handle as number),
    }
  const clipboard: ClipboardWriter | null =
    deps.clipboard !== undefined ? deps.clipboard : defaultClipboard()
  const execCommand: (command: 'copy') => boolean =
    deps.execCommand ??
    ((command) => typeof doc.execCommand === 'function' && doc.execCommand(command))
  const objectUrls: ObjectUrlSeam | null =
    deps.objectUrls !== undefined ? deps.objectUrls : defaultObjectUrls()

  const section = doc.createElement('section')
  section.dataset.phase = 'wind-down'
  section.className = 'outcome outcome-windown'

  // T12: one h1 per phase (each screen IS the page on this console), visually
  // hidden — the flipped board presides visually; DOWN SAFE stays the h2.
  const heading = doc.createElement('h1')
  heading.className = 'vh'
  heading.dataset.phaseHeading = ''
  heading.textContent = 'Session complete'

  // -- the board, flipped to its second side --------------------------------------
  // The same instrument the writer watched, come to rest: the frozen countdown
  // at 0:00 (same static slot cells as the write board's fallback rendering),
  // the green SAFE lamp, the DOWN SAFE verdict. CSS performs the damped tape
  // flip on this wrapper (.outcome-board-face) — instant under reduced motion.

  const wrap = doc.createElement('header')
  wrap.className = 'outcome-boardwrap'

  const face = doc.createElement('div')
  face.className = 'outcome-board-face'
  face.dataset.windDownBoard = ''

  const clock = doc.createElement('div')
  clock.className = 'flap-board'
  clock.dataset.frozenClock = ''
  clock.setAttribute('role', 'img')
  clock.setAttribute('aria-label', 'Session clock, stopped at 0:00')

  const glyphs = doc.createElement('span')
  glyphs.className = 'flap-glyphs'
  glyphs.setAttribute('aria-hidden', 'true')
  const prefix = doc.createElement('span')
  prefix.className = 'flap-prefix'
  prefix.textContent = 'T–'
  glyphs.append(prefix)
  const minuteDigits = Math.max(2, String(Math.floor(deps.totalSessionMs / 60_000)).length)
  for (const char of formatBoardClock(0, minuteDigits)) {
    if (char === ':') {
      const colon = doc.createElement('span')
      colon.className = 'flap-colon'
      colon.textContent = ':'
      glyphs.append(colon)
      continue
    }
    glyphs.append(frozenSlot(doc, char))
  }
  clock.append(glyphs)

  const strip = doc.createElement('div')
  strip.className = 'outcome-strip'
  const safeLamp = outcomeLamp(doc, 'safe', 'SAFE', true)
  const title = doc.createElement('h2')
  title.className = 'outcome-title'
  title.dataset.downSafe = ''
  title.textContent = 'DOWN SAFE — THREAT DISARMED'
  strip.append(safeLamp, title)

  face.append(clock, strip)
  wrap.append(face)

  // -- post-session stats: HERE ONLY (never during the write phase) ----------------
  // Word count is live (T6's own trim-split derivation — the number DONE will
  // persist); the run time rides the right margin (j-card).

  const stats = doc.createElement('p')
  stats.className = 'outcome-stats'
  stats.dataset.stats = ''
  const wordsLabel = doc.createElement('span')
  wordsLabel.className = 'outcome-stat-label'
  wordsLabel.textContent = 'WORDS'
  const words = doc.createElement('span')
  words.className = 'outcome-stat-value'
  words.dataset.words = ''
  words.textContent = String(deriveWordCount(deps.text))
  const runGroup = doc.createElement('span')
  runGroup.className = 'outcome-stat-run'
  const runLabel = doc.createElement('span')
  runLabel.className = 'outcome-stat-label'
  runLabel.textContent = 'RUN'
  const run = doc.createElement('span')
  run.className = 'outcome-stat-value'
  run.dataset.run = ''
  run.textContent = formatRun(deps.durationSec)
  runGroup.append(runLabel, run)
  // No whitespace text nodes between the children: these containers are flex
  // layouts whose gap carries the separation — a ' ' child would be a
  // whitespace-only anonymous flex item, which CSS never renders (orphan
  // node; refinement R4 removed the last of them).
  stats.append(wordsLabel, words, runGroup)

  // -- the draft, still editable (the controller is already destroyed) -------------

  const column = doc.createElement('div')
  column.className = 'write-column'
  const textarea = doc.createElement('textarea')
  textarea.className = 'write-editor'
  textarea.dataset.winddownText = ''
  textarea.rows = 10
  textarea.cols = 72
  textarea.value = deps.text
  textarea.placeholder = 'The clock is down. Write on.'
  textarea.setAttribute('aria-label', 'Draft — safe to edit')
  column.append(textarea)

  const refreshWords = (): void => {
    words.textContent = String(deriveWordCount(textarea.value))
  }
  textarea.addEventListener('input', refreshWords)

  // -- the archive status line + actions ---------------------------------------------

  const note = doc.createElement('p')
  note.className = 'outcome-note'
  note.dataset.note = ''
  note.textContent = deps.note

  const foot = doc.createElement('div')
  foot.className = 'outcome-foot'

  const actions = doc.createElement('div')
  actions.className = 'outcome-actions'

  const copyButton = doc.createElement('button')
  copyButton.type = 'button'
  copyButton.className = 'plate'
  copyButton.dataset.action = 'copy'
  copyButton.textContent = 'COPY'

  const downloadButton = doc.createElement('button')
  downloadButton.type = 'button'
  downloadButton.className = 'plate'
  downloadButton.dataset.action = 'download'
  downloadButton.textContent = 'DOWNLOAD .TXT'

  const doneButton = doc.createElement('button')
  doneButton.type = 'button'
  doneButton.className = 'plate plate-primary'
  doneButton.dataset.action = 'done'
  doneButton.textContent = 'DONE — FINALIZE ENTRY'

  actions.append(copyButton, downloadButton, doneButton)
  foot.append(note, actions)

  // Polite live region: copy/download outcomes, named honestly.
  const status = doc.createElement('p')
  status.className = 'vh'
  status.dataset.winddownStatus = ''
  status.setAttribute('aria-live', 'polite')

  const announce = (message: string): void => {
    status.textContent = message
  }

  // -- the DONE keystroke guard (refinement R3, critique F3) -----------------------
  // DONE is focused at disarm (T12), so a mid-sentence keystroke aimed at the
  // editor would land on the plate and finalize the session prematurely. The
  // guard holds KEYBOARD activation for DONE_KEY_GUARD_MS after disarm while
  // the plate stays clickable; fresh focus (Tab away and back) is deliberate
  // intent and lifts the hold. detail === 0 marks keyboard/AT-synthesized
  // clicks in browsers (and jsdom's `.click()`), so those are held too;
  // pointer clicks carry detail ≥ 1 and always pass.

  let doneKeyboardHeld = false
  let disarmFocusPending = false
  let heldAnnounced = false

  const isActivationKey = (key: string): boolean =>
    key === 'Enter' || key === ' ' || key === 'Spacebar'

  const announceHeld = (): void => {
    if (heldAnnounced) return // once per hold — repeated swallows stay silent
    heldAnnounced = true
    announce('DONE holds keypresses for a moment after disarm — click now, or press again shortly.')
  }

  doneButton.addEventListener('keydown', (event) => {
    if (doneKeyboardHeld && isActivationKey(event.key)) {
      event.preventDefault() // kills the button's keyboard activation
      announceHeld()
    }
  })
  doneButton.addEventListener('keyup', (event) => {
    // Space activates on keyup in some engines — held there too.
    if (doneKeyboardHeld && isActivationKey(event.key)) event.preventDefault()
  })
  doneButton.addEventListener('focus', () => {
    if (disarmFocusPending) {
      disarmFocusPending = false // the disarm focus itself — not fresh intent
      return
    }
    doneKeyboardHeld = false // a later focus on DONE is deliberate — circuit live
  })
  doneButton.addEventListener('click', (event) => {
    if (doneKeyboardHeld && event.detail === 0) {
      event.preventDefault() // synthesized activation inside the window
      announceHeld()
      return
    }
    deps.onDone()
  })

  const focusDone = (): void => {
    doneKeyboardHeld = true
    heldAnnounced = false
    timer.schedule(() => {
      doneKeyboardHeld = false
    }, DONE_KEY_GUARD_MS)
    disarmFocusPending = true
    doneButton.focus()
  }

  // -- copy / download: the CURRENT draft (wind-down edits included) ----------------

  const legacyCopy = (text: string): boolean => {
    const scratch = doc.createElement('textarea')
    scratch.value = text
    scratch.setAttribute('readonly', '')
    scratch.setAttribute('data-copy-scratch', '')
    scratch.style.position = 'fixed'
    scratch.style.top = '-1000px'
    doc.body.append(scratch)
    scratch.focus()
    scratch.select()
    let ok = false
    try {
      ok = execCommand('copy')
    } catch {
      ok = false
    }
    scratch.remove()
    return ok
  }

  const writeClipboard = async (text: string): Promise<boolean> => {
    if (clipboard !== null) {
      try {
        await clipboard.writeText(text)
        return true
      } catch {
        // Permission denied / not allowed / transient failure — fall through
        // to the legacy path rather than report failure early.
      }
    }
    return legacyCopy(text)
  }

  const copyDraft = async (): Promise<void> => {
    if (copyButton.dataset.state === 'busy') return
    copyButton.dataset.state = 'busy'
    const ok = await writeClipboard(textarea.value)
    if (!copyButton.isConnected) return
    if (ok) {
      copyButton.dataset.state = 'copied'
      copyButton.textContent = 'COPIED'
      announce('Draft copied to the clipboard.')
    } else {
      copyButton.dataset.state = 'failed'
      copyButton.textContent = 'COPY FAILED'
      announce('Copy failed. Select the text in the draft and copy it manually.')
    }
    timer.schedule(() => {
      if (!copyButton.isConnected) return
      delete copyButton.dataset.state
      copyButton.textContent = 'COPY'
    }, TRANSIENT_STATE_MS)
  }

  const downloadDraft = (): void => {
    if (objectUrls === null) {
      announce('Download is not available in this browser. Use COPY instead.')
      return
    }
    const name = windDownFileName(deps.endedAt)
    const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' })
    const url = objectUrls.create(blob)
    const anchor = doc.createElement('a')
    anchor.href = url
    anchor.download = name
    doc.body.append(anchor)
    anchor.click()
    anchor.remove()
    objectUrls.revoke(url)
    announce(`Downloaded ${name}.`)
  }

  copyButton.addEventListener('click', () => void copyDraft())
  downloadButton.addEventListener('click', () => downloadDraft())

  section.append(heading, wrap, stats, column, foot, status)
  return { section, textarea, note, focusDone }
}

// ---------------------------------------------------------------------------
// Shared pieces.
// ---------------------------------------------------------------------------

/** One range-safety lamp in the write surface's grammar (domes switch; the
 *  names are engraved legends; the element is decorative — text carries state). */
function outcomeLamp(
  doc: Document,
  kind: 'loss' | 'safe',
  name: string,
  lit: boolean,
): HTMLElement {
  const lamp = doc.createElement('span')
  lamp.className = 'lamp'
  lamp.dataset.lamp = kind
  lamp.setAttribute('aria-hidden', 'true')
  const dome = doc.createElement('span')
  dome.className = 'lamp-dome'
  const label = doc.createElement('span')
  label.className = 'lamp-name'
  label.textContent = name
  lamp.append(dome, label)
  if (lit) lamp.dataset.lit = ''
  return lamp
}

/** One static slot cell — exactly the write board's fallback rendering. */
function frozenSlot(doc: Document, char: string): HTMLElement {
  const slot = doc.createElement('span')
  slot.className = 'flap-slot'
  slot.dataset.frozenSlot = ''
  const top = doc.createElement('span')
  top.className = 'flap-half flap-half-top'
  const topGlyph = doc.createElement('span')
  topGlyph.className = 'flap-glyph'
  topGlyph.textContent = char
  top.append(topGlyph)
  const bottom = doc.createElement('span')
  bottom.className = 'flap-half flap-half-bottom'
  const bottomGlyph = doc.createElement('span')
  bottomGlyph.className = 'flap-glyph'
  bottomGlyph.textContent = char
  bottom.append(bottomGlyph)
  slot.append(top, bottom)
  return slot
}

function defaultClipboard(): ClipboardWriter | null {
  if (typeof navigator === 'undefined') return null
  const clip = navigator.clipboard
  if (clip !== undefined && clip !== null && typeof clip.writeText === 'function') {
    return clip
  }
  return null
}

function defaultObjectUrls(): ObjectUrlSeam | null {
  if (typeof URL === 'undefined') return null
  if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
    return null
  }
  return {
    create: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url),
  }
}
