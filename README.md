# The Disappearing Draft

A minimalist web text editor that breaks writer's block by making stopping costlier than continuing. You arm a guarded countdown — choose a session duration and a difficulty preset — and then you write under threat: stop typing and, after the preset idle delay, the draft begins to pale under an amber hairline band; idle past the second threshold and the entire draft is permanently deleted, with no undo, no recycle bin, and no pause, even if you look away from the tab. Keep moving until the clock reaches 0:00 and the threat disarms: the draft lands in a local flight log, where you can read, copy, or download it. The room is styled as a mission-control countdown console — split-flap boards, range-safety lamps, tabular numerals — because the threat is believed only because it is real.

Presets: **GENTLE** fades at 10s idle / deletes at 30s · **STANDARD** 5s / 10s · **BRUTAL** 3s / 6s. Session durations: 3 / 5 / 10 / 15-minute presets or any custom length from 1 to 120 minutes.

## Running it

Requires Node and npm (built and tested on Node 24 / npm 11) and a modern evergreen browser.

```bash
npm install     # once
npm run dev     # development server
npm test        # full suite (218 tests: timing, controller, permanence, router, surfaces, a11y, contrast)
npm run build   # strict typecheck + production build into dist/
npm run preview # serve the built dist/ bundle locally
```

The production build is a fully static bundle — `dist/index.html` plus hashed assets — deployable to any static host. Everything the app does happens in your browser; there is no backend, no account, and no network calls at runtime (fonts are self-hosted; no third-party requests).

## Deployment

Hosted at **[draft.graydonwasil.com](https://draft.graydonwasil.com)** via Cloudflare Pages connected to this GitHub repository.

- **Push to `main` deploys automatically**: Cloudflare Pages runs `npm install && npm run build` on Node 22 (pinned by `.node-version`) and publishes `dist/`. The strict typecheck gate is part of `npm run build`, so a deploy cannot ship on type errors.
- Setup record and the original runbook live in [docs/DEPLOY.md](docs/DEPLOY.md).

## The archive is ephemeral — read this

- Survived drafts live **only in your browser's localStorage**, under a single key (`the-disappearing-draft:archive`). Nothing leaves the browser: no server, no sync, no telemetry.
- A second, tiny localStorage key (`the-disappearing-draft:last-config`) remembers only your last session configuration — duration and difficulty, so the deleted board's RE-ARM restarts on it. It is not user content: no draft text is ever stored there, and clearing it only resets that recalled calibration (you just pick settings again).
- **Clearing your browser data (site data, cookies-and-storage sweeps, storage-partition resets, some private-mode closures) deletes the archive permanently.** There is no cloud copy and no recovery.
- **Copy or download is the backup story.** Every archived entry has per-entry copy and `.txt` download; if a draft matters, take it out of the browser.
- A corrupted or unreadable archive payload is quarantined, not silently destroyed — but the practical recovery is still "the archive starts empty."

This ephemerality is stated, not hidden: it is the product's own principle that no fabricated safety nets exist. The deletion threat inside a session is even stricter — a deleted draft is never written to storage at all.

## Accessibility — what is mitigated, and the residual risk we accept

The core mechanic is time-pressured deletion, which is inherently hostile to some users: the threat cannot be paused, and a screen-reader or motor-impaired writer may lose a draft to the clock through no fault of their own. Mitigations shipped:

- **Live announcements** — fade start (polite), deletion (assertive), and disarm (polite) are announced via aria-live regions; the countdown is a `role="timer"` region with milestone alerts.
- **Reduced motion** — with `prefers-reduced-motion: reduce`, the animated fade and split-flap motion are replaced by a static warning banner plus a numeric inactivity countdown; warnings are never encoded in opacity or color alone.
- **Contrast** — every rendered text/indicator pair is machine-checked against WCAG thresholds from the design tokens; the computed table runs as part of the test suite (`src/styles/contrast.test.ts`).
- **GENTLE preset** — fade 10s / delete 30s — exists partly as an accommodation, a slower clock to train against.

We do not and cannot eliminate the exclusion. This residual limitation is accepted by design, plainly stated: some writers will lose drafts to the clock, and no configuration of this product can fully prevent that while the product remains what it is.

## Verifying the timing promises yourself

The engine's invariants (exact fade/delete boundaries, hidden-tab reconciliation, single-beat deletion, undo-resistance at the DOM level, reload-mid-session storage silence) are proven by the automated suite with fake clocks — but real browser schedulers and native undo engines can only be exercised by a human. **[docs/manual-verification-protocol.md](docs/manual-verification-protocol.md)** contains four step-by-step protocols (hidden-tab overstay per browser/OS, foreground ±100ms tolerance, per-platform native-undo attempts, reload no-write) with per-browser PASS/FAIL tables for exactly that purpose.

## Fonts and licenses

The bundle self-hosts four open-licensed typefaces, with license texts shipped alongside in `dist/font-licenses/`:

- [B612 Mono](https://github.com/polarsys/b612) and [Michroma](https://github.com/googlefonts/michroma-font) — SIL Open Font License 1.1 (OFL.txt)
- [Source Sans 3](https://github.com/adobe-fonts/source-sans) — SIL Open Font License 1.1; the bundled subset is renamed to "Countdown Room Prose" in its name records per OFL §1, with copyright notice retained
- [DSEG14 Classic](https://www.keshikan.net/fonts-e.html) — the DSEG Free License (free for personal/commercial use, no redistribution of the license itself)

No runtime font fetching: everything ships in `dist/assets/`.

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
