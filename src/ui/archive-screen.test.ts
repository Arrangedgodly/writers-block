// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createArchiveScreen,
  DELETE_ARM_TIMEOUT_MS,
  downloadFileName,
  formatRun,
  formatZulu,
  type ArchiveScreenDeps,
  type ObjectUrlSeam,
} from './archive-screen'
import type { TimerScheduler } from '../engine/controller'
import {
  createArchive,
  deriveExcerpt,
  deriveTitle,
  type ArchiveEntry,
  type ArchiveStore,
  type StorageAdapter,
} from '../data/archive'
import type { PresetId } from '../engine/timing'

// T11 acceptance as automated jsdom walkthroughs. The screen module is driven
// through real DOM events with the environment seams (clipboard / execCommand
// / object URLs) injected — exactly the T5/T7 pattern of no test-only hooks
// in production paths. What jsdom cannot prove (rendered alignment, faces,
// the damped reveal) is pinned structurally via class/data hooks and left to
// the finishing phase's visual pass.

const T0 = 1_000_000

class FakeStorage implements StorageAdapter {
  private readonly map = new Map<string, string>()

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }
}

interface SessionSeed {
  text: string
  minutes: number
  endedAt: number
  preset?: PresetId
}

function seedArchive(storage: StorageAdapter, sessions: SessionSeed[]): ArchiveStore {
  const archive = createArchive(storage)
  for (const s of sessions) {
    archive.save({
      createdAt: s.endedAt - s.minutes * 60_000,
      endedAt: s.endedAt,
      durationSec: s.minutes * 60,
      preset: s.preset ?? 'STANDARD',
      text: s.text,
    })
  }
  return archive
}

const cleanups: (() => void)[] = []

/** Clock-free fake of the timeout seam: `fireAll()` is the lapse. */
class FakeArmTimers {
  private seq = 0
  private readonly pending = new Map<number, () => void>()
  readonly timer: TimerScheduler = {
    schedule: (fn, _delayMs) => {
      const id = ++this.seq
      this.pending.set(id, fn)
      return id
    },
    cancel: (handle) => {
      this.pending.delete(handle as number)
    },
  }
  fireAll(): void {
    for (const [id, fn] of [...this.pending.entries()]) {
      this.pending.delete(id)
      fn()
    }
  }
}

interface Mount {
  section: HTMLElement
  archive: ArchiveStore
  onNewSession: ReturnType<typeof vi.fn>
}

function mountScreen(
  deps: Omit<Partial<ArchiveScreenDeps>, 'doc' | 'archive' | 'onNewSession'> = {},
  storage: StorageAdapter = new FakeStorage(),
): Mount {
  const archive = createArchive(storage)
  const onNewSession = vi.fn()
  const section = createArchiveScreen({ doc: document, archive, onNewSession, ...deps })
  document.body.append(section)
  cleanups.push(() => section.remove())
  return { section, archive, onNewSession }
}

function q<E extends HTMLElement>(section: HTMLElement, selector: string): E {
  const el = section.querySelector<E>(selector)
  if (el === null) throw new Error(`missing element for ${selector}`)
  return el
}

function rowsOf(section: HTMLElement): HTMLLIElement[] {
  return [...section.querySelectorAll<HTMLLIElement>('[data-entry-id]')]
}

/** A real keydown at the element (the Escape cancel path is code-owned). */
function pressKey(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Pure formatters.
// ---------------------------------------------------------------------------

describe('formatters (pure)', () => {
  it('formatZulu renders deterministic UTC (Zulu) wall time', () => {
    expect(formatZulu(Date.UTC(2026, 7, 28, 14, 3, 21))).toBe('2026-08-28 14:03Z')
    expect(formatZulu(0)).toBe('1970-01-01 00:00Z')
  })

  it('formatRun renders M:SS and clamps negatives', () => {
    expect(formatRun(0)).toBe('0:00')
    expect(formatRun(59)).toBe('0:59')
    expect(formatRun(60)).toBe('1:00')
    expect(formatRun(300)).toBe('5:00')
    expect(formatRun(420)).toBe('7:00')
    expect(formatRun(-5)).toBe('0:00')
  })

  it('downloadFileName is code-derived (UTC time, no user text)', () => {
    const entry = {
      id: 'x',
      endedAt: Date.UTC(2026, 7, 28, 14, 3),
      durationSec: 60,
    } as ArchiveEntry
    expect(downloadFileName(entry)).toBe('draft-20260828T1403Z.txt')
  })
})

// ---------------------------------------------------------------------------
// The binder: newest-first, right-aligned run time, honest structure.
// ---------------------------------------------------------------------------

describe('archive screen (T11 — flight-log binder)', () => {
  it('renders newest-first rows: title, Zulu stamp, preset, words, excerpt, run right-aligned', () => {
    const storage = new FakeStorage()
    const seeded = seedArchive(storage, [
      { text: 'oldest session words here', minutes: 3, endedAt: T0 + 1_000 },
      { text: 'newest session words here', minutes: 5, endedAt: T0 + 3_000 },
      { text: 'middle session words here', minutes: 10, endedAt: T0 + 2_000 },
    ])
    const { section } = mountScreen({}, storage)

    // Newest-first, straight from T6 list() semantics.
    const expected = seeded.list()
    expect(expected.map((e) => e.endedAt)).toEqual([T0 + 3_000, T0 + 2_000, T0 + 1_000])
    expect(rowsOf(section).map((r) => r.dataset.entryId)).toEqual(expected.map((e) => e.id))

    // Structure + hooks the surface styles hang on: the run time is the last
    // child of the row's head grid (grid column 2, justify-self end in CSS).
    for (let i = 0; i < expected.length; i++) {
      const entry = expected[i]!
      const row = rowsOf(section)[i]!
      expect(row.querySelector('h2')!.textContent).toBe(entry.title)
      expect(row.querySelector('[data-run]')!.textContent).toBe(formatRun(entry.durationSec))
      expect(q<HTMLElement>(row, '.entry-top').lastElementChild).toBe(
        row.querySelector('[data-run]'),
      )
      expect(row.querySelector('[data-run]')!.className).toContain('entry-run')
      expect(row.querySelector('[data-ended]')!.textContent).toBe(formatZulu(entry.endedAt))
      expect(row.querySelector('[data-preset]')!.textContent).toBe(entry.preset)
      expect(row.querySelector('[data-words]')!.textContent).toBe(`${entry.wordCount} WORDS`)
      expect(row.querySelector('[data-excerpt]')!.textContent).toBe(entry.excerpt)
    }

    // Run times carry the numeric font hook; stamps/words are numeric spans.
    expect(q<HTMLElement>(section, '.entry-run').className).toContain('entry-run')
    expect(q<HTMLElement>(section, '.entry-stamp').className).toContain('entry-stamp')

    // Column labels for the list, count on the nameplate, CLEAR enabled.
    expect(q(section, '[data-columns]').textContent).toContain('SESSION')
    expect(q(section, '[data-columns]').textContent).toContain('RUN')
    expect(q(section, '[data-count]').textContent).toBe('3 SESSIONS LOGGED')
    expect(q<HTMLButtonElement>(section, '[data-action="clear-log"]').disabled).toBe(false)
    expect(section.dataset.phase).toBe('archive')
  })

  it('appends the display ellipsis only when the excerpt actually cut text', () => {
    const long = 'word '.repeat(80).trim() // > 160 chars
    const short = 'short survived draft'
    const storage = new FakeStorage()
    seedArchive(storage, [
      { text: long, minutes: 5, endedAt: T0 + 2_000 },
      { text: short, minutes: 5, endedAt: T0 + 1_000 },
    ])
    const { section } = mountScreen({}, storage)
    const [newest, older] = rowsOf(section)
    expect(newest!.querySelector('[data-excerpt]')!.textContent).toBe(`${deriveExcerpt(long)} …`)
    expect(older!.querySelector('[data-excerpt]')!.textContent).toBe(deriveExcerpt(short))
  })

  it('renders hostile title/excerpt/text inert — textContent only, no element creation', () => {
    const hostile =
      '<img src=x onerror="window.__pwned=1"> text <script>window.__pwned=2</script>' +
      ' <svg onload="window.__pwned=3"></svg> plain words to survive on'
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: hostile, minutes: 5, endedAt: T0 }])
    const { section } = mountScreen({}, storage)

    const entry = createArchive(storage).list()[0]!
    expect(entry.title).toBe(deriveTitle(hostile)) // the payload reached metadata

    // No markup became elements; no on* attribute exists anywhere.
    expect(section.querySelectorAll('img, script, iframe, svg').length).toBe(0)
    for (const el of section.querySelectorAll('*')) {
      for (const name of el.getAttributeNames()) expect(name).not.toMatch(/^on/i)
    }

    // The title is a TEXT node carrying the payload literally: serialized as
    // escaped entities, never parsed as markup.
    const title = q(section, '.entry-title')
    expect(title.textContent).toBe(entry.title)
    expect(title.innerHTML).toContain('&lt;img')
    expect(title.innerHTML).not.toContain('<img')

    // VIEW opens the full hostile draft — still inert text, byte-exact.
    q<HTMLButtonElement>(section, '[data-entry-action="view"]').click()
    const full = q(section, '[data-full-text]')
    expect(full.textContent).toBe(hostile)
    expect(section.querySelectorAll('img, script, iframe, svg').length).toBe(0)
    expect(full.innerHTML).not.toContain('<script')
    expect((window as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('VIEW toggles the full draft with aria-expanded and the COLLAPSE label', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: 'line one\nline two', minutes: 5, endedAt: T0 }])
    const { section } = mountScreen({}, storage)

    const view = q<HTMLButtonElement>(section, '[data-entry-action="view"]')
    const full = q(section, '[data-full-text]')
    expect(view.getAttribute('aria-expanded')).toBe('false')
    expect(view.getAttribute('aria-controls')).toBe(full.id)
    expect(full.hasAttribute('data-open')).toBe(false)

    view.click()
    expect(view.getAttribute('aria-expanded')).toBe('true')
    expect(view.textContent).toBe('COLLAPSE')
    expect(full.hasAttribute('data-open')).toBe(true)
    expect(full.textContent).toContain('line one\nline two')

    view.click()
    expect(view.getAttribute('aria-expanded')).toBe('false')
    expect(view.textContent).toBe('VIEW')
    expect(full.hasAttribute('data-open')).toBe(false)
  })

  it('copies via the clipboard; falls back to select+execCommand; fails honestly', async () => {
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: 'copy me whole', minutes: 5, endedAt: T0 }])
    const text = createArchive(storage).list()[0]!.text

    // Async clipboard path.
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    let mounted = mountScreen({ clipboard }, storage)
    q<HTMLButtonElement>(mounted.section, '[data-entry-action="copy"]').click()
    expect(clipboard.writeText).toHaveBeenCalledWith(text)
    await vi.waitFor(() => {
      expect(q(mounted.section, '[data-entry-action="copy"]').textContent).toBe('COPIED')
    })
    expect(q(mounted.section, '[data-archive-status]').textContent).toBe(
      'Entry copied to the clipboard.',
    )
    // The fallback scratch textarea never lingers in the document.
    expect(document.querySelector('[data-copy-scratch]')).toBeNull()

    // No clipboard API → legacy select+execCommand path.
    const execCommand = vi.fn(() => true)
    mounted = mountScreen({ clipboard: null, execCommand }, storage)
    q<HTMLButtonElement>(mounted.section, '[data-entry-action="copy"]').click()
    await vi.waitFor(() => {
      expect(q(mounted.section, '[data-entry-action="copy"]').textContent).toBe('COPIED')
    })
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('[data-copy-scratch]')).toBeNull()

    // Both paths fail → honest, named failure with the recovery.
    const failing = { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    mounted = mountScreen({ clipboard: failing, execCommand: vi.fn(() => false) }, storage)
    q<HTMLButtonElement>(mounted.section, '[data-entry-action="copy"]').click()
    await vi.waitFor(() => {
      expect(q(mounted.section, '[data-entry-action="copy"]').textContent).toBe('COPY FAILED')
    })
    const status = q(mounted.section, '[data-archive-status]').textContent
    expect(status).toContain('Copy failed')
    expect(status).toContain('VIEW')
  })

  it('downloads a text/plain blob through an object URL that is revoked after the click', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: 'download this draft', minutes: 5, endedAt: T0 }])
    const entry = createArchive(storage).list()[0]!

    const created: Blob[] = []
    const objectUrls: ObjectUrlSeam = {
      create: vi.fn((blob: Blob) => {
        created.push(blob)
        return 'blob:mock-1'
      }),
      revoke: vi.fn(),
    }
    const { section } = mountScreen({ objectUrls }, storage)

    // Capture the synthetic anchor click (preventDefault keeps jsdom from
    // attempting navigation — the production path never preventDefaults).
    const clicked: HTMLAnchorElement[] = []
    const onClick = (event: Event): void => {
      const target = event.target
      if (target instanceof HTMLAnchorElement) {
        clicked.push(target)
        event.preventDefault()
      }
    }
    document.addEventListener('click', onClick, { capture: true })
    try {
      q<HTMLButtonElement>(section, '[data-entry-action="download"]').click()
    } finally {
      document.removeEventListener('click', onClick, { capture: true })
    }

    expect(created).toHaveLength(1)
    expect(created[0]!.type).toBe('text/plain;charset=utf-8')
    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe(downloadFileName(entry))
    expect(clicked[0]!.href).toBe('blob:mock-1')
    expect(objectUrls.revoke).toHaveBeenCalledWith('blob:mock-1')
    expect(q(section, '[data-archive-status]').textContent).toContain(
      `Downloaded ${downloadFileName(entry)}`,
    )
    // The blob carries the full draft.
    return created[0]!.text().then((blobText) => {
      expect(blobText).toBe(entry.text)
    })
  })

  it('names an unavailable object-URL API honestly instead of failing silently', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: 'any draft', minutes: 5, endedAt: T0 }])
    const { section } = mountScreen({ objectUrls: null }, storage)
    q<HTMLButtonElement>(section, '[data-entry-action="download"]').click()
    const status = q(section, '[data-archive-status]').textContent
    expect(status).toContain('Download is not available')
    expect(status).toContain('COPY')
  })

  it('deletes a single entry after the two-step confirm; focus continues at the same log position; empty log focuses NEW SESSION', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [
      { text: 'first logged draft', minutes: 3, endedAt: T0 + 1_000 },
      { text: 'second logged draft', minutes: 5, endedAt: T0 + 2_000 },
      { text: 'third logged draft', minutes: 10, endedAt: T0 + 3_000 },
    ])
    const { section, archive } = mountScreen({}, storage)
    expect(archive.list()).toHaveLength(3)

    // R3 two-step: the first press ARMS (nothing deleted); the second confirms.
    // Delete the MIDDLE entry (row index 1) — focus lands on the row that
    // now occupies index 1 (the oldest), on its DELETE control.
    const midDelete = rowsOf(section)[1]!.querySelector<HTMLButtonElement>(
      '[data-entry-action="delete"]',
    )!
    midDelete.click() // arm
    expect(archive.list()).toHaveLength(3) // nothing deleted yet
    expect(midDelete.textContent).toBe('CONFIRM DELETE')
    midDelete.click() // confirm
    expect(archive.list()).toHaveLength(2)
    expect(rowsOf(section)).toHaveLength(2)
    expect(document.activeElement).toBe(
      rowsOf(section)[1]!.querySelector('[data-entry-action="delete"]'),
    )
    expect(q(section, '[data-count]').textContent).toBe('2 SESSIONS LOGGED')

    // Deleting the LAST remaining entries empties the log honestly (each row
    // through the same arm-then-confirm beat, re-queried as rows rebuild).
    while (rowsOf(section).length > 0) {
      const del = rowsOf(section)[0]!.querySelector<HTMLButtonElement>(
        '[data-entry-action="delete"]',
      )!
      del.click()
      del.click()
    }
    expect(archive.list()).toHaveLength(0)
    expect(q(section, '[data-empty]').hidden).toBe(false)
    expect(rowsOf(section)).toHaveLength(0)
    expect(q<HTMLButtonElement>(section, '[data-action="clear-log"]').disabled).toBe(true)
    expect(document.activeElement).toBe(q(section, '[data-action="new-session"]'))
    expect(q(section, '[data-archive-status]').textContent).toContain('log is empty')
  })

  it('clear-all requires the in-DOM confirm: Escape and KEEP cancel, CONFIRM clears', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [
      { text: 'first logged draft', minutes: 3, endedAt: T0 + 1_000 },
      { text: 'second logged draft', minutes: 5, endedAt: T0 + 2_000 },
    ])
    const { section, archive } = mountScreen({}, storage)
    const clear = q<HTMLButtonElement>(section, '[data-action="clear-log"]')
    const confirmPanel = q(section, '[data-confirm]')

    // Open: panel visible and honest about scope, focus on CONFIRM, list intact.
    clear.click()
    expect(confirmPanel.hidden).toBe(false)
    expect(q(section, '[data-confirm-body]').textContent).toContain('All 2 entries')
    expect(q(section, '[data-confirm-body]').textContent).toContain('no recovery')
    expect(archive.list()).toHaveLength(2)
    expect(document.activeElement).toBe(q(section, '[data-action="confirm-clear"]'))

    // Escape cancels — nothing deleted, focus returns to CLEAR LOG.
    pressKey(q(section, '[data-action="confirm-clear"]'), 'Escape')
    expect(confirmPanel.hidden).toBe(true)
    expect(archive.list()).toHaveLength(2)
    expect(document.activeElement).toBe(clear)

    // KEEP LOG cancels the same way.
    clear.click()
    q<HTMLButtonElement>(section, '[data-action="keep-log"]').click()
    expect(confirmPanel.hidden).toBe(true)
    expect(archive.list()).toHaveLength(2)

    // CONFIRM CLEAR empties the log; empty state lands; focus → NEW SESSION.
    clear.click()
    q<HTMLButtonElement>(section, '[data-action="confirm-clear"]').click()
    expect(archive.list()).toHaveLength(0)
    expect(confirmPanel.hidden).toBe(true)
    expect(q(section, '[data-empty]').hidden).toBe(false)
    expect(q(section, '[data-count]').textContent).toBe('NOTHING LOGGED')
    expect(q<HTMLButtonElement>(section, '[data-action="clear-log"]').disabled).toBe(true)
    expect(document.activeElement).toBe(q(section, '[data-action="new-session"]'))
    expect(q(section, '[data-archive-status]').textContent).toContain('Log cleared')
    expect(q(section, '[data-archive-status]').textContent).toContain('2 entries deleted')
  })

  it('honest empty state: no fake rows, columns hidden, CLEAR disabled', () => {
    const { section, archive } = mountScreen()
    expect(archive.list()).toHaveLength(0)
    expect(q(section, '[data-empty]').hidden).toBe(false)
    expect(q(section, '[data-empty]').textContent).toContain('No survived sessions')
    expect(rowsOf(section)).toHaveLength(0)
    expect(q(section, '[data-columns]').hidden).toBe(true)
    expect(q<HTMLButtonElement>(section, '[data-action="clear-log"]').disabled).toBe(true)
    expect(q(section, '[data-count]').textContent).toBe('NOTHING LOGGED')
    // Clearing an empty log never opens the confirm panel.
    q<HTMLButtonElement>(section, '[data-action="clear-log"]').click()
    expect(q(section, '[data-confirm]').hidden).toBe(true)
  })

  it('keyboard walkthrough: native buttons in a legible order, Enter/Space operable by construction', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [
      { text: 'first logged draft', minutes: 3, endedAt: T0 + 1_000 },
      { text: 'second logged draft', minutes: 5, endedAt: T0 + 2_000 },
    ])
    const { section, onNewSession } = mountScreen({}, storage)

    // Every interactive element is a native <button> (Enter/Space activation
    // by construction — the T7 stance); no div/role=button shortcuts exist.
    const interactive = section.querySelectorAll('button')
    expect(interactive.length).toBeGreaterThan(0)
    expect(section.querySelectorAll('[role="button"]').length).toBe(0)

    // Tab (DOM) order: NEW SESSION, then per entry VIEW/COPY/DOWNLOAD/DELETE
    // newest-first, then CLEAR LOG. Confirm controls join only when open.
    const visibleButtons = [...section.querySelectorAll('button')].filter(
      (b) => b.closest('[hidden]') === null,
    )
    expect(visibleButtons.map((b) => b.dataset.action ?? b.dataset.entryAction)).toEqual([
      'new-session',
      'view',
      'copy',
      'download',
      'delete',
      'view',
      'copy',
      'download',
      'delete',
      'clear-log',
    ])

    // Drive the loop keyboard-style: VIEW (toggle), NEW SESSION navigates.
    const firstView = visibleButtons[1] as HTMLButtonElement
    firstView.click()
    expect(firstView.getAttribute('aria-expanded')).toBe('true')
    q<HTMLButtonElement>(section, '[data-action="new-session"]').click()
    expect(onNewSession).toHaveBeenCalledTimes(1)

    // And the clear flow is fully keyboard-reachable: open → Escape closes.
    q<HTMLButtonElement>(section, '[data-action="clear-log"]').click()
    expect(document.activeElement).toBe(q(section, '[data-action="confirm-clear"]'))
    pressKey(q(section, '[data-action="confirm-clear"]'), 'Escape')
    expect(q(section, '[data-confirm]').hidden).toBe(true)
    expect(document.activeElement).toBe(q(section, '[data-action="clear-log"]'))
  })
})

// ---------------------------------------------------------------------------
// Refinement R3 / critique F4 — the single-entry DELETE confirm. A regular
// tab stop used to destroy a survived draft immediately and permanently while
// clear-all carried an in-DOM confirm; the two-step plate gives single delete
// the same confirm-before-destruction discipline, scaled to one row: DELETE
// arms CONFIRM DELETE in the destruct red (spoken caution through the polite
// region), Escape or a lapse cancels, and the focus continuation is T11's.
// ---------------------------------------------------------------------------

describe('single-entry delete — the two-step plate (R3 / F4)', () => {
  it('DELETE arms CONFIRM DELETE in the destruct red with a spoken caution; the second press deletes', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [
      { text: 'first logged draft', minutes: 3, endedAt: T0 + 1_000 },
      { text: 'second logged draft', minutes: 5, endedAt: T0 + 2_000 },
    ])
    const timers = new FakeArmTimers()
    const { section, archive } = mountScreen({ timer: timers.timer }, storage)
    const entry = archive.list()[0]!

    const del = rowsOf(section)[0]!.querySelector<HTMLButtonElement>(
      '[data-entry-action="delete"]',
    )!
    del.focus() // the keyboard path lands on the plate before pressing
    del.click() // ARM — the caution beat
    expect(del.textContent).toBe('CONFIRM DELETE')
    expect(del.classList.contains('plate-destruct')).toBe(true) // the destruct red
    expect(del.hasAttribute('data-armed')).toBe(true)
    expect(document.activeElement).toBe(del) // the plate keeps focus — same circuit
    expect(archive.list()).toHaveLength(2) // nothing deleted yet
    const spoken = q(section, '[data-archive-status]').textContent
    expect(spoken).toContain('Delete armed')
    expect(spoken).toContain(entry.title)
    expect(spoken).toContain('no recovery')
    expect(spoken).toContain('Escape cancels')

    del.click() // CONFIRM — the destruct
    expect(archive.list()).toHaveLength(1)
    expect(archive.list()[0]!.id).not.toBe(entry.id)
    expect(del.isConnected).toBe(false) // the confirmed row is gone
    // Every remaining plate is back to plain DELETE.
    for (const button of section.querySelectorAll<HTMLButtonElement>(
      '[data-entry-action="delete"]',
    )) {
      expect(button.textContent).toBe('DELETE')
      expect(button.classList.contains('plate-destruct')).toBe(false)
    }
    timers.fireAll() // the (already-cancelled) lapse timer is a no-op
    expect(archive.list()).toHaveLength(1)
  })

  it('Escape cancels the armed plate — nothing deleted, the plate reverts under focus', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: 'only logged draft', minutes: 5, endedAt: T0 }])
    const { section, archive } = mountScreen({}, storage)
    const del = q<HTMLButtonElement>(section, '[data-entry-action="delete"]')
    del.click() // arm
    expect(del.textContent).toBe('CONFIRM DELETE')

    pressKey(section, 'Escape') // Escape anywhere on the binder cancels
    expect(del.textContent).toBe('DELETE')
    expect(del.classList.contains('plate-destruct')).toBe(false)
    expect(del.hasAttribute('data-armed')).toBe(false)
    expect(archive.list()).toHaveLength(1)
    expect(q(section, '[data-archive-status]').textContent).toContain('Delete cancelled.')
  })

  it('an armed plate reverts after the lapse (DELETE_ARM_TIMEOUT_MS) — the safe direction', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [{ text: 'only logged draft', minutes: 5, endedAt: T0 }])
    const timers = new FakeArmTimers()
    const { section, archive } = mountScreen({ timer: timers.timer }, storage)
    expect(DELETE_ARM_TIMEOUT_MS).toBeGreaterThan(0)

    const del = q<HTMLButtonElement>(section, '[data-entry-action="delete"]')
    del.click() // arm
    timers.fireAll() // the lapse passes
    expect(del.textContent).toBe('DELETE')
    expect(del.classList.contains('plate-destruct')).toBe(false)
    expect(archive.list()).toHaveLength(1)
    expect(q(section, '[data-archive-status]').textContent).toContain('Delete cancelled.')

    // The reverted plate is not a decoy: arming it again works, and the
    // lapse-canceled arm leaves no live confirm behind.
    del.click()
    expect(del.textContent).toBe('CONFIRM DELETE')
    del.click()
    expect(archive.list()).toHaveLength(0)
  })

  it('one confirm is live at a time: arming another row disarms the first; the clear-all panel cancels an arm too', () => {
    const storage = new FakeStorage()
    seedArchive(storage, [
      { text: 'first logged draft', minutes: 3, endedAt: T0 + 1_000 },
      { text: 'second logged draft', minutes: 5, endedAt: T0 + 2_000 },
    ])
    const { section, archive } = mountScreen({}, storage)
    const [rowA, rowB] = rowsOf(section)
    const delA = rowA!.querySelector<HTMLButtonElement>('[data-entry-action="delete"]')!
    const delB = rowB!.querySelector<HTMLButtonElement>('[data-entry-action="delete"]')!

    delA.click() // arm row A
    expect(delA.textContent).toBe('CONFIRM DELETE')
    delB.click() // arming row B disarms row A
    expect(delA.textContent).toBe('DELETE')
    expect(delA.classList.contains('plate-destruct')).toBe(false)
    expect(delB.textContent).toBe('CONFIRM DELETE')
    expect(archive.list()).toHaveLength(2) // still nothing deleted

    // Opening the clear-all confirm cancels the row arm: one destructive
    // decision is live at a time.
    q<HTMLButtonElement>(section, '[data-action="clear-log"]').click()
    expect(q(section, '[data-confirm]').hidden).toBe(false)
    expect(delB.textContent).toBe('DELETE')
    expect(delB.classList.contains('plate-destruct')).toBe(false)
    pressKey(q(section, '[data-action="confirm-clear"]'), 'Escape')
    expect(q(section, '[data-confirm]').hidden).toBe(true)
    expect(archive.list()).toHaveLength(2)
  })
})
