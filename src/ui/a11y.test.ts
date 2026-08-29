// @vitest-environment jsdom
/**
 * T12 — axe-core over jsdom-rendered DOM, one pass per phase.
 *
 * DISCLOSED LIMITS (honesty over theater): jsdom runs no layout, no CSSOM
 * cascade (vitest stubs CSS imports), and no accessibility tree — so axe's
 * color-contrast rule lands "incomplete" here (contrast is instead COMPUTED
 * against the real token values in src/styles/contrast.test.ts), and nothing
 * here verifies what a real screen reader speaks. What this DOES verify with
 * real value: roles, names, landmarks, heading structure, label associations,
 * ARIA validity — the structural half of the a11y contract, on the exact DOM
 * the five phases produce. The spoken half is the recorded manual VoiceOver
 * protocol (production-log, T12 entry).
 */
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionRouter, type SessionRouter } from './router'
import { DONE_KEY_GUARD_MS } from './outcome-screens'
import { PRESETS } from '../engine/timing'
import type { StorageAdapter } from '../data/archive'

// Compact fakes (same seams as router.test.ts).
class FakeClock {
  now = 1_000_000
  readonly clock = (): number => this.now
}

class FakeTimers {
  private seq = 0
  private readonly pending = new Map<number, { fn: () => void; dueAt: number }>()
  constructor(private readonly clock: FakeClock) {}
  readonly schedule = (fn: () => void, delayMs: number): unknown => {
    const id = ++this.seq
    this.pending.set(id, { fn, dueAt: this.clock.now + Math.max(0, delayMs) })
    return id
  }
  readonly cancel = (handle: unknown): void => {
    this.pending.delete(handle as number)
  }
  fireDue(): void {
    for (const [id, t] of [...this.pending.entries()]) {
      if (t.dueAt <= this.clock.now) {
        this.pending.delete(id)
        t.fn()
      }
    }
  }
}

class FakeFrames {
  private seq = 0
  private readonly queued = new Map<number, () => void>()
  readonly request = (callback: () => void): unknown => {
    const id = ++this.seq
    this.queued.set(id, callback)
    return id
  }
  readonly cancel = (handle: unknown): void => {
    this.queued.delete(handle as number)
  }
  tick(): void {
    const callbacks = [...this.queued.values()]
    this.queued.clear()
    for (const cb of callbacks) cb()
  }
}

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

interface Mount {
  router: SessionRouter
  root: HTMLElement
  clock: FakeClock
  timers: FakeTimers
  frames: FakeFrames
}

const cleanups: (() => void)[] = []

/** Mirrors index.html: <main id="app"> in the body, html lang en, page title. */
function mountConsole(): Mount {
  document.documentElement.lang = 'en'
  document.title = 'The Disappearing Draft'
  const clock = new FakeClock()
  const timers = new FakeTimers(clock)
  const frames = new FakeFrames()
  const root = document.createElement('main')
  root.id = 'app'
  document.body.append(root)
  const router = createSessionRouter({
    root,
    window,
    document,
    clock: clock.clock,
    frame: frames,
    timer: timers,
    storage: new FakeStorage(),
    motionPreference: () => 'full',
    supports3d: () => true,
  })
  cleanups.push(() => {
    router.destroy()
    root.remove()
  })
  return { router, root, clock, timers, frames }
}

function q<E extends HTMLElement>(root: HTMLElement, selector: string): E {
  const el = root.querySelector<E>(selector)
  if (el === null) throw new Error(`missing element for ${selector}`)
  return el
}

function typeInto(editor: HTMLTextAreaElement, text: string): void {
  editor.value += text
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
}

function arm(root: HTMLElement, preset: 'GENTLE' | 'STANDARD' | 'BRUTAL', minutes: string): HTMLTextAreaElement {
  const radio = q<HTMLInputElement>(root, `[data-preset-option="${preset}"]`)
  radio.checked = true
  radio.dispatchEvent(new Event('change', { bubbles: true }))
  if (minutes !== '') {
    const custom = q<HTMLInputElement>(root, '[data-custom-minutes]')
    custom.value = minutes
    custom.dispatchEvent(new Event('input', { bubbles: true }))
  }
  q<HTMLButtonElement>(root, '[data-action="arm"]').click()
  return q<HTMLTextAreaElement>(root, '[data-editor]')
}

/** Drive a session to 0:00 (typing every 3s) → wind-down. */
function surviveToWindDown(h: Mount, editor: HTMLTextAreaElement, endAt: number): void {
  while (h.clock.now + 3_000 < endAt) {
    h.clock.now += 3_000
    h.frames.tick()
    h.timers.fireDue()
    typeInto(editor, 'word ')
  }
  if (h.clock.now < endAt) {
    h.clock.now += endAt - h.clock.now
    h.frames.tick()
    h.timers.fireDue()
  }
}

/** axe over the current document; critical/serious violations are failures. */
async function expectAxeClean(phase: string): Promise<void> {
  const results = await axe.run(document, { resultTypes: ['violations'] })
  const violations = results.violations
  const seriousPlus = violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )
  // Full disclosure in test output: every remaining violation, any severity.
  for (const v of violations) {
    console.warn(
      `[axe:${phase}] ${v.impact ?? 'unknown'} — ${v.id}: ${v.help} (${v.nodes.length} node(s))`,
    )
  }
  expect(
    seriousPlus.map((v) => `${v.id}(${v.impact})`),
    `phase=${phase} — axe critical/serious violations must be zero`,
  ).toEqual([])
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.innerHTML = ''
})

describe('axe-core (T12): zero critical/serious findings per phase', () => {
  it('setup console', async () => {
    const h = mountConsole()
    expect(h.router.currentScreen()).toBe('setup')
    await expectAxeClean('setup')
  })

  it('write surface (armed, mid-session)', async () => {
    const h = mountConsole()
    const editor = arm(h.root, 'STANDARD', '1')
    typeInto(editor, 'draft words under threat ')
    h.clock.now += 3_000
    h.frames.tick()
    h.timers.fireDue()
    await expectAxeClean('write')
  })

  it('write surface (fading, reduced-motion caution present in DOM)', async () => {
    const h = mountConsole()
    arm(h.root, 'STANDARD', '1')
    h.clock.now += PRESETS.STANDARD.fadeDelayMs + 1_000
    h.frames.tick()
    h.timers.fireDue()
    expect(q(h.root, '[data-fade-announcement]').textContent).not.toBe('')
    await expectAxeClean('write:fading')
  })

  it('deleted board (SIGNAL LOST)', async () => {
    const h = mountConsole()
    const editor = arm(h.root, 'BRUTAL', '')
    typeInto(editor, 'gone ')
    h.clock.now += PRESETS.BRUTAL.deleteThresholdMs
    h.timers.fireDue()
    expect(h.router.currentScreen()).toBe('deleted')
    await expectAxeClean('deleted')
  })

  it('wind-down board (DOWN SAFE) and archive binder (with a finalized entry)', async () => {
    const h = mountConsole()
    const editor = arm(h.root, 'STANDARD', '1')
    typeInto(editor, 'the surviving draft ')
    surviveToWindDown(h, editor, 1_000_000 + 60_000)
    expect(h.router.currentScreen()).toBe('wind-down')
    await expectAxeClean('wind-down')

    // R3: spend the DONE keystroke guard's window, then finalize — the
    // deliberate beat a keyboard writer takes before pressing DONE.
    h.clock.now += DONE_KEY_GUARD_MS + 1
    h.timers.fireDue()
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    expect(h.router.currentScreen()).toBe('archive')
    // One finalized row + the VIEW panel opened (the most text-heavy state).
    q<HTMLButtonElement>(h.root, '[data-entry-action="view"]').click()
    await expectAxeClean('archive')

    // The clear-all confirm panel open is its own interactive state.
    q<HTMLButtonElement>(h.root, '[data-action="clear-log"]').click()
    await expectAxeClean('archive:confirm')
  })
})

describe('document structure (T12): landmarks, one h1 per phase, labelled regions', () => {
  it('every phase swaps inside the single <main> landmark with exactly one h1 and sane heading order', () => {
    const h = mountConsole()
    const root = h.root
    // Setup: the visible product title is the h1.
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(q<HTMLHeadingElement>(root, 'h1').textContent).toBe('The Disappearing Draft')

    // Write: visually-hidden phase h1; no other headings on the surface.
    arm(root, 'STANDARD', '1')
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(q(root, '[data-phase-heading]').textContent).toBe('Writing session')
    expect(root.querySelectorAll('h1, h2, h3, h4, h5, h6').length).toBe(1)

    // Deleted: phase h1 + SIGNAL LOST as its h2 (order h1 → h2, no skips).
    h.clock.now += PRESETS.STANDARD.deleteThresholdMs
    h.timers.fireDue()
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    const deletedLevels = [...root.querySelectorAll('h1, h2')].map((el) => el.tagName)
    expect(deletedLevels).toEqual(['H1', 'H2'])
  })

  it('wind-down and archive heading trees: h1 → h2, entries as h2 under the FLIGHT LOG h1', () => {
    const h = mountConsole()
    const editor = arm(h.root, 'STANDARD', '1')
    surviveToWindDown(h, editor, 1_000_000 + 60_000)
    expect([...h.root.querySelectorAll('h1, h2')].map((el) => el.tagName)).toEqual(['H1', 'H2'])

    // R3: spend the DONE keystroke guard's window before finalizing.
    h.clock.now += DONE_KEY_GUARD_MS + 1
    h.timers.fireDue()
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    expect([...h.root.querySelectorAll('h1, h2')].map((el) => el.tagName)).toEqual(['H1', 'H2'])
    expect(q<HTMLHeadingElement>(h.root, 'h1').textContent).toBe('FLIGHT LOG')
    expect(q(h.root, '[data-entries] > li h2').textContent).not.toBe('')
  })

  it('the state-announcement live regions live inside the landmark, never inside the swapped screen', () => {
    const h = mountConsole()
    const status = q(h.root, '[data-announcements="status"]')
    const alert = q(h.root, '[data-announcements="alert"]')
    expect(status.closest('main')).toBe(h.root)
    expect(alert.closest('main')).toBe(h.root)
    expect(status.closest('[data-phase]')).toBeNull()
    expect(alert.closest('[data-phase]')).toBeNull()
  })
})
