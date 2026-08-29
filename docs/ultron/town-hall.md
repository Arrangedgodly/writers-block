# Town Hall — The Disappearing Draft (Writer's Block Breaker)

Status: APPROVED — 2026-08-28. All five clusters signed off individually; final gate approved by the user.

## Problem statement & target users

Drafting stalls because writers edit while they create. Overthinking kills momentum: the blank page plus the delete key plus infinite time equals paralysis. The Disappearing Draft imposes artificial urgency — a session timer plus the threat of the text literally evaporating — so the only rational strategy is to keep writing forward.

Target users: anyone who drafts — fiction writers, essayists, students, bloggers, technical writers — who recognizes perfectionism-as-paralysis in themselves. Secondary: anyone who enjoys constrained/competitive writing tools.

Desired outcome: a dead-simple web app a person can open, set a duration and difficulty, and write under pressure — ending either with a saved draft they kept alive, or a deleted draft and a reason to start again immediately.

## User-confirmed decisions (intake + round 1)

1. Survived drafts go to an in-browser local archive (localStorage) with copy/download. No accounts, no server.
2. Difficulty presets are MVP (gentle/standard/brutal), not one fixed timing.
3. Stack: vanilla TypeScript + Vite; static deliverable; no backend.
4. During-session HUD: remaining time only. No live word count while writing.
5. Tab-blur policy: the fade/delete clock keeps running on wall-clock time when the tab is hidden or unfocused. No pause exists.
6. Deletion is truly permanent: no undo, no recycle bin, no rescue path of any kind.
7. "Typing" = any text-changing input (keystrokes, paste, IME composition, autocorrect). Navigation/clicks/scrolling do not reset the triggers.
8. At 0:00: graceful wind-down — pressure mechanisms disarm, the user may keep typing, and the draft is saved. (Save semantics for sign-off: auto-archive at 0:00; wind-down edits refine the archived entry; closing without finishing still leaves the 0:00 version saved.)

## Role Perspectives

### Product / User Value
- Supports: converts anxiety into momentum; the deletion threat makes stopping costlier than continuing. Archive + presets turn raw punishment into a calibratable practice tool.
- Strongest concern: one traumatic deletion (500 words gone to a 10-second pause) may teach avoidance instead of flow — the user never returns.
- Exposed cost/risk/opportunity: presets are the pressure valve; the "deleted" state must funnel instantly into "start again" so failure feels like a round, not a funeral.
- Smallest experiment: after first real use, does the user start a second session after a deletion?

### UX / UI
- Supports: minimalist canvas matches the philosophy; fade is visceral, legible feedback; countdown-only HUD keeps eyes on words.
- Strongest concern: the fade→delete arc must read unmistakably as a warning (dying text) without inducing panic-typing garbage; the deletion moment and the session-over moment need distinct, deliberate treatments (Design phase).
- Exposed: opacity animation curve and the deletion moment are brand-defining details, not decoration.
- Smallest experiment: prototype fade curve (linear vs. accelerating) against real typing.

### Frontend
- Supports: vanilla TS + Vite gives direct control of the timing loop the product IS; single surface, no router complexity.
- Strongest concern: browser timer throttling — hidden tabs throttle setTimeout/setInterval (down to ~1/min) and pause requestAnimationFrame; naive timers misfire. Precision must come from wall-clock timestamps (performance.now / Date.now deltas), with visibilitychange handling, not accumulated ticks.
- Exposed: textarea vs contenteditable — textarea recommended (IME/selection/undo robustness); user text must never be injected as HTML.
- Smallest experiment: hidden-tab timing behavior test early in production.

### Backend / Data / Integrations
- Supports: none needed; localStorage archive is sufficient for text at this scale (≈5MB ≈ millions of words).
- Strongest concern: browser-data clearing loses the archive silently.
- Exposed: copy + download from the archive is the backup story; ephemerality documented honestly.
- Smallest experiment: none needed.

### Quality / Reliability
- Supports: behavior is a small deterministic state machine (setup → armed → fading → deleted | survived-winddown) — unit-testable with fake clocks; wall-clock math is pure functions.
- Strongest concern: "permanently deleted" must be engineered as true (no undo resurrection, never written to storage) while survived drafts are durable; the two paths must never be confusable.
- Exposed: timer precision and reset-on-input are the acceptance core — they need tests, not vibes.
- Smallest experiment: fake-clock unit tests of the state machine before UI polish.

### Security / Privacy
- Supports: fully local; nothing transmitted; no accounts; archive holds only what the user saved.
- Strongest concern: rendering user text must use textContent (never innerHTML) — the app must not become an XSS sink into its own archive view; shared-computer exposure of the archive needs a clear-all control.
- Smallest experiment: none; a code-review invariant.

### Accessibility
- Supports: keyboard-first by nature; large legible typography; Gentle preset is itself an accommodation.
- Strongest concern: a time-pressured deletion mechanic is inherently hostile to some users — the fade is invisible to screen readers and time pressure punishes motor disabilities. Mitigations, not elimination: aria-live announcements for fade/delete states, prefers-reduced-motion path (static warning banner + numeric countdown instead of animated fade), warning never encoded in opacity/color alone.
- Exposed: accepted residual risk — the core mechanic cannot be made fully accessible; we mitigate and document.
- Smallest experiment: VoiceOver pass during production.

## Proposed MVP (for sign-off)

Must-have:
1. Session setup: duration selection (presets + custom minutes) and difficulty preset — Gentle / Standard / Brutal. Exact timings planning-owned, anchored to Standard = 5s fade-start / 10s delete per the original concept.
2. Writing surface: minimalist editor, remaining-time HUD only.
3. Inactivity engine (the core): wall-clock timestamp math; no accumulated ticks. Fade begins at fade-delay (opacity decays with elapsed time); at delete-threshold the draft is destroyed. Any text-changing input instantly restores full opacity and resets both triggers.
4. Blur policy: clock keeps running when tab hidden/unfocused; state reconciled via wall-clock on visibilitychange/focus.
5. Deletion: truly permanent; the "deleted" state offers an immediate "start again" affordance.
6. Timer zero: threat disarms; draft auto-archived at 0:00; graceful wind-down — text stays editable; "Done" finalizes the archive entry; closing without Done keeps the 0:00 version.
7. Archive: newest-first list (timestamp + excerpt), view / copy / download / delete individual entries, clear all. localStorage only.
8. Session-over screen: duration, word count (post-session only), copy/download.
9. Accessibility mitigations: aria-live fade/delete announcements; prefers-reduced-motion static warning + numeric countdown; warning never encoded in opacity alone.
10. Security invariant: user text rendered via textContent only.

Explicit non-goals (MVP):
- Accounts, cloud sync, sharing, any server component.
- Any recovery path after deletion (no undo, no recycle bin).
- Pause/resume of a session (no pause exists; blur keeps running).
- Rich text, markdown preview, formatting.
- Live stats during the session.
- Continuing/branching an archived draft into a new session (archive is read-only reference).
- Native mobile apps (responsive web is fine).

Reload/exit mid-session = draft lost, treated identically to deletion (no archive write, session over). This is the honest consequence of decisions 5 and 6.

## Primary journeys & states

Journey A — the loop: Setup (choose duration + preset) → Write (armed; fade/delete triggers live; HUD counts down) → outcome:
- Survive → 0:00 disarms threat, auto-archive, Wind-down (editable; Done finalizes; shows duration + word count + copy/download) → Archive.
- Deleted → text destroyed → Deleted screen (acknowledge what happened, instant "start again" → Setup).
- Abandon (close/reload mid-session) → nothing saved.

Journey B — the archive: open archive → read an old draft → copy or download → (optional) delete / clear all.

Important states: setup; armed (typing, full opacity); fading (opacity ∝ elapsed-since-last-input, within [fade-delay, delete-threshold]); deleted; wind-down; archive view.

## Success measures & acceptance criteria

1. Full loop: configure → write → survive → the draft appears in the archive; copy and download work.
2. Stopping typing produces a visible fade beginning at the configured fade-delay; opacity decays smoothly until input or deletion.
3. Any text-changing input at any pre-deletion moment instantly restores full opacity and resets both triggers.
4. At delete-threshold the draft is irrecoverably gone — not in localStorage, not resurrectable via undo (verified in tests).
5. Wall-clock correctness: hidden-tab overstay past delete-threshold yields the deleted state when visibility returns; foreground timing within ~100ms tolerance of configured values (frame-level precision at 5–10s scale is ample headroom).
6. At 0:00 the threat disarms; the draft is present in the archive; wind-down editing works; Done finalizes.
7. Reduced-motion users get a static warning with numeric countdown; screen readers hear fade/deletion announcements.
8. The timing state machine passes fake-clock unit tests (fade math, reset math, delete boundary, disarm-at-zero, hidden-tab reconciliation).
9. No user text is ever injected as HTML (invariant test/review).

## Constraints, assumptions, dependencies, risks

- Constraints: static hosting only; modern evergreen browsers; localStorage (~5MB); no backend.
- Assumptions: single user, single device, ephemerality accepted by design.
- Dependencies: none beyond the toolchain (Vite/TS).
- Risks: hidden-tab timer throttling (mitigated: wall-clock + visibilitychange); traumatic-deletion churn (mitigated: presets, instant restart); archive loss on browser-data clearing (mitigated: copy/download, honest docs); fade invisible to assistive tech (mitigated: aria-live; residual accepted); JS event-loop jitter (accepted: ~16ms frames vs 5–10s scale).

## Open questions & dispositions

1. Exact preset timings (Gentle/Brutal values; Standard = 5s/10s anchor) → **planning**, non-blocking.
2. Fade curve (linear vs accelerating) and deletion-moment visual treatment → **Design phase ($impeccable)**, non-blocking.
3. Session-duration input shape (presets only vs +custom) → **planning**, non-blocking (recommend presets + custom minutes).
4. Archive entry metadata (title derivation, excerpt length) → **planning**, non-blocking.
5. textarea vs contenteditable → **production**, non-blocking (textarea recommended).
6. Opacity driven by rAF-computed values vs CSS transition toggled by JS → **production**, non-blocking (rAF-computed recommended for precision and reduced-motion parity).
7. Wind-down idle behavior → settled: no threat after 0:00.

## Challenger / Advocate (judgment clusters)

**MVP boundary & non-goals.**
Challenger: "Presets, wind-down, and an archive are scope creep on a tool whose power is singular cruelty. Every knob (Gentle mode) and every mercy (wind-down, auto-save) dilutes the threat that makes the product work. Ship one timing, hard-stop at 0:00, clipboard only — smaller, sharper, faster."
Advocate: "Writer's block is anxiety, and anxiety needs calibration, not maximal punishment. A first-time user who loses 400 words on the harshest setting never returns; presets make the threat trainable. Wind-down honors that thoughts don't obey timers — the threat did its job during the session; mercy after 0:00 doesn't negotiate with the mechanism, it ends it. The archive is the payoff that makes the suffering meaningful. The uncompromising core — clock-keeps-running and truly-permanent deletion — was preserved intact. The user's overrides stand."

**Success measures.**
Challenger: "Post-session word count violates minimalism; measurement invites the inner editor back."
Advocate: "The summary screen is the reward moment, after the threat has ended; during-session purity is preserved (decision 4). Keeping the payoff outside the pressure window is the right line."

## Cluster sign-offs

- Problem & users: SIGNED OFF 2026-08-28 (confirmed as written).
- MVP boundary & non-goals: SIGNED OFF 2026-08-28 (confirmed as written, with Challenger/Advocate debate recorded above).
- Journeys, states, success measures: SIGNED OFF 2026-08-28 (confirmed as written, incl. wind-down save semantics and close/reload = lost).
- Constraints/assumptions/risks: SIGNED OFF 2026-08-28 (confirmed as written).
- Open-question dispositions: SIGNED OFF 2026-08-28 (confirmed as written).
- Final gate: APPROVED 2026-08-28 — brief accepted as the scoping record; run proceeds to Design phase.

## Handoff note for plan-it-out

Vanilla TS + Vite static app; core is a wall-clock-driven inactivity state machine (setup → armed → fading → deleted | wind-down) with fake-clock unit tests; UI surfaces are setup / write / deleted / wind-down / archive. Design direction (fade curve, deletion moment, visual world) arrives from $impeccable before planning finalizes task order. Planning owns: exact preset timings (Standard = 5s/10s anchor), duration input shape, archive metadata. Production owns: textarea choice, rAF-vs-CSS opacity driving. No blockers.
