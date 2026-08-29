/**
 * Archive module for The Disappearing Draft (plan task T6).
 *
 * Durable local history of survived sessions. localStorage persistence with a
 * versioned envelope (`{ version, entries }`), corrupt-JSON fallback that
 * quarantines (never silently destroys) the payload, newest-first listing,
 * single-entry delete, clear-all, and quota failures surfaced as typed results
 * instead of crashes. The storage adapter is injectable so tests run against
 * an in-memory fake and never touch real localStorage.
 *
 * Metadata per the planning decision (2026-08-28):
 *   entry   = { id, createdAt, endedAt, durationSec, preset, wordCount,
 *              title, excerpt, text }
 *   title   = first ~6 words truncated at a word boundary (space + "…" when
 *             cut), fallback "Untitled session" for empty/whitespace text;
 *             runs of whitespace collapse to single spaces.
 *   excerpt = first 160 chars of the trimmed text (no truncation marker —
 *             display ellipsis is T11's presentation choice).
 *   list    = newest-first: endedAt desc, then createdAt desc, then id desc.
 *
 * Corruption policy: any payload that is not parseable JSON, not the current
 * schema version, or not a valid entry array is moved verbatim to a quarantine
 * key and the archive continues from empty. Ids are generated at save time
 * (crypto.randomUUID with a non-crypto fallback).
 */

import { PRESETS, type PresetId } from '../engine/timing'

/** localStorage key holding the versioned archive envelope. */
export const ARCHIVE_STORAGE_KEY = 'the-disappearing-draft:archive'
/** Key where a corrupt payload is preserved verbatim before starting empty. */
export const ARCHIVE_QUARANTINE_KEY = `${ARCHIVE_STORAGE_KEY}:corrupt`
/** Bump on schema change (a migration story is intentionally out of scope). */
export const ARCHIVE_SCHEMA_VERSION = 1

export const TITLE_MAX_WORDS = 6
export const EXCERPT_MAX_CHARS = 160
export const UNTITLED_SESSION_TITLE = 'Untitled session'

export interface ArchiveEntry {
  /** Generated at save time; stable identity for update/remove. */
  id: string
  /** Epoch ms the session was armed/started. */
  createdAt: number
  /** Epoch ms the session ended (disarm; later bumped by Done via update). */
  endedAt: number
  /** Running time in seconds. */
  durationSec: number
  preset: PresetId
  wordCount: number
  title: string
  excerpt: string
  text: string
}

/** What a caller provides to save a session; metadata is derived from text. */
export interface SaveEntryInput {
  createdAt: number
  endedAt: number
  durationSec: number
  preset: PresetId
  text: string
}

/**
 * T10 wind-down seam: at disarm an entry is written, then Done finalizes it.
 * When `text` is patched, wordCount/title/excerpt are re-derived.
 */
export interface UpdateEntryPatch {
  text?: string
  endedAt?: number
  durationSec?: number
}

export type ArchiveFailureKind = 'quota-exceeded' | 'storage-error' | 'not-found'

export interface ArchiveFailure {
  ok: false
  kind: ArchiveFailureKind
  /** The thrown cause for storage failures; absent for 'not-found'. */
  cause?: unknown
}

export type ArchiveResult<T> = { ok: true; value: T } | ArchiveFailure

/** Minimal localStorage-shaped seam; injectable for tests. */
export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ArchiveStore {
  /** Newest-first entries; corrupt storage falls back to []. */
  list(): ArchiveEntry[]
  save(input: SaveEntryInput): ArchiveResult<ArchiveEntry>
  update(id: string, patch: UpdateEntryPatch): ArchiveResult<ArchiveEntry>
  /** value: whether an entry with that id existed and was removed. */
  remove(id: string): ArchiveResult<boolean>
  /** value: how many entries were removed. */
  clear(): ArchiveResult<number>
}

// ---------------------------------------------------------------------------
// Metadata derivation (pure) — planning decision 2026-08-28.
// ---------------------------------------------------------------------------

function wordsOf(text: string): string[] {
  const trimmed = text.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** trim-split semantics: trim, then split on whitespace runs; empty text = 0. */
export function deriveWordCount(text: string): number {
  return wordsOf(text).length
}

/**
 * First TITLE_MAX_WORDS words with whitespace collapsed; a truncation marker
 * (" …") only when more words followed, so a cut never lands mid-word.
 * Empty/whitespace-only text falls back to UNTITLED_SESSION_TITLE.
 */
export function deriveTitle(text: string): string {
  const words = wordsOf(text)
  if (words.length === 0) return UNTITLED_SESSION_TITLE
  if (words.length <= TITLE_MAX_WORDS) return words.join(' ')
  return `${words.slice(0, TITLE_MAX_WORDS).join(' ')} …`
}

/** First EXCERPT_MAX_CHARS chars of the trimmed text, exactly. */
export function deriveExcerpt(text: string): string {
  return text.trim().slice(0, EXCERPT_MAX_CHARS)
}

export interface ArchiveMetadata {
  wordCount: number
  title: string
  excerpt: string
}

export function deriveMetadata(text: string): ArchiveMetadata {
  return { wordCount: deriveWordCount(text), title: deriveTitle(text), excerpt: deriveExcerpt(text) }
}

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, value)
}

/**
 * Runtime boundary check for caller-supplied fields (TS covers most of this;
 * numbers can still be NaN/Infinity at runtime). Matches timing.ts's habit of
 * throwing RangeError on invalid configuration — programmer errors throw;
 * environment failures (quota, storage) come back as typed results.
 */
function assertValidEntry(
  createdAt: number,
  endedAt: number,
  durationSec: number,
  preset: PresetId,
  text: string,
): void {
  if (!Number.isFinite(createdAt)) {
    throw new RangeError(`archive entry createdAt must be finite epoch ms, got ${createdAt}`)
  }
  if (!Number.isFinite(endedAt) || endedAt < createdAt) {
    throw new RangeError(`archive entry requires finite endedAt >= createdAt (${createdAt}), got ${endedAt}`)
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    throw new RangeError(`archive entry durationSec must be a finite number >= 0, got ${durationSec}`)
  }
  if (!isPresetId(preset)) {
    throw new RangeError(`archive entry preset must be one of ${Object.keys(PRESETS).join('|')}, got ${String(preset)}`)
  }
  if (typeof text !== 'string') {
    throw new TypeError(`archive entry text must be a string, got ${typeof text}`)
  }
}

/** Structural type guard for entries read back from storage. */
function isArchiveEntry(value: unknown): value is ArchiveEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    e.id !== '' &&
    typeof e.createdAt === 'number' &&
    Number.isFinite(e.createdAt) &&
    typeof e.endedAt === 'number' &&
    Number.isFinite(e.endedAt) &&
    e.endedAt >= e.createdAt &&
    typeof e.durationSec === 'number' &&
    Number.isFinite(e.durationSec) &&
    e.durationSec >= 0 &&
    isPresetId(e.preset) &&
    typeof e.wordCount === 'number' &&
    Number.isFinite(e.wordCount) &&
    e.wordCount >= 0 &&
    typeof e.title === 'string' &&
    typeof e.excerpt === 'string' &&
    typeof e.text === 'string'
  )
}

// ---------------------------------------------------------------------------
// Storage plumbing.
// ---------------------------------------------------------------------------

const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])

/** Chrome/Safari throw QuotaExceededError (legacy code 22); Firefox throws NS_ERROR_DOM_QUOTA_REACHED. */
function isQuotaExceededError(cause: unknown): boolean {
  if (cause instanceof DOMException) {
    return QUOTA_ERROR_NAMES.has(cause.name) || cause.code === 22
  }
  if (cause instanceof Error) {
    return QUOTA_ERROR_NAMES.has(cause.name)
  }
  return false
}

function writeFailure(cause: unknown): ArchiveFailure {
  return isQuotaExceededError(cause)
    ? { ok: false, kind: 'quota-exceeded', cause }
    : { ok: false, kind: 'storage-error', cause }
}

function newestFirst(entries: readonly ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort(
    (a, b) => b.endedAt - a.endedAt || b.createdAt - a.createdAt || idDesc(a.id, b.id),
  )
}

function idDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0
}

/** Returns the parsed entries, or null when the payload is corrupt. */
function parseStoredArchive(raw: string): ArchiveEntry[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { version, entries } = parsed as { version?: unknown; entries?: unknown }
  if (version !== ARCHIVE_SCHEMA_VERSION) return null
  if (!Array.isArray(entries) || !entries.every(isArchiveEntry)) return null
  return newestFirst(entries as ArchiveEntry[])
}

/** Best-effort non-destructive fallback: preserve the raw bytes, then start empty. */
function quarantineCorruptPayload(storage: StorageAdapter, raw: string): void {
  try {
    storage.setItem(ARCHIVE_QUARANTINE_KEY, raw)
    storage.removeItem(ARCHIVE_STORAGE_KEY)
  } catch {
    // If the payload cannot be moved, leave the corrupt key in place rather
    // than destroy potentially recoverable user history.
  }
  console.warn(
    `[archive] ignoring corrupt archive payload under "${ARCHIVE_STORAGE_KEY}" ` +
      `(expected schema v${ARCHIVE_SCHEMA_VERSION}); preserved verbatim under ` +
      `"${ARCHIVE_QUARANTINE_KEY}" and continuing from an empty archive.`,
  )
}

function readRaw(storage: StorageAdapter): string | null {
  try {
    return storage.getItem(ARCHIVE_STORAGE_KEY)
  } catch (cause) {
    console.warn(`[archive] storage read failed (${String(cause)}); treating the archive as empty.`)
    return null
  }
}

function loadEntries(storage: StorageAdapter): ArchiveEntry[] {
  const raw = readRaw(storage)
  if (raw === null) return [] // key absent (or unreadable) — nothing stored yet
  const entries = parseStoredArchive(raw)
  if (entries !== null) return entries
  quarantineCorruptPayload(storage, raw)
  return []
}

function tryWrite(storage: StorageAdapter, entries: readonly ArchiveEntry[]): ArchiveFailure | null {
  try {
    storage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify({ version: ARCHIVE_SCHEMA_VERSION, entries }))
    return null
  } catch (cause) {
    return writeFailure(cause)
  }
}

function newId(): string {
  const c = globalThis.crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function freshId(existing: readonly ArchiveEntry[]): string {
  let id = newId()
  while (existing.some((e) => e.id === id)) id = newId()
  return id
}

/**
 * localStorage adapter guarded for hostile contexts: some privacy modes throw
 * on the bare `localStorage` access. Read failures behave as "no archive";
 * write failures propagate so they surface as typed results.
 */
export function localStorageAdapter(): StorageAdapter {
  const open = (): Storage | null => {
    try {
      return globalThis.localStorage ?? null
    } catch {
      return null
    }
  }
  return {
    getItem: (key) => {
      const s = open()
      if (s === null) return null
      try {
        return s.getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key, value) => {
      const s = open()
      if (s === null) throw new Error('localStorage is not available in this context')
      s.setItem(key, value)
    },
    removeItem: (key) => {
      const s = open()
      if (s === null) throw new Error('localStorage is not available in this context')
      s.removeItem(key)
    },
  }
}

/** Create an archive store over the given adapter (defaults to localStorage). */
export function createArchive(storage: StorageAdapter = localStorageAdapter()): ArchiveStore {
  return {
    list: () => loadEntries(storage),

    save: (input) => {
      assertValidEntry(input.createdAt, input.endedAt, input.durationSec, input.preset, input.text)
      const entries = loadEntries(storage)
      const entry: ArchiveEntry = {
        id: freshId(entries),
        createdAt: input.createdAt,
        endedAt: input.endedAt,
        durationSec: input.durationSec,
        preset: input.preset,
        ...deriveMetadata(input.text),
        text: input.text,
      }
      const failure = tryWrite(storage, newestFirst([entry, ...entries]))
      return failure ?? { ok: true, value: entry }
    },

    update: (id, patch) => {
      const entries = loadEntries(storage)
      const current = entries.find((e) => e.id === id)
      if (current === undefined) return { ok: false, kind: 'not-found' }
      const text = patch.text ?? current.text
      const next: ArchiveEntry = {
        ...current,
        text,
        endedAt: patch.endedAt ?? current.endedAt,
        durationSec: patch.durationSec ?? current.durationSec,
        ...deriveMetadata(text),
      }
      assertValidEntry(next.createdAt, next.endedAt, next.durationSec, next.preset, next.text)
      const failure = tryWrite(storage, newestFirst(entries.map((e) => (e.id === id ? next : e))))
      return failure ?? { ok: true, value: next }
    },

    remove: (id) => {
      const entries = loadEntries(storage)
      const remaining = entries.filter((e) => e.id !== id)
      if (remaining.length === entries.length) return { ok: true, value: false }
      const failure = tryWrite(storage, remaining)
      return failure ?? { ok: true, value: true }
    },

    clear: () => {
      const count = loadEntries(storage).length
      if (count === 0) return { ok: true, value: 0 }
      try {
        storage.removeItem(ARCHIVE_STORAGE_KEY)
      } catch (cause) {
        return writeFailure(cause)
      }
      return { ok: true, value: count }
    },
  }
}
