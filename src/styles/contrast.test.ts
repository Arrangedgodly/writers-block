/**
 * T12 — CONTRAST VERIFICATION, COMPUTED (not eyeballed) against the real
 * token values, and REDUCED-MOTION PARITY re-checked across every sheet.
 *
 * jsdom/axe cannot evaluate contrast (no cascade, no layout — vitest stubs
 * CSS), so the arithmetic lives here against tokens.css itself: every
 * text/background pair the five phases actually render is computed with the
 * WCAG 2.x relative-luminance formula and asserted against its threshold
 * (4.5:1 normal text; 3:1 for the one display-size instrument readout and
 * non-text state indicators). color-mix(in srgb, A p%, B) resolves exactly as
 * the spec defines it for the srgb space: a weighted average of the
 * gamma-encoded components.
 *
 * The disclosed list at the bottom computes — and prints, but does not gate —
 * pairs that are exempt by design (disabled controls, decorative lamps whose
 * state is fully duplicated by adjacent text). The full table is reproduced
 * in the T12 production-log entry.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const mainCss = readFileSync(join(process.cwd(), 'src/styles/main.css'), 'utf8')
const platesCss = readFileSync(join(process.cwd(), 'src/styles/plates.css'), 'utf8')
const writeCss = readFileSync(join(process.cwd(), 'src/styles/write.css'), 'utf8')
const outcomeCss = readFileSync(join(process.cwd(), 'src/styles/outcome.css'), 'utf8')
const archiveCss = readFileSync(join(process.cwd(), 'src/styles/archive.css'), 'utf8')
const setupCss = readFileSync(join(process.cwd(), 'src/styles/setup.css'), 'utf8')

// ---------------------------------------------------------------------------
// WCAG arithmetic.
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number]

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

/** color-mix(in srgb, A p%, B): weighted average of gamma-encoded components. */
function mix(a: Rgb, b: Rgb, aPercent: number): Rgb {
  const w = aPercent / 100
  return [
    Math.round(a[0] * w + b[0] * (1 - w)),
    Math.round(a[1] * w + b[1] * (1 - w)),
    Math.round(a[2] * w + b[2] * (1 - w)),
  ]
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

export function contrast(fg: Rgb, bg: Rgb): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

function rgb(color: Rgb): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`
}

// ---------------------------------------------------------------------------
// Token resolution — from tokens.css, not hand-copied.
// ---------------------------------------------------------------------------

const hexTokens = new Map<string, Rgb>()
for (const match of tokensCss.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  const name = match[1]
  const hex = match[2]
  if (name === undefined || hex === undefined) continue
  hexTokens.set(name, hexToRgb(hex))
}

/** Resolve a named token: hex directly, color-mix recursively. */
function resolveToken(name: string): Rgb {
  const hex = hexTokens.get(name)
  if (hex !== undefined) return hex
  const mixMatch = tokensCss.match(
    new RegExp(`--${name}:\\s*color-mix\\(in srgb, var\\(--([a-z0-9-]+)\\) (\\d+)%, var\\(--([a-z0-9-]+)\\)\\)`),
  )
  if (mixMatch === null) throw new Error(`token --${name} not found in tokens.css`)
  const from = mixMatch[1]
  const percent = mixMatch[2]
  const to = mixMatch[3]
  if (from === undefined || percent === undefined || to === undefined) {
    throw new Error(`token --${name} has an unparsable color-mix`)
  }
  return mix(resolveToken(from), resolveToken(to), Number(percent))
}

// The composite surfaces actually used by the sheets (color-mix derivatives
// used directly in archive.css are resolved the same way).
const colors = {
  ground: resolveToken('ground'),
  panelRaised: resolveToken('panel-raised'),
  panelInset: resolveToken('panel-inset'),
  bone: resolveToken('bone'),
  boneDim: resolveToken('bone-dim'),
  boneFaint: resolveToken('bone-faint'),
  bone88: mix(resolveToken('bone'), resolveToken('ground'), 88), // primary-plate hover
  green: resolveToken('lamp-green'),
  amber: resolveToken('lamp-amber'),
  red: resolveToken('lamp-red'),
  greenDim: resolveToken('lamp-green-dim'),
  amberDim: resolveToken('lamp-amber-dim'),
  redDim: resolveToken('lamp-red-dim'),
} as const

// ---------------------------------------------------------------------------
// The pairs actually rendered (fg on bg), with the WCAG threshold that
// attaches, and where each appears. Normal text ≥4.5:1 unless noted.
// ---------------------------------------------------------------------------

const pairs: ReadonlyArray<{ name: string; fg: Rgb; bg: Rgb; min: number; where: string }> = [
  { name: 'bone / ground', fg: colors.bone, bg: colors.ground, min: 4.5, where: 'body prose, plate hover text, entry titles + run times, stat values, wind-down draft' },
  { name: 'bone / panel-raised', fg: colors.bone, bg: colors.panelRaised, min: 4.5, where: 'flap-board digits + frozen clock (write.css), FLIGHT LOG title (archive.css)' },
  { name: 'bone / panel-inset', fg: colors.bone, bg: colors.panelInset, min: 4.5, where: 'entry full-draft text in the recessed well' },
  { name: 'bone-dim / ground', fg: colors.boneDim, bg: colors.ground, min: 4.5, where: 'lamp names, status line, editor placeholder, meta/excerpt, verdict, notes, stat labels, plate text, setup intro/legends/error line' },
  { name: 'bone-dim / panel-raised', fg: colors.boneDim, bg: colors.panelRaised, min: 4.5, where: 'T– board prefix, caution label, archive notes/count, confirm body, setup placard names/values/limits (unselected), arm-station legends' },
  { name: 'lamp-green / ground', fg: colors.green, bg: colors.ground, min: 4.5, where: 'COPIED transient plate state' },
  { name: 'lamp-amber / ground', fg: colors.amber, bg: colors.ground, min: 4.5, where: 'FADING status text, COPY FAILED transient, setup validation hold line' },
  { name: 'lamp-amber / panel-raised', fg: colors.amber, bg: colors.panelRaised, min: 4.5, where: 'reduced-motion caution title + numeric countdown, confirm title' },
  { name: 'lamp-red / ground', fg: colors.red, bg: colors.ground, min: 4.5, where: 'CONFIRM CLEAR plate (destruct)' },
  { name: 'lamp-red / panel-inset', fg: colors.red, bg: colors.panelInset, min: 3, where: 'SIGNAL LOST DSEG14 readout — display size (≥24px) large text; passes 4.5 anyway' },
  { name: 'ground / bone', fg: colors.ground, bg: colors.bone, min: 4.5, where: 'primary plate (ARM-side buttons), ::selection' },
  { name: 'ground / bone-88%', fg: colors.ground, bg: colors.bone88, min: 4.5, where: 'primary plate hover' },
  // Non-text state indicators (WCAG 1.4.11, ≥3:1).
  { name: 'focus green / ground', fg: colors.green, bg: colors.ground, min: 3, where: '2px focus ring on plates/editor column' },
  { name: 'amber band / ground', fg: colors.amber, bg: colors.ground, min: 3, where: 'threat hairline band on the column edge (non-text)' },
  { name: 'lit green dome / ground', fg: colors.green, bg: colors.ground, min: 3, where: 'LIVE lamp lit (non-text; state also in text)' },
  { name: 'lit amber dome / ground', fg: colors.amber, bg: colors.ground, min: 3, where: 'FADE lamp lit (non-text; state also in text)' },
  { name: 'lit red dome / ground', fg: colors.red, bg: colors.ground, min: 3, where: 'LOSS lamp lit (non-text; state also in text)' },
]

describe('contrast (T12): every rendered pair computed from tokens.css', () => {
  it('asserts every text pair ≥4.5:1 and non-text indicators ≥3:1', () => {
    expect(hexTokens.get('ground')).toBeDefined()
    for (const pair of pairs) {
      const ratio = contrast(pair.fg, pair.bg)
      expect(
        Math.round(ratio * 100) / 100,
        `${pair.name} (${rgb(pair.fg)} on ${rgb(pair.bg)}) — ${pair.where}`,
      ).toBeGreaterThanOrEqual(pair.min)
    }
  })

  it('prints the full table for the production log and pins the exact ratios', () => {
    for (const pair of pairs) {
      console.info(`[contrast] ${pair.name}: ${contrast(pair.fg, pair.bg).toFixed(2)}:1 (min ${pair.min}) — ${pair.where}`)
    }
    // Spot-pin the load-bearing values so a token drift cannot pass silently.
    expect(contrast(colors.bone, colors.ground)).toBeGreaterThan(14)
    expect(contrast(colors.boneDim, colors.ground)).toBeGreaterThan(5.4)
    expect(contrast(colors.boneDim, colors.panelRaised)).toBeGreaterThan(5)
    expect(contrast(colors.amber, colors.panelRaised)).toBeGreaterThan(9)
    expect(contrast(colors.red, colors.ground)).toBeGreaterThan(5.4)
    expect(contrast(colors.red, colors.panelInset)).toBeGreaterThan(5.7)
  })

  it('disclosed-by-design pairs: computed and recorded, exempt (disabled control / decorative lamps)', () => {
    // Disabled plates (CLEAR LOG on an empty log) — inactive UI components are
    // exempt from 1.4.3; the token documents bone-faint as annotations-only.
    const disabled = contrast(colors.boneFaint, colors.ground)
    console.info(`[contrast] bone-faint / ground (DISABLED plates only): ${disabled.toFixed(2)}:1 — exempt (1.4.3 inactive components)`)
    expect(disabled).toBeGreaterThan(2)

    // Unlit lamp domes (26% lamp over panel-inset) sit below 3:1 against the
    // room — deliberate: an unlit lamp is PRESENCE, not information; the state
    // is fully carried by adjacent text (status line / verdicts), and the
    // domes are aria-hidden. Recorded, not gated.
    for (const [name, dim] of [
      ['lamp-green-dim', colors.greenDim],
      ['lamp-amber-dim', colors.amberDim],
      ['lamp-red-dim', colors.redDim],
    ] as const) {
      const ratio = contrast(dim, colors.ground)
      console.info(`[contrast] ${name} unlit dome / ground: ${ratio.toFixed(2)}:1 — decorative (aria-hidden; state duplicated by text)`)
      expect(ratio).toBeGreaterThan(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Reduced-motion parity re-check (T12) across ALL surfaces, incl. the outcome
// annunciator latch + tape flip: nothing may animate under
// prefers-reduced-motion: reduce — animations are either inside a
// no-preference gate or token-duration-driven (tokens collapse to 0.01ms),
// and every transition duration is a --dur-* token or literally 0s.
// ---------------------------------------------------------------------------

/** Extract one @media block by brace matching (with any nested blocks). */
function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media (${query})`)
  if (start < 0) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  return ''
}

describe('reduced-motion parity (T12): no animation under reduce, anywhere', () => {
  it('tokens.css collapses every duration token to 0.01ms under reduce', () => {
    const reduce = mediaBlock(tokensCss, 'prefers-reduced-motion: reduce')
    expect(reduce).not.toBe('')
    for (const token of ['--dur-flap', '--dur-board', '--dur-state', '--dur-arm']) {
      expect(reduce, `${token} collapsed under reduce`).toMatch(new RegExp(`${token}:\\s*0\\.01ms`))
    }
    expect(reduce).toMatch(/--motion-level:\s*reduced/)
  })

  it('write.css: zero animation declarations; flap transitions exist only inside the no-preference gate; all durations token-driven', () => {
    expect(writeCss).not.toMatch(/animation\s*:/)
    const noPref = mediaBlock(writeCss, 'prefers-reduced-motion: no-preference')
    expect(noPref).not.toBe('')
    // The leaf transform transition (the only motion on the write surface) is
    // inside the gate; outside it the leaves do not exist (display: none).
    expect(noPref).toMatch(/\.flap-leaf\s*\{[\s\S]*?transition:\s*transform var\(--dur-flap\)/)
    const outside = writeCss.replace(noPref, '')
    expect(outside).not.toMatch(/transition:\s*transform/)
    // Glow (text-shadow/box-shadow additions) is inside the gate too.
    expect(noPref).toMatch(/text-shadow/)
    expect(outside).not.toMatch(/text-shadow/)
  })

  it('outcome.css: every animation (annunciator latch + tape flip + glow) inside the no-preference gate', () => {
    const noPref = mediaBlock(outcomeCss, 'prefers-reduced-motion: no-preference')
    expect(noPref).not.toBe('')
    const animations = [...outcomeCss.matchAll(/animation:\s*[^;]+;/g)].map((m) => m[0])
    expect(animations.length).toBeGreaterThanOrEqual(2) // loss-latch + board-flip
    const outside = outcomeCss.replace(noPref, '')
    for (const declaration of animations) {
      expect(noPref).toContain(declaration)
      expect(outside).not.toContain(declaration)
    }
    // The latch switches background-color in hard steps, never opacity; the
    // flip is transform-only, never opacity (the fade is not co-opted).
    const latch = outcomeCss.match(/@keyframes\s+loss-latch\s*\{[\s\S]*?\n\}/)![0]
    expect(latch).not.toContain('opacity')
    const flip = outcomeCss.match(/@keyframes\s+board-flip\s*\{[\s\S]*?\n\}/)![0]
    expect(flip).toContain('rotateX')
    expect(flip).not.toContain('opacity')
  })

  it('archive.css: the confirm settle animation is token-duration-driven (0.01ms under reduce); reveal uses tokens + 0s', () => {
    const animations = [...archiveCss.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1])
    expect(animations).toEqual(['confirm-settle var(--dur-board) var(--ease-damped)'])
    // No reduce block is needed: the duration collapses to 0.01ms via tokens.
    expect(archiveCss).not.toMatch(/prefers-reduced-motion:\s*reduce/)
  })

  it('every transition duration in every sheet is a --dur-* token or literally 0s (all collapse or are zero under reduce)', () => {
    for (const [name, css] of [
      ['main.css', mainCss],
      ['plates.css', platesCss],
      ['write.css', writeCss],
      ['outcome.css', outcomeCss],
      ['archive.css', archiveCss],
      ['setup.css', setupCss],
    ] as const) {
      const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)]
        .map((m) => m[1])
        .filter((t): t is string => t !== undefined)
      for (const declaration of transitions) {
        const bareDurations = declaration
          .split(',')
          .flatMap((part) => part.trim().split(/\s+/))
          .filter((token) => /^\d+(\.\d+)?(ms|s)$/.test(token) && token !== '0s')
        expect(
          bareDurations,
          `${name}: transition "${declaration}" must be token-driven`,
        ).toEqual([])
      }
    }
  })

  it('main.css carries no animation at all (grain is static texture by T8 commitment)', () => {
    expect(mainCss).not.toMatch(/animation\s*:/)
    expect(mainCss).not.toMatch(/transition\s*:/)
  })
})

describe('focus appearance (T12 + R4): the 2px focus band, tokenized', () => {
  it('the write column edge — the textarea\'s focus indicator (it sets outline:none) — is a constant 2px band in every state', () => {
    // The editor removes the UA outline (its indicator = caret + this band),
    // so the band itself must satisfy WCAG 2.4.11's ≥2px thickness — and its
    // width is identical in ALL states (transparent/green/amber), so nothing
    // shifts when the state flips; the padding gives the 1px back.
    expect(writeCss).toMatch(/\.write-column\s*\{[^}]*border-left:\s*var\(--focus-width\) solid transparent/s)
    expect(writeCss).toMatch(/\.write-column\s*\{[^}]*padding-left:\s*calc\(var\(--sp-4\) - 1px\)/s)
    expect(writeCss).toMatch(/\.write-column:focus-within\s*\{[^}]*border-left-color:\s*var\(--focus-color\)/s)
  })

  it('the committed width is one token — --focus-width: 2px in tokens.css — and every focus ring in every sheet draws it (R4)', () => {
    // T11's follow-up closed: the 2px literal that three sheets shared is a
    // token now, so the WCAG 2.4.11 ≥2px judgment is made once and pinned.
    expect(tokensCss).toMatch(/--focus-width:\s*2px\s*;/)
    // Green focus ring on every plate control (archive.css + outcome.css
    // + setup.css; the setup placards carry it via :has(.placard-radio:
    // focus-visible), the custom-minutes field via its own rule) — all
    // consuming the same token, never a bare literal.
    for (const css of [archiveCss, outcomeCss, setupCss]) {
      expect(css).toMatch(/button:focus-visible\s*\{[^}]*outline:\s*var\(--focus-width\) solid var\(--focus-color\)/s)
      expect(css).not.toMatch(/outline:\s*2px solid/)
    }
    expect(setupCss).toMatch(/\.setup \.placard:has\(\.placard-radio:focus-visible\)\s*\{[^}]*outline:\s*var\(--focus-width\)/s)
    expect(setupCss).toMatch(/\.setup-custom-input:focus-visible\s*\{[^}]*outline:\s*var\(--focus-width\)/s)
  })
})
