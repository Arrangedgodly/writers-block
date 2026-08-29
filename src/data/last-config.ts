/**
 * Last-session configuration recall (refinement R2 — the one-motion restart).
 *
 * The deleted board's RE-ARM starts the NEXT session immediately with the
 * last-used duration + difficulty: failure funnels instantly into "start
 * again", not back through the setup console (critique F2; PRODUCT.md's
 * "a fast, shame-free restart after deletion"; DESIGN.md's "re-arm is one
 * motion"). This module is the whole recall mechanism — deliberately small:
 *
 * - `remember(config)` is called by the router on every `startSession` (the
 *   only path that ever arms), so the store always holds the calibration the
 *   writer last chose. Writing session config to storage is a deliberate,
 *   bounded exception to the app's ephemerality: config is NOT user content
 *   (no draft text ever passes through here — only a preset id and a minute
 *   count), and the archive's versioned-envelope discipline is mirrored so
 *   the payload can be schema-checked and discarded, never quarantined.
 * - `recall()` returns the remembered config or null. In-memory per
 *   page-load is the source of truth once set; a fresh page-load reads the
 *   persisted envelope so the restart loop survives a reload.
 *
 * Corruption policy (narrower than archive.ts, on purpose): a payload that
 * is unparseable, not the current schema version, or not a valid config is
 * IGNORED — recall degrades to "no calibration on record", RE-ARM falls back
 * to the setup console, and nothing is preserved or migrated. Config is a
 * convenience, never user history; there is nothing to quarantine.
 *
 * The storage adapter is the same injectable seam as the archive's, so tests
 * run against an in-memory fake and never touch real localStorage.
 */

import { PRESETS, isValidSessionMinutes, type PresetId } from '../engine/timing'
import { localStorageAdapter, type StorageAdapter } from './archive'

/** localStorage key holding the versioned last-config envelope. */
export const LAST_CONFIG_STORAGE_KEY = 'the-disappearing-draft:last-config'
/** Bump on schema change (mirrors ARCHIVE_SCHEMA_VERSION's discipline). */
export const LAST_CONFIG_SCHEMA_VERSION = 1

/** The calibration RE-ARM restarts with — exactly the setup console's output. */
export interface LastSessionConfig {
  preset: PresetId
  minutes: number
}

export interface LastConfigStore {
  /** Record the config a session was armed with (idempotent, best-effort). */
  remember(config: LastSessionConfig): void
  /** The last-armed config, or null when nothing valid is on record. */
  recall(): LastSessionConfig | null
}

function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, value)
}

/** Structural check for a config read back from storage. */
function isValidStoredConfig(value: unknown): value is LastSessionConfig {
  if (typeof value !== 'object' || value === null) return false
  const config = value as Record<string, unknown>
  return (
    isPresetId(config.preset) &&
    typeof config.minutes === 'number' &&
    isValidSessionMinutes(config.minutes)
  )
}

/**
 * Create the recall store over the given adapter (defaults to localStorage,
 * guarded for hostile contexts exactly like the archive's adapter).
 */
export function createLastConfigStore(storage: StorageAdapter = localStorageAdapter()): LastConfigStore {
  /** Set this page-load; once the writer has armed anything, memory wins. */
  let remembered: LastSessionConfig | null = null

  const warnIgnored = (reason: string): void => {
    console.warn(
      `[last-config] ignoring stored calibration under "${LAST_CONFIG_STORAGE_KEY}" (${reason}); ` +
        `RE-ARM falls back to the setup console.`,
    )
  }

  return {
    remember(config: LastSessionConfig): void {
      remembered = { preset: config.preset, minutes: config.minutes }
      try {
        storage.setItem(
          LAST_CONFIG_STORAGE_KEY,
          JSON.stringify({ version: LAST_CONFIG_SCHEMA_VERSION, preset: config.preset, minutes: config.minutes }),
        )
      } catch (cause) {
        // Recall is a convenience, never a failure surface: the in-memory
        // value still serves this page-load's restarts, and arming must not
        // be interrupted by a full quota or a hostile storage context.
        console.warn(`[last-config] persisting the calibration failed (${String(cause)}); kept in memory.`)
      }
    },

    recall(): LastSessionConfig | null {
      if (remembered !== null) return { ...remembered }
      let raw: string | null
      try {
        raw = storage.getItem(LAST_CONFIG_STORAGE_KEY)
      } catch {
        return null
      }
      if (raw === null) return null
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        warnIgnored('unparseable payload')
        return null
      }
      if (typeof parsed !== 'object' || parsed === null) {
        warnIgnored('not an object')
        return null
      }
      const envelope = parsed as { version?: unknown } & Record<string, unknown>
      if (envelope.version !== LAST_CONFIG_SCHEMA_VERSION) {
        warnIgnored(`expected schema v${LAST_CONFIG_SCHEMA_VERSION}`)
        return null
      }
      if (!isValidStoredConfig(parsed)) {
        warnIgnored('invalid preset or minutes')
        return null
      }
      // Only the config fields — the envelope's version never leaks out.
      return { preset: parsed.preset, minutes: parsed.minutes }
    },
  }
}
