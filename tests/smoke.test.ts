import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('scaffold smoke', () => {
  it('runs the vitest pipeline', () => {
    expect(1 + 1).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Document shell (refinement R4): the browser chrome carries the room.
// ---------------------------------------------------------------------------

const shellHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('document shell: the parts the room did not draw still follow the room', () => {
  it('declares theme-color equal to the committed ground token (exact value from tokens.css)', () => {
    const ground = tokensCss.match(/--ground:\s*(#[0-9a-fA-F]{6})\s*;/)?.[1]
    expect(ground).toBeDefined()
    expect(shellHtml).toContain(`<meta name="theme-color" content="${ground}" />`)
  })

  it('ships an inline SVG favicon in the world\'s vocabulary — no external asset, palette from tokens.css', () => {
    const href = shellHtml.match(/<link\s+rel="icon"\s+href="([^"]+)"/)?.[1]
    expect(href).toBeDefined()
    expect(href!).toMatch(/^data:image\/svg\+xml,/)
    // Hand-authored geometry in the committed palette only: every hex the
    // glyph spends is a tokens.css value (panel-raised, panel-inset, bone,
    // ground) — the split-flap digit well with its hinge seam.
    const hexes = [...href!.matchAll(/%23([0-9a-fA-F]{6})/g)].map((m) => `#${m[1]}`)
    expect(hexes.length).toBeGreaterThan(0)
    for (const hex of hexes) {
      expect(tokensCss, `favicon color ${hex} must be a token`).toContain(`${hex};`)
    }
    // The signature silhouette: the recessed well rect and the seam rect.
    expect(href).toContain('rx=')
    expect(href).toMatch(/%3Crect[^%]*fill='%230e1013'/)
  })
})
