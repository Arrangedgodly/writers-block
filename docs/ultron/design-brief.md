# Shape Brief — The Disappearing Draft

Status: PENDING CONFIRMATION. Direction chosen 2026-08-28: **The Countdown Room** (concept-seed roll da64ca22, assigned index 7; both decision channels returned `assigned`; build path code-led — no image generation in this harness, ambition carried by the direction contract). Craft bar: `signals-instruments-night-flight-six-pack` board + hero, archived at `.impeccable/quality-bar/`.

## 1. Job and audience

A writer paralyzed by self-editing opens a tab, arms a timed session, and drafts under threat: stop typing and the text fades; stop long enough and it is permanently destroyed. Visitor mode: **Operate** — the task, the state, and familiar affordances outrank expression; the world lives in precise details.

## 2. Outcome and proof

The loop works and is felt: configure (duration + difficulty) → write with only a countdown visible → either survive to 0:00 (threat disarms, draft auto-archived, editable wind-down, Done finalizes) or lose the draft (instant RE-ARM, no recovery). Proof is the mechanism itself, legible without instructions: dying text under an amber caution band while a flap-board clock presides. No invented claims anywhere; no fake user content.

## 3. Selected direction — The Countdown Room

- **Visual authority:** the mission-control countdown room — split-flap boards, the presiding countdown clock, range-safety hold/fire lamps, engraved placards. Analog-physical and damped, never a glassy dashboard or neon terminal.
- **Structural thesis:** the clock is the room's presiding authority; the draft is telemetry that dies when signal is lost. Every screen is the *same console at a different mission phase* (pre-arm → count → hold/destruct → post-flight log), not separate pages.
- **Sequence:** SETUP (flip-digit `T–10:00`, placard switches GENTLE/STANDARD/BRUTAL with printed FADE/LOSS limits, one guarded ARM gesture) → WRITE (countdown top-center, text column below) → DELETED (`SIGNAL LOST` board, single red beat, RE-ARM) or DOWN SAFE (wind-down as the flight-log side of the board; Done → archive).
- **Focal moment:** the fade — text paling under an amber hairline band while seconds tick; then the deletion beat. Signature interaction: arming the session by one deliberate guarded flip.
- **Color system:** charcoal panel ground + bone luminous text (≈90% of surface, achromatic); semantic lamps locked — phosphor green = nominal/alive, amber = fading/hold, red = destruct, reserved absolutely. Dark ground forced by the physical scene: a writer at a night desk, luminous readouts in a dim room.
- **Type character:** engraved-placard caps for labels (tracked uppercase), tabular avionics numerals for all live numbers (zero layout shift), quiet grotesk for prose. Specific faces chosen at build.
- **Raised lines carried into the build:** amber-before-red lamp hierarchy with damped mechanical motion (six-pack); running times right-aligned against the margin, session/wind-down as two hard sides of one board (j-card); warning color confined to a hairline edge band while the field stays achromatic (cloud-edge); the one-gesture arm ritual (cape); glow/flap motion as capability layers off under reduced-motion, absolute two-color caution law (arcade); fixed ground that never repaints, threat rides as one overlay (orienteering).
- **Implementation consequences:** rAF-computed opacity driven by wall-clock timestamps; flap/damped motion as CSS capability layers; aria-live state announcements; tabular numerals; subtle panel grain to kill flat-black banding; hairline 1px bezels, no soft shadows.

## 4. Scope and boundaries

Full product MVP per the approved scoping brief (setup / write / deleted / wind-down / archive; localStorage; a11y mitigations; textContent-only rendering). Static Vite + vanilla TS deliverable. Untouched: the scoping brief's decisions (presets, wall-clock blur policy, true permanence, text-changing input, graceful wind-down, time-only HUD). Anti-goals: marketing pages, rich text, accounts, pause, live in-session stats.

## 5. States and ranges

Setup (duration presets + custom minutes; three difficulty placards); armed/typing (full opacity, green lamp); fading (amber lamp + hairline band + decaying opacity, numeric countdown in reduced-motion mode); deleted (red beat, SIGNAL LOST, RE-ARM); wind-down (editable, threat off, Done); archive (list with timestamps + excerpts; view/copy/download/delete/clear; empty state honest). Text ranges: empty to multi-thousand-word sessions; archive 0→dozens of entries. First-run: the console must explain itself by being operable, no tour.

## 6. Interaction and layout

Single-column console topology; the countdown presides top-center at large scale; the text column owns the viewport's middle; controls are physical (switches, guarded arms, lamps) — every stock component rebuilt in the console's vocabulary. Feedback is continuous (opacity, lamp states, flap ticks), never modal. Transitions are damped and mechanical; reduced-motion replaces fade/glow with a static amber banner + numeric countdown. Responsive: the console stacks by criticality on phones; archive list collapses to spine-style rows.

## 7. Constraints and open decisions

Binding: scoping brief + PRODUCT.md (permanence, blur policy, HUD constraint, a11y mitigations, no fabricated content). Open, non-blocking: exact preset values (planning); duration input shape (planning); archive metadata (planning); fade curve shaping (direction contract at build); split-flap rendering technique and face choices (production); grain/noise technique (production).

## Handoff

To `plan-it-out` with the approved scoping brief (docs/ultron/town-hall.md) + this brief. The direction contract (THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM/FINISH) is written into the artifact's opening comment when production builds the first surface, per new-work §5.
