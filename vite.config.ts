/// <reference types="vitest/config" />
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * OFL font files ship hashed into dist/assets via the CSS url() imports, but
 * their licenses must accompany them in the shipped bundle (OFL 1.1). This
 * plugin copies every *.txt license from src/assets/fonts/<family>/ into
 * dist/font-licenses/<family>/ so the build stays self-contained.
 */
function shipFontLicenses(fontsDir: string, outDir: string): Plugin {
  return {
    name: 'ship-font-licenses',
    apply: 'build',
    closeBundle() {
      for (const family of readdirSync(fontsDir)) {
        const familyDir = join(fontsDir, family)
        if (!statSync(familyDir).isDirectory()) continue
        for (const file of readdirSync(familyDir)) {
          if (!file.endsWith('.txt')) continue
          const target = join(outDir, family)
          mkdirSync(target, { recursive: true })
          cpSync(join(familyDir, file), join(target, file))
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [shipFontLicenses('src/assets/fonts', 'dist/font-licenses')],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
