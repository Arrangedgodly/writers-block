/**
 * Archive screen for The Disappearing Draft (plan task T11) — the flight-log
 * binder: the post-flight side of the one console.
 *
 * Design authority: docs/ultron/design-brief.md §3 (archive as the flight-log
 * binder — logged sessions with running times right-aligned against the
 * margin, timestamps + excerpts, newest-first; view/copy/download/delete/clear;
 * honest empty state; the fixed charcoal ground is never repainted). Faces per
 * R4: Michroma placard caps for controls/labels, B612 Mono for every numeral
 * (run times, Zulu timestamps, word counts), Source Sans 3 for prose (titles,
 * excerpts, full drafts). Styling lives in src/styles/archive.css over the T8
 * tokens; this module owns structure + behavior only.
 *
 * SAFETY CONTRACT (plan T11, load-bearing): every user-derived string —
 * title, excerpt, and the full draft text — is rendered through textContent
 * exclusively. innerHTML / insertAdjacentHTML / DOMParser are never used
 * anywhere in this module, so hostile drafts (markup, <script>, onerror
 * payloads in the text a writer typed) can only ever become inert text nodes.
 * Code-derived strings (labels, counts, filenames) are equally textContent.
 *
 * Behavior:
 * - newest-first list straight from T6 `list()` (endedAt desc); each row:
 *   title (h2 under the screen's h1), Zulu timestamp + preset + word count,
 *   excerpt (with the display ellipsis T6 left to this layer), and the running
 *   time flush right in B612 Mono.
 * - VIEW expands the full draft in a recessed well (aria-expanded/aria-controls,
 *   visibility-gated so collapsed text is out of the accessibility tree).
 * - COPY: navigator.clipboard with a select+execCommand fallback and an
 *   honest named failure; transient COPIED/COPY FAILED state on the button
 *   plus a polite live region.
 * - DOWNLOAD .TXT: Blob → object URL → anchor click → revoke. The filename is
 *   code-derived (UTC session time), never from user text, so no path
 *   sanitization surface exists.
 * - DELETE is a two-step plate (refinement R3, critique F4 — the same
 *   confirm-before-destruction discipline clear-all already carries, scaled
 *   to one row): the first press ARMS the plate in place — it becomes
 *   CONFIRM DELETE in the destruct red, with the caution spoken through the
 *   polite region — and the second press (click or Enter/Space on the same
 *   native button) performs it. Escape anywhere on the binder cancels, and
 *   an armed plate reverts to DELETE after DELETE_ARM_TIMEOUT_MS (the safe
 *   direction — a lingering armed destruct control would reintroduce the
 *   accident the arm guards). One confirm is live at a time. A confirmed
 *   delete keeps T11's focus continuation: the next entry's DELETE, else
 *   the previous, else NEW SESSION when the log empties.
 * - CLEAR LOG opens an in-DOM confirm panel (never window.confirm): amber
 *   hairline caution band, CONFIRM CLEAR / KEEP LOG, Escape cancels, focus
 *   moves in on open and back out on cancel. Confirmation required — clear
 *   is the only multi-entry destructive gesture.
 * - Empty state is honest: no fake entries, "No survived sessions yet."
 *
 * Every environment dependency is injectable (clipboard, execCommand,
 * object URLs) exactly like the router's clock/frame/timer seams, so jsdom
 * tests verify copy/download behavior with mocks and no test-only hook
 * exists in any production path.
 */

import {
  EXCERPT_MAX_CHARS,
  type ArchiveEntry,
  type ArchiveStore,
} from '../data/archive'
import type { TimerScheduler } from '../engine/controller'

/** Async clipboard seam (the navigator.clipboard.writeText shape). */
export interface ClipboardWriter {
  writeText(data: string): Promise<void>
}

/** Blob → object-URL seam (URL.createObjectURL / revokeObjectURL shapes). */
export interface ObjectUrlSeam {
  create(blob: Blob): string
  revoke(url: string): void
}

export interface ArchiveScreenDeps {
  doc: Document
  archive: ArchiveStore
  /** NEW SESSION — navigation back to the setup console (router-owned). */
  onNewSession: () => void
  /** Clipboard writer; null when unavailable. Default: navigator.clipboard, if present. */
  clipboard?: ClipboardWriter | null
  /** Legacy copy path. Default: document.execCommand('copy'), if present. */
  execCommand?: (command: 'copy') => boolean
  /** Object-URL factory; null when unavailable. Default: URL statics, if present. */
  objectUrls?: ObjectUrlSeam | null
  /** setTimeout seam (the DELETE arm auto-revert + COPY transient); default window.setTimeout. */
  timer?: TimerScheduler
}

/**
 * How long a COPY button wears its COPIED / COPY FAILED state.
 */
const TRANSIENT_STATE_MS = 2400

/**
 * Refinement R3 (critique F4): how long an armed CONFIRM DELETE plate stays
 * armed before it reverts to DELETE — the safe direction, so a distracted
 * writer can never return to a still-armed destruct control and destroy a
 * survived draft with one old keypress. Escape cancels immediately; the
 * lapse is the backstop. Long enough to read the spoken caution and press
 * again deliberately, short enough that the armed state is always fresh.
 */
export const DELETE_ARM_TIMEOUT_MS = 5000

// ---------------------------------------------------------------------------
// Pure formatters (deterministic, timezone-free — flight logs keep Zulu time).
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD HH:MMZ` — UTC (Zulu) wall time, the flight-log convention. */
export function formatZulu(epochMs: number): string {
  const iso = new Date(epochMs).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`
}

/** Running time `M:SS` from whole seconds (floor; a finished run is exact). */
export function formatRun(durationSec: number): string {
  const total = Math.max(0, Math.floor(durationSec))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Code-derived download filename (UTC session time) — deliberately never
 * built from the title, so user text has no path/filename surface.
 */
export function downloadFileName(entry: ArchiveEntry): string {
  const iso = new Date(entry.endedAt).toISOString()
  const day = iso.slice(0, 10).replace(/-/g, '')
  const time = iso.slice(11, 16).replace(/:/g, '')
  return `draft-${day}T${time}Z.txt`
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

// ---------------------------------------------------------------------------
// The screen.
// ---------------------------------------------------------------------------

/**
 * Builds the `<section data-phase="archive">` element: header nameplate,
 * newest-first log list, per-entry actions, confirm panel, empty state, and
 * a polite live region. All listeners attach inside the returned subtree —
 * the router discards the section on the next screen swap and nothing leaks.
 */
export function createArchiveScreen(deps: ArchiveScreenDeps): HTMLElement {
  const doc = deps.doc
  const archive = deps.archive
  const clipboard: ClipboardWriter | null =
    deps.clipboard !== undefined ? deps.clipboard : defaultClipboard()
  const execCommand: (command: 'copy') => boolean =
    deps.execCommand ??
    ((command) => typeof doc.execCommand === 'function' && doc.execCommand(command))
  const objectUrls: ObjectUrlSeam | null =
    deps.objectUrls !== undefined ? deps.objectUrls : defaultObjectUrls()
  // R3: the timeout seam (DELETE arm auto-revert) is injectable like every
  // other environment dependency; the COPY transient rides the same seam.
  const timer: TimerScheduler =
    deps.timer ?? {
      schedule: (fn, delayMs) => doc.defaultView?.setTimeout(fn, delayMs) ?? 0,
      cancel: (handle) => doc.defaultView?.clearTimeout(handle as number),
    }
  const schedule = (fn: () => void, ms: number): void => {
    timer.schedule(fn, ms)
  }

  const section = doc.createElement('section')
  section.dataset.phase = 'archive'
  section.className = 'archive'

  // -- nameplate strip ---------------------------------------------------------

  const head = doc.createElement('header')
  head.className = 'archive-head'

  const headText = doc.createElement('div')
  headText.className = 'archive-head-text'
  // T12: the binder's visible title IS the screen's h1 (one per phase — each
  // screen IS the page on this console); entry titles sit beneath as h2s.
  const heading = doc.createElement('h1')
  heading.className = 'archive-title'
  heading.textContent = 'FLIGHT LOG'
  // R4 keeps Michroma placard labels short (wide caps) — two stacked lines
  // instead of one long one: the time convention, and the storage honesty.
  const noteZulu = doc.createElement('p')
  noteZulu.className = 'archive-note'
  noteZulu.textContent = 'ALL TIMES ZULU'
  const noteLocal = doc.createElement('p')
  noteLocal.className = 'archive-note'
  noteLocal.textContent = 'KEPT ONLY IN THIS BROWSER'
  headText.append(heading, noteZulu, noteLocal)

  const count = doc.createElement('p')
  count.className = 'archive-count'
  count.dataset.count = ''

  const newSessionButton = doc.createElement('button')
  newSessionButton.type = 'button'
  newSessionButton.className = 'plate plate-primary'
  newSessionButton.dataset.action = 'new-session'
  newSessionButton.textContent = 'NEW SESSION'
  newSessionButton.addEventListener('click', () => deps.onNewSession())

  head.append(headText, count, newSessionButton)

  // -- body: the binder --------------------------------------------------------

  const body = doc.createElement('div')
  body.className = 'archive-body'

  const columns = doc.createElement('div')
  columns.className = 'log-columns'
  columns.dataset.columns = ''
  const colSession = doc.createElement('span')
  colSession.textContent = 'SESSION'
  const colRun = doc.createElement('span')
  colRun.className = 'col-run'
  colRun.textContent = 'RUN'
  columns.append(colSession, colRun)

  const list = doc.createElement('ol')
  list.className = 'log-list'
  list.dataset.entries = ''

  const empty = doc.createElement('div')
  empty.className = 'empty'
  empty.dataset.empty = ''
  const emptyTitle = doc.createElement('p')
  emptyTitle.className = 'empty-title'
  emptyTitle.textContent = 'No survived sessions yet'
  const emptyBody = doc.createElement('p')
  emptyBody.className = 'empty-body'
  emptyBody.textContent =
    'Nothing has outlasted the clock. Arm a session — whatever survives 0:00 lands on this log.'
  empty.append(emptyTitle, emptyBody)

  // In-DOM confirm panel for clear-all (amber caution band in CSS; never a
  // window.confirm). Non-modal, in-flow: the log stays visible while deciding.
  const confirmPanel = doc.createElement('div')
  confirmPanel.className = 'confirm'
  confirmPanel.dataset.confirm = ''
  confirmPanel.hidden = true
  confirmPanel.setAttribute('role', 'group')
  const confirmTitle = doc.createElement('p')
  confirmTitle.className = 'confirm-title'
  confirmTitle.id = 'archive-confirm-title'
  confirmTitle.textContent = 'CLEAR THE ENTIRE LOG?'
  confirmPanel.setAttribute('aria-labelledby', confirmTitle.id)
  const confirmBody = doc.createElement('p')
  confirmBody.className = 'confirm-body'
  confirmBody.dataset.confirmBody = ''
  const confirmActions = doc.createElement('div')
  confirmActions.className = 'confirm-actions'
  const confirmClearButton = doc.createElement('button')
  confirmClearButton.type = 'button'
  confirmClearButton.className = 'plate plate-destruct'
  confirmClearButton.dataset.action = 'confirm-clear'
  confirmClearButton.textContent = 'CONFIRM CLEAR'
  const keepButton = doc.createElement('button')
  keepButton.type = 'button'
  keepButton.className = 'plate'
  keepButton.dataset.action = 'keep-log'
  keepButton.textContent = 'KEEP LOG'
  confirmActions.append(confirmClearButton, keepButton)
  confirmPanel.append(confirmTitle, confirmBody, confirmActions)

  const foot = doc.createElement('div')
  foot.className = 'log-foot'
  const clearButton = doc.createElement('button')
  clearButton.type = 'button'
  clearButton.className = 'plate'
  clearButton.dataset.action = 'clear-log'
  clearButton.textContent = 'CLEAR LOG'
  foot.append(clearButton)

  // Polite live region: copy/download/delete/clear outcomes, named honestly.
  const status = doc.createElement('p')
  status.className = 'vh'
  status.dataset.archiveStatus = ''
  status.setAttribute('aria-live', 'polite')

  body.append(columns, list, empty, confirmPanel, foot)
  section.append(head, body, status)

  const announce = (message: string): void => {
    status.textContent = message
  }

  // -- one log entry -------------------------------------------------------------

  const actionButton = (label: string, action: string): HTMLButtonElement => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'plate plate-entry'
    button.dataset.entryAction = action
    button.textContent = label
    return button
  }

  const entryRow = (entry: ArchiveEntry): HTMLLIElement => {
    const item = doc.createElement('li')
    item.className = 'log-entry'
    item.dataset.entryId = entry.id

    // Title + running time — the run time rides the right margin (j-card).
    const top = doc.createElement('div')
    top.className = 'entry-top'
    const title = doc.createElement('h2')
    title.className = 'entry-title'
    title.textContent = entry.title // user-derived: textContent ONLY
    const run = doc.createElement('p')
    run.className = 'entry-run'
    run.dataset.run = ''
    run.textContent = formatRun(entry.durationSec)
    top.append(title, run)

    const meta = doc.createElement('p')
    meta.className = 'entry-meta'
    const stamp = doc.createElement('span')
    stamp.className = 'entry-stamp'
    stamp.dataset.ended = ''
    stamp.textContent = formatZulu(entry.endedAt)
    const preset = doc.createElement('span')
    preset.className = 'entry-preset'
    preset.dataset.preset = ''
    preset.textContent = entry.preset
    const words = doc.createElement('span')
    words.className = 'entry-words'
    words.dataset.words = ''
    words.textContent = `${entry.wordCount} ${entry.wordCount === 1 ? 'WORD' : 'WORDS'}`
    meta.append(stamp, preset, words)

    const excerpt = doc.createElement('p')
    excerpt.className = 'entry-excerpt'
    excerpt.dataset.excerpt = ''
    // T6 stores the first 160 chars with no marker; the display ellipsis is
    // this layer's presentation choice, appended only when text was cut.
    excerpt.textContent =
      entry.text.trim().length > EXCERPT_MAX_CHARS ? `${entry.excerpt} …` : entry.excerpt

    const actions = doc.createElement('div')
    actions.className = 'entry-actions'

    const fullId = `log-entry-${entry.id}`
    const viewButton = actionButton('VIEW', 'view')
    viewButton.setAttribute('aria-expanded', 'false')
    viewButton.setAttribute('aria-controls', fullId)
    const full = doc.createElement('div')
    full.className = 'entry-full'
    full.dataset.fullText = ''
    full.id = fullId

    viewButton.addEventListener('click', () => {
      const open = viewButton.getAttribute('aria-expanded') !== 'true'
      viewButton.setAttribute('aria-expanded', String(open))
      viewButton.textContent = open ? 'COLLAPSE' : 'VIEW'
      if (open) full.setAttribute('data-open', '')
      else full.removeAttribute('data-open')
    })

    const copyButton = actionButton('COPY', 'copy')
    copyButton.addEventListener('click', () => void copyEntry(entry, copyButton))

    const downloadButton = actionButton('DOWNLOAD .TXT', 'download')
    downloadButton.addEventListener('click', () => downloadEntry(entry))

    const deleteButton = actionButton('DELETE', 'delete')
    // R3 two-step (F4): first press arms the plate in place, second confirms.
    // The handler reads the live arm state at click time — the plate's
    // CONFIRM DELETE face is presentation, never the source of truth.
    deleteButton.addEventListener('click', () => {
      if (armedEntryId !== entry.id) {
        armDelete(entry)
        return
      }
      cancelDeleteArm(false)
      removeEntry(entry.id)
    })

    actions.append(viewButton, copyButton, downloadButton, deleteButton)

    // The full draft in a recessed well; collapsed via visibility (CSS), so
    // the text is out of the accessibility tree until VIEW opens it.
    const well = doc.createElement('div')
    well.className = 'entry-full-well'
    const fullText = doc.createElement('p')
    fullText.className = 'entry-full-text'
    fullText.textContent = entry.text // user-derived: textContent ONLY
    well.append(fullText)
    full.append(well)

    item.append(top, meta, excerpt, actions, full)
    return item
  }

  // -- copy / download -------------------------------------------------------------

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

  const copyEntry = async (entry: ArchiveEntry, button: HTMLButtonElement): Promise<void> => {
    if (button.dataset.state === 'busy') return
    button.dataset.state = 'busy'
    const ok = await writeClipboard(entry.text)
    if (!button.isConnected) return
    if (ok) {
      button.dataset.state = 'copied'
      button.textContent = 'COPIED'
      announce('Entry copied to the clipboard.')
    } else {
      button.dataset.state = 'failed'
      button.textContent = 'COPY FAILED'
      announce('Copy failed. Press VIEW, select the text, and copy it manually.')
    }
    schedule(() => {
      if (!button.isConnected) return
      delete button.dataset.state
      button.textContent = 'COPY'
    }, TRANSIENT_STATE_MS)
  }

  const downloadEntry = (entry: ArchiveEntry): void => {
    if (objectUrls === null) {
      announce('Download is not available in this browser. Use COPY instead.')
      return
    }
    const name = downloadFileName(entry)
    const blob = new Blob([entry.text], { type: 'text/plain;charset=utf-8' })
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

  // -- delete / clear ----------------------------------------------------------------

  // R3 (F4) — the single-entry delete arm: ONE row's DELETE may be armed at
  // a time; the armed plate wears the destruct red (`plate-destruct` — the
  // locked lamp: the only red on a screen is the control that destructs,
  // the same vocabulary as CONFIRM CLEAR). The state is the id, never the
  // button text — rows are rebuilt by renderLog, which clears the arm.
  let armedEntryId: string | null = null
  let armTimer: unknown | null = null

  const applyDeleteArm = (): void => {
    for (const button of list.querySelectorAll<HTMLButtonElement>(
      '[data-entry-action="delete"]',
    )) {
      const row = button.closest('li')
      const armed = row !== null && row.dataset.entryId === armedEntryId
      if (armed) {
        button.textContent = 'CONFIRM DELETE'
        button.classList.add('plate-destruct')
        button.dataset.armed = ''
      } else {
        button.textContent = 'DELETE'
        button.classList.remove('plate-destruct')
        delete button.dataset.armed
      }
    }
  }

  /** Revert any armed plate to DELETE. `announceIt` closes the loop politely. */
  const cancelDeleteArm = (announceIt: boolean): void => {
    if (armedEntryId === null) return
    if (armTimer !== null) {
      timer.cancel(armTimer)
      armTimer = null
    }
    armedEntryId = null
    applyDeleteArm()
    if (announceIt) announce('Delete cancelled.')
  }

  const armDelete = (entry: ArchiveEntry): void => {
    if (armTimer !== null) timer.cancel(armTimer)
    armedEntryId = entry.id
    applyDeleteArm()
    announce(
      `Delete armed for “${entry.title}”. Press CONFIRM DELETE to remove it permanently — ` +
        'there is no recovery. Escape cancels.',
    )
    armTimer = timer.schedule(() => {
      armTimer = null
      if (armedEntryId === entry.id) cancelDeleteArm(true)
    }, DELETE_ARM_TIMEOUT_MS)
  }

  // Escape anywhere on the binder cancels an armed delete (keyboard-complete
  // cancel, like the clear-all confirm's Escape). Focus stays on the plate —
  // it reverts to DELETE under the cursor.
  section.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancelDeleteArm(true)
  })

  const removeEntry = (id: string): void => {
    const before = archive.list()
    const index = before.findIndex((e) => e.id === id)
    if (index < 0 || before[index] === undefined) return
    archive.remove(id)
    renderLog()
    const after = archive.list()
    announce(
      after.length === 0
        ? 'Entry deleted. The log is empty.'
        : `Entry deleted. ${after.length} ${after.length === 1 ? 'entry remains' : 'entries remain'} on the log.`,
    )
    if (after.length === 0) {
      newSessionButton.focus()
      return
    }
    // Focus continues the workflow at the same position in the log: the next
    // entry's DELETE, else the previous entry's.
    const rows = [...list.children] as HTMLLIElement[]
    const row = rows[Math.min(index, rows.length - 1)]
    row?.querySelector<HTMLButtonElement>('[data-entry-action="delete"]')?.focus()
  }

  let confirmOpen = false

  const renderConfirm = (): void => {
    const entries = archive.list()
    if (entries.length === 0) confirmOpen = false
    const open = confirmOpen && entries.length > 0
    confirmPanel.hidden = !open
    if (open) {
      confirmBody.textContent =
        `All ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} will be deleted permanently. ` +
        'There is no recovery.'
    }
  }

  const openConfirm = (): void => {
    cancelDeleteArm(false) // one destructive decision is live at a time
    confirmOpen = true
    renderConfirm()
    confirmClearButton.focus()
  }

  const closeConfirm = (restoreFocus: boolean): void => {
    confirmOpen = false
    renderConfirm()
    if (restoreFocus) clearButton.focus()
  }

  clearButton.addEventListener('click', () => {
    if (archive.list().length === 0) return
    openConfirm()
  })
  confirmClearButton.addEventListener('click', () => {
    const removed = archive.clear()
    confirmOpen = false
    renderLog()
    announce(
      removed.ok
        ? `Log cleared. ${removed.value} ${removed.value === 1 ? 'entry' : 'entries'} deleted.`
        : 'Clear failed — the log could not be written. Nothing was deleted.',
    )
    newSessionButton.focus()
  })
  keepButton.addEventListener('click', () => closeConfirm(true))
  confirmPanel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || confirmPanel.hidden) return
    closeConfirm(true)
  })

  // -- one render pass over the whole binder -------------------------------------

  const renderLog = (): void => {
    cancelDeleteArm(false) // rows rebuild unarmed; the arm dies with its row set
    const entries = archive.list()
    list.replaceChildren(...entries.map((entry) => entryRow(entry)))
    columns.hidden = entries.length === 0
    empty.hidden = entries.length !== 0
    count.textContent =
      entries.length === 0
        ? 'NOTHING LOGGED'
        : `${entries.length} ${entries.length === 1 ? 'SESSION' : 'SESSIONS'} LOGGED`
    clearButton.disabled = entries.length === 0
    renderConfirm()
  }

  renderLog()
  return section
}
