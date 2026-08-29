// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSessionRouter,
  DELETION_ANNOUNCEMENT,
  DISARM_ANNOUNCEMENT,
  DISARM_FAILURE_ANNOUNCEMENT,
  formatClock,
  type SessionRouter,
} from './router'
import { FADE_START_ANNOUNCEMENT } from './write-surface'
import { formatZulu, type ClipboardWriter, type ObjectUrlSeam } from './archive-screen'
import { reArmPlateLabel, windDownFileName, DONE_KEY_GUARD_MS } from './outcome-screens'
import {
  ARCHIVE_STORAGE_KEY,
  createArchive,
  deriveTitle,
  deriveWordCount,
  type StorageAdapter,
} from '../data/archive'
import { LAST_CONFIG_STORAGE_KEY } from '../data/last-config'
import { DURATION_PRESET_MINUTES, PRESETS, type PresetId } from '../engine/timing'

// T5 acceptance as automated walkthroughs: the ENTIRE loop is driven through
// real DOM events with the engine's clock/frame/timer seams injected — no
// test-only hooks in production paths, no vi.useFakeTimers.

// The committed outcome stylesheet, pinned by the structural T10 tests below
// (same fs-read pattern as write-surface.test.ts — vitest stubs CSS imports).
const outcomeCss = readFileSync(join(process.cwd(), 'src/styles/outcome.css'), 'utf8')
// R1 — the setup console's sheet + its wiring through main.css.
const setupCss = readFileSync(join(process.cwd(), 'src/styles/setup.css'), 'utf8')
const mainCss = readFileSync(join(process.cwd(), 'src/styles/main.css'), 'utf8')
// R4 — the shared plate layer + the archive sheet it was extracted from.
const platesCss = readFileSync(join(process.cwd(), 'src/styles/plates.css'), 'utf8')
const archiveCss = readFileSync(join(process.cwd(), 'src/styles/archive.css'), 'utf8')

const T0 = 1_000_000

// ---------------------------------------------------------------------------
// Fakes (same seams as controller.test.ts, compact forms).
// ---------------------------------------------------------------------------

class FakeClock {
  now = T0
  advance(ms: number): void {
    this.now += ms
  }
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

  get size(): number {
    return this.pending.size
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

  get size(): number {
    return this.queued.size
  }
}

class FakeStorage implements StorageAdapter {
  private readonly map = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------

interface Harness {
  router: SessionRouter
  root: HTMLElement
  clock: FakeClock
  timers: FakeTimers
  frames: FakeFrames
  storage: FakeStorage
}

const cleanups: (() => void)[] = []

interface MountOptions {
  motion?: 'full' | 'reduced'
  supports3d?: boolean
  clipboard?: ClipboardWriter | null
  execCommand?: (command: 'copy') => boolean
  objectUrls?: ObjectUrlSeam | null
}

function mountRouter(storage: FakeStorage = new FakeStorage(), options: MountOptions = {}): Harness {
  const clock = new FakeClock()
  const timers = new FakeTimers(clock)
  const frames = new FakeFrames()
  const root = document.createElement('div')
  document.body.append(root)
  const router = createSessionRouter({
    root,
    window,
    document,
    clock: clock.clock,
    frame: frames,
    timer: timers,
    storage,
    motionPreference: () => options.motion ?? 'full',
    supports3d: () => options.supports3d ?? true,
    clipboard: options.clipboard,
    execCommand: options.execCommand,
    objectUrls: options.objectUrls,
  })
  cleanups.push(() => {
    router.destroy()
    root.remove()
  })
  return { router, root, clock, timers, frames, storage }
}

function phaseOf(root: HTMLElement): string {
  return root.firstElementChild?.getAttribute('data-phase') ?? ''
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

/** Check a radio through the same event the browser's keyboard path ends in. */
function chooseRadio(root: HTMLElement, selector: string): void {
  const radio = q<HTMLInputElement>(root, selector)
  radio.checked = true
  radio.dispatchEvent(new Event('change', { bubbles: true }))
}

/** A real keydown at the element (rove handlers are code-owned, so jsdom runs them). */
function pressKey(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

function arm(h: Harness, preset: string, customMinutes: string): HTMLTextAreaElement {
  chooseRadio(h.root, `[data-preset-option="${preset}"]`)
  if (customMinutes !== '') {
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    custom.value = customMinutes
    custom.dispatchEvent(new Event('input', { bubbles: true }))
  }
  q<HTMLButtonElement>(h.root, '[data-action="arm"]').click()
  return q<HTMLTextAreaElement>(h.root, '[data-editor]')
}

/** Type every 3s (< STANDARD's 5s fade) until `endAt`, then reconcile the end. */
function typeUntil(h: Harness, editor: HTMLTextAreaElement, endAt: number, chunk: string): void {
  while (h.clock.now + 3_000 < endAt) {
    h.clock.advance(3_000)
    h.frames.tick()
    h.timers.fireDue()
    typeInto(editor, chunk)
  }
  if (h.clock.now < endAt) {
    h.clock.advance(endAt - h.clock.now)
    h.frames.tick()
    h.timers.fireDue()
  }
}

/**
 * The deliberate beat after disarm (R3 / critique F3): DONE holds KEYBOARD
 * activation for DONE_KEY_GUARD_MS, so a test driving the finalize through
 * the keyboard-equivalent click() spends that beat first — exactly what a
 * deliberate writer does before pressing DONE.
 */
function passDoneGuard(h: Harness): void {
  h.clock.advance(DONE_KEY_GUARD_MS + 1)
  h.timers.fireDue()
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// formatClock (pure).
// ---------------------------------------------------------------------------

describe('formatClock', () => {
  it('formats ceil-to-next-second M:SS and clamps negatives to 0:00', () => {
    const cases: Array<[number, string]> = [
      [0, '0:00'],
      [1, '0:01'],
      [999, '0:01'],
      [1_000, '0:01'],
      [1_001, '0:02'],
      [59_999, '1:00'],
      [60_000, '1:00'],
      [61_000, '1:01'],
      [180_000, '3:00'],
      [599_999, '10:00'],
      [-5_000, '0:00'],
    ]
    for (const [ms, expected] of cases) expect(formatClock(ms), `${ms}ms`).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// Setup console — T7 operable configuration.
// ---------------------------------------------------------------------------

describe('setup console (T7 — function)', () => {
  it('renders radio-group duration + difficulty placards with printed FADE/LOSS limits, native semantics', () => {
    const h = mountRouter()
    expect(h.router.currentScreen()).toBe('setup')
    expect(phaseOf(h.root)).toBe('setup')
    // ONE console, ONE screen at a time — the T12 announcement regions ride
    // after the section (root.children: section + status region + alert region).
    expect(h.root.querySelectorAll('[data-phase]')).toHaveLength(1)
    expect(h.root.firstElementChild!.getAttribute('data-phase')).toBe('setup')

    // Difficulty: one radio per preset inside a named fieldset; each placard
    // prints its preset's FADE/LOSS limits from the T2 table.
    const presetGroup = q<HTMLFieldSetElement>(h.root, '[data-preset-group]')
    expect(presetGroup.querySelector('legend')!.textContent).toBe('Difficulty')
    const presetRadios = [...presetGroup.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(presetRadios.map((r) => r.value)).toEqual(['GENTLE', 'STANDARD', 'BRUTAL'])
    for (const radio of presetRadios) {
      const preset = PRESETS[radio.value as PresetId]
      const placard = radio.closest('label')!
      expect(placard.textContent).toContain(`FADE ${preset.fadeDelayMs / 1000}s`)
      expect(placard.textContent).toContain(`LOSS ${preset.deleteThresholdMs / 1000}s`)
    }
    expect(presetRadios.find((r) => r.checked)!.value).toBe('STANDARD')

    // Duration: the four planned presets + CUSTOM carrying the minutes field.
    const durationGroup = q<HTMLFieldSetElement>(h.root, '[data-duration-group]')
    expect(durationGroup.querySelector('legend')!.textContent).toBe('Duration')
    const durationRadios = [...durationGroup.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(durationRadios.map((r) => r.value)).toEqual([...DURATION_PRESET_MINUTES.map(String), 'custom'])
    expect(durationRadios.find((r) => r.checked)!.value).toBe('5')
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    expect(custom.type).toBe('number')
    expect(custom.min).toBe('1')
    expect(custom.max).toBe('120')

    // Keyboard semantics by construction: two separate arrow-key radio groups
    // (one shared name per group, distinct across groups) and native controls only.
    expect(new Set(presetRadios.map((r) => r.name)).size).toBe(1)
    expect(new Set(durationRadios.map((r) => r.name)).size).toBe(1)
    expect(new Set([...presetRadios, ...durationRadios].map((r) => r.name)).size).toBe(2)
    for (const control of h.root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) {
      expect(['radio', 'number', 'button']).toContain(control.type)
    }
    expect(q<HTMLButtonElement>(h.root, '[data-action="arm"]').disabled).toBe(false)
  })

  it('blocks ARM with feedback on out-of-range/non-numeric/empty custom minutes and recovers', () => {
    const h = mountRouter()
    const armButton = q<HTMLButtonElement>(h.root, '[data-action="arm"]')
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    const error = q(h.root, '[data-error]')
    expect(armButton.disabled).toBe(false)

    // Invalid-UX (stated in production-log): DISABLE ARM + inline message, keep
    // the writer's input in the field. A non-numeric literal like 'abc' either
    // sanitizes to '' through the number input (jsdom included) or reaches
    // Number() as NaN — both land blocked. '1e3' is a valid float literal → 1000.
    for (const bad of ['0', '0.5', '121', '-3', '1e3', 'abc', '']) {
      custom.value = bad
      custom.dispatchEvent(new Event('input', { bubbles: true }))
      expect(armButton.disabled, `bad=${bad}`).toBe(true)
      expect(error.textContent, `bad=${bad}`).not.toBe('')
      expect(custom.getAttribute('aria-invalid')).toBe('true')
      expect(q<HTMLInputElement>(h.root, '[data-duration-custom]').checked).toBe(true)
    }

    // A valid value recovers.
    custom.value = '90'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(armButton.disabled).toBe(false)
    expect(error.textContent).toBe('')
    expect(custom.hasAttribute('aria-invalid')).toBe(false)

    // And choosing a preset duration clears the field and re-enables ARM.
    custom.value = '0'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(armButton.disabled).toBe(true)
    chooseRadio(h.root, '[data-duration-option="10"]')
    expect(armButton.disabled).toBe(false)
    expect(custom.value).toBe('')
    expect(error.textContent).toBe('')
  })

  it('selects durations and difficulties via arrow keys (roving radios, wrapping, focus follows)', () => {
    const h = mountRouter()

    // Difficulty: ArrowDown from STANDARD lands on BRUTAL, moves check + focus.
    const standard = q<HTMLInputElement>(h.root, '[data-preset-option="STANDARD"]')
    pressKey(standard, 'ArrowDown')
    const brutal = q<HTMLInputElement>(h.root, '[data-preset-option="BRUTAL"]')
    expect(brutal.checked).toBe(true)
    expect(standard.checked).toBe(false)
    expect(document.activeElement).toBe(brutal)
    // Wrapping: ArrowUp from GENTLE wraps to BRUTAL; ArrowRight moves forward.
    pressKey(q<HTMLInputElement>(h.root, '[data-preset-option="GENTLE"]'), 'ArrowUp')
    expect(brutal.checked).toBe(true)
    pressKey(brutal, 'ArrowRight')
    expect(q<HTMLInputElement>(h.root, '[data-preset-option="GENTLE"]').checked).toBe(true)

    // Duration roving: 5 → ArrowDown → 10.
    const five = q<HTMLInputElement>(h.root, '[data-duration-option="5"]')
    pressKey(five, 'ArrowDown')
    expect(q<HTMLInputElement>(h.root, '[data-duration-option="10"]').checked).toBe(true)
    // Roving OFF the custom radio wraps to the first preset AND clears the field.
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    custom.value = '42'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(q<HTMLInputElement>(h.root, '[data-duration-custom]').checked).toBe(true)
    pressKey(q<HTMLInputElement>(h.root, '[data-duration-custom]'), 'ArrowDown')
    expect(q<HTMLInputElement>(h.root, '[data-duration-option="3"]').checked).toBe(true)
    expect(custom.value).toBe('')

    // Arrows inside the number input never rove the group — the input owns them.
    custom.value = '9'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    pressKey(custom, 'ArrowDown')
    expect(q<HTMLInputElement>(h.root, '[data-duration-custom]').checked).toBe(true)
  })

  it('ARM starts the session with exactly the chosen duration + preset (controller + session params)', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)

    // GENTLE + custom 7 minutes through the real controls.
    chooseRadio(h.root, '[data-preset-option="GENTLE"]')
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    custom.value = '7'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    q<HTMLButtonElement>(h.root, '[data-action="arm"]').click()

    expect(phaseOf(h.root)).toBe('write')
    // Duration: sessionEndAt − armedAt projects as the first countdown paint.
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('7:00')

    // Preset: 8s idle is past STANDARD's 5s fade but inside GENTLE's 10s → ARMED.
    const editor = q<HTMLTextAreaElement>(h.root, '[data-editor]')
    h.clock.advance(8_000)
    h.frames.tick()
    expect(parseFloat(editor.style.opacity)).toBe(1)
    expect(q(h.root, '[data-status]').textContent).toContain('ARMED')

    // And the disarm-time archive entry records exactly the chosen params.
    typeUntil(h, editor, T0 + 7 * 60_000, 'word ')
    expect(phaseOf(h.root)).toBe('wind-down')
    const entries = archive.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.preset).toBe('GENTLE')
    expect(entries[0]!.durationSec).toBe(7 * 60)
    expect(entries[0]!.createdAt).toBe(T0)
    expect(entries[0]!.endedAt).toBe(T0 + 7 * 60_000)
  })

  it('runs the controller on exactly the chosen preset (BRUTAL fade 3s/loss 6s: 4s idle → opacity 2/3)', () => {
    const h = mountRouter()
    chooseRadio(h.root, '[data-preset-option="BRUTAL"]')
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    custom.value = '1'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    q<HTMLButtonElement>(h.root, '[data-action="arm"]').click()

    h.clock.advance(4_000)
    h.frames.tick()
    expect(parseFloat(q<HTMLTextAreaElement>(h.root, '[data-editor]').style.opacity)).toBeCloseTo(2 / 3, 10)
    expect(q(h.root, '[data-status]').textContent).toContain('FADING')
  })

  it('startSession throws RangeError on invalid minutes (engine contract) and stays on setup', () => {
    const h = mountRouter()
    expect(() => h.router.startSession({ preset: 'GENTLE', minutes: 0 })).toThrow(RangeError)
    expect(() => h.router.startSession({ preset: 'GENTLE', minutes: 121 })).toThrow(RangeError)
    expect(phaseOf(h.root)).toBe('setup')
  })

  it('navigates setup → archive (honest empty state) → back to setup', () => {
    const h = mountRouter()
    q<HTMLButtonElement>(h.root, '[data-action="view-archive"]').click()
    expect(phaseOf(h.root)).toBe('archive')
    expect(q(h.root, '[data-empty]').textContent).toContain('No survived sessions')
    q<HTMLButtonElement>(h.root, '[data-action="new-session"]').click()
    expect(phaseOf(h.root)).toBe('setup')
  })
})

// ---------------------------------------------------------------------------
// Setup console (R1) — the committed front door, built to the FIRST VIEWPORT
// contract: the flap duration board presides at display scale on the write
// surface's own classes (reused, not forked), the placard hooks are consumed
// by a real sheet, and the guarded ARM spends --dur-arm on its cover.
// ---------------------------------------------------------------------------

describe('setup console (R1 — the committed front door)', () => {
  it('the duration board: write.css flap classes, fixed 3-minute wells, selection echo, capability-gated flips', () => {
    const h = mountRouter()
    const board = q(h.root, '[data-setup-board]')
    // The same instrument as the write board — class reuse, not a fork.
    expect(board.classList.contains('flap-board')).toBe(true)
    expect(q(board, '.flap-prefix').textContent).toBe('T–')
    expect(board.querySelectorAll('.flap-slot')).toHaveLength(5) // MMM + SS, fixed
    expect(board.querySelectorAll('.flap-colon')).toHaveLength(1)
    expect(board.getAttribute('role')).toBe('img')
    expect(board.getAttribute('aria-label')).toBe('Session length 5 minutes')

    // The board echoes the console's selection and FLIPS the changed digits
    // (005:00 → 015:00 flips the minute tens digit only).
    chooseRadio(h.root, '[data-duration-option="15"]')
    expect(board.getAttribute('aria-label')).toBe('Session length 15 minutes')
    expect(h.root.querySelectorAll('[data-setup-slot][data-flipping]')).toHaveLength(1)
    // The flip settles at the committed 300ms (FLIP_SETTLE_MS twin of --dur-flap).
    h.clock.advance(300)
    h.timers.fireDue()
    expect(h.root.querySelector('[data-setup-slot][data-flipping]')).toBeNull()

    // CUSTOM minutes echo too; an empty custom field dashes the wells honestly.
    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    custom.value = '90'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(board.getAttribute('aria-label')).toBe('Session length 90 minutes')
    custom.value = ''
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(board.getAttribute('aria-label')).toBe('Session length not set')

    // Leaving the setup screen cancels the board's pending flip timers.
    chooseRadio(h.root, '[data-duration-option="10"]')
    expect(h.timers.size).toBeGreaterThan(0)
    q<HTMLButtonElement>(h.root, '[data-action="view-archive"]').click()
    expect(phaseOf(h.root)).toBe('archive')
    expect(h.timers.size).toBe(0)
  })

  it('reduced motion: the setup board never flips — static per-digit swap on the same wells', () => {
    const h = mountRouter(new FakeStorage(), { motion: 'reduced' })
    const board = q(h.root, '[data-setup-board]')
    chooseRadio(h.root, '[data-duration-option="15"]')
    expect(board.getAttribute('aria-label')).toBe('Session length 15 minutes')
    expect(h.root.querySelector('[data-setup-slot][data-flipping]')).toBeNull()
    expect(h.timers.size).toBe(0)
  })

  it('the guarded ARM ritual: cover closed at rest, one motion to open, Escape re-covers, deliberate focus lifts it', () => {
    const h = mountRouter()
    const station = q<HTMLElement>(h.root, '[data-arm-station]')
    const arm = q<HTMLButtonElement>(h.root, '[data-action="arm"]')
    const cover = q<HTMLButtonElement>(h.root, '[data-action="arm-cover"]')

    // Rest: covered. ARM is out of the tab order but still a live control.
    expect(station.hasAttribute('data-open')).toBe(false)
    expect(arm.getAttribute('tabindex')).toBe('-1')
    expect(cover.textContent).toBe('LIFT COVER')

    // The deliberate router focus (the RE-ARM one-motion loop) lifts the cover
    // by itself — no extra step between RE-ARM and Enter.
    arm.focus()
    expect(station.hasAttribute('data-open')).toBe(true)
    expect(arm.hasAttribute('tabindex')).toBe(false)

    // Escape re-covers the switch and hands focus back to the cover.
    station.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(station.hasAttribute('data-open')).toBe(false)
    expect(arm.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(cover)

    // ARM under a closed cover still starts the session on direct press (the
    // T7 seam: nothing may sit between a valid config and startSession).
    arm.click()
    expect(phaseOf(h.root)).toBe('write')
  })

  it('the placard hooks are consumed in the console vocabulary — no UA-default furniture on primary actions', () => {
    const h = mountRouter()
    // Every preset placard carries its committed hooks with real content.
    for (const label of h.root.querySelectorAll('[data-preset-group] label.placard')) {
      const name = label.querySelector('.placard-name')
      const limits = label.querySelector('.placard-limits')
      expect(name?.textContent).toMatch(/^(GENTLE|STANDARD|BRUTAL)$/)
      expect(limits?.textContent).toMatch(/FADE \d+s/)
      expect(limits?.textContent).toMatch(/LOSS \d+s/)
    }
    // Buttons are plates: the primary ARM is the room's one energized plate,
    // VIEW ARCHIVE the standard secondary plate, the cover a plate too.
    const arm = q<HTMLButtonElement>(h.root, '[data-action="arm"]')
    const cover = q<HTMLButtonElement>(h.root, '[data-action="arm-cover"]')
    const archive = q<HTMLButtonElement>(h.root, '[data-action="view-archive"]')
    expect(arm.className).toContain('plate')
    expect(arm.className).toContain('plate-primary')
    expect(cover.className).toContain('plate')
    expect(archive.className).toContain('plate')
    for (const button of h.root.querySelectorAll('button')) {
      expect(button.className, button.textContent ?? '').toContain('plate')
    }
  })

  it('setup.css exists, is wired through main.css, and spends the committed tokens', () => {
    // Wired: the sheet ships with the document.
    expect(mainCss).toContain(`@import './setup.css'`)
    // The committed T7 hooks are consumed by real rules.
    expect(setupCss).toMatch(/\.setup \.placard\s*\{/)
    expect(setupCss).toMatch(/\.placard-name\s*\{/)
    expect(setupCss).toMatch(/\.placard-limits\s*\{/)
    // The guarded ARM gesture spends --dur-arm on the cover lift — a hinge
    // (rotateX), never an opacity cross-fade, and it leaves the tab order.
    expect(setupCss).toContain('var(--dur-arm)')
    expect(setupCss).toMatch(/\.setup-arm\[data-open\] \.arm-cover\s*\{[^}]*rotateX/s)
    expect(setupCss).toMatch(/\.setup-arm\[data-open\] \.arm-cover\s*\{[^}]*visibility: hidden/s)
    // The flap board is REUSED from write.css, not forked: setup.css defines
    // no board/slot/well rules of its own.
    expect(setupCss).not.toMatch(/\.flap-slot\s*\{/)
    expect(setupCss).not.toMatch(/\.flap-board\s*\{/)
    // The validation hold is the caution band's amber on the field edge.
    expect(setupCss).toMatch(/\[aria-invalid='true'\]\s*\{[^}]*--lamp-amber/s)
    // No animation declarations at all: every motion is a token-driven
    // transition (they collapse under reduced motion).
    expect(setupCss).not.toMatch(/animation\s*:/)
  })

  it('the .plate vocabulary is one shared layer (plates.css), imported before every screen sheet (R4)', () => {
    // The critique's cross-sheet seam: .plate was defined in archive.css but
    // spent by the outcome + setup screens. It lives in its own sheet now,
    // and the import ORDER is load-bearing — the shared layer must precede
    // the screen sheets so per-screen refinements (e.g. setup.css's
    // .setup-arm-trigger sizing) keep winning the cascade at equal
    // specificity, exactly as they did when archive.css held the block.
    expect(mainCss).toContain(`@import './plates.css'`)
    for (const sheet of ['./write.css', './outcome.css', './archive.css', './setup.css']) {
      expect(mainCss.indexOf(`@import './plates.css'`)).toBeLessThan(mainCss.indexOf(`@import '${sheet}'`))
    }
    // The component is complete in the shared layer: base plate, primary,
    // destruct, transient COPY states, and the ≤40rem tightening.
    expect(platesCss).toMatch(/^\.plate\s*\{/m)
    expect(platesCss).toMatch(/^\.plate-primary\s*\{/m)
    expect(platesCss).toMatch(/^\.plate-destruct:hover\s*\{/m)
    expect(platesCss).toMatch(/\.plate\[data-state='copied'\]\s*\{/)
    expect(platesCss).toMatch(/\.plate\[data-state='failed'\]\s*\{/)
    expect(platesCss).toMatch(/@media \(max-width: 40rem\)\s*\{[\s\S]*\.plate\s*\{[\s\S]*?padding:\s*var\(--sp-1\) var\(--sp-2\)/)
    // No screen sheet redefines the vocabulary (archive birthed it; R4 moved it).
    expect(archiveCss).not.toMatch(/^\.plate[,\s{]/m)
    // ...and the sheets that spend plates no longer point at archive.css for them.
    expect(outcomeCss).not.toContain("archive's")
  })
})

// ---------------------------------------------------------------------------
// THE WALKTHROUGH — survive path.
// ---------------------------------------------------------------------------

describe('walkthrough: config → write → survive (disarm at 0) → wind-down → Done → archive', () => {
  it('proves the full survive loop with the engine wiring live', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const editor = arm(h, 'STANDARD', '1') // 1-minute custom session
    expect(phaseOf(h.root)).toBe('write')
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('1:00')

    // Engine wiring: idling into the fade window decays opacity via onState.
    h.clock.advance(6_000)
    h.frames.tick()
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('0:54')
    expect(parseFloat(editor.style.opacity)).toBeCloseTo(0.8, 10) // STANDARD fade 5s/10s at 6s
    expect(q(h.root, '[data-status]').textContent).toContain('FADING')

    // Typing through the real editor restores instantly (T3 input wiring).
    typeInto(editor, 'The signal holds ')
    expect(parseFloat(editor.style.opacity)).toBe(1)
    expect(q(h.root, '[data-status]').textContent).toContain('ARMED')

    // Keep typing to the wire — disarm at exactly 0:00.
    typeUntil(h, editor, T0 + 60_000, 'word ')
    const textAtDisarm = editor.value
    expect(phaseOf(h.root)).toBe('wind-down')
    // R3: disarm schedules ONE pending timer — the DONE keystroke guard.
    // Spend the deliberate beat: from here the console is fully quiet again
    // (the threat engine was down at disarm; the guard is a UI affordance).
    passDoneGuard(h)
    expect(h.frames.size).toBe(0) // terminal: the live loop is fully down
    expect(h.timers.size).toBe(0)

    // Wind-down keeps the draft, editable.
    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    expect(windDown.value).toBe(textAtDisarm)
    expect(windDown.disabled).toBe(false)
    expect(q(h.root, '[data-note]').textContent).toContain('archived')

    // Entry written at disarm with 0:00 semantics.
    const entries = archive.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.preset).toBe('STANDARD')
    expect(entries[0]!.createdAt).toBe(T0)
    expect(entries[0]!.endedAt).toBe(T0 + 60_000)
    expect(entries[0]!.durationSec).toBe(60)
    expect(entries[0]!.text).toBe(textAtDisarm)
    expect(entries[0]!.title).toBe(deriveTitle(textAtDisarm))

    // Wind-down edits persist via Done (update, not a second entry).
    windDown.value += 'Edited in the calm. '
    passDoneGuard(h)
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    expect(phaseOf(h.root)).toBe('archive')

    const finalEntries = archive.list()
    expect(finalEntries).toHaveLength(1)
    expect(finalEntries[0]!.text).toBe(textAtDisarm + 'Edited in the calm. ')
    expect(finalEntries[0]!.title).toBe(deriveTitle(textAtDisarm + 'Edited in the calm. '))

    // The flight-log binder shows the entry, textContent-rendered (T11).
    const row = h.root.querySelector(`[data-entry-id="${finalEntries[0]!.id}"]`)
    expect(row).not.toBeNull()
    expect(row!.querySelector('h2')!.textContent).toBe(finalEntries[0]!.title)
    expect(row!.querySelector('[data-run]')!.textContent).toBe('1:00') // B612 run time, right-aligned
    expect(row!.querySelector('[data-ended]')!.textContent).toBe(formatZulu(T0 + 60_000))

    // And the loop closes: back to setup for a fresh session.
    q<HTMLButtonElement>(h.root, '[data-action="new-session"]').click()
    expect(phaseOf(h.root)).toBe('setup')
  })

  it('survives a quota failure at disarm honestly: draft preserved, note shown, Done retries and lands', () => {
    const h = mountRouter()
    h.storage.failWrites = true
    const archive = createArchive(h.storage)
    const editor = arm(h, 'STANDARD', '1')
    typeUntil(h, editor, T0 + 60_000, 'word ')

    expect(phaseOf(h.root)).toBe('wind-down')
    expect(q(h.root, '[data-note]').textContent).toContain('quota-exceeded')
    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    expect(windDown.value).toBe(editor.value) // the draft itself never at risk
    expect(archive.list()).toHaveLength(0)

    h.storage.failWrites = false
    windDown.value += 'final words '
    passDoneGuard(h)
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    expect(phaseOf(h.root)).toBe('archive')
    const entries = archive.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.text).toBe(windDown.value)
  })
})

// ---------------------------------------------------------------------------
// THE WALKTHROUGH — deletion path (R2: RE-ARM restarts the session
// immediately on the last-used calibration — one motion, zero
// re-configuration; failure funnels straight into "start again").
// ---------------------------------------------------------------------------

describe('walkthrough: idle past threshold → deleted → RE-ARM restarts the next session immediately (R2)', () => {
  it('deletes on overstay, archives nothing, and RE-ARM lands in a FRESH armed session with the recalled params', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const setItem = vi.spyOn(h.storage, 'setItem')
    const removeItem = vi.spyOn(h.storage, 'removeItem')
    const editor = arm(h, 'GENTLE', '7') // custom 7 minutes + GENTLE
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('7:00')
    typeInto(editor, 'doomed words ')

    // Idle past GENTLE's 30s loss threshold — timers carry it (hidden-tab style).
    h.clock.advance(PRESETS.GENTLE.deleteThresholdMs)
    h.timers.fireDue()

    expect(phaseOf(h.root)).toBe('deleted')
    expect(h.root.querySelector('[data-editor]')).toBeNull() // editor gone with the screen
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)
    expect(archive.list()).toHaveLength(0) // nothing is ever archived on deletion

    // The plate prints the calibration RE-ARM will re-run — pre-session, on
    // the control itself, never HUD (the write surface stays time-only).
    const reArm = q<HTMLButtonElement>(h.root, '[data-action="rearm"]')
    expect(reArm.textContent).toBe(reArmPlateLabel({ preset: 'GENTLE', minutes: 7 }))
    expect(reArm.textContent).toBe('RE-ARM — 7 MIN · GENTLE')
    expect(document.activeElement).toBe(reArm) // focused on mount — Enter is the whole gesture

    // ONE motion: RE-ARM goes STRAIGHT into the next session — no setup pass,
    // no re-configuration. Fresh controller + fresh editor (arm on a destroyed
    // controller would throw), threat from the top, hands on the text.
    reArm.click()
    expect(phaseOf(h.root)).toBe('write')
    const freshEditor = q<HTMLTextAreaElement>(h.root, '[data-editor]')
    expect(freshEditor).not.toBe(editor) // T4 seam: never the destroyed editor
    expect(freshEditor.value).toBe('')
    expect(document.activeElement).toBe(freshEditor)
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('7:00') // last duration recalled

    // Preset recalled too — discriminated by GENTLE's fade math: 20s idle is
    // mid GENTLE fade (10s/30s → 1 − 10/20 = 0.5), while STANDARD and BRUTAL
    // would both be past deletion at 20s. Only GENTLE can paint 0.5 here.
    h.clock.advance(20_000)
    h.frames.tick()
    expect(parseFloat(freshEditor.style.opacity)).toBeCloseTo(0.5, 10)
    expect(q(h.root, '[data-status]').textContent).toContain('FADING')

    // Drafts never touch storage on this loop; the calibration write is the
    // only storage traffic, under its own key (never the archive envelope).
    expect(h.storage.getItem(ARCHIVE_STORAGE_KEY)).toBeNull()
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY)
    expect(removeItem).not.toHaveBeenCalled()
    expect(archive.list()).toHaveLength(0)

    // And the loop is repeatable: this session may delete and re-arm again.
    typeInto(freshEditor, 'second attempt ')
    h.clock.advance(PRESETS.GENTLE.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')
    expect(q<HTMLButtonElement>(h.root, '[data-action="rearm"]').textContent).toBe(
      'RE-ARM — 7 MIN · GENTLE',
    )
    expect(archive.list()).toHaveLength(0)
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY)
  })

  it('the recalled calibration is the NEWEST arm (a mid-loop RECONFIGURE changes what the next RE-ARM runs)', () => {
    const h = mountRouter()
    const editor = arm(h, 'BRUTAL', '') // preset 5 min + BRUTAL
    typeInto(editor, 'gone ')
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')
    expect(q<HTMLButtonElement>(h.root, '[data-action="rearm"]').textContent).toBe(
      'RE-ARM — 5 MIN · BRUTAL',
    )

    // Reconfigure mid-loop, arm differently — the next deletion's plate and
    // restart must carry the NEW calibration, not the first.
    q<HTMLButtonElement>(h.root, '[data-action="reconfigure"]').click()
    const second = arm(h, 'STANDARD', '1')
    typeUntil(h, second, T0 + PRESETS.BRUTAL.deleteThresholdMs + 60_000, 'survived ')
    expect(phaseOf(h.root)).toBe('wind-down')
    passDoneGuard(h)
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    q<HTMLButtonElement>(h.root, '[data-action="new-session"]').click()
    const third = arm(h, 'GENTLE', '3')
    typeInto(third, 'also gone ')
    h.clock.advance(PRESETS.GENTLE.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')
    expect(q<HTMLButtonElement>(h.root, '[data-action="rearm"]').textContent).toBe(
      'RE-ARM — 3 MIN · GENTLE',
    )
    q<HTMLButtonElement>(h.root, '[data-action="rearm"]').click()
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('3:00')
    h.clock.advance(PRESETS.GENTLE.fadeDelayMs + 5_000) // 15s idle: GENTLE fade 1 − 5/20 = 0.75
    h.frames.tick()
    expect(parseFloat(q<HTMLTextAreaElement>(h.root, '[data-editor]').style.opacity)).toBeCloseTo(0.75, 10)
  })

  it('RECONFIGURE keeps the setup console reachable from the deleted board — no dead ends, full config surface', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const editor = arm(h, 'BRUTAL', '')
    typeInto(editor, 'gone ')
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')

    // The setup console stays the FULL configuration surface, one motion from
    // the loss: every control present, ARM focused (the deliberate focus
    // lifts the cover), and a completely different configuration arms.
    q<HTMLButtonElement>(h.root, '[data-action="reconfigure"]').click()
    expect(phaseOf(h.root)).toBe('setup')
    expect(document.activeElement).toBe(q<HTMLButtonElement>(h.root, '[data-action="arm"]'))
    const reEditor = arm(h, 'STANDARD', '2')
    expect(phaseOf(h.root)).toBe('write')
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('2:00')
    typeUntil(h, reEditor, T0 + PRESETS.BRUTAL.deleteThresholdMs + 120_000, 'fresh config ')
    expect(phaseOf(h.root)).toBe('wind-down')
    passDoneGuard(h)
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    expect(archive.list()).toHaveLength(1) // the reconfigured run survives and archives
    expect(archive.list()[0]!.preset).toBe('STANDARD')
    expect(archive.list()[0]!.durationSec).toBe(120)

    // And the classic setup entries remain: wind-down DONE → archive → NEW
    // SESSION → setup (verified by the survive walkthrough above), plus the
    // console's own VIEW ARCHIVE — the deleted board added a path, removed none.
  })

  it('a corrupt persisted config never traps the writer — the arm record from this load serves the restart', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const h = mountRouter()
      h.storage.setItem(LAST_CONFIG_STORAGE_KEY, '{corrupt')
      const editor = arm(h, 'STANDARD', '1') // remember() replaces the corrupt bytes
      typeInto(editor, 'gone ')
      h.clock.advance(PRESETS.STANDARD.deleteThresholdMs)
      h.timers.fireDue()
      expect(phaseOf(h.root)).toBe('deleted')
      // Memory is authoritative for the page-load: the plate and the restart
      // carry the arm, never the corrupt envelope — the loop cannot depend on
      // storage health at the mercy moment.
      expect(q<HTMLButtonElement>(h.root, '[data-action="rearm"]').textContent).toBe(
        'RE-ARM — 1 MIN · STANDARD',
      )
      q<HTMLButtonElement>(h.root, '[data-action="rearm"]').click()
      expect(phaseOf(h.root)).toBe('write')
      expect(q(h.root, '[data-countdown-text]').textContent).toBe('1:00')
      // The unreachable-in-practice defensive branch (recall null → setup) is
      // pinned at the STORE level in last-config.test.ts: a deleted board
      // always follows an arm on the same load, which always records.
    } finally {
      warn.mockRestore()
    }
  })

  it('the calibration envelope persists under its own key; a fresh router over the same storage runs on top of it', () => {
    // The in-memory record always serves the same page-load (the cross-load
    // READ is pinned at the store level in last-config.test.ts) — this pins
    // the router-seam half: the envelope written on arm is versioned, under
    // its own key, never the archive's, and a fresh page-load's console
    // functions normally over the storage that carries it.
    const storage = new FakeStorage()
    const first = mountRouter(storage)
    arm(first, 'BRUTAL', '2')
    const raw = storage.getItem(LAST_CONFIG_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ version: 1, preset: 'BRUTAL', minutes: 2 })
    expect(storage.getItem(ARCHIVE_STORAGE_KEY)).toBeNull() // drafts' home untouched
    first.router.destroy()

    const second = mountRouter(storage)
    expect(phaseOf(second.root)).toBe('setup') // a fresh load boots the fresh ritual
    const editor = arm(second, 'STANDARD', '1')
    typeInto(editor, 'gone ')
    second.clock.advance(PRESETS.STANDARD.deleteThresholdMs)
    second.timers.fireDue()
    q<HTMLButtonElement>(second.root, '[data-action="rearm"]').click()
    expect(q(second.root, '[data-countdown-text]').textContent).toBe('1:00') // this load's arm wins
  })
})

// ---------------------------------------------------------------------------
// T4 PERMANENCE — the deletion beat's R3 sequence, storage silence, and the
// deleted-phase undo interceptor, all through the live router (the pure
// sequence-order proof lives in src/engine/permanence.test.ts; jsdom runs no
// native undo, so the physical per-browser protocol is T13's).
// ---------------------------------------------------------------------------

describe('permanence (T4): deletion sequence, storage silence, undo interceptor', () => {
  it('runs the R3 sequence on the live editor: blur, both value stores scrubbed, node detached', () => {
    const h = mountRouter()
    const editor = arm(h, 'BRUTAL', '')
    typeInto(editor, 'the doomed draft ')
    editor.focus()
    expect(document.activeElement).toBe(editor)
    expect(editor.closest('form')).toBeNull() // R3: the editor is never inside a <form>
    expect(h.root.querySelector('form')).toBeNull()

    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()

    expect(phaseOf(h.root)).toBe('deleted')
    expect(document.activeElement).not.toBe(editor) // blur fired before the scrub
    expect(editor.value).toBe('') // API-value store
    expect(editor.defaultValue).toBe('') // child-text store (form.reset vector)
    expect(editor.textContent).toBe('')
    expect(editor.isConnected).toBe(false) // detached, never hidden
    expect(h.root.querySelector('[data-editor]')).toBeNull()
    expect(document.querySelectorAll('textarea')).toHaveLength(0) // no editor anywhere in the console

    // Late activity at the dead editor resurrects nothing: the controller is
    // destroyed, the node detached, and nothing ever writes back to it.
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    editor.dispatchEvent(new InputEvent('beforeinput', { cancelable: true, inputType: 'historyUndo' }))
    h.clock.advance(60_000)
    h.frames.tick()
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')
    expect(editor.value).toBe('')
    expect(editor.textContent).toBe('')
  })

  it('writes nothing to storage on deletion; historyUndo/historyRedo are cancelled only while deleted', () => {
    const h = mountRouter()
    const setItem = vi.spyOn(h.storage, 'setItem')
    const removeItem = vi.spyOn(h.storage, 'removeItem')
    const editor = arm(h, 'BRUTAL', '')
    typeInto(editor, 'more doomed words ')

    // Mid-write, undo is normal typing behavior — NOT intercepted.
    const liveUndo = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'historyUndo' })
    editor.dispatchEvent(liveUndo)
    expect(liveUndo.defaultPrevented).toBe(false)

    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')

    // No DRAFT ever touches storage on the deletion path: the only writes are
    // the R2 calibration record under its own key — never the archive's.
    expect(setItem.mock.calls.length).toBeGreaterThan(0) // the arm's remember
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY)
    expect(h.storage.getItem(ARCHIVE_STORAGE_KEY)).toBeNull()
    expect(removeItem).not.toHaveBeenCalled()
    expect(createArchive(h.storage).list()).toHaveLength(0)

    // Deleted phase: history replay attempts die in capture on the console mount.
    const board = h.root.querySelector<HTMLElement>('[data-phase="deleted"]')
    expect(board).not.toBeNull()
    for (const inputType of ['historyUndo', 'historyRedo']) {
      const event = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType })
      board!.dispatchEvent(event)
      expect(event.defaultPrevented, inputType).toBe(true)
    }
    const insert = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'insertText' })
    board!.dispatchEvent(insert)
    expect(insert.defaultPrevented).toBe(false) // non-history types pass untouched

    // RE-ARM leaves the deleted board → interceptor disarmed; the restart is
    // a live session (R2), so the check runs on the write surface itself.
    q<HTMLButtonElement>(h.root, '[data-action="rearm"]').click()
    expect(phaseOf(h.root)).toBe('write')
    const after = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'historyUndo' })
    ;(h.root.firstElementChild as HTMLElement).dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)

    // The re-armed session mounts a FRESH editor over the dead one; undo works in it.
    const fresh = q<HTMLTextAreaElement>(h.root, '[data-editor]')
    expect(fresh).not.toBe(editor)
    expect(fresh.value).toBe('')
    const freshUndo = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'historyUndo' })
    fresh.dispatchEvent(freshUndo)
    expect(freshUndo.defaultPrevented).toBe(false)
    expect(editor.isConnected).toBe(false) // the old node stays dead and scrubbed
    expect(editor.value).toBe('')
    expect(editor.textContent).toBe('')
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY)
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('leaves the T6 archive untouched on deletion — a previously survived entry survives byte-identical', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)

    // Pre-seed via the one path that ever writes storage: a survived session.
    const first = arm(h, 'STANDARD', '1')
    typeUntil(h, first, T0 + 60_000, 'kept words ')
    expect(phaseOf(h.root)).toBe('wind-down')

    // Undo stays functional in wind-down (the draft is already archived) —
    // the interceptor is deleted-phase ONLY.
    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    const calmUndo = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'historyUndo' })
    windDown.dispatchEvent(calmUndo)
    expect(calmUndo.defaultPrevented).toBe(false)

    passDoneGuard(h)
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    expect(phaseOf(h.root)).toBe('archive')
    const before = archive.list()
    const envelopeBefore = h.storage.getItem(ARCHIVE_STORAGE_KEY)
    expect(before).toHaveLength(1)

    // Now delete a second session on top of the populated archive.
    q<HTMLButtonElement>(h.root, '[data-action="new-session"]').click()
    const setItem = vi.spyOn(h.storage, 'setItem')
    const removeItem = vi.spyOn(h.storage, 'removeItem')
    const second = arm(h, 'BRUTAL', '')
    typeInto(second, 'doomed again ')
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')

    // Drafts stay unwritten: only the R2 calibration key is touched, the
    // archive envelope is byte-identical, the entry list unchanged.
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY)
    expect(removeItem).not.toHaveBeenCalled()
    expect(h.storage.getItem(ARCHIVE_STORAGE_KEY)).toBe(envelopeBefore) // byte-identical
    expect(archive.list()).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// T13 — RELOAD / EXIT MID-SESSION. jsdom cannot navigate; the honest model:
// the outgoing page receives the browser's unload events (beforeunload +
// pagehide dispatched on window), then all in-memory state dies with the
// instance while the storage ADAPTER survives — exactly what a same-origin
// reload keeps and discards. The physical reload (address bar / Cmd+R / F5)
// is protocol D of docs/manual-verification-protocol.md.
// ---------------------------------------------------------------------------

describe('reload / exit mid-session (T13): no storage write, session-over on the fresh load', () => {
  it('beforeunload and pagehide mid-armed-session write nothing; the live threat keeps time through them', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const setItem = vi.spyOn(h.storage, 'setItem')
    const removeItem = vi.spyOn(h.storage, 'removeItem')
    const editor = arm(h, 'STANDARD', '1')
    typeInto(editor, 'draft in flight ')

    // The browser's unload events land mid-session (the app registers none —
    // silence here is the point: nothing on this path may persist). The R2
    // calibration record (its own key, written at ARM) is the one exception
    // that is not a draft and not the archive.
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))

    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY)
    expect(removeItem).not.toHaveBeenCalled()
    expect(archive.list()).toHaveLength(0) // the mid-session draft exists only in the editor

    // No navigation actually happened: the page stays live and the engine
    // keeps time straight through the unload events.
    expect(phaseOf(h.root)).toBe('write')
    h.clock.advance(6_000)
    h.frames.tick()
    expect(parseFloat(editor.style.opacity)).toBeCloseTo(0.8, 10)
    h.clock.advance(PRESETS.STANDARD.deleteThresholdMs - 6_000)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY) // the whole abandoned lifecycle wrote no draft
    expect(removeItem).not.toHaveBeenCalled()
    expect(archive.list()).toHaveLength(0)
  })

  it('a fresh load with no session boots to setup: nothing resurrects, zero console errors, prior archive byte-identical', () => {
    const storage = new FakeStorage()
    const first = mountRouter(storage)
    const archive = createArchive(storage)

    // A previously SURVIVED entry exists before the abandoned session.
    const survivor = arm(first, 'STANDARD', '1')
    typeUntil(first, survivor, T0 + 60_000, 'kept words ')
    expect(phaseOf(first.root)).toBe('wind-down')
    passDoneGuard(first)
    q<HTMLButtonElement>(first.root, '[data-action="done"]').click()
    expect(archive.list()).toHaveLength(1)
    const envelopeBefore = storage.getItem(ARCHIVE_STORAGE_KEY)

    // Session two is armed and mid-write when the page is left (reload/exit).
    q<HTMLButtonElement>(first.root, '[data-action="new-session"]').click()
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')
    const doomed = arm(first, 'STANDARD', '5')
    typeInto(doomed, 'this draft dies with the page ')
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
    first.router.destroy() // the in-memory page dies here; the adapter survives
    for (const [key] of setItem.mock.calls) expect(key).toBe(LAST_CONFIG_STORAGE_KEY) // config write only
    expect(removeItem).not.toHaveBeenCalled()

    // The fresh load: a brand-new router over the SAME storage (the only thing
    // a reload keeps). No session state exists — setup boots, no editor, no
    // draft text anywhere in the DOM, no engine loop, zero console errors.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const second = mountRouter(storage)
      expect(second.router.currentScreen()).toBe('setup')
      expect(phaseOf(second.root)).toBe('setup')
      expect(second.root.querySelector('[data-editor]')).toBeNull()
      expect(second.root.textContent).not.toContain('this draft dies with the page')
      expect(second.frames.size).toBe(0) // session-over: no loop exists on the fresh load
      expect(second.timers.size).toBe(0)

      // The prior archive is intact and byte-identical; the abandoned draft
      // left no trace in any entry.
      expect(storage.getItem(ARCHIVE_STORAGE_KEY)).toBe(envelopeBefore)
      const entries = archive.list()
      expect(entries).toHaveLength(1)
      expect(entries[0]!.text).toContain('kept words')
      expect(entries.some((e) => e.text.includes('this draft dies with the page'))).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// T9 WRITE SURFACE — the committed board + dying text, live through the router.
// ---------------------------------------------------------------------------

describe('write surface (T9): fade decay, lamps/band, milestones, reduced motion', () => {
  it('fades at the configured delay with opacity decaying per engine output at fake-clock points', () => {
    const h = mountRouter()
    const editor = arm(h, 'STANDARD', '1') // fade 5s / loss 10s, ends T0+60s
    const opacityAt = (): number => parseFloat(editor.style.opacity)

    // Fade begins at the configured delay: 4.999s armed, 5s exactly = fade
    // start (opacity still 1), then linear decay across the 5s fade window.
    h.clock.advance(4_999)
    h.frames.tick()
    expect(opacityAt()).toBe(1)
    h.clock.advance(1) // 5s — fade start
    h.frames.tick()
    expect(opacityAt()).toBe(1)
    h.clock.advance(1_000) // 6s → 1 − 1/5 = 0.8
    h.frames.tick()
    expect(opacityAt()).toBeCloseTo(0.8, 10)
    h.clock.advance(1_500) // 7.5s → 1 − 2.5/5 = 0.5
    h.frames.tick()
    expect(opacityAt()).toBeCloseTo(0.5, 10)
    h.clock.advance(1_500) // 9s → 1 − 4/5 = 0.2
    h.frames.tick()
    expect(opacityAt()).toBeCloseTo(0.2, 10)
    expect(q(h.root, '[data-status]').textContent).toContain('FADING')
  })

  it('lamp/band state transitions: green LIVE while armed, amber FADE at fade start, restored by typing', () => {
    const h = mountRouter()
    const editor = arm(h, 'STANDARD', '1')
    const write = q(h.root, '[data-phase="write"]')
    const live = q(h.root, '[data-lamp="live"]')
    const fade = q(h.root, '[data-lamp="fade"]')

    // Armed: nominal — green lamp lit, no amber, no threat band state.
    expect(write.getAttribute('data-threat')).toBe('armed')
    expect(live.hasAttribute('data-lit')).toBe(true)
    expect(fade.hasAttribute('data-lit')).toBe(false)

    // Fade start: amber-before-red — amber lamp lights, green goes out, the
    // threat state that drives the hairline band flips (CSS: [data-threat]).
    h.clock.advance(PRESETS.STANDARD.fadeDelayMs)
    h.frames.tick()
    h.timers.fireDue()
    expect(write.getAttribute('data-threat')).toBe('fading')
    expect(fade.hasAttribute('data-lit')).toBe(true)
    expect(live.hasAttribute('data-lit')).toBe(false)

    // Any text-changing input restores full opacity + the armed state instantly.
    typeInto(editor, 'restored ')
    expect(parseFloat(editor.style.opacity)).toBe(1)
    expect(write.getAttribute('data-threat')).toBe('armed')
    expect(live.hasAttribute('data-lit')).toBe(true)
    expect(q(h.root, '[data-status]').textContent).toContain('ARMED')
  })

  it('announces the final-ten-seconds milestone through the live loop (temporary role="alert")', () => {
    const h = mountRouter()
    const editor = arm(h, 'STANDARD', '1') // ends T0+60s
    typeUntil(h, editor, T0 + 49_000, 'word ') // remaining 11s, still typing
    h.clock.advance(2_000) // remaining 9s — crosses the 10s milestone
    h.frames.tick()
    h.timers.fireDue()

    const board = q(h.root, '[data-countdown]')
    expect(board.getAttribute('role')).toBe('alert')
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('Ten seconds remaining.')

    // The promotion is temporary (~1s): the timer role returns afterwards.
    h.clock.advance(1_100)
    h.timers.fireDue()
    expect(board.getAttribute('role')).toBe('timer')
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('0:09')
  })

  it('reduced motion: no flap/opacity animation — caution placard + numeric inactivity countdown instead', () => {
    const h = mountRouter(new FakeStorage(), { motion: 'reduced' })
    const editor = arm(h, 'BRUTAL', '1') // fade 3s / loss 6s, 1-minute session
    const write = q(h.root, '[data-phase="write"]')

    // The board's digit slots exist and NEVER animate (no flip classes), the
    // time still ticks per second through them.
    const slot = q(h.root, '[data-digit-slot]')
    h.clock.advance(4_000)
    h.frames.tick()
    h.timers.fireDue()
    expect(write.getAttribute('data-threat')).toBe('fading')
    expect(slot.hasAttribute('data-flipping')).toBe(false)
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('0:56')

    // NO animated opacity — the engine's per-frame value is never applied.
    expect(editor.style.opacity).toBe('')

    // The static amber banner + numeric inactivity countdown (deletesInMs).
    const banner = q(h.root, '[data-reduced-banner]')
    expect(banner.textContent).toContain('SIGNAL FADING')
    expect(q(h.root, '[data-inactivity-countdown]').textContent).toBe('0:02') // 6s loss at 4s idle

    // Lamps still switch (state, not motion), and typing still restores.
    expect(q(h.root, '[data-lamp="fade"]').hasAttribute('data-lit')).toBe(true)
    typeInto(editor, 'still counts ')
    expect(write.getAttribute('data-threat')).toBe('armed')
    expect(editor.style.opacity).toBe('')
    expect(q(h.root, '[data-lamp="live"]').hasAttribute('data-lit')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T10 OUTCOME BOARDS — the deleted beat (SIGNAL LOST) and the wind-down
// board (DOWN SAFE), live through the router exactly as a session ends.
// ---------------------------------------------------------------------------

describe('outcome boards (T10): deleted beat — SIGNAL LOST', () => {
  it('renders the deletion as ONE deliberate sequence: board mounts after permanence, editor gone, RE-ARM focused', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const editor = arm(h, 'BRUTAL', '2')
    typeInto(editor, 'the last transmission ')

    // Idle past BRUTAL's loss threshold — the beat fires once, terminally.
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()

    // ONE synchronous sequence: the same transition that ends the session
    // mounts the board — never two screens, never a flash of leftover content.
    expect(phaseOf(h.root)).toBe('deleted')
    expect(h.root.querySelectorAll('[data-phase]')).toHaveLength(1)

    // The console empties: no editor anywhere in the document.
    expect(h.root.querySelector('[data-editor]')).toBeNull()
    expect(document.querySelectorAll('textarea')).toHaveLength(0)

    // The SIGNAL LOST board: instrument readout, red LOSS lamp lit, honest
    // copy (what happened, what was not archived, no recovery) — no stats,
    // no telemetry, nothing else in the emptied room.
    expect(q(h.root, '[data-signal-lost]').textContent).toBe('SIGNAL LOST')
    expect(q(h.root, '[data-lamp="loss"]').hasAttribute('data-lit')).toBe(true)
    const copy = q(h.root, '[data-deleted-copy]').textContent ?? ''
    expect(copy).toContain('Nothing was archived')
    expect(copy).toContain('no recovery')
    expect(h.root.querySelector('[data-stats]')).toBeNull()
    expect(archive.list()).toHaveLength(0)

    // RE-ARM is focused the moment the board mounts, and the undo guard is
    // STILL armed on this board (R3: deletion → RE-ARM is its lifetime).
    const reArm = q<HTMLButtonElement>(h.root, '[data-action="rearm"]')
    expect(document.activeElement).toBe(reArm)
    const board = q<HTMLElement>(h.root, '[data-phase="deleted"]')
    const undo = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'historyUndo' })
    board.dispatchEvent(undo)
    expect(undo.defaultPrevented).toBe(true)

    // R2: restart goes STRAIGHT into the next armed session (no setup pass)
    // and disarms the guard — the check runs on the live write surface.
    reArm.click()
    expect(phaseOf(h.root)).toBe('write')
    const after = new InputEvent('beforeinput', { cancelable: true, bubbles: true, inputType: 'historyUndo' })
    ;(h.root.firstElementChild as HTMLElement).dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
    expect(q(h.root, '[data-countdown-text]').textContent).toBe('2:00') // the recalled calibration
    expect(document.activeElement).toBe(q(h.root, '[data-editor]')) // hands on the text
  })
})

describe('outcome boards (T10): wind-down — DOWN SAFE', () => {
  it('flips the board to its second side: frozen 0:00, SAFE lamp, editable draft, stats HERE ONLY', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const editor = arm(h, 'STANDARD', '1')

    // During the write phase there are NO session stats — the countdown is
    // the only HUD (brief: live in-session stats are banned).
    expect(h.root.querySelector('[data-stats]')).toBeNull()

    typeInto(editor, 'alpha beta gamma')
    typeUntil(h, editor, T0 + 60_000, ' delta')
    const textAtDisarm = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]').value
    expect(phaseOf(h.root)).toBe('wind-down')

    // The controller threat is fully off — the loop is down. (R3: the one
    // pending timer right after disarm is the DONE keystroke guard; spend
    // the beat and the console is totally quiet.)
    passDoneGuard(h)
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)

    // The board's second side: the same instrument, frozen at 0:00. The
    // static rendering carries each digit on BOTH halves (the write board's
    // own fallback path), so each slot reads the digit twice; the accessible
    // name is the stopped clock.
    const clock = q(h.root, '[data-frozen-clock]')
    expect(clock.getAttribute('aria-label')).toContain('0:00')
    const slots = [...h.root.querySelectorAll<HTMLElement>('[data-frozen-slot]')]
    expect(slots).toHaveLength(4) // 1-min session → 2 minute digits
    for (const slot of slots) expect(slot.textContent).toBe('00')
    expect(q(h.root, '[data-frozen-clock] .flap-prefix').textContent).toBe('T–')
    expect(q(h.root, '[data-frozen-clock] .flap-colon').textContent).toBe(':')
    expect(q(h.root, '[data-lamp="safe"]').hasAttribute('data-lit')).toBe(true)
    expect(q(h.root, '[data-down-safe]').textContent).toContain('DOWN SAFE')

    // The draft stays editable, and the disarm-time entry already exists.
    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    expect(windDown.disabled).toBe(false)
    expect(windDown.value).toBe(textAtDisarm)
    expect(archive.list()).toHaveLength(1) // closing without DONE keeps this entry

    // Post-session stats, here only: live word count + right-margin run time.
    const wordsAtDisarm = deriveWordCount(textAtDisarm)
    expect(q(h.root, '[data-words]').textContent).toBe(String(wordsAtDisarm))
    expect(q(h.root, '[data-run]').textContent).toBe('1:00')
    windDown.value += ' epsilon zeta'
    windDown.dispatchEvent(new Event('input', { bubbles: true }))
    expect(q(h.root, '[data-words]').textContent).toBe(String(deriveWordCount(windDown.value)))
  })

  it('DONE finalizes the disarm-time entry — updated, never duplicated — and lands on the archive view', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)
    const editor = arm(h, 'STANDARD', '1')
    typeInto(editor, 'survivor words')
    typeUntil(h, editor, T0 + 60_000, ' more')

    const disarmEntries = archive.list()
    expect(disarmEntries).toHaveLength(1)

    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    windDown.value += ' final line'
    windDown.dispatchEvent(new Event('input', { bubbles: true }))
    passDoneGuard(h)
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()

    expect(phaseOf(h.root)).toBe('archive')
    const entries = archive.list()
    expect(entries).toHaveLength(1) // update, not a second entry
    expect(entries[0]!.id).toBe(disarmEntries[0]!.id)
    expect(entries[0]!.text).toBe(windDown.value)
    expect(entries[0]!.title).toBe(deriveTitle(windDown.value))
    expect(entries[0]!.wordCount).toBe(deriveWordCount(windDown.value))
    expect(entries[0]!.wordCount).not.toBe(disarmEntries[0]!.wordCount) // edits took

    // The flight-log binder shows the finalized row.
    const row = h.root.querySelector(`[data-entry-id="${entries[0]!.id}"]`)
    expect(row).not.toBeNull()
    expect(row!.querySelector('[data-run]')!.textContent).toBe('1:00')
    expect(row!.querySelector('[data-words]')!.textContent).toContain(
      String(deriveWordCount(windDown.value)),
    )
  })

  it('copies and downloads the CURRENT draft (wind-down edits included) through the mocked seams', async () => {
    const clipboard: ClipboardWriter = { writeText: vi.fn().mockResolvedValue(undefined) }
    const created: Blob[] = []
    const objectUrls: ObjectUrlSeam = {
      create: vi.fn((blob: Blob) => {
        created.push(blob)
        return 'blob:mock-winddown'
      }),
      revoke: vi.fn(),
    }
    const h = mountRouter(new FakeStorage(), { clipboard, objectUrls })
    const editor = arm(h, 'STANDARD', '1')
    typeInto(editor, 'the archived body')
    typeUntil(h, editor, T0 + 60_000, ' word')

    // Edit AFTER disarm — copy/download must carry the current draft, pre-Done.
    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    windDown.value += ' post-flight edit'
    windDown.dispatchEvent(new Event('input', { bubbles: true }))

    // COPY: clipboard path, transient COPIED state, polite announcement.
    const copyButton = q<HTMLButtonElement>(h.root, '[data-action="copy"]')
    copyButton.click()
    await vi.waitFor(() => expect(copyButton.textContent).toBe('COPIED'))
    expect(clipboard.writeText).toHaveBeenCalledWith(windDown.value)
    expect(q(h.root, '[data-winddown-status]').textContent).toContain('copied')

    // DOWNLOAD .TXT: text/plain blob of the current draft through an object
    // URL revoked after the click; code-derived filename (disarm instant).
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
      q<HTMLButtonElement>(h.root, '[data-action="download"]').click()
    } finally {
      document.removeEventListener('click', onClick, { capture: true })
    }
    expect(created).toHaveLength(1)
    expect(created[0]!.type).toBe('text/plain;charset=utf-8')
    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe(windDownFileName(T0 + 60_000))
    expect(clicked[0]!.href).toBe('blob:mock-winddown')
    expect(objectUrls.revoke).toHaveBeenCalledWith('blob:mock-winddown')
    expect(q(h.root, '[data-winddown-status]').textContent).toContain(windDownFileName(T0 + 60_000))
    const blobText = await created[0]!.text()
    expect(blobText).toBe(windDown.value)
  })

  it('reduced motion: every outcome animation lives inside the no-preference gate (no rules under reduce)', () => {
    // Extract the `@media (prefers-reduced-motion: no-preference)` block by
    // brace matching, then require ALL animation declarations to sit inside it.
    const gateStart = outcomeCss.indexOf('@media (prefers-reduced-motion: no-preference)')
    expect(gateStart).toBeGreaterThanOrEqual(0)
    let depth = 0
    let gateEnd = -1
    for (let i = gateStart; i < outcomeCss.length; i++) {
      const char = outcomeCss[i]
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          gateEnd = i
          break
        }
      }
    }
    expect(gateEnd).toBeGreaterThan(gateStart)
    const gate = outcomeCss.slice(gateStart, gateEnd + 1)
    const outside = outcomeCss.slice(0, gateStart) + outcomeCss.slice(gateEnd + 1)

    const animations = [...outcomeCss.matchAll(/animation:\s*[^;]+;/g)].map((m) => m[0])
    expect(animations.length).toBeGreaterThanOrEqual(2) // the lamp latch + the tape flip
    for (const declaration of animations) {
      expect(gate).toContain(declaration) // inside the gate…
      expect(outside).not.toContain(declaration) // …and nowhere else
    }

    // No reduce block is needed in this sheet: the animations simply do not
    // exist under reduce (tokens.css additionally collapses the durations).
    expect(outcomeCss).not.toMatch(/prefers-reduced-motion:\s*reduce/)

    // The tape flip is a hard side-change — rotateX, never opacity.
    const flip = outcomeCss.match(/@keyframes\s+board-flip\s*\{[\s\S]*?\n\}/)![0]
    expect(flip).toContain('rotateX')
    expect(flip).not.toContain('opacity')

    // The lamp latch switches — steps, not a fade.
    const latch = outcomeCss.match(/@keyframes\s+loss-latch\s*\{[\s\S]*?\n\}/)![0]
    expect(latch).toContain('background-color')
    expect(latch).not.toContain('opacity')
    expect(gate).toMatch(/loss-latch[\s\S]*?steps\(1,\s*end\)/)

    // The running time rides the right margin (j-card); the SIGNAL LOST
    // readout uses the reserved instrument face with its fallback stack.
    expect(outcomeCss).toMatch(/\.outcome-stat-run\s*\{[^}]*margin-left:\s*auto/)
    expect(outcomeCss).toMatch(/\.outcome-readout\s*\{[^}]*font-family:\s*var\(--font-instrument\)/)
  })
})

// ---------------------------------------------------------------------------
// Refinement R3 / critique F3 — the DONE keystroke guard after disarm. The
// disarm swap lands focus on DONE (T12's committed focus map), so a writer
// still mid-sentence would have their next Space/Enter — aimed at the draft —
// finalize the session instead. The guard holds keyboard activation for a
// short window while the plate stays clickable; fresh focus lifts it.
// ---------------------------------------------------------------------------

describe('wind-down DONE keystroke guard (R3 / F3): a mid-sentence keypress cannot finalize', () => {
  /** Survive a 1-minute STANDARD session to the disarm beat; DONE focused. */
  function surviveToDone(h: Harness): HTMLButtonElement {
    const editor = arm(h, 'STANDARD', '1')
    typeInto(editor, 'still writing at the wire ')
    typeUntil(h, editor, T0 + 60_000, ' word')
    expect(phaseOf(h.root)).toBe('wind-down')
    const done = q<HTMLButtonElement>(h.root, '[data-action="done"]')
    expect(document.activeElement).toBe(done) // T12 focus map intact — (a), not (b)
    return done
  }

  it('holds Enter/Space on the focused plate: keydowns prevented, keyboard-style clicks swallowed — a pointer click finalizes immediately', () => {
    const h = mountRouter()
    const done = surviveToDone(h)

    // The mid-sentence keystroke lands on the focused plate — held. (Space
    // is ' ' in the DOM key; 'Spacebar' is the legacy name, matched too.)
    for (const key of ['Enter', ' ', 'Spacebar']) {
      const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      done.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true)
      const up = new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })
      done.dispatchEvent(up)
      expect(up.defaultPrevented).toBe(true)
    }
    // The keyboard-equivalent click is swallowed too (detail 0 is exactly
    // what browsers synthesize for Enter/Space activation — and what jsdom's
    // click() produces), with ONE honest spoken hold per window.
    done.click()
    expect(phaseOf(h.root)).toBe('wind-down')
    expect(q(h.root, '[data-winddown-status]').textContent).toContain('DONE holds')
    done.click()
    expect(q(h.root, '[data-winddown-status]').textContent).toContain('DONE holds') // once

    // The pointer always works: a real click (detail ≥ 1) finalizes now.
    done.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    expect(phaseOf(h.root)).toBe('archive')
  })

  it('the hold expires after the guard window: keyboard activation finalizes again', () => {
    const h = mountRouter()
    const done = surviveToDone(h)
    passDoneGuard(h)
    const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    done.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false) // the circuit is live again
    done.click()
    expect(phaseOf(h.root)).toBe('archive')
  })

  it('a FRESH focus on DONE is deliberate intent — the hold lifts inside the window', () => {
    const h = mountRouter()
    const done = surviveToDone(h)
    q<HTMLTextAreaElement>(h.root, '[data-winddown-text]').focus()
    done.focus() // Tab away and back: deliberate, not the disarm focus
    const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    done.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    done.click()
    expect(phaseOf(h.root)).toBe('archive')
  })

  it('Enter inside the wind-down editor never finalizes — no form, no submit semantics (even outside the window)', () => {
    const h = mountRouter()
    surviveToDone(h)
    passDoneGuard(h)
    const windDown = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    // Structural: the editor is not inside any form (implicit submission is
    // impossible), and every button on the console is type="button".
    expect(windDown.closest('form')).toBeNull()
    expect(q(h.root, '[data-phase="wind-down"]').querySelector('form')).toBeNull()
    for (const button of h.root.querySelectorAll('button')) {
      expect(button.type).toBe('button')
    }
    // Behavioral: Enter in the draft is a draft keystroke, not a finalize.
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    windDown.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    expect(phaseOf(h.root)).toBe('wind-down')
    expect(q(h.root, '[data-winddown-status]').textContent).not.toContain('DONE holds')
  })
})

// ---------------------------------------------------------------------------
// T12 — STATE ANNOUNCEMENTS. Two persistent regions ride after the screen
// section (they survive every swap); the fade-start announcement lives in the
// write surface's own polite region (T9 built it empty from mount). All fire
// ONCE per transition, never per tick.
// ---------------------------------------------------------------------------

describe('announcements (T12): regions, politeness, once-per-transition', () => {
  it('mounts the two state-announcement regions EMPTY from construction with the right roles', () => {
    const h = mountRouter()
    const status = h.root.querySelector<HTMLElement>('[data-announcements="status"]')
    const alert = h.root.querySelector<HTMLElement>('[data-announcements="alert"]')
    expect(status).not.toBeNull()
    expect(alert).not.toBeNull()
    // Politeness by role: status ⇒ polite (implicit), alert ⇒ assertive.
    expect(status!.getAttribute('role')).toBe('status')
    expect(alert!.getAttribute('role')).toBe('alert')
    // MDN/R2: the region must exist BEFORE its content changes — empty now.
    expect(status!.textContent).toBe('')
    expect(alert!.textContent).toBe('')
    // They ride AFTER the section and survive the swap (firstElementChild is
    // still the screen — phaseOf and tab order are unaffected).
    expect(h.root.children[h.root.children.length - 1]).toBe(alert)
    expect(h.root.children[h.root.children.length - 2]).toBe(status)
    expect(phaseOf(h.root)).toBe('setup')
  })

  it('announces fade start politely ONCE per fade onset, clears on restore, re-announces on the next onset', () => {
    const h = mountRouter()
    const editor = arm(h, 'STANDARD', '2') // fade 5s / loss 10s
    const fadeRegion = q(h.root, '[data-fade-announcement]')
    expect(fadeRegion.getAttribute('aria-live')).toBe('polite')
    expect(fadeRegion.textContent).toBe('') // exists empty from mount (R2)

    // Fade onset: the announcement is written once — never per tick.
    h.clock.advance(PRESETS.STANDARD.fadeDelayMs + 1_000)
    h.frames.tick()
    h.timers.fireDue()
    expect(fadeRegion.textContent).toBe(FADE_START_ANNOUNCEMENT)
    const announcedAt = fadeRegion.textContent
    h.clock.advance(1_000) // more frames while fading — region must NOT churn
    h.frames.tick()
    h.timers.fireDue()
    expect(fadeRegion.textContent).toBe(announcedAt)

    // The countdown keeps ticking in ITS region (role=timer) without touching
    // the announcement — the per-second spam guard is structural.
    expect(q(h.root, '[data-countdown]').getAttribute('role')).toBe('timer')
    expect(q(h.root, '[data-countdown-text]').textContent).not.toBe(FADE_START_ANNOUNCEMENT)

    // Restore clears the region, so the NEXT fade onset is a real content
    // change (live regions announce changes, not repeated identical text).
    typeInto(editor, 'restored ')
    expect(fadeRegion.textContent).toBe('')
    h.clock.advance(PRESETS.STANDARD.fadeDelayMs + 1_000)
    h.frames.tick()
    h.timers.fireDue()
    expect(fadeRegion.textContent).toBe(FADE_START_ANNOUNCEMENT)
  })

  it('announces deletion ASSERTIVELY (role=alert region), once, and clears it when the board is left', () => {
    const h = mountRouter()
    const editor = arm(h, 'BRUTAL', '')
    typeInto(editor, 'the last words ')
    const alertRegion = q(h.root, '[data-announcements="alert"]')

    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(alertRegion.textContent).toBe(DELETION_ANNOUNCEMENT)

    // Terminal: no further recomputes exist, and none could re-fire it — but
    // late clock/frames must not churn the region either.
    h.clock.advance(60_000)
    h.frames.tick()
    h.timers.fireDue()
    expect(alertRegion.textContent).toBe(DELETION_ANNOUNCEMENT)

    // Leaving the board (RE-ARM, straight into the next session — R2) clears
    // both regions — the second deletion announces again despite identical text.
    q<HTMLButtonElement>(h.root, '[data-action="rearm"]').click()
    expect(alertRegion.textContent).toBe('')
    expect(q(h.root, '[data-announcements="status"]').textContent).toBe('')
    expect(phaseOf(h.root)).toBe('write') // the restart is a live session, not a setup pass

    const second = q<HTMLTextAreaElement>(h.root, '[data-editor]') // the re-armed fresh editor
    typeInto(second, 'second loss ')
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(q(h.root, '[data-announcements="alert"]').textContent).toBe(DELETION_ANNOUNCEMENT)
  })

  it('announces disarm politely — success names the archive, quota failure names the retry', () => {
    const h = mountRouter()
    const editor = arm(h, 'STANDARD', '1')
    typeUntil(h, editor, T0 + 60_000, 'word ')
    expect(q(h.root, '[data-announcements="status"]').textContent).toBe(DISARM_ANNOUNCEMENT)
    // Assertive is reserved for loss — the deletion region stays silent here.
    expect(q(h.root, '[data-announcements="alert"]').textContent).toBe('')

    const failing = mountRouter()
    failing.storage.failWrites = true
    const second = arm(failing, 'STANDARD', '1')
    typeUntil(failing, second, T0 + 60_000, 'word ')
    expect(q(failing.root, '[data-announcements="status"]').textContent).toBe(
      DISARM_FAILURE_ANNOUNCEMENT,
    )
  })

  it('mounts every screen with both regions cleared (a same-text announcement stays a content change)', () => {
    const h = mountRouter()
    const editor = arm(h, 'STANDARD', '1')
    typeUntil(h, editor, T0 + 60_000, 'word ') // disarm announcement lands
    expect(q(h.root, '[data-announcements="status"]').textContent).not.toBe('')

    // NEW SESSION back to setup clears; ARM into the next session stays
    // clear; the next disarm announces as a fresh content change. (R3: DONE
    // is finalized through the fresh-focus path — no clock advance — so the
    // second 1-minute session still disarms exactly at T0 + 120_000.)
    q<HTMLTextAreaElement>(h.root, '[data-winddown-text]').focus()
    q<HTMLButtonElement>(h.root, '[data-action="done"]').focus()
    q<HTMLButtonElement>(h.root, '[data-action="done"]').click()
    q<HTMLButtonElement>(h.root, '[data-action="new-session"]').click()
    expect(q(h.root, '[data-announcements="status"]').textContent).toBe('')
    const next = arm(h, 'STANDARD', '1')
    expect(q(h.root, '[data-announcements="status"]').textContent).toBe('')
    typeUntil(h, next, T0 + 2 * 60_000, 'word ')
    expect(q(h.root, '[data-announcements="status"]').textContent).toBe(DISARM_ANNOUNCEMENT)
  })
})

// ---------------------------------------------------------------------------
// T12 — FOCUS MANAGEMENT + KEYBOARD-ONLY WALKTHROUGH. Every screen swap lands
// focus deliberately; Tab order is pinned per screen. jsdom honesty: native
// Enter/Space→click activation for <button> is browser behavior jsdom does
// not synthesize, so activations go through click() and the real-browser
// confirmation belongs to the recorded manual VoiceOver/keyboard protocol.
// ---------------------------------------------------------------------------

/** Keyboard-reachable elements in DOM order (native controls; no tabindex tricks
 *  exist — R1's guarded ARM is the one deliberate exception: ARM carries
 *  tabindex="-1" while its cover is closed, mirroring the CSS cover that owns
 *  the socket; it re-enters the order the moment the cover lifts). Unchecked
 *  radios are skipped by native rules; hidden subtrees (the archive confirm
 *  panel while closed) leave the tab order. */
function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')].filter(
    (el) => {
      if (el.closest('[hidden]') !== null) return false
      if (el.getAttribute('tabindex') === '-1') return false
      if (el instanceof HTMLInputElement && el.type === 'radio') return el.checked
      return true
    },
  )
}

/** Label a tabbable by its action hooks (button vocabulary of the screen). */
function tabLabel(el: HTMLElement): string {
  return el.getAttribute('data-action') ?? el.getAttribute('data-entry-action') ?? el.tagName
}

describe('keyboard walkthrough (T12): focus targets + tab order across the whole loop', () => {
  it('survive loop: setup → editor (ARM) → DONE (disarm) → finalized entry VIEW (Done) → ARM (new session)', () => {
    const h = mountRouter()
    const archive = createArchive(h.storage)

    // SETUP tab order (cover closed): checked duration radio, custom field,
    // checked preset radio, the ARM COVER (the ritual's first step — ARM
    // itself is tabindex="-1" under the closed cover), VIEW ARCHIVE.
    expect(tabbables(h.root).map((el) => el.getAttribute('data-action') ?? el.tagName)).toEqual([
      'INPUT', // duration 5 (checked)
      'INPUT', // custom minutes
      'INPUT', // STANDARD (checked)
      'arm-cover',
      'view-archive',
    ])

    // Lifting the cover is one motion and keyboard-complete: the cover leaves
    // the order, ARM enters it and takes focus.
    q<HTMLButtonElement>(h.root, '[data-action="arm-cover"]').click()
    expect(tabbables(h.root).map((el) => el.getAttribute('data-action') ?? el.tagName)).toEqual([
      'INPUT', // duration 5 (checked)
      'INPUT', // custom minutes
      'INPUT', // STANDARD (checked)
      'arm',
      'view-archive',
    ])
    expect(document.activeElement).toBe(q(h.root, '[data-action="arm"]'))
    // Escape re-covers the switch and returns focus to the cover.
    q(h.root, '[data-action="arm"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(tabbables(h.root).map((el) => el.getAttribute('data-action') ?? el.tagName)).toEqual([
      'INPUT',
      'INPUT',
      'INPUT',
      'arm-cover',
      'view-archive',
    ])
    expect(document.activeElement).toBe(q(h.root, '[data-action="arm-cover"]'))

    // ARM → the editor is focused (the writer's hands go to the text).
    const editor = arm(h, 'STANDARD', '1')
    expect(document.activeElement).toBe(editor)
    // WRITE tab order: the editor is the only focusable circuit.
    expect(tabbables(h.root)).toEqual([editor])

    typeUntil(h, editor, T0 + 60_000, 'word ')
    // DISARM → DONE focused (T12 decision; the editor stays one Tab away).
    const done = q<HTMLButtonElement>(h.root, '[data-action="done"]')
    expect(document.activeElement).toBe(done)

    // WIND-DOWN tab order: draft, COPY, DOWNLOAD, DONE.
    expect(tabbables(h.root).map(tabLabel)).toEqual(['TEXTAREA', 'copy', 'download', 'done'])

    // R3 guard, keyboard honestly: the writer finishes their sentence first —
    // Tab to the draft, then BACK to DONE. The fresh focus is deliberate
    // intent, so the keystroke hold lifts and Enter-equivalent finalizes.
    const draft = q<HTMLTextAreaElement>(h.root, '[data-winddown-text]')
    draft.focus()
    expect(document.activeElement).toBe(draft)
    done.focus()
    expect(document.activeElement).toBe(done)

    // DONE → archive, focus on the finalized entry's VIEW (the payoff first).
    done.click()
    expect(phaseOf(h.root)).toBe('archive')
    const entries = archive.list()
    const view = h.root.querySelector<HTMLButtonElement>(
      `[data-entry-id="${entries[0]!.id}"] [data-entry-action="view"]`,
    )
    expect(view).not.toBeNull()
    expect(document.activeElement).toBe(view)

    // ARCHIVE tab order: NEW SESSION, per-entry view/copy/download/delete, CLEAR
    // (the hidden confirm panel's controls are excluded while closed).
    expect(tabbables(h.root).map(tabLabel)).toEqual([
      'new-session',
      'view',
      'copy',
      'download',
      'delete',
      'clear-log',
    ])

    // NEW SESSION → setup, ARM focused: the loop is one motion from here.
    q<HTMLButtonElement>(h.root, '[data-action="new-session"]').click()
    const armButton = q<HTMLButtonElement>(h.root, '[data-action="arm"]')
    expect(document.activeElement).toBe(armButton)
    armButton.click()
    expect(document.activeElement).toBe(q(h.root, '[data-editor]'))
  })

  it('deletion loop: RE-ARM focused first on the deleted board (RECONFIGURE second); one gesture restarts into the editor; RECONFIGURE lands on ARM', () => {
    const h = mountRouter()
    const editor = arm(h, 'BRUTAL', '')
    typeInto(editor, 'doomed ')
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()

    expect(phaseOf(h.root)).toBe('deleted')
    const reArm = q<HTMLButtonElement>(h.root, '[data-action="rearm"]')
    const reconfigure = q<HTMLButtonElement>(h.root, '[data-action="reconfigure"]')
    expect(document.activeElement).toBe(reArm)
    expect(tabbables(h.root)).toEqual([reArm, reconfigure]) // the restart circuit first

    // One gesture — RE-ARM (focused) → Enter-equivalent → writing. No setup
    // pass, no second decision: the keyboard loop is RE-ARM → keys on text.
    reArm.click()
    expect(phaseOf(h.root)).toBe('write')
    const fresh = q<HTMLTextAreaElement>(h.root, '[data-editor]')
    expect(fresh).not.toBe(editor)
    expect(document.activeElement).toBe(fresh)
    expect(tabbables(h.root)).toEqual([fresh]) // the write surface holds one circuit

    // RECONFIGURE: the deleted board's second circuit lands on ARM (the
    // deliberate focus lifts the cover) — the setup path stays one motion too.
    typeInto(fresh, 'gone again ')
    h.clock.advance(PRESETS.BRUTAL.deleteThresholdMs)
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('deleted')
    expect(document.activeElement).toBe(q<HTMLButtonElement>(h.root, '[data-action="rearm"]'))
    q<HTMLButtonElement>(h.root, '[data-action="reconfigure"]').click()
    expect(phaseOf(h.root)).toBe('setup')
    expect(document.activeElement).toBe(q<HTMLButtonElement>(h.root, '[data-action="arm"]'))
  })

  it('archive from setup lands focus on NEW SESSION; the confirm panel keeps its focus discipline', () => {
    const h = mountRouter()
    q<HTMLButtonElement>(h.root, '[data-action="view-archive"]').click()
    expect(phaseOf(h.root)).toBe('archive')
    expect(document.activeElement).toBe(q<HTMLButtonElement>(h.root, '[data-action="new-session"]'))

    // Clear-all (T11): focus moves to CONFIRM CLEAR on open, back to CLEAR on
    // Escape — no keyboard trap, hidden controls stay out of the tab order.
    const clear = q<HTMLButtonElement>(h.root, '[data-action="clear-log"]')
    expect(clear.disabled).toBe(true) // empty log — nothing to confirm
  })

  it('setup validation announces politely through [data-error] (role=status) and never blocks recovery', () => {
    const h = mountRouter()
    const error = q(h.root, '[data-error]')
    expect(error.getAttribute('role')).toBe('status')
    expect(error.textContent).toBe('')

    const custom = q<HTMLInputElement>(h.root, '[data-custom-minutes]')
    custom.value = '121'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(error.textContent).toContain('1–120')
    custom.value = '90'
    custom.dispatchEvent(new Event('input', { bubbles: true }))
    expect(error.textContent).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Teardown.
// ---------------------------------------------------------------------------

describe('destroy', () => {
  it('tears down a live session and the console; nothing runs afterwards', () => {
    const h = mountRouter()
    arm(h, 'STANDARD', '1')
    expect(phaseOf(h.root)).toBe('write')

    h.router.destroy()
    expect(h.frames.size).toBe(0)
    expect(h.timers.size).toBe(0)
    expect(h.root.children).toHaveLength(0)
    expect(() => h.router.startSession({ preset: 'GENTLE', minutes: 5 })).toThrow()

    // The engine is silent afterwards — no phase change, no resurrected screen.
    h.clock.advance(60_000)
    h.frames.tick()
    h.timers.fireDue()
    expect(phaseOf(h.root)).toBe('')
    expect(() => h.router.destroy()).not.toThrow() // idempotent (harness cleanup)
  })
})
