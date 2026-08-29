/**
 * Pure timing state machine for The Disappearing Draft (plan task T2).
 *
 * Everything here is a pure function of wall-clock milliseconds
 * (Date.now()-style epoch ms). No DOM, no timers, no mutable state — the
 * controller (T3) owns the event loop and calls `deriveTimingState` at every
 * reconciliation point (rAF tick, visibility/focus/pageshow return).
 *
 * Timeline semantics for an armed session (inactivity = now - lastInputAt):
 *
 *   pre-arm   sessionEndAt === null — no session armed yet.
 *   armed     inactivity < fadeDelayMs            — opacity 1, threat counting.
 *   fading    fadeDelayMs <= inactivity < deleteThresholdMs
 *             — opacity decays linearly 1 -> 0 across the fade window.
 *   deleted   inactivity >= deleteThresholdMs AND the delete boundary
 *             (lastInputAt + deleteThresholdMs) is strictly before sessionEndAt.
 *   survived  session end reached before the delete boundary — disarm at 0:00.
 *             The draft is safe; opacity restores to 1 for the wind-down.
 *
 * Deletion-vs-disarm collisions are decided chronologically by wall clock:
 * whichever boundary is crossed first wins, and an exact tie goes to disarm
 * (disarm-at-zero precedence over deletion). A single recompute after a
 * hidden-tab overstay is therefore historically correct (R1).
 *
 * Precondition: lastInputAt <= now (the controller maintains this by setting
 * lastInputAt = Date.now() on arm and on each text-changing input).
 */

export type TimingPhase = 'pre-arm' | 'armed' | 'fading' | 'deleted' | 'survived'

export interface TimingConfig {
  /** Inactivity ms before the text starts fading. */
  fadeDelayMs: number
  /** Inactivity ms at which the draft is irreversibly deleted (> fadeDelayMs). */
  deleteThresholdMs: number
}

export interface TimingState {
  phase: TimingPhase
  /** 0..1 inclusive — the write surface's per-frame opacity (T9 consumes). */
  opacity: number
  /** Ms until session end; 0 when not armed or already ended. */
  remainingMs: number
  /** Ms until deletion counting from inactivity; 0 once deleted, disarmed, or not armed. */
  deletesInMs: number
}

/** Difficulty presets — planning decision 2026-08-28 (values fixed at scoping). */
export const PRESETS = {
  GENTLE: { fadeDelayMs: 10_000, deleteThresholdMs: 30_000 },
  STANDARD: { fadeDelayMs: 5_000, deleteThresholdMs: 10_000 },
  BRUTAL: { fadeDelayMs: 3_000, deleteThresholdMs: 6_000 },
} as const satisfies Record<string, TimingConfig>

export type PresetId = keyof typeof PRESETS

/** Session-duration presets in minutes — planning decision 2026-08-28. */
export const DURATION_PRESET_MINUTES = [3, 5, 10, 15] as const

export const MIN_SESSION_MINUTES = 1
export const MAX_SESSION_MINUTES = 120
export const MS_PER_MINUTE = 60_000

/** True when `minutes` is a usable custom session length (1–120, finite). */
export function isValidSessionMinutes(minutes: number): boolean {
  return (
    Number.isFinite(minutes) &&
    minutes >= MIN_SESSION_MINUTES &&
    minutes <= MAX_SESSION_MINUTES
  )
}

/** Session-end epoch ms for a session armed at `armedAt` lasting `minutes`. */
export function sessionEndAt(armedAt: number, minutes: number): number {
  if (!isValidSessionMinutes(minutes)) {
    throw new RangeError(
      `session length must be ${MIN_SESSION_MINUTES}-${MAX_SESSION_MINUTES} minutes, got ${minutes}`,
    )
  }
  return armedAt + minutes * MS_PER_MINUTE
}

function assertValidConfig(fadeDelayMs: number, deleteThresholdMs: number): void {
  const valid =
    Number.isFinite(fadeDelayMs) &&
    Number.isFinite(deleteThresholdMs) &&
    fadeDelayMs >= 0 &&
    deleteThresholdMs > fadeDelayMs
  if (!valid) {
    throw new RangeError(
      `timing config requires 0 <= fadeDelayMs < deleteThresholdMs, got fadeDelayMs=${fadeDelayMs} deleteThresholdMs=${deleteThresholdMs}`,
    )
  }
}

/**
 * Derive the instantaneous timing state. Idempotent: same inputs, same output;
 * the controller emits transitions only when the phase value changes.
 */
export function deriveTimingState(
  now: number,
  lastInputAt: number,
  fadeDelayMs: number,
  deleteThresholdMs: number,
  sessionEndAt: number | null,
): TimingState {
  assertValidConfig(fadeDelayMs, deleteThresholdMs)

  if (sessionEndAt === null) {
    return { phase: 'pre-arm', opacity: 1, remainingMs: 0, deletesInMs: 0 }
  }

  const inactiveMs = now - lastInputAt
  const deleteAt = lastInputAt + deleteThresholdMs

  // Threat matured. Deletion only if its boundary was crossed strictly before
  // the session ended; disarm at 0:00 wins ties and any collision where the
  // session ended first.
  if (inactiveMs >= deleteThresholdMs) {
    if (deleteAt < sessionEndAt) {
      return {
        phase: 'deleted',
        opacity: 0,
        remainingMs: Math.max(0, sessionEndAt - now),
        deletesInMs: 0,
      }
    }
    return { phase: 'survived', opacity: 1, remainingMs: 0, deletesInMs: 0 }
  }

  if (now >= sessionEndAt) {
    return { phase: 'survived', opacity: 1, remainingMs: 0, deletesInMs: 0 }
  }

  const remainingMs = sessionEndAt - now
  const deletesInMs = deleteThresholdMs - inactiveMs

  if (inactiveMs >= fadeDelayMs) {
    const fadeSpanMs = deleteThresholdMs - fadeDelayMs
    const opacity = 1 - (inactiveMs - fadeDelayMs) / fadeSpanMs
    return { phase: 'fading', opacity, remainingMs, deletesInMs }
  }

  return { phase: 'armed', opacity: 1, remainingMs, deletesInMs }
}
