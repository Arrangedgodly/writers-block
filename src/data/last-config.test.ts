import { describe, expect, it, vi } from 'vitest'
import { ARCHIVE_STORAGE_KEY, type StorageAdapter } from './archive'
import {
  LAST_CONFIG_SCHEMA_VERSION,
  LAST_CONFIG_STORAGE_KEY,
  createLastConfigStore,
} from './last-config'

// R2 — the one-motion restart's recall mechanism, in isolation from the
// router (the deletion-loop walkthrough in router.test.ts proves the loop).
// Node env, in-memory storage fake: real localStorage is never touched.

class FakeStorage implements StorageAdapter {
  private readonly files = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.files.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.files.set(key, value)
  }

  removeItem(key: string): void {
    this.files.delete(key)
  }
}

describe('last-config store (R2): remember / recall round-trip', () => {
  it('recalls what was remembered this page-load, as a copy', () => {
    const storage = new FakeStorage()
    const store = createLastConfigStore(storage)
    expect(store.recall()).toBeNull() // nothing armed yet

    store.remember({ preset: 'GENTLE', minutes: 7 })
    const recalled = store.recall()
    expect(recalled).toEqual({ preset: 'GENTLE', minutes: 7 })
    // A copy, not the held reference — callers cannot corrupt the record.
    if (recalled !== null) recalled.minutes = 120
    expect(store.recall()).toEqual({ preset: 'GENTLE', minutes: 7 })

    // The newest calibration wins (every startSession re-records).
    store.remember({ preset: 'BRUTAL', minutes: 3 })
    expect(store.recall()).toEqual({ preset: 'BRUTAL', minutes: 3 })
  })

  it('persists the versioned envelope under its OWN key and survives a fresh store (page-load)', () => {
    const storage = new FakeStorage()
    createLastConfigStore(storage).remember({ preset: 'STANDARD', minutes: 10 })

    // Own key, versioned like the archive's envelope, separate from it.
    expect(LAST_CONFIG_STORAGE_KEY).not.toBe(ARCHIVE_STORAGE_KEY)
    expect(LAST_CONFIG_STORAGE_KEY).toMatch(/^the-disappearing-draft:/)
    const raw = storage.getItem(LAST_CONFIG_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ version: LAST_CONFIG_SCHEMA_VERSION, preset: 'STANDARD', minutes: 10 })
    expect(storage.getItem(ARCHIVE_STORAGE_KEY)).toBeNull() // drafts' home is never touched

    // A fresh store over the same adapter = the next page-load.
    expect(createLastConfigStore(storage).recall()).toEqual({ preset: 'STANDARD', minutes: 10 })
  })

  it('write failures never surface (recall keeps serving the in-memory record)', () => {
    const storage = new FakeStorage()
    const store = createLastConfigStore(storage)
    storage.failWrites = true
    expect(() => store.remember({ preset: 'BRUTAL', minutes: 15 })).not.toThrow()
    expect(store.recall()).toEqual({ preset: 'BRUTAL', minutes: 15 }) // this page-load still served
    expect(createLastConfigStore(storage).recall()).toBeNull() // nothing persisted — honest degradation
  })
})

describe('last-config store (R2): corrupt or foreign payloads are ignored, never quarantined', () => {
  const cases: Array<[label: string, raw: string]> = [
    ['unparseable JSON', '{preset:'],
    ['wrong schema version', JSON.stringify({ version: 99, preset: 'STANDARD', minutes: 5 })],
    ['missing version', JSON.stringify({ preset: 'STANDARD', minutes: 5 })],
    ['unknown preset', JSON.stringify({ version: 1, preset: 'NIGHTMARE', minutes: 5 })],
    ['minutes below the floor', JSON.stringify({ version: 1, preset: 'STANDARD', minutes: 0 })],
    ['minutes above the ceiling', JSON.stringify({ version: 1, preset: 'STANDARD', minutes: 121 })],
    ['non-numeric minutes', JSON.stringify({ version: 1, preset: 'STANDARD', minutes: '5' })],
    ['array payload', JSON.stringify([1, 2, 3])],
  ]

  for (const [label, raw] of cases) {
    it(`ignores a payload that is ${label} (null recall, nothing preserved, no throw)`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const storage = new FakeStorage()
        storage.setItem(LAST_CONFIG_STORAGE_KEY, raw)
        const store = createLastConfigStore(storage)
        expect(store.recall()).toBeNull()
        // Ignored, not quarantined: the corrupt bytes are left in place (the
        // next remember overwrites them) and no other key is written.
        expect(storage.getItem(LAST_CONFIG_STORAGE_KEY)).toBe(raw)
        expect(warn).toHaveBeenCalledTimes(1) // one honest line, then degradation
      } finally {
        warn.mockRestore()
      }
    })
  }

  it('an unreadable adapter degrades to null without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const hostile: StorageAdapter = {
        getItem: () => {
          throw new Error('SecurityError')
        },
        setItem: () => {
          throw new Error('SecurityError')
        },
        removeItem: () => {},
      }
      const store = createLastConfigStore(hostile)
      expect(() => store.remember({ preset: 'GENTLE', minutes: 1 })).not.toThrow()
      expect(store.recall()).toEqual({ preset: 'GENTLE', minutes: 1 })
      expect(createLastConfigStore(hostile).recall()).toBeNull()
    } finally {
      warn.mockRestore()
    }
  })
})
