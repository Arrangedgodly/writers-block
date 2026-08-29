# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vanilla TypeScript + Vite; static deliverable, no backend, no framework (user-confirmed at scoping, 2026-08-28).

## Users

Writers who draft — fiction writers, essayists, students, bloggers, technical writers — who recognize perfectionism-as-paralysis in themselves and want to be forced past it. Secondary: people who enjoy constrained/competitive writing tools.

## Product Purpose

The Disappearing Draft is a minimalist web text editor that breaks writer's block by making stopping costlier than continuing. The user sets a session duration and a difficulty preset, then writes under threat: after a preset idle delay the text begins to fade; past a second threshold the entire draft is permanently deleted. Surviving until 0:00 disarms the threat and archives the draft locally. Success = a session that ends with words that exist — or a fast, shame-free restart after deletion.

## Positioning

The deletion threat is real and unrescuable: no undo, no recycle bin, no pause, and the clock keeps wall-clock running when the tab is hidden. Neighboring "focus writer" tools gate distraction; this one punishes stopping. The archive of survived drafts is the payoff that makes the pressure meaningful.

## Operating Context

Single-user, single-browser, local-only. Sessions are self-contained rituals: choose duration (presets + custom minutes) and difficulty (Gentle / Standard / Brutal — Standard: fade begins at 5s idle, delete at 10s), write, then either wind-down-and-archive or instantly restart after deletion. Archive lives in localStorage; copy/download is the backup story; clearing browser data loses it (documented honestly).

## Capabilities and Constraints

Confirmed functionality (MVP, scoping brief 2026-08-28):
- Setup: duration + difficulty preset selection.
- Writing surface with remaining-time HUD only; no live stats during the session.
- Inactivity engine: wall-clock timestamp math (no accumulated ticks — background-tab timer throttling defeated by design); fade begins at fade-delay, opacity decays with elapsed time; any text-changing input (keystrokes, paste, IME composition, autocorrect) instantly restores opacity and resets both triggers; navigation/clicks do not.
- At delete-threshold: draft truly permanently deleted (never written to storage, no undo resurrection); Deleted state offers instant restart.
- Blur/hidden-tab: clock keeps running; state reconciled on visibilitychange/focus.
- At 0:00: threat disarms, draft auto-archived, graceful editable wind-down; "Done" finalizes; closing early keeps the 0:00 version.
- Archive: newest-first list (timestamp + excerpt), view/copy/download/delete, clear all — localStorage only.
- Session-over screen: duration, word count (post-session only), copy/download.

Constraints: static hosting only; modern evergreen browsers; localStorage ≈5MB; no accounts/sync/server.
Non-goals: any post-deletion recovery; pause/resume; rich text or markdown preview; live session stats; continuing archived drafts into new sessions; native mobile apps.
Terminology: preset names Gentle/Standard/Brutal are binding.

Open product facts: exact Gentle/Brutal timings (planning-owned; Standard anchored at 5s/10s); session-duration input shape (planning-owned); archive entry metadata (planning-owned).

## Brand Commitments

Working product name: "The Disappearing Draft" (user's original title; to be confirmed as binding at the design touchpoint). Tagline concept: Writer's Block Breaker. No logo, voice, or identity assets exist yet.

## Evidence on Hand

None. No real drafts, testimonials, usage data, or imagery exist. Future work must not fabricate any (no invented quotes, fake user counts, or sample "survived drafts" presented as real user content).

## Product Principles

1. The threat is the product — never soften the core loop (running clock, true permanence) to make users comfortable.
2. Pressure is calibrated, not maximized — presets let each writer train at the edge of their anxiety.
3. Nothing between the writer and words — the session surface holds text and a clock; everything else waits.
4. Mercy only after the mechanism ends — wind-down and archive exist outside the pressure window, never inside it.
5. Local and honest — no accounts, no sync, no fabricated safety nets; ephemerality is stated, not hidden.

## Accessibility & Inclusion

Core mechanic is time-pressured deletion — inherently hostile to some users; mitigations (not elimination) are confirmed MVP scope: aria-live announcements for fade/deletion states, prefers-reduced-motion path (static warning banner + numeric countdown replacing the animated fade), warning never encoded in opacity/color alone. Residual risk accepted and documented in the scoping brief.
