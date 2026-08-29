import { describe, expect, it } from 'vitest'
import {
  DURATION_PRESET_MINUTES,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  MS_PER_MINUTE,
  PRESETS,
  deriveTimingState,
  isValidSessionMinutes,
  sessionEndAt,
  type TimingConfig,
  type TimingPhase,
} from './timing'

// Fixtures: STANDARD (fade 5s / delete 10s), armed at t=1,000,000, 5-minute session.
const FADE_MS = PRESETS.STANDARD.fadeDelayMs // 5_000
const DELETE_MS = PRESETS.STANDARD.deleteThresholdMs // 10_000
const ARMED_AT = 1_000_000
const END = ARMED_AT + 5 * MS_PER_MINUTE

const derive = (now: number, lastInputAt: number, end: number | null = END): ReturnType<typeof deriveTimingState> =>
  deriveTimingState(now, lastInputAt, FADE_MS, DELETE_MS, end)

describe('preset table and duration constraints', () => {
  it('has the planning-decided preset values', () => {
    expect({ ...PRESETS.GENTLE }).toEqual({ fadeDelayMs: 10_000, deleteThresholdMs: 30_000 })
    expect({ ...PRESETS.STANDARD }).toEqual({ fadeDelayMs: 5_000, deleteThresholdMs: 10_000 })
    expect({ ...PRESETS.BRUTAL }).toEqual({ fadeDelayMs: 3_000, deleteThresholdMs: 6_000 })
  })

  it('every preset satisfies 0 <= fade < delete', () => {
    for (const config of Object.values(PRESETS)) {
      expect(config.fadeDelayMs).toBeGreaterThanOrEqual(0)
      expect(config.deleteThresholdMs).toBeGreaterThan(config.fadeDelayMs)
    }
  })

  it('exposes the duration presets and the 1-120 custom bounds', () => {
    expect([...DURATION_PRESET_MINUTES]).toEqual([3, 5, 10, 15])
    expect(MIN_SESSION_MINUTES).toBe(1)
    expect(MAX_SESSION_MINUTES).toBe(120)
  })

  it('validates custom session minutes', () => {
    for (const ok of [1, 1.5, 60, 120]) expect(isValidSessionMinutes(ok)).toBe(true)
    for (const bad of [0, 0.999, 121, -5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(isValidSessionMinutes(bad)).toBe(false)
    }
  })

  it('computes session end from minutes and rejects out-of-range durations', () => {
    expect(sessionEndAt(1_000, 3)).toBe(1_000 + 3 * MS_PER_MINUTE)
    expect(sessionEndAt(0, 120)).toBe(120 * MS_PER_MINUTE)
    expect(sessionEndAt(5_000, 1)).toBe(5_000 + MS_PER_MINUTE)
    for (const bad of [0, 121, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sessionEndAt(0, bad)).toThrow(RangeError)
    }
  })

  it('honors fade/delete boundaries for every preset', () => {
    for (const config of Object.values(PRESETS) as TimingConfig[]) {
      const lastInput = 500_000
      const end = lastInput + 10 * MS_PER_MINUTE // disarm cannot interfere
      const at = (t: number) => deriveTimingState(t, lastInput, config.fadeDelayMs, config.deleteThresholdMs, end)
      expect(at(lastInput + config.fadeDelayMs - 1).phase).toBe('armed')
      expect(at(lastInput + config.fadeDelayMs).phase).toBe('fading')
      expect(at(lastInput + config.fadeDelayMs).opacity).toBe(1)
      expect(at(lastInput + config.deleteThresholdMs - 1).phase).toBe('fading')
      expect(at(lastInput + config.deleteThresholdMs - 1).opacity).toBeGreaterThan(0)
      expect(at(lastInput + config.deleteThresholdMs).phase).toBe('deleted')
      expect(at(lastInput + config.deleteThresholdMs).opacity).toBe(0)
    }
  })
})

describe('deriveTimingState — phases and boundaries (fake clock)', () => {
  it('pre-arm: null sessionEndAt means no session, regardless of inactivity', () => {
    const s = derive(ARMED_AT + 3_600_000, ARMED_AT, null)
    expect(s).toEqual({ phase: 'pre-arm', opacity: 1, remainingMs: 0, deletesInMs: 0 })
  })

  it('armed at the input instant with full opacity and fresh threat clock', () => {
    const s = derive(ARMED_AT, ARMED_AT)
    expect(s).toEqual({ phase: 'armed', opacity: 1, remainingMs: END - ARMED_AT, deletesInMs: DELETE_MS })
  })

  it('exact fade start: armed at fadeDelay-1, fading at exactly fadeDelay (opacity 1)', () => {
    expect(derive(ARMED_AT + FADE_MS - 1, ARMED_AT)).toEqual({
      phase: 'armed', opacity: 1, remainingMs: END - (ARMED_AT + FADE_MS - 1), deletesInMs: DELETE_MS - (FADE_MS - 1),
    })
    const start = derive(ARMED_AT + FADE_MS, ARMED_AT)
    expect(start.phase).toBe('fading')
    expect(start.opacity).toBe(1)
    const justAfter = derive(ARMED_AT + FADE_MS + 1, ARMED_AT)
    expect(justAfter.phase).toBe('fading')
    expect(justAfter.opacity).toBeLessThan(1)
    expect(justAfter.opacity).toBeCloseTo(1 - 1 / (DELETE_MS - FADE_MS), 10)
  })

  it('linear decay: quarter, half, three-quarter points of the fade window', () => {
    expect(derive(ARMED_AT + 6_250, ARMED_AT).opacity).toBeCloseTo(0.75, 10)
    expect(derive(ARMED_AT + 7_500, ARMED_AT).opacity).toBeCloseTo(0.5, 10)
    expect(derive(ARMED_AT + 8_750, ARMED_AT).opacity).toBeCloseTo(0.25, 10)
  })

  it('exact delete boundary: fading at threshold-1 (opacity still >0), deleted at threshold', () => {
    const last = derive(ARMED_AT + DELETE_MS - 1, ARMED_AT)
    expect(last.phase).toBe('fading')
    expect(last.opacity).toBeGreaterThan(0)
    expect(last.opacity).toBeCloseTo(1 / (DELETE_MS - FADE_MS), 10)
    const gone = derive(ARMED_AT + DELETE_MS, ARMED_AT)
    expect(gone.phase).toBe('deleted')
    expect(gone.opacity).toBe(0)
    expect(gone.deletesInMs).toBe(0)
    expect(gone.remainingMs).toBe(END - (ARMED_AT + DELETE_MS)) // session clock outlives deletion
    // deletion is stable for later evaluations (controller emits it once; pure state stays)
    expect(derive(ARMED_AT + DELETE_MS + 20_000, ARMED_AT).phase).toBe('deleted')
  })

  it('input reset math: typing re-arms instantly and restarts both threat clocks from the new input', () => {
    const t1 = ARMED_AT + 6_000 // mid-fade, opacity 0.8
    expect(derive(t1, ARMED_AT).opacity).toBeCloseTo(0.8, 10)
    // input happens at t1: lastInputAt := t1
    const after = derive(t1, t1)
    expect(after.phase).toBe('armed')
    expect(after.opacity).toBe(1) // no ramp back — instant recovery
    expect(after.deletesInMs).toBe(DELETE_MS) // threat clock fully reset
    expect(after.remainingMs).toBe(END - t1) // session clock is unaffected by input
    // fade window restarts from the NEW input instant
    expect(derive(t1 + FADE_MS - 1, t1).phase).toBe('armed')
    const restarted = derive(t1 + FADE_MS, t1)
    expect(restarted.phase).toBe('fading')
    expect(restarted.opacity).toBe(1)
    expect(derive(t1 + DELETE_MS, t1).phase).toBe('deleted')
  })

  it('disarm-at-zero precedence: exact delete/disarm collision resolves to survived, not deleted', () => {
    const lastInput = END - DELETE_MS // delete boundary lands exactly on session end
    expect(derive(END, lastInput).phase).toBe('survived')
    expect(derive(END, lastInput).opacity).toBe(1)
    expect(derive(END + 1, lastInput).phase).toBe('survived')
    expect(derive(END + 60_000, lastInput).phase).toBe('survived')
  })

  it('chronological collisions (hidden-tab overstay): whichever boundary passed first wins', () => {
    // Deletion boundary strictly before session end: text stays deleted even when
    // recompute happens long after both boundaries (R1 single-reconcile case).
    const stoppedEarly = END - 60_000 // delete boundary at END - 50_000
    expect(derive(END + 60_000, stoppedEarly).phase).toBe('deleted')
    expect(derive(END + 60_000, stoppedEarly).opacity).toBe(0)
    // Session end before delete boundary: disarm wins, text restored.
    const stoppedLate = END - 1_000 // delete boundary at END + 9_000
    expect(derive(END + 60_000, stoppedLate).phase).toBe('survived')
    expect(derive(END + 60_000, stoppedLate).opacity).toBe(1)
  })

  it('session end during fade disarms and restores opacity to 1', () => {
    const lastInput = END - 7_000
    expect(derive(END - 1_000, lastInput).phase).toBe('fading')
    expect(derive(END - 1_000, lastInput).opacity).toBeCloseTo(0.8, 10)
    const safe = derive(END, lastInput)
    expect(safe.phase).toBe('survived')
    expect(safe.opacity).toBe(1)
  })

  it('session can end before the fade even starts: armed -> survived directly', () => {
    const lastInput = END - 2_000
    expect(derive(END - 1_000, lastInput).phase).toBe('armed')
    expect(derive(END, lastInput).phase).toBe('survived')
  })

  it('remaining-time math across phases', () => {
    expect(derive(ARMED_AT + 2_000, ARMED_AT).remainingMs).toBe(END - ARMED_AT - 2_000)
    expect(derive(ARMED_AT + 6_000, ARMED_AT).remainingMs).toBe(END - ARMED_AT - 6_000)
    expect(derive(END, ARMED_AT).remainingMs).toBe(0)
    expect(derive(END + 5_000, ARMED_AT).remainingMs).toBe(0)
    expect(derive(ARMED_AT, ARMED_AT, null).remainingMs).toBe(0)
    // deleted before session end: raw remaining still counts down, clamped at 0 after end
    expect(derive(ARMED_AT + DELETE_MS, ARMED_AT).remainingMs).toBe(END - ARMED_AT - DELETE_MS)
    const overstay = ARMED_AT + (END - ARMED_AT) + 30_000
    expect(derive(overstay, ARMED_AT).remainingMs).toBe(0)
  })

  it('deletesInMs counts down through armed and fading, 0 in every terminal phase', () => {
    expect(derive(ARMED_AT + 2_000, ARMED_AT).deletesInMs).toBe(8_000)
    expect(derive(ARMED_AT + 6_000, ARMED_AT).deletesInMs).toBe(4_000)
    expect(derive(ARMED_AT + 9_999, ARMED_AT).deletesInMs).toBe(1)
    expect(derive(ARMED_AT + DELETE_MS, ARMED_AT).deletesInMs).toBe(0)
    expect(derive(END, END - 1_000).deletesInMs).toBe(0)
    expect(derive(ARMED_AT, ARMED_AT, null).deletesInMs).toBe(0)
  })

  it('rejects invalid timing configs', () => {
    const t = ARMED_AT
    for (const [fade, del] of [[10_000, 5_000], [5_000, 5_000], [-1, 5_000], [0, 0], [Number.NaN, 5_000], [5_000, Number.POSITIVE_INFINITY]] as const) {
      expect(() => deriveTimingState(t, t, fade, del, END)).toThrow(RangeError)
    }
  })
})

describe('monotonic opacity decay (unit scans)', () => {
  it('opacity is non-increasing across the whole threat timeline (1ms scan, STANDARD)', () => {
    let prev = derive(ARMED_AT, ARMED_AT)
    const seen: TimingPhase[] = [prev.phase]
    for (let t = ARMED_AT + 1; t <= ARMED_AT + DELETE_MS; t++) {
      const s = derive(t, ARMED_AT)
      expect(s.opacity).toBeLessThanOrEqual(prev.opacity)
      if (s.phase !== prev.phase) seen.push(s.phase)
      if (prev.phase === 'fading' && s.phase === 'fading') {
        expect(s.opacity).toBeLessThan(prev.opacity) // strictly decaying every ms while fading
      }
      prev = s
    }
    expect(seen).toEqual(['armed', 'fading', 'deleted'])
    expect(prev.opacity).toBe(0)
  })

  it('decay is monotonic up to the disarm instant; disarm restores full opacity', () => {
    const lastInput = END - 8_000
    let prev = derive(lastInput, lastInput)
    for (let t = lastInput + 1; t < END; t++) {
      const s = derive(t, lastInput)
      expect(s.opacity).toBeLessThanOrEqual(prev.opacity)
      prev = s
    }
    expect(prev.phase).toBe('fading')
    expect(derive(END, lastInput).opacity).toBe(1) // survived: text fully legible in wind-down
  })
})

// ---------------------------------------------------------------------------
// Property tests (seeded PRNG — deterministic, no external dependency).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

interface SessionCase {
  fade: number
  del: number
  lastInput: number
  end: number
}

function randomSession(rng: () => number): SessionCase {
  const fade = randInt(rng, 1, 20_000)
  const del = fade + randInt(rng, 1, 30_000)
  const armedAt = randInt(rng, 0, 1_000_000)
  const end = armedAt + randInt(rng, 1, 20) * MS_PER_MINUTE
  const lastInput = randInt(rng, armedAt, end)
  return { fade, del, lastInput, end }
}

describe('property: bounds and derived-math invariants', () => {
  it('opacity is always within [0,1]; remaining/deletes math holds for every phase', () => {
    const rng = mulberry32(0xc0ffee)
    for (let i = 0; i < 2_000; i++) {
      const c = randomSession(rng)
      const now = randInt(rng, c.lastInput, c.end + 60_000)
      const s = deriveTimingState(now, c.lastInput, c.fade, c.del, c.end)
      expect(s.opacity).toBeGreaterThanOrEqual(0)
      expect(s.opacity).toBeLessThanOrEqual(1)
      expect(s.remainingMs).toBeGreaterThanOrEqual(0)
      expect(s.deletesInMs).toBeGreaterThanOrEqual(0)
      switch (s.phase) {
        case 'armed':
          expect(s.opacity).toBe(1)
          expect(s.remainingMs).toBe(c.end - now)
          expect(s.deletesInMs).toBe(c.del - (now - c.lastInput))
          break
        case 'fading':
          expect(s.opacity).toBeGreaterThan(0)
          expect(s.opacity).toBeLessThanOrEqual(1)
          expect(s.remainingMs).toBe(c.end - now)
          expect(s.deletesInMs).toBe(c.del - (now - c.lastInput))
          break
        case 'deleted':
          expect(s.opacity).toBe(0)
          expect(s.remainingMs).toBe(Math.max(0, c.end - now))
          expect(s.deletesInMs).toBe(0)
          break
        case 'survived':
          expect(s.opacity).toBe(1)
          expect(s.remainingMs).toBe(0)
          expect(s.deletesInMs).toBe(0)
          break
      }
    }
  })

  it('pre-arm: a null session is pre-arm at any now', () => {
    const rng = mulberry32(0xbadc0de)
    for (let i = 0; i < 200; i++) {
      const c = randomSession(rng)
      const now = randInt(rng, c.lastInput, c.end + 3_600_000)
      const s = deriveTimingState(now, c.lastInput, c.fade, c.del, null)
      expect(s).toEqual({ phase: 'pre-arm', opacity: 1, remainingMs: 0, deletesInMs: 0 })
    }
  })

  it('input reset: typing "now" always yields armed, opacity 1, full threat clock', () => {
    const rng = mulberry32(0x5eed)
    for (let i = 0; i < 1_000; i++) {
      const c = randomSession(rng)
      if (c.lastInput >= c.end) continue
      const t = randInt(rng, c.lastInput, c.end - 1)
      const s = deriveTimingState(t, t, c.fade, c.del, c.end)
      expect(s.phase).toBe('armed')
      expect(s.opacity).toBe(1)
      expect(s.deletesInMs).toBe(c.del)
      expect(s.remainingMs).toBe(c.end - t)
    }
  })
})

describe('property: no state skip, monotonic decay, terminal stability', () => {
  // Adaptive sampling: every phase window of >=1ms is probed at its boundaries
  // (b-2..b+2) and at segment midpoints, so a skipped phase cannot hide.
  function sampleTimes(c: SessionCase): number[] {
    const boundaries = [c.lastInput + c.fade, c.lastInput + c.del, c.end]
    const spanEnd = Math.max(c.lastInput + c.del, c.end)
    const times = new Set<number>([c.lastInput])
    for (const b of boundaries) {
      for (const d of [-2, -1, 0, 1, 2]) {
        const t = b + d
        if (t >= c.lastInput && t <= spanEnd + 1) times.add(t)
      }
    }
    const sorted = [...times].sort((x, y) => x - y)
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]
      const b = sorted[i]
      if (a === undefined || b === undefined) continue
      const mid = Math.floor((a + b) / 2)
      if (mid > a && mid < b) times.add(mid)
    }
    times.add(spanEnd + 60_000)
    return [...times].sort((x, y) => x - y)
  }

  function expectedChain(c: SessionCase): TimingPhase[] {
    const fadeStart = c.lastInput + c.fade
    const deleteAt = c.lastInput + c.del
    const chain: TimingPhase[] = []
    if (c.lastInput < c.end) chain.push('armed')
    if (fadeStart < Math.min(deleteAt, c.end)) chain.push('fading')
    chain.push(deleteAt < c.end ? 'deleted' : 'survived')
    return chain
  }

  it('phases appear in chain order with no skip or regression; opacity decays monotonically', () => {
    const rng = mulberry32(0xda64ca22)
    for (let i = 0; i < 500; i++) {
      const c = randomSession(rng)
      const deleteAt = c.lastInput + c.del
      const terminal: TimingPhase = deleteAt < c.end ? 'deleted' : 'survived'
      const terminalAt = terminal === 'deleted' ? deleteAt : c.end

      const observed: TimingPhase[] = []
      let prevPhase: TimingPhase | null = null
      let prevSample: { t: number; opacity: number } | null = null

      for (const t of sampleTimes(c)) {
        const s = deriveTimingState(t, c.lastInput, c.fade, c.del, c.end)

        expect(s.opacity).toBeGreaterThanOrEqual(0)
        expect(s.opacity).toBeLessThanOrEqual(1)

        if (prevSample && prevSample.t < t) {
          // monotonic decay while the threat is live (up to the terminal instant;
          // a 'survived' disarm legitimately restores opacity to 1 at terminalAt)
          if (t < terminalAt || (t === terminalAt && terminal === 'deleted')) {
            expect(s.opacity).toBeLessThanOrEqual(prevSample.opacity)
          }
          // strictly decaying between two distinct instants both inside the fade
          // (prevPhase is still the PREVIOUS sample's phase here)
          if (prevPhase === 'fading' && s.phase === 'fading') {
            expect(s.opacity).toBeLessThan(prevSample.opacity)
          }
        }

        if (s.phase !== prevPhase) {
          observed.push(s.phase)
          prevPhase = s.phase
        }

        // terminal phases are stable and never regress afterward
        if (t >= terminalAt) {
          expect(s.phase).toBe(terminal)
          expect(s.opacity).toBe(terminal === 'deleted' ? 0 : 1)
        }

        prevSample = { t, opacity: s.opacity }
      }

      expect(observed).toEqual(expectedChain(c))
    }
  })
})
