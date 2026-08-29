import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PresetId } from '../engine/timing'
import {
  ARCHIVE_QUARANTINE_KEY,
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_STORAGE_KEY,
  EXCERPT_MAX_CHARS,
  TITLE_MAX_WORDS,
  UNTITLED_SESSION_TITLE,
  createArchive,
  deriveExcerpt,
  deriveTitle,
  deriveWordCount,
  type ArchiveResult,
  type SaveEntryInput,
  type StorageAdapter,
} from './archive'

// ---------------------------------------------------------------------------
// In-memory storage fake — real localStorage is never touched in unit tests.
// ---------------------------------------------------------------------------

class FakeStorage implements StorageAdapter {
  private readonly files = new Map<string, string>()
  private failing = false
  private setFailure: unknown = null

  getItem(key: string): string | null {
    return this.files.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failing) throw this.setFailure
    this.files.set(key, value)
  }

  removeItem(key: string): void {
    this.files.delete(key)
  }

  /** Test seam: make every setItem throw the given error. */
  failSetWith(cause: unknown): void {
    this.failing = true
    this.setFailure = cause
  }

  healSet(): void {
    this.failing = false
    this.setFailure = null
  }

  /** Write bypassing the throwing path (corrupt-payload fixtures). */
  inject(key: string, value: string): void {
    this.files.set(key, value)
  }

  raw(key: string): string | null {
    return this.files.get(key) ?? null
  }
}

function expectOk<T>(result: ArchiveResult<T>): T {
  if (!result.ok) throw new Error(`expected result.ok true, got failure kind "${result.kind}"`)
  return result.value
}

// Fixtures: session n runs [T0 + n*5min, T0 + (n+1)*5min), STANDARD preset.
const T0 = 1_782_600_000_000
const MIN = 60_000

function session(n: number, overrides: Partial<SaveEntryInput> = {}): SaveEntryInput {
  return {
    createdAt: T0 + n * 5 * MIN,
    endedAt: T0 + (n + 1) * 5 * MIN,
    durationSec: 300,
    preset: 'STANDARD',
    text: `Session ${n}: the quick brown fox keeps writing while the lamp burns.`,
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Metadata derivation — planning-decision semantics.
// ---------------------------------------------------------------------------

describe('deriveWordCount — trim-split semantics', () => {
  it('empty and whitespace-only text count as zero words', () => {
    expect(deriveWordCount('')).toBe(0)
    expect(deriveWordCount('   ')).toBe(0)
    expect(deriveWordCount(' \n\t\r ')).toBe(0)
  })

  it('trims, then splits on whitespace runs (newlines/tabs are separators)', () => {
    expect(deriveWordCount('one')).toBe(1)
    expect(deriveWordCount('  hello   world  ')).toBe(2)
    expect(deriveWordCount('a\nb\tc\rd')).toBe(4)
    expect(deriveWordCount('the quick brown fox jumps over the lazy dog')).toBe(9)
  })
})

describe('deriveTitle — first ~6 words, word-boundary truncation', () => {
  it('pins the planning-decision constants', () => {
    expect(TITLE_MAX_WORDS).toBe(6)
    expect(EXCERPT_MAX_CHARS).toBe(160)
    expect(UNTITLED_SESSION_TITLE).toBe('Untitled session')
  })

  it('falls back to "Untitled session" for empty or whitespace-only text', () => {
    expect(deriveTitle('')).toBe(UNTITLED_SESSION_TITLE)
    expect(deriveTitle('  \n ')).toBe(UNTITLED_SESSION_TITLE)
  })

  it('uses the whole text (whitespace collapsed) when it has six words or fewer', () => {
    expect(deriveTitle('six word title right here exactly')).toBe('six word title right here exactly')
    expect(deriveTitle('one\ntwo\tthree four five six')).toBe('one two three four five six')
    expect(deriveTitle('singleword')).toBe('singleword')
  })

  it('truncates after the sixth word at the word boundary — never mid-word', () => {
    expect(deriveTitle('one two three four five six seven')).toBe('one two three four five six …')
    // A long seventh word is dropped whole, not sliced.
    expect(deriveTitle('one two three four five six extraordinarilysupercalifragilisticword')).toBe(
      'one two three four five six …',
    )
    expect(deriveTitle('alpha beta gamma delta epsilon zeta eta theta')).toBe(
      'alpha beta gamma delta epsilon zeta …',
    )
  })
})

describe('deriveExcerpt — first 160 chars of the trimmed text', () => {
  it('returns short text unchanged after trimming', () => {
    expect(deriveExcerpt('short')).toBe('short')
    expect(deriveExcerpt('  padded all around  ')).toBe('padded all around')
    expect(deriveExcerpt('')).toBe('')
  })

  it('cuts at exactly 160 chars — no marker appended', () => {
    const exact = 'x'.repeat(160)
    expect(deriveExcerpt(exact)).toBe(exact)
    const over = 'y'.repeat(161)
    expect(deriveExcerpt(over)).toBe('y'.repeat(160))
    expect(deriveExcerpt(over)).toHaveLength(160)
  })
})

// ---------------------------------------------------------------------------
// Store behavior over the injected adapter.
// ---------------------------------------------------------------------------

describe('archive store — save/list/delete/clear', () => {
  it('empty archive: list() returns [] on fresh storage', () => {
    const archive = createArchive(new FakeStorage())
    expect(archive.list()).toEqual([])
  })

  it('save derives and stores the full metadata envelope', () => {
    const archive = createArchive(new FakeStorage())
    const text = 'The quick brown fox jumps over the lazy dog again and again'
    const saved = expectOk(archive.save(session(1, { text })))
    expect(saved.id).not.toBe('')
    expect(saved.title).toBe('The quick brown fox jumps over …')
    expect(saved.wordCount).toBe(12)
    expect(saved.excerpt).toBe(text)
    expect(archive.list()).toEqual([saved])
  })

  it('lists newest-first (endedAt desc) regardless of save order', () => {
    const archive = createArchive(new FakeStorage())
    const first = expectOk(archive.save(session(1)))
    const third = expectOk(archive.save(session(3)))
    const second = expectOk(archive.save(session(2)))
    expect(archive.list().map((e) => e.id)).toEqual([third.id, second.id, first.id])
  })

  it('persists through the versioned envelope; a second store instance sees it', () => {
    const storage = new FakeStorage()
    const a = createArchive(storage)
    const oldest = expectOk(a.save(session(1)))
    const newest = expectOk(a.save(session(2)))
    const raw = storage.raw(ARCHIVE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw ?? 'null') as { version: number; entries: { id: string }[] }
    expect(parsed.version).toBe(ARCHIVE_SCHEMA_VERSION)
    expect(parsed.entries.map((e) => e.id)).toEqual([newest.id, oldest.id]) // stored pre-sorted
    expect(createArchive(storage).list().map((e) => e.id)).toEqual([newest.id, oldest.id])
  })

  it('delete removes exactly one entry; unknown ids report value false', () => {
    const archive = createArchive(new FakeStorage())
    const a = expectOk(archive.save(session(1)))
    const b = expectOk(archive.save(session(2)))
    const c = expectOk(archive.save(session(3)))
    expect(archive.remove(b.id)).toEqual({ ok: true, value: true })
    expect(archive.list().map((e) => e.id)).toEqual([c.id, a.id])
    expect(archive.list().map((e) => e.id)).not.toContain(b.id)
    expect(archive.remove('no-such-id')).toEqual({ ok: true, value: false })
    expect(archive.list()).toHaveLength(2)
  })

  it('clear-all removes every entry and the storage key', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    expectOk(archive.save(session(1)))
    expectOk(archive.save(session(2)))
    expect(archive.clear()).toEqual({ ok: true, value: 2 })
    expect(archive.list()).toEqual([])
    expect(storage.raw(ARCHIVE_STORAGE_KEY)).toBeNull()
    expect(archive.clear()).toEqual({ ok: true, value: 0 })
  })

  it('update (T10 Done seam) re-derives metadata, bumps order, and reports not-found', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    const early = expectOk(archive.save(session(1)))
    const later = expectOk(archive.save(session(2)))

    const finalized = expectOk(
      archive.update(later.id, {
        text: 'Wind-down edits: one two three four five six seven more',
        endedAt: later.endedAt + 30_000,
        durationSec: 330,
      }),
    )
    expect(finalized.title).toBe('Wind-down edits: one two three four …')
    expect(finalized.wordCount).toBe(10)
    expect(finalized.durationSec).toBe(330)
    expect(archive.list().map((e) => e.id)).toEqual([finalized.id, early.id])

    expect(archive.update('no-such-id', { text: 'x' })).toEqual({ ok: false, kind: 'not-found' })
  })

  it('rejects invalid caller inputs without touching storage', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    expect(() => archive.save(session(1, { durationSec: -1 }))).toThrow(RangeError)
    expect(() => archive.save(session(1, { durationSec: Number.NaN }))).toThrow(RangeError)
    expect(() => archive.save(session(1, { endedAt: Number.POSITIVE_INFINITY }))).toThrow(RangeError)
    expect(() => archive.save(session(1, { endedAt: T0 }))).toThrow(RangeError) // before createdAt
    expect(() => archive.save(session(1, { preset: 'SURREAL' as PresetId }))).toThrow(RangeError)
    expect(() => archive.save(session(1, { text: 42 as unknown as string }))).toThrow(TypeError)
    const saved = expectOk(archive.save(session(1)))
    expect(() => archive.update(saved.id, { endedAt: 0 })).toThrow(RangeError)
    expect(archive.list()).toEqual([saved]) // failed validations wrote nothing
  })
})

// ---------------------------------------------------------------------------
// Corrupt storage fallback — non-destructive quarantine.
// ---------------------------------------------------------------------------

const VALID_STORED_ENTRY = {
  id: 'entry-1',
  createdAt: T0,
  endedAt: T0 + 5 * MIN,
  durationSec: 300,
  preset: 'GENTLE',
  wordCount: 1,
  title: 'hello',
  excerpt: 'hello',
  text: 'hello',
} as const

const CORRUPT_PAYLOADS: { label: string; raw: string }[] = [
  { label: 'unparseable JSON', raw: '{"version":1,"entries":[' },
  { label: 'JSON null', raw: 'null' },
  { label: 'wrong schema version', raw: JSON.stringify({ version: 99, entries: [] }) },
  { label: 'entries not an array', raw: JSON.stringify({ version: 1, entries: 'nope' }) },
  { label: 'entry with non-string id', raw: JSON.stringify({ version: 1, entries: [{ ...VALID_STORED_ENTRY, id: 42 }] }) },
  { label: 'entry with negative durationSec', raw: JSON.stringify({ version: 1, entries: [{ ...VALID_STORED_ENTRY, durationSec: -5 }] }) },
  { label: 'entry with unknown preset', raw: JSON.stringify({ version: 1, entries: [{ ...VALID_STORED_ENTRY, preset: 'NIGHTMARE' }] }) },
]

describe('corrupt storage falls back to empty, non-destructively', () => {
  it.each(CORRUPT_PAYLOADS)('$label: list() = [], raw payload quarantined, key cleared, warned once', ({ raw }) => {
    const storage = new FakeStorage()
    storage.inject(ARCHIVE_STORAGE_KEY, raw)
    const archive = createArchive(storage)

    expect(archive.list()).toEqual([])
    expect(storage.raw(ARCHIVE_QUARANTINE_KEY)).toBe(raw) // preserved verbatim
    expect(storage.raw(ARCHIVE_STORAGE_KEY)).toBeNull() // corrupt key removed
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1)
    expect(archive.list()).toEqual([]) // second read is clean, no repeat warning
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1)
  })

  it('recovers: first save after quarantine starts a clean archive', () => {
    const storage = new FakeStorage()
    storage.inject(ARCHIVE_STORAGE_KEY, 'garbage{{')
    const archive = createArchive(storage)
    expect(archive.list()).toEqual([])
    const saved = expectOk(archive.save(session(1)))
    expect(archive.list().map((e) => e.id)).toEqual([saved.id])
    expect(storage.raw(ARCHIVE_QUARANTINE_KEY)).toBe('garbage{{')
  })
})

// ---------------------------------------------------------------------------
// Quota / storage failures — typed results, never crashes.
// ---------------------------------------------------------------------------

describe('quota and storage failures surface as typed results', () => {
  it('QuotaExceededError on save -> { ok:false, kind:"quota-exceeded" }, data intact, recovers after heal', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    const first = expectOk(archive.save(session(1)))

    const quota = new DOMException('mock quota exceeded', 'QuotaExceededError')
    storage.failSetWith(quota)
    const result = archive.save(session(2))
    expect(result).toEqual({ ok: false, kind: 'quota-exceeded', cause: quota })
    expect(archive.list().map((e) => e.id)).toEqual([first.id]) // failed write left storage untouched

    storage.healSet()
    const second = expectOk(archive.save(session(2)))
    expect(archive.list().map((e) => e.id)).toEqual([second.id, first.id])
  })

  it('Firefox-style NS_ERROR_DOM_QUOTA_REACHED and legacy name-only errors map to quota-exceeded', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    storage.failSetWith(new DOMException('mock', 'NS_ERROR_DOM_QUOTA_REACHED'))
    expect(archive.save(session(1)).ok).toBe(false)
    expect(archive.save(session(1))).toMatchObject({ ok: false, kind: 'quota-exceeded' })
    storage.failSetWith(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }))
    expect(archive.save(session(1))).toMatchObject({ ok: false, kind: 'quota-exceeded' })
  })

  it('non-quota storage errors map to storage-error', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    const boom = new Error('disk on fire')
    storage.failSetWith(boom)
    expect(archive.save(session(1))).toEqual({ ok: false, kind: 'storage-error', cause: boom })
  })

  it('update surfaces quota failures without crashing or corrupting stored data', () => {
    const storage = new FakeStorage()
    const archive = createArchive(storage)
    const saved = expectOk(archive.save(session(1)))
    const before = storage.raw(ARCHIVE_STORAGE_KEY)
    const quota = new DOMException('mock quota exceeded', 'QuotaExceededError')
    storage.failSetWith(quota)
    expect(archive.update(saved.id, { text: 'edited' })).toEqual({
      ok: false,
      kind: 'quota-exceeded',
      cause: quota,
    })
    expect(storage.raw(ARCHIVE_STORAGE_KEY)).toBe(before) // untouched
    expect(archive.list()[0]?.text).toBe(saved.text)
  })
})
