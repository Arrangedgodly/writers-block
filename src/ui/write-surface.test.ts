// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createWriteSurface,
  formatBoardClock,
  type WriteSurface,
} from './write-surface'
import type { TimingPhase, TimingState } from '../engine/timing'

// The committed stylesheet, pinned by the structural tests below. Vitest
// stubs CSS imports and jsdom rewrites import.meta.url, so read the source
// file from the project root (vitest's cwd) directly.
const writeCss = readFileSync(join(process.cwd(), 'src/styles/write.css'), 'utf8')

// T9 acceptance as automated jsdom + structural checks. The flap geometry,
// the R2 aria pairing, the milestone role="alert" promotion, the reduced-motion
// path, and the R3 destroy seam are all driven through the surface's public
// API (`update(state)`) with synthetic engine states and an injected timer
// seam — the router-level integration (fade decay at fake-clock points,
// lamp/band transitions, permanence seam) lives in router.test.ts.

// ---------------------------------------------------------------------------
// Fakes + harness.
// ---------------------------------------------------------------------------

class FakeTimers {
  private seq = 0
  private now = 0
  private readonly pending = new Map<number, { fn: () => void; dueAt: number }>()

  readonly schedule = (fn: () => void, delayMs: number): unknown => {
    const id = ++this.seq
    this.pending.set(id, { fn, dueAt: this.now + Math.max(0, delayMs) })
    return id
  }

  readonly cancel = (handle: unknown): void => {
    this.pending.delete(handle as number)
  }

  elapse(ms: number): void {
    this.now += ms
    for (const [id, t] of [...this.pending.entries()]) {
      if (t.dueAt <= this.now) {
        this.pending.delete(id)
        t.fn()
      }
    }
  }

  get size(): number {
    return this.pending.size
  }
}

interface MountOptions {
  totalSessionMs?: number
  motion?: 'full' | 'reduced'
  supports3d?: boolean
}

interface Harness {
  surface: WriteSurface
  element: HTMLElement
  editor: HTMLTextAreaElement
  timers: FakeTimers
}

const cleanups: (() => void)[] = []

function mountSurface(options: MountOptions = {}): Harness {
  const timers = new FakeTimers()
  const surface = createWriteSurface({
    doc: document,
    totalSessionMs: options.totalSessionMs ?? 5 * 60_000,
    timer: timers,
    motionPreference: () => options.motion ?? 'full',
    supports3d: () => options.supports3d ?? true,
  })
  document.body.append(surface.getElement())
  cleanups.push(() => {
    surface.destroy()
    surface.getElement().remove()
  })
  return { surface, element: surface.getElement(), editor: surface.getEditor(), timers }
}

/** Synthetic engine state (the T2/T3 output shape). */
function st(phase: TimingPhase, opacity: number, remainingMs: number, deletesInMs: number): TimingState {
  return { phase, opacity, remainingMs, deletesInMs }
}

const slotsOf = (element: HTMLElement): HTMLElement[] => [
  ...element.querySelectorAll<HTMLElement>('[data-digit-slot]'),
]

const glyph = (slot: Element, hook: string): string =>
  slot.querySelector<HTMLElement>(`[data-glyph="${hook}"]`)?.textContent ?? ''

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Pure formatters.
// ---------------------------------------------------------------------------

describe('formatBoardClock', () => {
  it('zero-pads minutes to the session slot width and ceils to the next second', () => {
    const cases: Array<[number, number, string]> = [
      [5 * 60_000, 2, '05:00'],
      [299_999, 2, '05:00'],
      [61_000, 2, '01:01'],
      [0, 2, '00:00'],
      [-5_000, 2, '00:00'],
      [120 * 60_000, 3, '120:00'],
      [119 * 60_000 + 59_999, 3, '120:00'],
      [7 * 60_000, 2, '07:00'],
    ]
    for (const [ms, digits, expected] of cases) expect(formatBoardClock(ms, digits), `${ms}ms`).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// Structure + the R2 accessibility pairing.
// ---------------------------------------------------------------------------

describe('structure (R2 aria pairing, editor, hooks)', () => {
  it('builds the timer region: role=timer + aria-label + aria-atomic, visible glyphs hidden, one live text node', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    const board = h.element.querySelector<HTMLElement>('[data-countdown]')!
    expect(board).not.toBeNull()
    expect(board.getAttribute('role')).toBe('timer')
    expect(board.getAttribute('aria-label')).toBe('Time remaining in session')
    expect(board.getAttribute('aria-atomic')).toBe('true')
    expect(board.getAttribute('aria-live')).toBeNull() // never combined with the alert promotion

    // Every visible board node is decorative duplication (aria-hidden)…
    const glyphs = board.querySelector<HTMLElement>('.flap-glyphs')!
    expect(glyphs.getAttribute('aria-hidden')).toBe('true')
    // …and the single authoritative text node sits outside it, one per tick.
    const sr = h.element.querySelector<HTMLElement>('[data-countdown-text]')!
    expect(sr.textContent).toBe('5:00')
    expect(glyphs.contains(sr)).toBe(false)
    expect(sr.closest('[data-countdown]')).toBe(board)
  })

  it('fixes the digit-slot count from the session length (2 minute digits minimum, 3 for ≥100 min)', () => {
    expect(slotsOf(mountSurface({ totalSessionMs: 5 * 60_000 }).element)).toHaveLength(4)
    expect(slotsOf(mountSurface({ totalSessionMs: 1 * 60_000 }).element)).toHaveLength(4)
    expect(slotsOf(mountSurface({ totalSessionMs: 120 * 60_000 }).element)).toHaveLength(5)
    // …with the colon as a fixed non-flapping cell between the groups.
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    const board = h.element.querySelector('[data-countdown]')!
    expect(board.querySelector('.flap-colon')?.textContent).toBe(':')
    expect(board.querySelector('.flap-prefix')?.textContent).toBe('T–')
  })

  it('renders four glyph surfaces per digit slot (static halves + rotating leaves)', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    const slot = slotsOf(h.element)[0]!
    for (const hook of ['static-top', 'static-bottom', 'leaf-top', 'leaf-bottom']) {
      expect(slot.querySelector(`[data-glyph="${hook}"]`), hook).not.toBeNull()
    }
  })

  it('mounts the editor: named, placeholdered, never inside a form; fade-announcement hook present and empty', () => {
    const h = mountSurface()
    expect(h.editor.tagName).toBe('TEXTAREA')
    expect(h.editor.getAttribute('aria-label')).toBe('Draft')
    expect(h.editor.placeholder).not.toBe('')
    expect(h.editor.closest('form')).toBeNull() // R3: the editor is never inside a <form>
    expect(h.element.querySelector('form')).toBeNull()

    // T12's aria-live hook exists from mount (R2: the region exists before
    // content changes) and is empty — content is T12's.
    const fade = h.element.querySelector<HTMLElement>('[data-fade-announcement]')!
    expect(fade.getAttribute('aria-live')).toBe('polite')
    expect(fade.textContent).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Flap mode (3D + full motion) — the committed R2 sequence.
// ---------------------------------------------------------------------------

describe('flap mode: digit diff, flip sequence, interrupted flips', () => {
  it('flips exactly the changed digits: mid-flip glyph placement per the R2 geometry', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 }) // board '05:00'
    h.surface.update(st('armed', 1, 4 * 60_000 + 59_000, 9_000)) // → '04:59'

    const slots = slotsOf(h.element)
    expect(slots).toHaveLength(4)
    // Slot 0 ('0' → '0') never flips.
    expect(slots[0]!.hasAttribute('data-flipping')).toBe(false)
    expect(glyph(slots[0]!, 'static-top')).toBe('0')

    // Changed slots (1,2,3): mid-flip — the NEW glyph already on the static
    // top (revealed as the old top leaf falls) and the rising bottom leaf;
    // the OLD glyph still on the static bottom and the falling top leaf.
    for (const [index, oldDigit, newDigit] of [
      [1, '5', '4'],
      [2, '0', '5'],
      [3, '0', '9'],
    ] as const) {
      const slot = slots[index]!
      expect(slot.hasAttribute('data-flipping'), `slot ${index} flipping`).toBe(true)
      expect(glyph(slot, 'static-top'), `slot ${index} static-top`).toBe(newDigit)
      expect(glyph(slot, 'leaf-bottom'), `slot ${index} leaf-bottom`).toBe(newDigit)
      expect(glyph(slot, 'static-bottom'), `slot ${index} static-bottom`).toBe(oldDigit)
      expect(glyph(slot, 'leaf-top'), `slot ${index} leaf-top`).toBe(oldDigit)
    }

    // Completion settles the flip: bottom static + top leaf take the new
    // glyph, the slot arms its no-transition reset, flipping clears.
    h.timers.elapse(300)
    for (const [index, newDigit] of [
      [1, '4'],
      [2, '5'],
      [3, '9'],
    ] as const) {
      const slot = slots[index]!
      expect(slot.hasAttribute('data-flipping'), `slot ${index} flipping done`).toBe(false)
      expect(slot.hasAttribute('data-reset'), `slot ${index} reset`).toBe(true)
      expect(glyph(slot, 'static-bottom')).toBe(newDigit)
      expect(glyph(slot, 'leaf-top')).toBe(newDigit)
    }
    expect(h.timers.size).toBe(0)
  })

  it('completes an interrupted flip instantly before starting the newer one', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 }) // '05:00'
    h.surface.update(st('armed', 1, 4 * 60_000 + 59_000, 9_000)) // → '04:59' (flip begins)
    h.surface.update(st('armed', 1, 4 * 60_000 + 58_000, 8_000)) // → '04:58' before settle

    const slot = slotsOf(h.element)[3]! // seconds-ones: 0 → 9 → 8
    // The '9' flip was completed instantly (old bottom settled), then the
    // flip toward '8' is in flight.
    expect(slot.hasAttribute('data-flipping')).toBe(true)
    expect(glyph(slot, 'static-top')).toBe('8')
    expect(glyph(slot, 'leaf-bottom')).toBe('8')
    expect(glyph(slot, 'static-bottom')).toBe('9')
    expect(glyph(slot, 'leaf-top')).toBe('9')
    // Exactly ONE settle timer for the slot (the interrupted one was cancelled).
    expect(h.timers.size).toBe(1)

    h.timers.elapse(300)
    expect(glyph(slot, 'static-bottom')).toBe('8')
    expect(glyph(slot, 'leaf-top')).toBe('8')
    expect(slot.hasAttribute('data-flipping')).toBe(false)
  })

  it('updates the per-tick SR text alongside the board', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    const sr = h.element.querySelector<HTMLElement>('[data-countdown-text]')!
    h.surface.update(st('armed', 1, 4 * 60_000 + 59_000, 9_000))
    expect(sr.textContent).toBe('4:59')
    h.surface.update(st('armed', 1, 4 * 60_000 + 1_000, 9_000))
    expect(sr.textContent).toBe('4:01')
  })
})

// ---------------------------------------------------------------------------
// Milestones — the temporary role="alert" promotion (R2 / MDN egg-timer).
// ---------------------------------------------------------------------------

describe('milestones: temporary role="alert" promotion', () => {
  const boardOf = (h: Harness) => h.element.querySelector<HTMLElement>('[data-countdown]')!
  const srOf = (h: Harness) => h.element.querySelector<HTMLElement>('[data-countdown-text]')!

  it('announces the final minute once: role swaps to alert, text freezes, reverts after ~1s', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    h.surface.update(st('armed', 1, 61_000, 9_000)) // baseline 61s — no announcement
    expect(boardOf(h).getAttribute('role')).toBe('timer')

    h.surface.update(st('armed', 1, 60_000, 9_000)) // crossing into the final minute
    expect(boardOf(h).getAttribute('role')).toBe('alert')
    expect(srOf(h).textContent).toBe('One minute remaining.')

    // While announcing, per-tick text is suppressed (a second content change
    // mid-alert would re-announce); the board itself keeps ticking.
    h.surface.update(st('armed', 1, 59_000, 9_000))
    expect(srOf(h).textContent).toBe('One minute remaining.')
    expect(slotsOf(h.element).some((slot) => slot.hasAttribute('data-flipping'))).toBe(true)

    h.timers.elapse(1_000)
    expect(boardOf(h).getAttribute('role')).toBe('timer')
    expect(srOf(h).textContent).toBe('0:59')

    // Fires once: later updates never re-promote.
    h.surface.update(st('armed', 1, 58_000, 9_000))
    expect(boardOf(h).getAttribute('role')).toBe('timer')
    expect(srOf(h).textContent).toBe('0:58')
  })

  it('announces the final ten seconds once', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    h.surface.update(st('fading', 0.3, 11_000, 4_000))
    h.surface.update(st('fading', 0.2, 10_000, 3_000))
    expect(boardOf(h).getAttribute('role')).toBe('alert')
    expect(srOf(h).textContent).toBe('Ten seconds remaining.')
    h.timers.elapse(1_000)
    expect(boardOf(h).getAttribute('role')).toBe('timer')
    expect(srOf(h).textContent).toBe('0:10')
  })

  it('never announces from a cold baseline, and a jump past both thresholds fires only the nearer', () => {
    const h = mountSurface({ totalSessionMs: 60_000 })
    // A 1-minute session STARTS at 60s: the first update is the baseline,
    // not a crossing — no announcement (the writer just armed the session).
    h.surface.update(st('armed', 1, 60_000, 9_000))
    expect(boardOf(h).getAttribute('role')).toBe('timer')
    h.surface.update(st('armed', 1, 59_000, 9_000))
    expect(boardOf(h).getAttribute('role')).toBe('timer')

    // A single recompute that crosses both (hidden-tab return): only the
    // stronger, nearer milestone announces.
    const jump = mountSurface({ totalSessionMs: 5 * 60_000 })
    jump.surface.update(st('armed', 1, 61_000, 9_000))
    jump.surface.update(st('fading', 0.1, 9_000, 4_000))
    expect(boardOf(jump).getAttribute('role')).toBe('alert')
    expect(srOf(jump).textContent).toBe('Ten seconds remaining.')
  })
})

// ---------------------------------------------------------------------------
// Static fallback + reduced motion.
// ---------------------------------------------------------------------------

describe('static fallback (no preserve-3d)', () => {
  it('swaps digits per-slot with no flip classes and no scheduled timers', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000, supports3d: false })
    h.surface.update(st('armed', 1, 4 * 60_000 + 59_000, 9_000))
    const slots = slotsOf(h.element)
    expect(slots.every((slot) => !slot.hasAttribute('data-flipping'))).toBe(true)
    // All glyph surfaces carry the new digit immediately.
    const secondsOnes = slots[3]!
    expect(glyph(secondsOnes, 'static-top')).toBe('9')
    expect(glyph(secondsOnes, 'static-bottom')).toBe('9')
    expect(glyph(secondsOnes, 'leaf-top')).toBe('9')
    expect(h.timers.size).toBe(0)
    expect(h.element.querySelector('[data-countdown-text]')!.textContent).toBe('4:59')
  })
})

describe('reduced motion (no flap, no animated opacity; placard + numeric inactivity countdown)', () => {
  it('never applies engine opacity to the editor — the fade is not animated', () => {
    const h = mountSurface({ totalSessionMs: 60_000, motion: 'reduced' })
    h.surface.update(st('armed', 1, 55_000, 9_000))
    h.surface.update(st('fading', 0.42, 50_000, 4_000))
    h.surface.update(st('fading', 0.05, 46_000, 500))
    expect(h.editor.style.opacity).toBe('') // opacity is never written
  })

  it('still switches lamps/threat state and updates the board statically (no flipping)', () => {
    const h = mountSurface({ totalSessionMs: 60_000, motion: 'reduced' })
    h.surface.update(st('fading', 0.42, 50_000, 4_000))
    expect(h.element.dataset.threat).toBe('fading')
    expect(h.element.querySelector('[data-lamp="fade"]')!.hasAttribute('data-lit')).toBe(true)
    expect(slotsOf(h.element).every((slot) => !slot.hasAttribute('data-flipping'))).toBe(true)
    expect(h.element.querySelector('[data-countdown-text]')!.textContent).toBe('0:50')
  })

  it('carries the numeric inactivity countdown (T2 deletesInMs) on the caution placard', () => {
    const h = mountSurface({ totalSessionMs: 60_000, motion: 'reduced' })
    const countdown = h.element.querySelector<HTMLElement>('[data-inactivity-countdown]')!
    expect(countdown.textContent).toBe('')
    h.surface.update(st('fading', 0.42, 50_000, 4_000))
    expect(countdown.textContent).toBe('0:04')
    h.surface.update(st('fading', 0.2, 48_000, 1_500))
    expect(countdown.textContent).toBe('0:02')
    // The placard block itself is CSS-gated (reduce + fading) — structural
    // presence and content asserted here, the media-query gate below.
    const banner = h.element.querySelector<HTMLElement>('[data-reduced-banner]')!
    expect(banner.textContent).toContain('SIGNAL FADING')
    expect(banner.textContent).toContain('DELETION IN')
  })
})

// ---------------------------------------------------------------------------
// Threat projection: lamps, band driver, status, opacity (full motion).
// ---------------------------------------------------------------------------

describe('threat state projection', () => {
  it('armed: green LIVE lamp lit, no amber, armed threat state; fading: amber lit, green out', () => {
    const h = mountSurface({ totalSessionMs: 60_000 })
    h.surface.update(st('armed', 1, 55_000, 9_000))
    expect(h.element.dataset.threat).toBe('armed')
    expect(h.element.querySelector('[data-lamp="live"]')!.hasAttribute('data-lit')).toBe(true)
    expect(h.element.querySelector('[data-lamp="fade"]')!.hasAttribute('data-lit')).toBe(false)
    expect(h.element.querySelector('[data-status]')!.textContent).toContain('ARMED')

    h.surface.update(st('fading', 0.5, 50_000, 4_000))
    expect(h.element.dataset.threat).toBe('fading')
    expect(h.element.querySelector('[data-lamp="fade"]')!.hasAttribute('data-lit')).toBe(true)
    expect(h.element.querySelector('[data-lamp="live"]')!.hasAttribute('data-lit')).toBe(false)
    expect(h.element.querySelector('[data-status]')!.textContent).toContain('FADING')

    // Typing again restores the armed projection instantly (the router's
    // input wiring proves this end-to-end; here the state flip suffices).
    h.surface.update(st('armed', 1, 50_000, 9_000))
    expect(h.element.querySelector('[data-lamp="live"]')!.hasAttribute('data-lit')).toBe(true)
    expect(h.element.dataset.threat).toBe('armed')
  })

  it('applies the engine opacity per recompute in full-motion mode (the dying text)', () => {
    const h = mountSurface({ totalSessionMs: 60_000 })
    h.surface.update(st('armed', 1, 55_000, 9_000))
    expect(h.editor.style.opacity).toBe('1')
    h.surface.update(st('fading', 0.42, 50_000, 4_000))
    expect(h.editor.style.opacity).toBe('0.42')
    h.surface.update(st('armed', 1, 50_000, 9_000))
    expect(h.editor.style.opacity).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// The R3 destroy seam.
// ---------------------------------------------------------------------------

describe('destroy() seam (R3)', () => {
  it('cancels every pending flip and milestone timer; update afterwards is a no-op; idempotent', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    h.surface.update(st('armed', 1, 4 * 60_000 + 59_000, 9_000)) // flips pending
    h.surface.update(st('armed', 1, 60_000, 9_000)) // final-minute milestone pending
    expect(h.timers.size).toBeGreaterThan(0)

    h.surface.destroy()
    expect(h.timers.size).toBe(0)

    // Post-destroy updates are silent no-ops (no timers, no throw).
    h.surface.update(st('fading', 0.3, 30_000, 5_000))
    expect(h.timers.size).toBe(0)
    expect(h.element.querySelector('[data-countdown-text]')!.textContent).not.toBe('0:30')

    expect(() => h.surface.destroy()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Zero layout shift — structural guarantee + stylesheet pins.
// (jsdom lays nothing out; the fixed-width/fixed-count slots plus the pinned
// stylesheet rules are the structural proof, and the finishing phase's
// screenshot pass owns the rendered confirmation.)
// ---------------------------------------------------------------------------

describe('zero layout shift (structural)', () => {
  it('keeps the same slot elements and slot count across ticks — digits never re-flow', () => {
    const h = mountSurface({ totalSessionMs: 5 * 60_000 })
    const before = slotsOf(h.element)
    h.surface.update(st('armed', 1, 4 * 60_000 + 59_000, 9_000))
    h.timers.elapse(300)
    h.surface.update(st('armed', 1, 4 * 60_000 + 58_000, 9_000))
    h.timers.elapse(300)
    const after = slotsOf(h.element)
    expect(after).toHaveLength(before.length)
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBe(before[i]) // same nodes, only glyph text changed
    }
  })

  it('pins the fixed-slot stylesheet rules and the capability gates', () => {
    // Fixed-width, fixed-height digit cells (1ch = B612 Mono's shared digit
    // advance; 1em the shared figure box) — the no-shift guarantee.
    expect(writeCss).toMatch(/\.flap-slot\s*\{[^}]*width:\s*1ch[^}]*height:\s*1em/s)
    // Flap capability needs BOTH gates; leaves default to hidden (statics
    // carry the digits otherwise).
    expect(writeCss).toContain('prefers-reduced-motion: no-preference')
    expect(writeCss).toContain('@supports (transform-style: preserve-3d)')
    expect(writeCss).toMatch(/\.flap-leaf\s*\{\s*display:\s*none/s)
    // The reduced-motion placard shows ONLY under reduce + fading.
    expect(writeCss).toContain('prefers-reduced-motion: reduce')
    expect(writeCss).toMatch(/\.write\[data-threat='fading'\]\s*\.write-caution/s)
    // Transform-only flap transitions, per R2.
    expect(writeCss).toMatch(/transition:\s*transform\s+var\(--dur-flap\)/)
    // The amber hairline band rides the column's leading edge.
    expect(writeCss).toMatch(/\.write\[data-threat='fading'\]\s*\.write-column\s*\{[^}]*border-left-color:\s*var\(--lamp-amber\)/s)
  })
})
