// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInactivityController,
  isTextChangingInputType,
  type InactivityController,
} from './controller'
import { MS_PER_MINUTE, PRESETS, deriveTimingState, type TimingPhase, type TimingState } from './timing'

// Fixtures: STANDARD (fade 5s / delete 10s), armed at t=1,000,000, 5-minute session.
const FADE_MS = PRESETS.STANDARD.fadeDelayMs // 5_000
const DELETE_MS = PRESETS.STANDARD.deleteThresholdMs // 10_000
const T0 = 1_000_000
const SESSION_MS = 5 * MS_PER_MINUTE

// ---------------------------------------------------------------------------
// Fakes — every controller dependency is injected; no vi.useFakeTimers magic,
// so "no accumulated ticks" is assertable by direct inspection.
// ---------------------------------------------------------------------------

class FakeClock {
  now = T0
  advance(ms: number): void {
    this.now += ms
  }
  readonly clock = (): number => this.now
}

interface FakeTimer {
  id: number
  fn: () => void
  dueAt: number
}

/** setTimeout seam; `fireDue()` runs callbacks whose wall-clock due time has passed (lateness = throttling). */
class FakeTimers {
  private seq = 0
  private readonly pending = new Map<number, FakeTimer>()
  scheduleCount = 0
  cancelCount = 0

  constructor(private readonly clock: FakeClock) {}

  readonly schedule = (fn: () => void, delayMs: number): unknown => {
    const id = ++this.seq
    this.pending.set(id, { id, fn, dueAt: this.clock.now + Math.max(0, delayMs) })
    this.scheduleCount++
    return id
  }

  readonly cancel = (handle: unknown): void => {
    if (this.pending.delete(handle as number)) this.cancelCount++
  }

  fireDue(): number {
    let fired = 0
    for (const t of [...this.pending.values()]) {
      if (t.dueAt <= this.clock.now) {
        this.pending.delete(t.id)
        t.fn()
        fired++
      }
    }
    return fired
  }

  /**
   * Remove and return pending callbacks WITHOUT running them — simulates a
   * wake-up the browser already committed to running before any cancel (the
   * R1 double-fire race: clearTimeout cannot recall an entered callback).
   */
  steal(): Array<() => void> {
    const fns = [...this.pending.values()].map((t) => t.fn)
    this.pending.clear()
    return fns
  }

  get size(): number {
    return this.pending.size
  }

  /** Wall-clock due times of pending timers, sorted (normally exactly one). */
  dueAts(): number[] {
    return [...this.pending.values()].map((t) => t.dueAt).sort((a, b) => a - b)
  }
}

/** rAF seam; `tick()` delivers one frame — callbacks re-requested inside land on the NEXT frame. */
class FakeFrames {
  private seq = 0
  private readonly queued = new Map<number, () => void>()
  requestCount = 0
  cancelCount = 0

  readonly request = (callback: () => void): unknown => {
    const id = ++this.seq
    this.queued.set(id, callback)
    this.requestCount++
    return id
  }

  readonly cancel = (handle: unknown): void => {
    if (this.queued.delete(handle as number)) this.cancelCount++
  }

  tick(): void {
    const callbacks = [...this.queued.values()]
    this.queued.clear()
    for (const cb of callbacks) cb()
  }

  get size(): number {
    return this.queued.size
  }
}

// ---------------------------------------------------------------------------
// Event helpers (mocked events per acceptance).
// ---------------------------------------------------------------------------

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true })
}

function visibilityChange(): void {
  document.dispatchEvent(new Event('visibilitychange'))
}

function goHidden(): void {
  setVisibility('hidden')
  visibilityChange()
}

function visibilityReturn(): void {
  setVisibility('visible')
  visibilityChange()
}

function beforeinput(editor: HTMLTextAreaElement, inputType?: string): void {
  editor.dispatchEvent(new InputEvent('beforeinput', { cancelable: true, inputType }))
}

function input(editor: HTMLTextAreaElement, inputType?: string): void {
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }))
}

function compositionUpdate(editor: HTMLTextAreaElement, data: string): void {
  editor.dispatchEvent(new CompositionEvent('compositionupdate', { data }))
}

function windowFocus(): void {
  window.dispatchEvent(new Event('focus'))
}

function windowBlur(): void {
  window.dispatchEvent(new Event('blur'))
}

function pageShow(persisted: boolean): void {
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }))
}

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------

interface Harness {
  controller: InactivityController
  clock: FakeClock
  timers: FakeTimers
  frames: FakeFrames
  editor: HTMLTextAreaElement
  states: TimingState[]
  transitions: TimingPhase[]
  arm(sessionMs?: number): void
}

const cleanups: (() => void)[] = []

function mount(sessionMs = SESSION_MS): Harness {
  const clock = new FakeClock()
  const timers = new FakeTimers(clock)
  const frames = new FakeFrames()
  const editor = document.createElement('textarea')
  document.body.appendChild(editor)
  const controller = createInactivityController({
    editor,
    window,
    document,
    clock: clock.clock,
    frame: frames,
    timer: timers,
  })
  const states: TimingState[] = []
  const transitions: TimingPhase[] = []
  controller.onState((s) => states.push(s))
  controller.onTransition((s) => transitions.push(s.phase))
  cleanups.push(() => {
    controller.destroy()
    editor.remove()
  })
  return {
    controller,
    clock,
    timers,
    frames,
    editor,
    states,
    transitions,
    arm: (ms = sessionMs) => controller.arm(PRESETS.STANDARD, T0 + ms),
  }
}

beforeEach(() => {
  setVisibility('visible')
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

// ---------------------------------------------------------------------------
// inputType taxonomy (pure helper).
// ---------------------------------------------------------------------------

describe('isTextChangingInputType', () => {
  it('counts typing, paste, autocorrect, IME, deletion and history inputTypes as text-changing', () => {
    for (const type of [
      'insertText',
      'insertCompositionText',
      'insertReplacementText',
      'insertFromPaste',
      'insertFromPasteAsQuotation',
      'insertFromDrop',
      'insertFromYank',
      'insertTranspose',
      'insertParagraph',
      'insertLineBreak',
      'deleteContentBackward',
      'deleteContentForward',
      'deleteWordBackward',
      'deleteWordForward',
      'deleteSoftLineBackward',
      'deleteByCut',
      'deleteByDrag',
      'deleteByComposition',
      'deleteCompositionText',
      'historyUndo',
      'historyRedo',
    ]) {
      expect(isTextChangingInputType(type), type).toBe(true)
    }
  })

  it('counts absent/empty inputType as text-changing (legacy engines: the event implies mutation)', () => {
    expect(isTextChangingInputType(undefined)).toBe(true)
    expect(isTextChangingInputType('')).toBe(true)
  })

  it('excludes formatting inputTypes (never fired by a textarea, never text-changing)', () => {
    for (const type of ['formatBold', 'formatItalic', 'formatBackColor', 'formatIndent']) {
      expect(isTextChangingInputType(type), type).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// arm baseline.
// ---------------------------------------------------------------------------

describe('arm', () => {
  it('emits armed synchronously, requests exactly one frame, schedules the fade boundary', () => {
    const h = mount()
    h.arm()
    expect(h.transitions).toEqual(['armed'])
    expect(h.controller.getState()).toEqual({
      phase: 'armed',
      opacity: 1,
      remainingMs: SESSION_MS,
      deletesInMs: DELETE_MS,
    })
    expect(h.controller.getLastInputAt()).toBe(T0)
    expect(h.frames.size).toBe(1)
    expect(h.timers.size).toBe(1)
    expect(h.timers.dueAts()).toEqual([T0 + FADE_MS])
  })

  it('validates config and sessionEndAt before mutating any state (failed arm leaves it unarmed)', () => {
    const h = mount()
    expect(() => h.controller.arm({ fadeDelayMs: 10_000, deleteThresholdMs: 5_000 }, T0 + 60_000)).toThrow(RangeError)
    expect(() => h.controller.arm({ fadeDelayMs: -1, deleteThresholdMs: 5_000 }, T0 + 60_000)).toThrow(RangeError)
    expect(() => h.controller.arm(PRESETS.STANDARD, Number.NaN)).toThrow(RangeError)
    expect(h.controller.getState()).toBeNull()
    expect(h.controller.getLastInputAt()).toBeNull()
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)
    expect(h.states).toEqual([])
    // still fully usable afterwards
    h.arm()
    expect(h.transitions).toEqual(['armed'])
  })

  it('re-arming a survived session starts a fresh session (wind-down -> new arm)', () => {
    const h = mount(3_000) // session ends at 3s — before the 5s fade would start
    h.arm()
    expect(h.timers.dueAts()).toEqual([T0 + 3_000]) // disarm is the first boundary
    h.clock.advance(3_000)
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'survived']) // armed -> survived directly
    expect(h.frames.size).toBe(0)
    h.controller.arm(PRESETS.STANDARD, T0 + 3_000 + 60_000)
    expect(h.transitions).toEqual(['armed', 'survived', 'armed'])
    expect(h.controller.getState()?.phase).toBe('armed')
    expect(h.frames.size).toBe(1)
    expect(h.timers.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Acceptance: input resets both triggers instantly; text-changing filtering.
// ---------------------------------------------------------------------------

describe('text-changing input', () => {
  it('resets BOTH triggers instantly — synchronous emission, no frame wait', () => {
    const h = mount()
    h.arm()
    h.clock.advance(FADE_MS + 1_000) // mid-fade
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('fading')
    expect(h.controller.getState()?.opacity).toBeCloseTo(0.8, 10)

    const statesBefore = h.states.length
    beforeinput(h.editor, 'insertText') // typing at t = T0 + 6_000
    expect(h.states.length).toBe(statesBefore + 1) // emitted synchronously
    expect(h.controller.getState()).toEqual({
      phase: 'armed',
      opacity: 1, // fade trigger reset — no ramp back
      remainingMs: SESSION_MS - (FADE_MS + 1_000),
      deletesInMs: DELETE_MS, // delete trigger fully reset
    })
    expect(h.controller.getLastInputAt()).toBe(T0 + FADE_MS + 1_000)
    expect(h.transitions).toEqual(['armed', 'fading', 'armed'])
    // fade window restarts from the NEW input instant
    expect(h.timers.dueAts()).toEqual([T0 + FADE_MS + 1_000 + FADE_MS])
  })

  it('counts paste, autocorrect, IME and undo/redo inputTypes from both input and beforeinput', () => {
    const h = mount()
    h.arm()
    for (const [event, type] of [
      ['input', 'insertFromPaste'],
      ['input', 'insertReplacementText'],
      ['input', 'insertCompositionText'],
      ['input', 'insertLineBreak'],
      ['input', 'deleteWordBackward'],
      ['input', 'deleteByCut'],
      ['input', 'historyUndo'],
      ['beforeinput', 'insertText'],
      ['beforeinput', 'insertFromPaste'],
      ['beforeinput', 'historyRedo'],
    ] as const) {
      h.clock.advance(1_000)
      const before = h.controller.getLastInputAt()!
      if (event === 'input') input(h.editor, type)
      else beforeinput(h.editor, type)
      expect(h.controller.getLastInputAt(), `${event} ${type}`).toBe(before + 1_000)
    }
  })

  it('counts IME compositionupdate events', () => {
    const h = mount()
    h.arm()
    h.clock.advance(2_000)
    compositionUpdate(h.editor, 'き')
    expect(h.controller.getLastInputAt()).toBe(T0 + 2_000)
  })

  it('counts an input event with absent inputType (legacy engines)', () => {
    const h = mount()
    h.arm()
    h.clock.advance(2_000)
    h.editor.dispatchEvent(new Event('input', { bubbles: true }))
    expect(h.controller.getLastInputAt()).toBe(T0 + 2_000)
  })

  it('never resets on navigation keys, clicks, scroll or formatting inputTypes', () => {
    const h = mount()
    h.arm()
    h.clock.advance(FADE_MS + 2_000) // mid-fade, threat maturing
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('fading')
    const lastInputAt = h.controller.getLastInputAt()
    const statesBefore = h.states.length

    h.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    h.editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }))
    h.editor.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    h.editor.dispatchEvent(new Event('scroll', { bubbles: true }))
    h.editor.dispatchEvent(new Event('wheel', { bubbles: true }))
    input(h.editor, 'formatBold')
    beforeinput(h.editor, 'formatItalic')

    expect(h.controller.getLastInputAt()).toBe(lastInputAt)
    expect(h.states.length).toBe(statesBefore)
    expect(h.controller.getState()?.phase).toBe('fading')
    // and the threat keeps maturing past those events
    h.clock.advance(1_000)
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('fading')
    expect(h.controller.getState()?.opacity).toBeCloseTo(0.4, 10)
  })
})

// ---------------------------------------------------------------------------
// Acceptance: hidden-tab overshoot applies deletion on return (R1 Option C).
// ---------------------------------------------------------------------------

describe('hidden-tab overshoot', () => {
  it('applies deletion exactly once on visibility return after overshooting past the delete threshold', () => {
    const h = mount()
    h.arm()
    goHidden()
    h.clock.advance(DELETE_MS + 45_000) // overstay; timers NOT fired (suspended tab)
    visibilityReturn()
    expect(h.transitions).toEqual(['armed', 'deleted'])
    expect(h.controller.getState()?.opacity).toBe(0)

    // every other trigger converging on the same return: all no-ops
    windowFocus()
    pageShow(true)
    h.timers.fireDue()
    h.frames.tick()
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(1)
    // terminal hygiene: loop and boundary timer are down
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)
  })

  it('focus firing before visibilitychange in one return still yields a single transition', () => {
    const h = mount()
    h.arm()
    goHidden()
    h.clock.advance(DELETE_MS + 5_000)
    windowFocus() // ordering is irrelevant — focus first
    expect(h.transitions).toEqual(['armed', 'deleted'])
    visibilityChange() // visibilitychange second
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(1)
  })

  it('pageshow with persisted=true (bfcache restore) after a long overstay applies deletion', () => {
    const h = mount()
    h.arm()
    goHidden()
    h.clock.advance(10 * MS_PER_MINUTE)
    pageShow(true)
    expect(h.transitions).toEqual(['armed', 'deleted'])
    expect(h.controller.getState()?.phase).toBe('deleted')
    pageShow(true)
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(1)
  })

  it('the boundary timer can land fade and deletion while still hidden (Chrome throttled tiers)', () => {
    const h = mount()
    h.arm()
    goHidden()
    h.clock.advance(FADE_MS)
    h.timers.fireDue() // timer fires while hidden
    expect(h.transitions).toEqual(['armed', 'fading'])
    h.clock.advance(DELETE_MS - FADE_MS)
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'fading', 'deleted'])
    visibilityReturn()
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(1)
  })

  it('visibilitychange to hidden is gated on visibilityState, not the event alone', () => {
    const h = mount()
    h.arm()
    h.clock.advance(DELETE_MS + 5_000) // overshot while "visible"
    goHidden()
    expect(h.transitions).toEqual(['armed']) // the hidden-change itself reconciles nothing
    visibilityReturn()
    expect(h.transitions).toEqual(['armed', 'deleted'])
  })

  it('a late throttled timer after the visibility handler already deleted is a no-op (R1 double-fire prevention)', () => {
    const h = mount()
    h.arm()
    goHidden()
    // The browser commits to running the fade-boundary wake-up before any
    // later cancel could recall it — steal it out of the pending queue.
    const stolenWakeUps = h.timers.steal()
    expect(stolenWakeUps.length).toBe(1)
    h.clock.advance(DELETE_MS + 2_000)
    visibilityReturn()
    expect(h.transitions).toEqual(['armed', 'deleted'])
    // ...and only THEN the (very late) throttled callback finally executes
    stolenWakeUps[0]!()
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(1)
    expect(h.controller.getState()?.phase).toBe('deleted')
    expect(h.timers.size).toBe(0) // terminal: nothing was rescheduled
  })
})

// ---------------------------------------------------------------------------
// T13 — boundary ties and return-path gaps. Every return instant probed at
// the EXACT boundary ms (not seconds past it), the focus-only return (R1 E11:
// iOS can skip the return visibilitychange entirely), the ordinary-load
// pageshow, a non-terminal (mid-fade) return, and the boundary timer landing
// exactly AT the fade delay.
// ---------------------------------------------------------------------------

describe('T13: boundary ties and return-path gaps', () => {
  it('visibility return landing exactly ON the delete boundary deletes at the tie instant', () => {
    const h = mount()
    h.arm()
    goHidden()
    expect(h.timers.steal()).toHaveLength(1) // suspended tab: the wake-up never ran
    h.clock.advance(DELETE_MS) // now === lastInputAt + deleteThresholdMs, exactly
    visibilityReturn()
    expect(h.transitions).toEqual(['armed', 'deleted'])
    expect(h.controller.getState()?.phase).toBe('deleted')
    expect(h.controller.getState()?.opacity).toBe(0)
    expect(h.timers.size).toBe(0) // the suspended (never-fired) wake-up is absorbed by the terminal reconcile
  })

  it('visibility return landing exactly ON 0:00 disarms — including the exact delete/disarm tie', () => {
    // Delete boundary (10s) sits 2s after the end: return at the 0:00 instant.
    const h = mount(8_000)
    h.arm()
    goHidden()
    h.timers.steal()
    h.clock.advance(8_000) // now === sessionEndAt, exactly
    visibilityReturn()
    expect(h.transitions).toEqual(['armed', 'survived'])
    expect(h.controller.getState()?.opacity).toBe(1)
    expect(h.timers.size).toBe(0)

    // And deleteAt === sessionEndAt exactly (T2's disarm-wins-ties rule) holds
    // through the return path too — not just through the pure function.
    const tie = mount(DELETE_MS)
    tie.arm()
    goHidden()
    tie.timers.steal()
    tie.clock.advance(DELETE_MS)
    visibilityReturn()
    expect(tie.transitions).toEqual(['armed', 'survived'])
    expect(tie.controller.getState()?.opacity).toBe(1)
  })

  it('focus ALONE — no visibility change fired at all (R1 E11, the iOS return-visibilitychange miss) — reconciles the overstay', () => {
    const h = mount()
    h.arm()
    // visibilityState stays 'visible' the whole time and visibilitychange
    // never fires: the focus trigger must carry the reconciliation alone
    // (frames never ticked either — full JS suspension while away).
    h.timers.steal()
    h.clock.advance(DELETE_MS + 30_000)
    windowFocus()
    expect(h.transitions).toEqual(['armed', 'deleted'])
    // the belated visibilitychange (and a stray bfcache pageshow) are absorbed
    visibilityChange()
    pageShow(true)
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(1)
  })

  it('pageshow persisted=false (ordinary load event, no bfcache) is an equally interchangeable trigger', () => {
    const h = mount()
    h.arm()
    goHidden()
    h.timers.steal()
    h.clock.advance(DELETE_MS + 5_000)
    pageShow(false)
    expect(h.transitions).toEqual(['armed', 'deleted'])
    expect(h.controller.getState()?.phase).toBe('deleted')
  })

  it('hidden overstay landing mid-FADE returns to the exact fading state and stays recoverable by typing', () => {
    const h = mount()
    h.arm()
    goHidden()
    h.timers.steal()
    h.clock.advance(FADE_MS + 2_000) // 7s idle inside the 5s/10s window
    visibilityReturn()
    expect(h.transitions).toEqual(['armed', 'fading']) // NOT forced to a terminal
    expect(h.controller.getState()?.opacity).toBeCloseTo(0.6, 10)
    expect(h.controller.getState()?.deletesInMs).toBe(DELETE_MS - FADE_MS - 2_000)
    // still live: one keystroke right there restores instantly
    input(h.editor, 'insertText')
    expect(h.transitions).toEqual(['armed', 'fading', 'armed'])
    expect(h.controller.getState()?.opacity).toBe(1)
    expect(h.timers.dueAts()).toEqual([h.controller.getLastInputAt()! + FADE_MS])
  })

  it('the boundary timer firing exactly AT the fade delay lands fading (opacity 1) with the delete boundary re-targeted exactly', () => {
    const h = mount()
    h.arm()
    expect(h.timers.dueAts()).toEqual([T0 + FADE_MS])
    h.clock.advance(FADE_MS) // exactly the due instant — not a ms past it
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'fading'])
    expect(h.controller.getState()?.opacity).toBe(1) // fade STARTS here; no skip past it
    expect(h.controller.getState()?.deletesInMs).toBe(DELETE_MS - FADE_MS)
    expect(h.timers.size).toBe(1) // the fired callback rescheduled exactly once, no double
    expect(h.timers.dueAts()).toEqual([T0 + DELETE_MS]) // next boundary is the loss limit
  })
})

// ---------------------------------------------------------------------------
// Acceptance: blur keeps running.
// ---------------------------------------------------------------------------

describe('blur', () => {
  it('keeps the loop running and the clock honest after window blur', () => {
    const h = mount()
    h.arm()
    windowBlur()
    h.clock.advance(1_000)
    h.frames.tick()
    h.clock.advance(1_000)
    h.frames.tick()
    h.clock.advance(1_000)
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('armed')
    expect(h.states.length).toBeGreaterThanOrEqual(4) // arm + one emission per frame
    h.clock.advance(FADE_MS - 3_000) // cumulative 5s → fade starts
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('fading')
    expect(h.controller.getState()?.opacity).toBe(1)
    expect(h.frames.size).toBe(1) // loop alive, exactly one pending frame
    expect(h.timers.size).toBe(1) // boundary timer still armed
  })
})

// ---------------------------------------------------------------------------
// Acceptance: slow/janky frames cause no drift.
// ---------------------------------------------------------------------------

describe('drift-free wall-clock loop', () => {
  it('state always equals the pure derivation at the current wall clock, whatever the frame cadence', () => {
    const h = mount()
    h.arm()
    const endAt = T0 + SESSION_MS
    const jankySteps = [3_000, 1_500, 700, 1_231, 250, 900, 499, 1, 17]
    for (const step of jankySteps) {
      h.clock.advance(step)
      h.frames.tick()
      const expected = deriveTimingState(h.clock.now, T0, FADE_MS, DELETE_MS, endAt)
      expect(h.controller.getState()).toEqual(expected)
      expect(h.frames.size).toBe(1)
      expect(h.timers.size).toBe(1)
      // exact-math spot checks at known cumulative instants (no frame-count math anywhere)
      if (h.clock.now === T0 + 5_200) {
        expect(h.controller.getState()?.phase).toBe('fading')
        expect(h.controller.getState()?.opacity).toBeCloseTo(0.96, 10) // 1 - 200/5000
      }
      if (h.clock.now === T0 + 6_431) {
        expect(h.controller.getState()?.opacity).toBeCloseTo(0.7138, 3) // 1 - 1431/5000
      }
    }
  })

  it('one giant janky frame jump straight past the delete boundary deletes with zero accumulated error', () => {
    const h = mount()
    h.arm()
    h.clock.advance(DELETE_MS)
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('deleted')
    expect(h.controller.getState()?.opacity).toBe(0)
    expect(h.transitions).toEqual(['armed', 'deleted']) // single recompute is historically correct
  })

  it('foreground frames never churn the boundary timer; input re-targets it exactly once', () => {
    const h = mount()
    h.arm()
    expect(h.timers.scheduleCount).toBe(1)
    expect(h.timers.dueAts()).toEqual([T0 + FADE_MS])
    for (let i = 0; i < 100; i++) {
      h.clock.advance(16)
      h.frames.tick()
    }
    expect(h.timers.scheduleCount).toBe(1) // no reschedule per frame
    expect(h.timers.cancelCount).toBe(0)
    expect(h.timers.dueAts()).toEqual([T0 + FADE_MS]) // target is wall-clock-stable

    h.clock.advance(2_000 - 1_600) // t = T0 + 2_000
    input(h.editor, 'insertText')
    expect(h.timers.scheduleCount).toBe(2)
    expect(h.timers.cancelCount).toBe(1)
    expect(h.timers.size).toBe(1)
    expect(h.timers.dueAts()).toEqual([T0 + 2_000 + FADE_MS])
  })
})

// ---------------------------------------------------------------------------
// Acceptance: disarm at 0:00 stops all threat transitions.
// ---------------------------------------------------------------------------

describe('session disarm', () => {
  it('survived at 0:00 stops the loop and the timer; nothing afterwards can threaten', () => {
    const h = mount(8_000) // session ends before the 10s delete threshold
    h.arm()
    h.clock.advance(FADE_MS)
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'fading'])
    expect(h.timers.dueAts()).toEqual([T0 + 8_000]) // disarm is the next boundary
    h.clock.advance(3_000)
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'fading', 'survived'])
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)

    // post-disarm bombardment: late clocks, frames, inputs, return events
    h.clock.advance(DELETE_MS)
    h.timers.fireDue()
    h.frames.tick()
    input(h.editor, 'insertText')
    goHidden()
    h.clock.advance(MS_PER_MINUTE)
    visibilityReturn()
    windowFocus()
    pageShow(true)
    expect(h.transitions).toEqual(['armed', 'fading', 'survived'])
    expect(h.transitions.filter((p) => p === 'deleted')).toHaveLength(0)
    expect(h.controller.getState()?.phase).toBe('survived')
    expect(h.controller.getState()?.opacity).toBe(1)
  })

  it('exact 0:00 / delete-boundary tie resolves to disarm through the controller (T2 precedence)', () => {
    const h = mount(DELETE_MS) // delete boundary lands exactly on session end
    h.arm()
    h.clock.advance(FADE_MS)
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'fading'])
    h.clock.advance(DELETE_MS - FADE_MS)
    h.timers.fireDue()
    expect(h.transitions).toEqual(['armed', 'fading', 'survived'])
    expect(h.controller.getState()?.opacity).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Acceptance: no accumulated ticks anywhere.
// ---------------------------------------------------------------------------

describe('no accumulated ticks', () => {
  it('at most one pending frame and one pending timer across heavy churn, always targeting the true boundary', () => {
    const h = mount()
    h.arm()
    for (let i = 0; i < 50; i++) {
      h.clock.advance(200)
      h.frames.tick()
      if (i % 7 === 3) input(h.editor, 'insertText')
      h.timers.fireDue()
      expect(h.frames.size).toBeLessThanOrEqual(1)
      expect(h.timers.size).toBeLessThanOrEqual(1)
    }
    expect(h.frames.size).toBe(1)
    expect(h.timers.size).toBe(1)
    const lastInputAt = h.controller.getLastInputAt()
    expect(lastInputAt).not.toBeNull()
    const expectedBoundary = Math.min(lastInputAt! + FADE_MS, lastInputAt! + DELETE_MS, T0 + SESSION_MS)
    expect(h.timers.dueAts()).toEqual([expectedBoundary])
  })

  it('a hidden tick skips the recompute but keeps the loop scheduled; the visible-resume frame reconciles', () => {
    const h = mount()
    h.arm()
    setVisibility('hidden')
    h.clock.advance(FADE_MS + 1_000)
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('armed') // tick did not reconcile while hidden
    expect(h.frames.size).toBe(1) // scheduling continues (R1 §5.3)
    setVisibility('visible')
    h.clock.advance(1)
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('fading')
    expect(h.transitions).toEqual(['armed', 'fading'])
  })
})

// ---------------------------------------------------------------------------
// Clock guards (R1 §7 / §5.1).
// ---------------------------------------------------------------------------

describe('clock guards', () => {
  it('a frozen performance.now changes nothing — the controller never reads it', () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(424_242)
    try {
      const h = mount()
      h.arm()
      h.clock.advance(FADE_MS + 2_000)
      h.frames.tick()
      input(h.editor, 'insertText')
      h.clock.advance(FADE_MS)
      h.timers.fireDue()
      goHidden()
      h.clock.advance(DELETE_MS)
      visibilityReturn()
      expect(h.controller.getState()?.phase).toBe('deleted')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('backwards wall-clock jumps are clamped to a no-op and never move the input anchor backwards', () => {
    const h = mount()
    h.arm()
    h.clock.advance(FADE_MS + 1_000)
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('fading')
    input(h.editor, 'insertText') // anchor at T0 + 6_000
    const statesBefore = h.states.length

    h.clock.advance(-5_000) // NTP-style backwards jump to T0 + 1_000
    h.frames.tick()
    input(h.editor, 'insertText')
    expect(h.states.length).toBe(statesBefore) // no emission, no crash
    expect(h.controller.getLastInputAt()).toBe(T0 + FADE_MS + 1_000) // anchor unmoved
    expect(h.controller.getState()?.phase).toBe('armed')

    h.clock.advance(9_000) // forward past the earlier point: recovers normally
    h.frames.tick()
    expect(h.controller.getState()?.phase).toBe('armed') // 4s since input
    expect(h.states.length).toBe(statesBefore + 1)
  })
})

// ---------------------------------------------------------------------------
// Subscriptions and the R3 destroy() seam.
// ---------------------------------------------------------------------------

describe('subscriptions and teardown', () => {
  it('onState and onTransition subscriptions can be unsubscribed', () => {
    const h = mount()
    const seenStates: TimingState[] = []
    const seenTransitions: TimingPhase[] = []
    const offState = h.controller.onState((s) => seenStates.push(s))
    const offTransition = h.controller.onTransition((s) => seenTransitions.push(s.phase))
    offState()
    offTransition()
    h.arm()
    h.clock.advance(FADE_MS)
    h.timers.fireDue()
    expect(seenStates).toEqual([])
    expect(seenTransitions).toEqual([])
    expect(h.transitions).toEqual(['armed', 'fading']) // other subscribers unaffected
  })

  it('destroy unwires every listener — no emissions, no timers, no frames afterwards; re-arm throws', () => {
    const h = mount()
    h.arm()
    h.clock.advance(500)
    const statesBefore = h.states.length
    const schedulesBefore = h.timers.scheduleCount
    const requestsBefore = h.frames.requestCount

    h.controller.destroy()
    expect(h.controller.isDestroyed()).toBe(true)
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)

    input(h.editor, 'insertText')
    beforeinput(h.editor, 'insertText')
    compositionUpdate(h.editor, 'あ')
    windowFocus()
    pageShow(true)
    goHidden()
    visibilityReturn()
    h.clock.advance(SESSION_MS)
    h.timers.fireDue()
    h.frames.tick()

    expect(h.states.length).toBe(statesBefore)
    expect(h.timers.scheduleCount).toBe(schedulesBefore)
    expect(h.frames.requestCount).toBe(requestsBefore)
    expect(() => h.controller.arm(PRESETS.STANDARD, T0 + 60_000)).toThrow()
  })

  it('destroy is idempotent', () => {
    const h = mount()
    h.controller.destroy()
    expect(() => h.controller.destroy()).not.toThrow()
  })
})
