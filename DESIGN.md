---
name: The Disappearing Draft
description: A mission-control countdown room where the draft is telemetry that dies when the signal is lost.
colors:
  console-charcoal: "#14161a"
  bezel-plate: "#1a1d23"
  recessed-well: "#0e1013"
  luminous-bone: "#e8e4d8"
  bone-dim: "color-mix(in srgb, #e8e4d8 58%, #14161a)"
  bone-faint: "color-mix(in srgb, #e8e4d8 34%, #14161a)"
  phosphor-green: "#3fe06f"
  caution-amber: "#ffb000"
  destruct-red: "#ff4a3d"
  green-unlit: "color-mix(in srgb, #3fe06f 26%, #0e1013)"
  amber-unlit: "color-mix(in srgb, #ffb000 26%, #0e1013)"
  red-unlit: "color-mix(in srgb, #ff4a3d 26%, #0e1013)"
  hairline: "color-mix(in srgb, #e8e4d8 16%, transparent)"
  hairline-strong: "color-mix(in srgb, #e8e4d8 32%, transparent)"
typography:
  display:
    fontFamily: "'B612 Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "clamp(2.75rem, 9vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "'tnum' 1, 'zero' 0"
  instrument:
    fontFamily: "'DSEG14 Classic', 'B612 Mono', monospace"
    fontSize: "min(calc(clamp(2.75rem, 9vw, 5.5rem) * 0.82), 9vw)"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "Michroma, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "0.12em"
  label:
    fontFamily: "Michroma, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.12em"
  label-sm:
    fontFamily: "Michroma, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.12em"
  numeric:
    fontFamily: "'B612 Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "'tnum' 1, 'zero' 0"
  numeric-sm:
    fontFamily: "'B612 Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "'tnum' 1, 'zero' 0"
  numeric-lg:
    fontFamily: "'B612 Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "19px"
    fontWeight: 400
    fontFeature: "'tnum' 1, 'zero' 0"
  body:
    fontFamily: "'Countdown Room Prose', 'Source Sans 3', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.65
  body-editor:
    fontFamily: "'Countdown Room Prose', 'Source Sans 3', system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: "2px"
  md: "4px"
  lamp: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
  sp-7: "48px"
  sp-8: "64px"
  sp-9: "96px"
components:
  plate:
    backgroundColor: "transparent"
    textColor: "{colors.bone-dim}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  plate-hover:
    textColor: "{colors.luminous-bone}"
  plate-primary:
    backgroundColor: "{colors.luminous-bone}"
    textColor: "{colors.console-charcoal}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  plate-primary-hover:
    backgroundColor: "color-mix(in srgb, #e8e4d8 88%, #14161a)"
    textColor: "{colors.console-charcoal}"
  plate-destruct:
    backgroundColor: "transparent"
    textColor: "{colors.destruct-red}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  plate-destruct-hover:
    textColor: "{colors.destruct-red}"
  flap-board:
    backgroundColor: "{colors.bezel-plate}"
    textColor: "{colors.luminous-bone}"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  flap-slot:
    backgroundColor: "{colors.recessed-well}"
    rounded: "{rounded.sm}"
    width: "1ch"
    height: "1em"
  lamp-dome:
    backgroundColor: "{colors.green-unlit}"
    rounded: "{rounded.lamp}"
    width: "10px"
    height: "10px"
  lamp-dome-live-lit:
    backgroundColor: "{colors.phosphor-green}"
    rounded: "{rounded.lamp}"
    width: "10px"
    height: "10px"
  lamp-dome-fade-lit:
    backgroundColor: "{colors.caution-amber}"
    rounded: "{rounded.lamp}"
    width: "10px"
    height: "10px"
  lamp-dome-loss-lit:
    backgroundColor: "{colors.destruct-red}"
    rounded: "{rounded.lamp}"
    width: "10px"
    height: "10px"
  caution-panel:
    backgroundColor: "{colors.bezel-plate}"
    rounded: "{rounded.sm}"
    padding: "16px"
  nameplate-strip:
    backgroundColor: "{colors.bezel-plate}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: The Disappearing Draft

## Overview

**Creative North Star: "The Countdown Room"**

One console through five mission phases — setup, write, deleted, wind-down, archive — where the split-flap clock presides and the draft is telemetry that dies when the signal is lost. Every screen is the same console at a different mission phase, not a separate page. The world is analog-physical and damped: engraved placard caps, tabular avionics numerals, recessed wells, hairline bezels, panel grain. Roughly 90% of any surface is achromatic — charcoal ground, bone readouts — and the only hue in the room is the range-safety lamp triad, locked to state semantics. Depth comes from hairlines and overlap; soft shadows do not exist anywhere in the system.

The room refuses two things by commitment: the serene writing-app canvas with its reassuring toolbar (the direction contract's explicit refusal), and the glassy dashboard / neon terminal reading of mission control. Pressure is carried by real instruments, not by drama: text pales under an amber hairline band while a flap board ticks; the destruct annunciator latches hard; re-arm is one motion straight into the next session on the last-used calibration. Motion is damped and mechanical (`cubic-bezier(0.16, 1, 0.3, 1)` family), gated as a capability layer — under `prefers-reduced-motion` the room swaps instruments (static amber placard + numeric countdown) rather than going dark, and lamp colors keep switching because they are state, not motion.

The committed lineage: direction "The Countdown Room" (seed da64ca22), direction contract in `index.html` as first child of `<body>`, tokens in `src/styles/tokens.css` (the file header declares values there "the committed world — changing one is a direction change, not a tweak"), and the shared plate vocabulary in `src/styles/plates.css` — imported first among the screen sheets, so every phase spends one button vocabulary and no screen's markup ever depends on another screen's stylesheet. The browser chrome is the room's own: `theme-color` carries the fixed charcoal ground into the tab strip, and the favicon is the signature silhouette — one recessed split-flap digit well with the hinge seam across its middle and a bone digit — hand-authored inline SVG whose every hex is a committed token. Descriptive names, atmosphere language, and named rules below are **simulated (auto mode)**, derived only from `docs/ultron/design-brief.md` §3/§6, `docs/ultron/town-hall.md`, and `PRODUCT.md`.

**Key Characteristics:**
- Fixed console-charcoal ground that never repaints; threat rides as overlays on top of it
- Bone luminous readouts on ~90% achromatic surfaces; three locked lamp hues only
- Michroma engraved placard caps; B612 Mono tabular numerals for every live number; Countdown Room Prose (Source Sans 3, OFL-renamed) for all long-form text; DSEG14 Classic reserved for the SIGNAL LOST board alone
- Hairline (1px) bezel discipline, zero-blur inset panel edges, no soft shadows
- Machined corners (2px plates, 4px large plates); lamp domes are the only full rounds
- Split-flap countdown board presides top-center; per-digit fixed wells give zero layout shift
- Damped mechanical motion as a capability layer; hard lamp switching in both motion modes
- Fixed low-opacity grain overlay kills flat-black banding and survives reduced motion

## Colors

A dark instrument room: one fixed charcoal, two panel steps, and a bone ramp for text — plus three absolutely reserved range-safety lamp hues that mean state and never decorate.

### Primary
- **Luminous Bone** (#e8e4d8): the readout color. Primary text on ground and panels, the lit flap-board digits, entry titles, stat values — and the fill of the one energized control (the primary plate: bone on charcoal, inverted). Selection is bone-on-ground inversion, not a lamp.
- **Phosphor Green** (#3fe06f): the LIVE / SAFE / nominal lamp — armed-and-typing, circuit closed, signal up. Also the console's one sanctioned non-lamp green: keyboard focus (the live circuit under the writer's hands) and the write column's focused leading-edge band.

### Secondary
- **Caution Amber** (#ffb000): the FADE / hold lamp and the whole caution band — the warning-before-loss state. Appears as the fading status text, the 2px amber leading-edge band while the field stays achromatic, the reduced-motion caution placard, and the clear-all confirm's title and edge. Never terminal.
- **Destruct Red** (#ff4a3d): the LOSS lamp, the SIGNAL LOST DSEG14 readout, and the CONFIRM CLEAR control. Terminal, once, never decorative — the only red on any screen is the control or state that destroys.

### Neutral
- **Console Charcoal** (#14161a): the room's fixed ground. Never repaints; screens put nothing behind it. The threat, grain, and overlays ride on top.
- **Bezel Plate** (#1a1d23): raised panels one step above ground — flap board, instrument beds, nameplate strip, caution panels.
- **Recessed Well** (#0e1013): inset beds — flap digit wells, the SIGNAL LOST readout bed, the archive full-draft well.
- **Bone-dim** (color-mix 58% bone / charcoal): secondary text — labels, status, meta, excerpts, plate text. The quiet-but-readable tier (≥4.5:1 on ground).
- **Bone-faint** (color-mix 34%): annotations and disabled affordances only, never body text (~3:1).
- **Unlit lamps** (green/amber/red mixed 26% into recessed-well): the same lamps off — dark tinted glass, still present. An unlit lamp is information.
- **Hairline / Hairline-strong** (16% / 32% bone over transparent): bezel lines over any surface; alpha-based so they adapt to ground or panel without a second palette.

### Named Rules
**The Locked Lamp Rule.** Green = nominal/alive, amber = fading/hold, red = destruct/signal lost. Lamps mean state and never decorate; no hue exists outside these roles (focus green is the one sanctioned extension). Rarity is the point — amber and red each appear on a screen only while their state is true.

**The Fixed Ground Rule.** The charcoal ground never repaints. Threat, caution, and texture ride as overlays and edge bands; a screen never paints a full-bleed replacement background.

**The Unlit Lamp Rule.** An unlit lamp is not removed — it stays on the console as dark tinted glass. State absent is itself information.

## Typography

**Display Font:** B612 Mono (with ui-monospace / SFMono-Regular / Menlo / Consolas fallback) — the flap board and all tabular numerals
**Body Font:** Countdown Room Prose (Source Sans 3 variable, wght 200–900, renamed per OFL §1; with Source Sans 3 / system-ui fallback)
**Label/Placard Font:** Michroma (Microgramma-lineage extended caps)
**Instrument Font:** DSEG14 Classic (B612 Mono fallback) — condition-gated, see rules

**Character:** Three instruments, three voices — the engraved aerospace placard (tracked uppercase Michroma), the cockpit avionics counter (B612 Mono, researched for Airbus/ENAC cockpit legibility, all digits equal-advance by construction), and the quiet grotesk prose. The pairing reads as one manufactured console: nothing hand-written, nothing glassy.

### Hierarchy
- **Display** (700, clamp(2.75rem, 9vw, 5.5rem), line-height 1, tabular): the presiding split-flap countdown `T–MM:SS`, top-center. The board's minute-slot count is fixed per session so the board can never shift while counting.
- **Instrument** (400, min(board × 0.82, 9vw), line-height 1): `SIGNAL LOST` on the deleted board — DSEG14's shared 0.816em advance keeps it on one line from phones up. This is the DSEG14 face's only engagement.
- **Title** (400, 13px, 0.12em, uppercase): screen verdicts and binder identity — `DOWN SAFE — THREAT DISARMED`, `FLIGHT LOG`.
- **Label** (400, 11px, 0.12em, uppercase): status line (`FADING — type to restore`), confirm titles, verdicts.
- **Label-small** (400, 10px, 0.12em, uppercase): engraved legends everywhere — lamp names, stat labels, column strips, plate controls, notes and counts.
- **Numeric** (400, 14px / 19px / 12px, tabular): every live number that is not the board — run times (19px, flush right), stat values, timestamps, word counts (12px meta). Bold 700 is reserved for the board.
- **Body** (400, 18px, 1.65): prose outside the editor — archive excerpts, outcome copy, notes.
- **Body-editor** (400, 19px, 1.65): the draft itself. 18–19px floor on dark ground; measure held at 70ch.

### Named Rules
**The Three Instruments Rule.** Placard caps for labels, avionics numerals for numbers, prose for long-form text — and never crosswise. Placard text is tracked uppercase and short (≤ ~24 chars); long-form text exists only in the prose face.

**The Tabular Rule.** Every live number is set tabular (`tnum`, slashed-zero off). Numbers must never shift the layout while counting — B612 Mono's digits are equal-advance by construction and the flap wells are fixed 1ch × 1em regardless.

**The Reserved Instrument Rule.** DSEG14 Classic renders the SIGNAL LOST readout and nothing else — never the animated flap board, never labels. Segment-LCD and split-flap are different instruments; mixing them breaks the metaphor. (In reduced motion the numeric inactivity countdown is B612 Mono, not DSEG14 — the reservation holds in both motion modes.)

## Layout

A single-column console topology. The board presides top-center at display scale; the text column owns the viewport's middle; controls sit low and isolated in space. Screens are centered shells with a hard max-width — 76rem for write/outcome, 72rem for the archive binder, 48rem for the setup console (a control cluster, not a binder) — carrying `min-height: 100vh` and generous outer padding (32px top, 16px sides, 48px bottom), with flex-column gaps at 32px (24px archive). The prose measure is 70ch centered inside the column; the archive log is hairline-ruled rows on the ground itself (a log sheet, not cards), with run times flush against the right margin (the log's spine of numbers). Spacing rhythm is a 4px base (`sp-1`–`sp-9`: 4/8/12/16/24/32/48/64/96): tight groups inside an instrument, generous separation between instruments, more space above a heading than below. The only breakpoint is 40rem (640px), where the console stacks by criticality — board, lamps, column — and the archive collapses to spine-style rows; the board scale is viewport-clamped, so no other responsive machinery exists. Elevation stacking is a fixed z-vocabulary: panels 10, board 30, threat band 40, grain 50, transient alerts 60.

## Elevation & Depth

No soft shadows, anywhere. Depth is hairlines and overlap: a panel rises by its bezel line and by what it covers, and a recessed well sinks by its darker bed plus an inset lip. The one sanctioned `box-shadow` in the system is a zero-blur 1px inset hairline (the panel edge), used where a border would double the line; lamp glows and readout halos exist only as capability layers under `prefers-reduced-motion: no-preference` and are absent otherwise. Surfaces are flat at rest; the room's dimension comes from the charcoal/panel/well lightness steps and the grain overlay (fixed, pointer-transparent, 4.5% opacity, self-contained SVG turbulence tile) that kills flat-black banding. Grain is static texture — it carries no motion and survives reduced motion untouched.

### Shadow Vocabulary
- **Panel edge** (`box-shadow: inset 0 0 0 1px var(--line)`): the bezel line on raised plates (board, instrument, nameplate, wells). The only always-on shadow form.
- **Lit-lamp glow** (`box-shadow: 0 0 10px 2px color-mix(... lamp ... 50%, transparent)`): a lit dome's halo; no-preference motion only.
- **Readout halo** (`text-shadow: 0 0 18px` bone 18% / red 26%): luminous figures in a dim room, on the board glyphs and the SIGNAL LOST bed; no-preference motion only.

### Named Rules
**The No-Soft-Shadows Rule.** No blurred drop shadows exist in this system and none may be added. Depth = lightness step + hairline edge + overlap; glow is a motion-gated halo on lit instruments, never elevation.

## Shapes

Machined, not molded. Corners barely break the raster: 2px on plates and controls, 4px only where a plate is large (the flap board, the instrument bed, the nameplate strip). Lamp domes are the sole full rounds (999px) — a circle means a lamp, always. Edges are 1px hairlines (alpha bone) rather than solid strokes; strong hairlines (32%) appear only on plate hover. The signature silhouettes: the split-flap digit well (recessed 1ch × 1em cell with a 1px hinge seam across its middle, the physical split line), and the caution band — a hairline/2px colored edge down a panel's or column's leading edge while the field itself stays achromatic (the cloud-edge raised line). Selection inverts bone-on-ground; scrollbars are thin and bone-dim.

## Components

Controls are physical instruments rebuilt in the console's vocabulary — machined plates, lamps, boards — never stock web furniture. Every action button on every styled screen is the same small plate, defined once in the shared `plates.css` layer imported before any screen sheet.

### Buttons (plates)
- **Shape:** machined, barely rounded (2px radius)
- **Default plate:** transparent ground, 1px hairline bezel, bone-dim placard caps (10px, 0.12em, uppercase), padding 8px 12px; hover brightens text to bone and the bezel to strong hairline; active presses 1px down (`translateY(1px)`); all state changes 180ms damped
- **Primary plate** (ARM, RE-ARM, DONE — FINALIZE ENTRY, NEW SESSION): the one filled plate — bone on charcoal, the room's energized state; hover dims the fill one step (88% bone mix). Lands flush right where the run time lives. DONE carries the disarm guard (refinement R3): for one beat after disarm its KEYBOARD activation is held — a mid-sentence keystroke aimed at the just-lost editor must not finalize the session — while the plate stays clickable; a fresh focus on it (Tab away and back) is deliberate intent and lifts the hold at once. The RE-ARM plate's worst-case 27-character label ("RE-ARM — 120 MIN · STANDARD") carries its own structural measure scoped to the deleted board: a `min()` caps its rendered width against the 320px floor, so the placard trades type size for fit and can wrap but never overflow.
- **Destruct plate** (CONFIRM CLEAR, CONFIRM DELETE): red text on a 45%-red hairline, full red border on hover. The destruct lamp color is reserved for the control that destructs.
- **Transient outcome states:** COPY wears `COPIED` in green / `COPY FAILED` in amber for 2.4s — lamp semantics on a plate.
- **Focus:** the room's one focus band — a `--focus-width` (2px) solid focus-green outline, 2px offset (`:focus-visible`), on every screen with plates. The same token sets the editor's leading band, so one value owns every focus indicator in the room; the write editor shows it as that constant-width band plus the caret.

### Lamps (range-safety annunciators)
- **Style:** a 10px full-round dome under an engraved Michroma legend (LIVE / FADE / LOSS / SAFE), stacked and centered
- **State:** lit = the lamp's own hue with a motion-gated glow; unlit = dark tinted glass at 26% into recessed-well — present, never removed. Lamps switch in 180ms damped (or hard-step in authored moments); they never fade semantically
- **Signature behavior — the annunciator latch:** the LOSS lamp on the SIGNAL LOST board latches a fault: three hard on/off steps (`steps(1, end)`, 1.4s, single iteration) then steady lit — the way a real annunciator latches. Under reduced motion the animation does not exist and the board arrives fully lit

### The flap board (signature)
One raised bezel plate (4px radius, panel edge) holding recessed digit wells (1ch × 1em, 2px radius, inset hairline) with the 1px hinge seam across each well's middle, the `T–` prefix engraved alongside at 0.32× board size in bone-dim. The live board is B612 Mono 700; each digit is four glyph surfaces — two static halves and two rotating leaves — flipping transform-only at 300ms flap easing under a single 1000px perspective. Capability-gated twice: flap motion requires no-preference motion AND `transform-style: preserve-3d`; otherwise the same wells update by static per-digit swap (identical look at rest, the reduced-motion and fallback path). Board glyphs carry the bone readout halo (no-preference only).

### The instrument readout (signature)
`SIGNAL LOST` in DSEG14 Classic on a recessed bed (inset hairline, 2px radius, extra bottom padding to even the segment face's high em-box), red at display size capped to hold one line from 320px up, with a motion-gated red halo. The console empties around it — no telemetry, no stats, only the verdict line, honest copy, and two plates: RE-ARM, the primary, carries the recalled calibration on its face ("RE-ARM — 10 MIN · STANDARD") and starts the next session on it — one motion, zero re-configuration, the parameters riding the control that will re-run them (pre-session plate text, never HUD; the write surface stays time-only); RECONFIGURE, the standard secondary, is the door back to the setup console at the exact moment calibration is most likely to want changing, so the full configuration surface never requires surviving a session first. The last-armed configuration is recalled from a small versioned store (in-memory for the page-load; persisted under its own localStorage key, never the archive's envelope — configuration is not user content).

### The text column (the draft)
A chromeless textarea: no box, no border, transparent over the ground; prose face at 19px/1.65, 70ch measure, bone caret, thin bone-dim scrollbar. The column's only edge is its leading band — a constant-width left border set to the committed `--focus-width` token (2px, the same value every focus ring draws) that is transparent while idle, focus-green under the writer's focused hands, and caution-amber while fading (threat outranks focus). The 2px (not the 1px hairline) is deliberate: it doubles as the editor's WCAG 2.4.11 focus indicator, and its width never changes across states so nothing shifts.

### The log (archive rows)
Hairline-ruled rows on the ground itself — top border per row, bottom border on the last — not cards. Each row: prose-strong title, Zulu timestamp + preset + word count in 12px tabular numerals, an 18px prose excerpt at bone-dim, and the run time flush right in 19px B612 Mono. Hover brightens the row one step (4% bone) for scanning without making it a panel. VIEW opens the full draft in a recessed well (0fr→1fr grid reveal, 480ms damped, visibility-gated). Single-entry DELETE is a two-step plate (refinement R3): the first press arms it in place — the plate becomes CONFIRM DELETE in the destruct red, the caution spoken through the polite region — and the second press (click or Enter/Space on the same native button) deletes; Escape anywhere on the binder cancels, and an armed plate reverts to DELETE after a 5s lapse, the safe direction. One confirm is live at a time. The clear-all decision is the one raised caution panel: amber hairline leading edge, amber title, CONFIRM CLEAR in red, settling in with one 480ms damped drop — the amber caution band stays reserved for the multi-entry decision; the single row's caution is spoken, not painted.

### Inputs
The only field is the setup console's custom-minutes number input (native, validated 1–120, `aria-invalid` on error with a polite inline status message). It sits inside its CUSTOM placard as a recessed numeral well — B612 Mono, centered, spinners removed, an amber hairline edge while `aria-invalid` and the field itself stays achromatic — riding above the placard's covering radio so typing never toggles the radio.

### Navigation
There is none — five phases of one console, swapped as a single `<section data-phase>`. Phase changes are deliberate beats: the write board presides; the wind-down board turns over once (damped `rotateX` side-change from edge-on, never a cross-fade) and rests frozen at 0:00 with the SAFE lamp; focus is moved deliberately on every swap (editor on ARM, RE-ARM on deletion, editor again on RE-ARM — the restart is itself a session start — DONE on disarm, the finalized entry's VIEW after Done). The disarm focus keeps its target but gains a guard (refinement R3): for one beat after the swap, DONE holds keyboard activation — the writer may still be mid-sentence, and the keystroke meant for the draft must not finalize the session — while the plate stays clickable and a fresh focus on it lifts the hold.

### Setup console (the front door)
The setup phase is the FIRST VIEWPORT of the direction contract, built on the T7 hooks (`placard`, `placard-name`, `placard-limits`) by `src/styles/setup.css`: the split-flap duration board presides top-center at display scale on the write surface's own classes (a fixed three-digit minute field holds every legal length 1–120, so wells never appear or disappear; digits flip on selection through the same capability gates as the write board, `role="img"` with a plain-language label since nothing is counting); the duration presets and the GENTLE/STANDARD/BRUTAL placards are raised switch plates whose native radios cover them as invisible hit targets — selected = pressed in (recessed bed, bone reading), focus shows on the placard as the 2px focus-green band; the FADE/LOSS limits print as two engraved lines straight from the preset table. The guarded ARM sits low and isolated (it rides to the bottom of the viewport's remaining space) as the MASTER ARM station: a physical cover over the room's one energized plate. The ritual is one deliberate motion, two physical steps — LIFT COVER, then ARM: the cover hinges at its top edge under the station's perspective and vanishes past edge-on (`--dur-arm`, the committed gesture token), leaving the tab order for ARM; Escape re-covers and returns focus to the cover. While closed the cover owns the tab order (ARM carries `tabindex="-1"` but stays a live control), and the router's deliberate focus — arriving from the deleted board's RECONFIGURE or the archive's NEW SESSION — lifts the cover by itself. VIEW ARCHIVE is the standard secondary plate. Validation is the caution band's amber: an amber edge on the field plus a reserved one-line status placard that names the exact bound, so ARM disabling never shifts the station.

## Do's and Don'ts

### Do:
- **Do** keep ~90% of every surface achromatic; hue appears only as lamp state, the caution band, focus green, or the reserved red of destruction.
- **Do** set every live number in B612 Mono with tabular figures, in a fixed-width context when it counts (flap wells are 1ch × 1em) — zero layout shift while counting is an invariant.
- **Do** hold prose to the measure (70ch) at 18–19px / 1.65 leading on the dark ground.
- **Do** keep the leading-edge band at a constant width across transparent → green → amber — the committed `--focus-width` (2px) token that every focus ring also draws — so the prose measure never moves.
- **Do** switch lamps hard (180ms damped, or `steps(1, end)` in authored latches); keep unlit lamps visible as tinted glass.
- **Do** gate flap rotation, board flip, lamp latch, glows, and halos behind `prefers-reduced-motion: no-preference` (flaps additionally behind `preserve-3d`); under reduce, swap instruments — static per-digit swap, static amber placard + B612 numeric countdown — while lamp colors keep switching.
- **Do** let the engine apply the threat fade's opacity per frame from wall-clock output; never leave a CSS opacity transition running unwatched.
- **Do** align run times and session stats flush against the right margin in tabular numerals — the log's spine.

### Don't:
- **Don't** add blurred or soft drop shadows, gradient surfaces, or glassy overlays; the panel edge is the only sanctioned box-shadow and it is a zero-blur hairline.
- **Don't** repaint the ground, introduce a new background hue, or use DSEG14 anywhere except the SIGNAL LOST readout.
- **Don't** use lamp hues decoratively (buttons, accents, illustrations) or introduce any hue beyond the locked triad + focus green.
- **Don't** use bone-faint for readable text (annotations and disabled states only); quiet-but-readable is bone-dim.
- **Don't** round corners beyond the machined 2px/4px steps — full rounds are lamp domes, exclusively.
- **Don't** animate opacity as a state transition, fade a lamp's meaning, or add live stats to the write phase (numbers beyond the countdown exist only post-session).
- **Don't** set long-form text in Michroma or DSEG14, or lowercase placard labels; don't exceed ~24 characters on a placard.
