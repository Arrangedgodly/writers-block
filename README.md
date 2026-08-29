# The Disappearing Draft

A minimalist web text editor that breaks writer's block by making stopping costlier than continuing.

Live at **[draft.graydonwasil.com](https://draft.graydonwasil.com)**.

## How it works

You arm a guarded countdown, then write under threat:

1. Pick a session length and a difficulty preset.
2. Write. Stop typing, and after the preset idle delay the draft starts to pale under an amber hairline band.
3. Idle past the second threshold and the whole draft is permanently deleted. No undo, no recycle bin, no pause, and the clock keeps running while the tab is hidden.
4. Keep moving until 0:00 and the threat disarms. The draft lands in the FLIGHT LOG, where you can read, copy, or download it.

The interface is styled as a mission-control countdown console, all split-flap boards, range-safety lamps, and tabular numerals. The threat is believable because it is real.

| Preset | Fades after | Deletes after |
| --- | --- | --- |
| GENTLE | 10s idle | 30s idle |
| STANDARD | 5s idle | 10s idle |
| BRUTAL | 3s idle | 6s idle |

Durations: 3, 5, 10, or 15 minutes, or any custom length from 1 to 120 minutes.

## Running it

Requires Node and npm. Built and tested on Node 24 / npm 11; `engines` asks for 22.12+.

```bash
npm install     # once
npm run dev     # development server
npm test        # full suite (218 tests: timing, controller, permanence, router, surfaces, a11y, contrast)
npm run build   # strict typecheck + production build into dist/
npm run preview # serve the built dist/ bundle locally
```

The production build is a fully static bundle, `dist/index.html` plus hashed assets, deployable to any static host. Everything happens in your browser: no backend, no account, no network calls at runtime. Fonts are self-hosted.

## Deployment

Cloudflare Pages hosts [draft.graydonwasil.com](https://draft.graydonwasil.com), connected to this repository. Every push to `main` triggers a build on Node 22 (pinned by `.node-version`) that publishes `dist/`. The strict typecheck runs as part of `npm run build`, so a deploy cannot ship on type errors. The setup record and original runbook live in [docs/DEPLOY.md](docs/DEPLOY.md).

## The archive is ephemeral

Survived drafts live only in your browser's localStorage, under a single key, `the-disappearing-draft:archive`. Nothing leaves the browser: no server, no sync, no telemetry.

**Clearing your browser data deletes the archive permanently.** There is no cloud copy and no recovery. Copy and download are the backup story: every archived entry has its own copy button and `.txt` download, so if a draft matters, take it out of the browser.

A second, tiny key, `the-disappearing-draft:last-config`, remembers only your last duration and difficulty, so the deleted board's RE-ARM restarts on them. It never holds draft text. A corrupted archive payload is quarantined rather than silently destroyed, but the practical recovery is still an archive that starts empty.

None of this is hidden. No fabricated safety nets is a product principle, and the in-session threat is stricter still: a deleted draft is never written to storage at all.

## Accessibility

The core mechanic is time-pressured deletion, which is inherently hostile to some users. The threat cannot be paused, and a screen-reader or motor-impaired writer may lose a draft to the clock through no fault of their own. What ships:

- Fade start, deletion, and disarm are announced through aria-live regions. The countdown is a `role="timer"` region with milestone alerts.
- With `prefers-reduced-motion: reduce`, the animated fade and split-flap motion become a static warning banner plus a numeric inactivity countdown. Warnings are never encoded in opacity or color alone.
- Every rendered text and indicator pair is machine-checked against WCAG thresholds from the design tokens, as part of the test suite (`src/styles/contrast.test.ts`).
- GENTLE, with its 10s fade and 30s delete, exists partly as an accommodation: a slower clock to train against.

The exclusion is not eliminated and cannot be. Some writers will lose drafts to the clock, and no configuration of this product prevents that while it remains what it is.

## Verifying the timing yourself

The automated suite proves the engine's invariants with fake clocks: exact fade and delete boundaries, hidden-tab reconciliation, single-beat deletion, undo resistance at the DOM level, and storage silence on reload mid-session. Real browser schedulers and native undo engines still need a human. [docs/manual-verification-protocol.md](docs/manual-verification-protocol.md) has four step-by-step protocols with per-browser PASS/FAIL tables for exactly that.

## Fonts and licenses

The bundle self-hosts four open-licensed typefaces, with license texts shipped alongside in `dist/font-licenses/`:

- [B612 Mono](https://github.com/polarsys/b612) and [Michroma](https://github.com/googlefonts/michroma-font), SIL Open Font License 1.1
- [Source Sans 3](https://github.com/adobe-fonts/source-sans), SIL Open Font License 1.1. The bundled subset is renamed to "Countdown Room Prose" in its name records per OFL §1, with the copyright notice retained.
- [DSEG14 Classic](https://www.keshikan.net/fonts-e.html), DSEG Free License: free for personal and commercial use, though the license text itself may not be redistributed.

No fonts are fetched at runtime; everything ships in `dist/assets/`.

## Project layout

```
src/engine/    pure timing state machine, inactivity controller, permanence guard
src/data/      localStorage archive module
src/ui/        phase router, setup console, write surface, outcome boards, archive binder
src/styles/    tokens, the shared plate layer, per-surface CSS
src/assets/    self-hosted fonts + licenses
tests/         smoke test
docs/          manual verification protocol, run records (docs/ultron/)
```
