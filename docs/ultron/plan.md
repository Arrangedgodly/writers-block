# Plan — The Disappearing Draft

Status: PENDING USER REVIEW. Inputs: docs/ultron/town-hall.md (approved scope), docs/ultron/design-brief.md (approved direction: The Countdown Room, code-led), PRODUCT.md.
Coordinator: ultron-supreme. From research onward, tasks are auto-approved as they verify; the task index below is the source of truth for status and dependencies.

## Planning decisions (settled here, within approved scope)

- Preset values: **GENTLE = fade 10s / delete 30s; STANDARD = fade 5s / delete 10s (concept anchor); BRUTAL = fade 3s / delete 6s.** (Values match the option text the user selected at scoping.)
- Duration input: presets **3 / 5 / 10 / 15 min** plus a **custom minutes field (1–120)**.
- Archive entry: `{ id, createdAt, endedAt, durationSec, preset, wordCount, title, excerpt, text }`; title = first ~6 words (word-boundary truncation), fallback "Untitled session"; excerpt = first 160 chars; list newest-first.
- Loop architecture: **pure timing functions (T2) + controller (T3)** consumed by UI; opacity computed per frame from wall-clock — never a CSS transition left to run unwatched (production-owned detail confirmed by R1/R2).

## Lanes and tasks

### Lane: DevOps / Tooling

**T1 — Scaffold the workspace.** Role: DevOps. Outcome: green build+test skeleton.
Scope: Vite + TypeScript (strict) + Vitest; `index.html` shell; empty app mount; scripts `dev/build/test/preview`; `.gitignore`. Journey: none (enabling).
Inputs: none → Output: runnable skeleton.
Deps: none. Parallel: nothing until green.
Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest` config, `index.html`, `src/main.ts`.
Acceptance: `npm run build` succeeds; `npm run test` passes a placeholder test; `npm run dev` serves the shell.
Risks: none material. Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).

**T14 — Deliverable check.** Role: DevOps. Outcome: shippable static bundle + honest README.
Scope: production build clean (no console errors, sane bundle), works from a static server, README documents ephemerality (localStorage, browser-data loss), local-only privacy, how to run. Journey: all.
Deps: T9, T10, T11, T12, T13.
Files: `README.md`, build outputs.
Acceptance: `npm run build && npm run preview` serves a working app; README covers ephemerality honestly.
Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md — final production verification, PASS).

### Lane: Core Engine (frontend timing — the product's heart)

**T2 — Pure timing state machine.** Role: Core Engine. Outcome: headless, fully-tested math.
Scope: pure functions of `(now, lastInputAt, fadeDelayMs, deleteThresholdMs, sessionEndAt)` → `{ phase: pre-arm|armed|fading|deleted|survived, opacity: 0..1, remainingMs }`; preset table (values above); duration constraints. Journey: write→outcomes.
Inputs: preset values decision → Output: `src/engine/timing.ts`.
Deps: T1. Parallel: T6.
Acceptance (validation: `npm run test`): fake-clock unit tests cover exact fade start, exact delete boundary, input reset, disarm-at-zero precedence over deletion, monotonic opacity decay, remaining-time math; property test: opacity never negative/>1, no state skip.
Risks: none. Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).

**T3 — Inactivity controller.** Role: Core Engine. Outcome: the live loop that never drifts.
Scope: consumes text-changing input events (`beforeinput`/`input` incl. paste, IME composition, autocorrect; navigation/clicks excluded), wall-clock loop (rAF in foreground; immediate reconciliation on `visibilitychange`/`focus`), emits state transitions; zero accumulated ticks; session end disarm. Journey: write.
Inputs: T2, R1 → Output: `src/engine/controller.ts`.
Deps: T2 (R1 informs before completion). Parallel: T5 after.
Files: `src/engine/controller.ts` + tests.
Acceptance: mocked-event/timer tests — input resets both triggers instantly; hidden-tab overshoot past delete threshold applies deletion on visibility return; blur keeps running; slow/janky frames cause no drift; disarm at 0:00 stops all threat transitions.
Risks: browser-specific throttling edge cases (R1). Size: medium. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).
Research-locked (R1, committed 2026-08-28): plural-event, phase-checked `reconcile()` — `visibilitychange` + `focus` + `pageshow` (+ boundary `setTimeout` fallback) all invoke ONE idempotent recompute `derivePhase(Date.now(), lastInputAt, …)`; emit transitions only on phase change (`deleted` terminal → deletion exactly once); rAF is the foreground tick only; all wall-clock anchors are `Date.now()`, never `performance.now()` deltas (Chrome can freeze performance.now during page freeze). Evidence: `docs/ultron/research/R1-hidden-tab-throttling.md`.

**T4 — Permanence guard.** Role: Core Engine. Outcome: deletion that is truly unrecoverable.
Scope: on deletion — clear text from memory, never write storage, defeat native undo resurrection (editor node replacement strategy per R3), teardown controller. Journey: deleted.
Inputs: T3, R3 → Output: `src/engine/permanence.ts` (or folded into controller with tests).
Deps: T3. Parallel: T6.
Acceptance: tests assert — no storage write on deletion path; textarea value cleared; editor element replaced so Ctrl+Z cannot resurrect; memory references dropped.
Risks: undo behavior differs per browser (R3 verifies). Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).
Research-locked (R3, committed 2026-08-28): deletion sequence = blur → `value=''` → `defaultValue=''` (scrubs child text nodes, closing the form.reset()/dirty-flag vector) → replace/detach the editor node → drop references, PLUS a deleted-phase capture listener `preventDefault()`ing `beforeinput` `historyUndo`/`historyRedo`; node replacement is the load-bearing layer (Safari preserves native undo across programmatic value sets — WebKit r87204; Chrome/Firefox wipe); never wrap the editor in a `<form>`; jsdom asserts the strategy, physical undo is T13's. Evidence: `docs/ultron/research/R3-undo-defeat.md`.

### Lane: Data

**T6 — Archive module.** Role: Data. Outcome: durable local archive with metadata.
Scope: localStorage persistence (key, versioned schema, corrupt-JSON fallback to empty), save/list/delete-entry/clear-all, metadata derivation (title/excerpt/wordCount per planning decision), newest-first, quota-error surfacing. Journey: archive, survive.
Inputs: metadata decision → Output: `src/data/archive.ts`.
Deps: T1. Parallel: T2, T3.
Acceptance: unit tests — empty archive, save+list order, corrupt storage, delete/clear, quota failure path; word-count matches trim-split semantics.
Risks: none material. Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).

### Lane: UI (the Countdown Room)

**T5 — Session phase router.** Role: UI. Outcome: one console, five phases, wired to the engine.
Scope: setup → write → deleted | wind-down → archive as states of one console; placeholder styling; wire controller transitions. Journey: the whole loop.
Inputs: T3 → Output: `src/ui/router.ts` + minimal screens.
Deps: T3. Parallel: T6, T7.
Acceptance: fake-clock-driven walkthrough in dev (config→write→survive→wind-down→Done→archive visible; and deletion→RE-ARM restarts) with unstyled DOM.
Risks: none. Size: medium. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).

**T7 — Setup console (function).** Role: UI. Outcome: fully operable configuration.
Scope: duration presets + custom minutes (1–120 validation), three difficulty placards with printed FADE/LOSS limits, ARM action, keyboard operability, invalid-state handling. Journey: setup.
Inputs: T2 preset table, T5 → Output: setup screen logic.
Deps: T5. Parallel: T8 prep.
Acceptance: unit/e2e — custom out-of-range blocked; presets selectable via keyboard; ARM starts session with chosen parameters.
Risks: none. Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).

**T8 — Direction contract + design tokens.** Role: UI. Outcome: the world's constitution, in the artifact.
Scope: write the direction contract comment (THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM + FINISH) as first child of body in `index.html` per new-work §5; token layer: palette (charcoal ground, bone luminous, phosphor green/amber/red lamp colors), type scale with tabular numerals, spacing/hairline rules, grain approach; faces from R4. Journey: all.
Inputs: design-brief.md, craft bar images, R4 → Output: `src/styles/tokens.css`, contract in `index.html`.
Deps: T5 (structure), R4. Parallel: T9 design.
Acceptance: contract present in built output (grep the seed key `da64ca22`); tokens reviewed against brief (lamp semantics locked; achromatic field).
Risks: faces licensing (R4 confirms open-license bundling). Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).
Research-locked (R4, committed 2026-08-28): typefaces are Michroma 400 (placard caps), B612 Mono 400/700 (avionics numerals; genuine Airbus/ENAC cockpit font, monospaced digits verified in binaries), Source Sans 3 VF 200–900 (prose; tabular-by-default digits); ~69 KB woff2 total, all OFL, self-hosted as unmodified woff2 + OFL.txt copies (no runtime Google Fonts fetch); optional DSEG14 Classic reserved for the reduced-motion / SIGNAL LOST instrument readout. Evidence: `docs/ultron/research/R4-typefaces.md`.

**T9 — Write surface, fully committed.** Role: UI. Outcome: the presiding countdown and dying text.
Scope: flap-digit countdown top-center (technique per R2), text column, amber hairline band + caution lamps on fade, rAF-driven opacity from engine output, damped mechanical motion, tabular numerals, grain, subtle glow as capability layer; **reduced-motion path**: no flap/glow/opacity animation — static amber banner + numeric inactivity countdown; aria-live fade announcement hook (content in T12). Journey: write.
Inputs: T3, T8, R2 → Output: write surface.
Deps: T8. Parallel: T10 after T6.
Acceptance: brief criteria 2, 3, 7 observable in browser; `prefers-reduced-motion: reduce` emulation shows banner+countdown, no animated fade; no layout shift while counting (tabular numerals).
Risks: flap animation cost (R2 benchmark). Size: medium. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).
Research-locked (R2+R3+R4, committed 2026-08-28): R2 — DOM split-flap with CSS 3D `rotateX` top/bottom flaps, transform-only transitions, per-digit fixed-width slots, `@supports not (transform-style: preserve-3d)` static per-digit swap fallback, a11y pairing (`role="timer"` + visually-hidden `aria-atomic` text per tick, flap glyphs `aria-hidden`, milestones via temporary `role="alert"`); R3 — expose a `destroy()`/fresh-instance seam (RE-ARM always mounts a new surface) and never place the editor inside a `<form>`; R4 — countdown/timing readouts in B612 Mono, prose in Source Sans 3. Evidence: `docs/ultron/research/R2-splitflap-technique.md`, `R3-undo-defeat.md`, `R4-typefaces.md`.

**T10 — Deleted beat + wind-down board.** Role: UI. Outcome: both outcomes, deliberate and distinct.
Scope: deletion moment — single red beat, `SIGNAL LOST` board, empty console, RE-ARM instantly focused; wind-down — DOWN SAFE board, text editable, running time right-aligned, Done writes/finalizes archive (entry written at disarm; Done updates it). Journey: deleted, survive→archive.
Inputs: T4, T6, T9 → Output: outcome screens.
Deps: T9, T6, T4.
Acceptance: deletion renders in one deliberate sequence (no flash-of-content bug); wind-down edits persist via Done; closing without Done leaves the 0:00 version in archive (verified by test).
Risks: none. Size: medium. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).
Research-locked (R3+R4, committed 2026-08-28): R3 — RE-ARM mounts a FRESH surface instance over the detached editor and focuses it immediately (permanence sequencing: no editable undo target survives deletion); R4 — SIGNAL LOST board may use the optional DSEG14 Classic instrument readout (condition-gated; never for the animated flap countdown). Evidence: `docs/ultron/research/R3-undo-defeat.md`, `R4-typefaces.md`.

**T11 — Archive view (flight-log binder).** Role: UI. Outcome: the payoff, safe and legible.
Scope: newest-first list (timestamp + excerpt + running time), view entry, copy, download `.txt`, delete entry, clear all with confirm; honest empty state; **textContent-only rendering** of any user-derived string. Journey: archive.
Inputs: T6, T8 → Output: archive screen.
Deps: T6, T8. Parallel: T10.
Acceptance: brief criterion 1; hostile-entry test (title/excerpt containing HTML/script renders inert); copy/download verified; clear-all requires confirmation.
Risks: none. Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md).

### Lane: QA / Accessibility

**T12 — Accessibility pass.** Role: A11y. Outcome: mitigations real, not nominal.
Scope: aria-live announcements (fade start, deletion, disarm), focus management (RE-ARM focused on deletion; Done focused on disarm), keyboard-only walkthrough, lamp/ground contrast verification, VoiceOver smoke test, reduced-motion parity re-check. Journey: all.
Inputs: T9–T11 → Output: fixes across UI files.
Deps: T9, T10, T11.
Acceptance: brief criterion 7 + Product a11y section verified; keyboard-only full loop possible; announced transitions heard in VoiceOver.
Risks: residual accepted risk documented (not eliminable). Size: medium. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md — jsdom/axe/computed-contrast evidence plus a recorded manual VoiceOver protocol for the spoken half, which cannot be verified headlessly).

**T13 — Timing hardening verification.** Role: QA. Outcome: the core promise, proven.
Scope: full fake-clock suite green; manual protocol for hidden-tab overstay (switch away past threshold → return to deleted state); foreground tolerance spot-check vs configured values (~100ms); reload/exit mid-session leaves no storage write and shows session-over. Journey: write→outcomes.
Inputs: T4, T10, R1 → Output: test evidence + any fixes.
Deps: T4, T10.
Acceptance: brief criteria 4, 5, 6, 8; protocol results recorded in production-log.
Risks: browser variance (R1 resolves). Size: small. Status: completed (verified + auto-approved, ultron-supreme, 2026-08-28; evidence: docs/ultron/production-log.md — fake-clock audit 185/185 incl. six new boundary/tie/return-path gap tests and two reload-no-write tests, zero production code changed, dist byte-identical; docs/manual-verification-protocol.md Protocols A–D remain a user follow-up, results table to be copied into the production-log entry).
Research-locked (R1+R3, committed 2026-08-28): R1 — manual hidden-tab protocol spans visibility return, long-hide intensive throttling (>5 min), Safari minimized suspension, bfcache `pageshow.persisted`, occluded window, Chrome freeze/discard reload, Firefox-Android unload; verify single (never double) delete beat; R3 — manual per-browser undo-attempt protocol (jsdom cannot run native undo): Cmd/Ctrl+Z, Edit-menu Undo, iOS shake-to-undo, Android long-press toolbar in Chrome/Firefox/Safari — none restores text; results recorded in production-log. Evidence: `docs/ultron/research/R1-hidden-tab-throttling.md`, `R3-undo-defeat.md`.

## Dependency-ordered task index

| # | Task | Role | Deps | Size | Status |
|---|------|------|------|------|--------|
| 1 | T1 Scaffold | DevOps | — | S | completed |
| 2 | T2 Pure timing state machine | Core Engine | T1 | S | completed |
| 3 | T6 Archive module | Data | T1 | S | completed |
| 4 | T3 Inactivity controller | Core Engine | T2 + R1 | M | completed |
| 5 | T5 Session phase router | UI | T3 | M | completed |
| 6 | T4 Permanence guard | Core Engine | T3 + R3 | S | completed |
| 7 | T7 Setup console (function) | UI | T5 | S | completed |
| 8 | T8 Direction contract + tokens | UI | T5 + R4 | S | completed |
| 9 | T11 Archive view | UI | T6 + T8 | S | completed |
| 10 | T9 Write surface, committed | UI | T8 + R2 | M | completed |
| 11 | T10 Deleted beat + wind-down | UI | T9 + T6 + T4 | M | completed |
| 12 | T12 Accessibility pass | A11y | T9–T11 | M | completed |
| 13 | T13 Timing hardening verification | QA | T4 + T10 + R1 | S | completed |
| 14 | T14 Deliverable check | DevOps | T9–T13 | S | completed |

Critical path: T1 → T2 → T3 → T5 → T8 → T9 → T10 → T13 → T14. First parallel batch after T1: T2 + T6.

## Milestones

- **M0 — Scaffold green:** T1. Build+test pipeline proven.
- **M1 — Engine proven headless:** T2, T3, T4 (R1, R3 in). The product's promise verified in fake-clock tests before any styling exists.
- **M2 — Naked loop:** T5, T7 (+T6). Full user loop works unstyled; mistaken assumptions about state flow surface here.
- **M3 — The world lands:** T8, T9, T10, T11 (R2, R4 in). Countdown Room committed across all five phases.
- **M4 — Hardened deliverable:** T12, T13, T14. A11y, timing proof, shippable static bundle.

## Research queue (→ $deep-research-supreme)

- **R1 (informs T3, T13) — COMMITTED, auto-approved (ultron-supreme), 2026-08-28.** Disposition: plural-event, phase-checked `reconcile()` — `visibilitychange` + `focus` + `pageshow` (+ boundary `setTimeout` fallback) all funnel into ONE idempotent recompute `derivePhase(Date.now(), lastInputAt, …)`; transitions emitted only on phase change; `deleted` is terminal (double-fires structurally impossible); rAF is foreground tick only; anchor wall-clock on `Date.now()` NOT `performance.now()` (Chrome can freeze performance.now during page freeze). Evidence: `docs/ultron/research/R1-hidden-tab-throttling.md`.
- **R2 (informs T9) — COMMITTED, auto-approved (ultron-supreme), 2026-08-28.** Disposition: DOM split-flap with CSS 3D `rotateX` top/bottom flaps — transform-only transitions, per-digit fixed-width slots, `@supports not (transform-style: preserve-3d)` fallback to static per-digit swap; accessibility pairing: `role="timer"` + visually-hidden `aria-atomic` text per tick, flap glyphs `aria-hidden`, milestone announcements via temporary `role="alert"`. Evidence: `docs/ultron/research/R2-splitflap-technique.md`.
- **R3 (informs T4, T9, T10, T13) — COMMITTED, auto-approved (ultron-supreme), 2026-08-28.** Disposition: deletion sequence = blur → `value=''` → `defaultValue=''` → replace/detach the editor node → drop references, PLUS a deleted-phase capture listener `preventDefault()`ing `beforeinput` `historyUndo`/`historyRedo`; node replacement is the load-bearing layer (Safari preserves native undo across programmatic value sets — WebKit r87204; Chrome/Firefox wipe). Evidence: `docs/ultron/research/R3-undo-defeat.md`.
- **R4 (informs T8, T9; secondary T10, T11) — COMMITTED, auto-approved (ultron-supreme), 2026-08-28.** Disposition: Michroma 400 (placard caps), B612 Mono 400/700 (avionics numerals; genuine Airbus/ENAC cockpit font, monospaced digits verified in binaries), Source Sans 3 VF 200–900 (prose; tabular-by-default digits); ~69 KB woff2 total, all OFL; optional DSEG14 Classic for reduced-motion / SIGNAL LOST instrument readout. Evidence: `docs/ultron/research/R4-typefaces.md`.

## Handoff

- **Build order:** milestone order above; engine lane and data lane run parallel after scaffold; UI world lands as one committed pass (T8→T11) rather than incremental restyling.
- **Fixed by scope (not open):** vanilla TS+Vite, localStorage-only, wall-clock blur policy, true permanence, text-changing-input definition, graceful wind-down with disarm-time archive write, time-only HUD, preset semantics, a11y mitigations, textContent-only rendering, The Countdown Room world, code-led path.
- **Delegated to research:** R1–R4 are COMMITTED (auto-approved ultron-supreme, 2026-08-28); dispositions recorded in `docs/ultron/research/` (R1-hidden-tab-throttling.md, R2-splitflap-technique.md, R3-undo-defeat.md, R4-typefaces.md) and folded back into dependent tasks as Research-locked lines (T3, T4, T8, T9, T10, T13).
- **Assumptions that would return to Town Hall if changed:** preset values feel right in real use; localStorage suffices (no sync demand); single-user single-device; static hosting acceptable; no draft-continuation demand.
- **Approval needed before research begins:** this plan (one user review). After approval, ultron-supreme self-approves research dispositions and every verified task.
- **Beyond this plan:** finishing phase (ultron-impeccable auto mode) owns the design-detector pass, finish review against the direction contract + craft bar, and DESIGN.md documentation from the built world.
