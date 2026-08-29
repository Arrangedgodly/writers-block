# R2 — Split-flap / flip-digit countdown: technique selection

- **Date:** 2026-08-28
- **Affected tasks:** T9 (write surface — presiding countdown, committed)
- **Decision priority:** P1
- **Status:** Committed, pending synthesis
- **Product context:** "The Countdown Room" mission-control aesthetic; countdown rendered as split-flap/flip-digit (e.g. T–09:59), updating once per second, vanilla TypeScript + CSS, no framework.
- **Out of scope (already settled):** reduced-motion behavior = static text + numeric inactivity countdown, no animation. Not re-researched here.

## Research question

What is the best-performing, accessible technique for a per-second-updating split-flap/flip-digit countdown in vanilla TS + CSS? Compare:

- **(a)** CSS 3D-transform flip on DOM digit halves (top/bottom split-flap or full-digit flip-card)
- **(b)** canvas rendering
- **(c)** plain DOM text swap with a lightweight CSS animation on change (no split-flap geometry)

Judged on: visual fidelity at 1 Hz; CPU/GPU cost and layout/paint behavior; tabular-numeral stability; vanilla-TS implementation complexity; screen-reader handling; graceful degradation.

## Constraints & criteria

1. Vanilla TS + CSS only, no framework, no runtime dependency (project rule).
2. Update cadence 1 Hz; only digits that change should animate (seconds column most ticks, minutes tens/hundreds rarely).
3. Animations must stay on the compositor (transform/opacity only); no per-tick layout or paint.
4. No layout shift between ticks — digit cells must be fixed-width regardless of glyph.
5. Countdown legible to screen readers regardless of technique (aria), without per-second announcement spam.
6. Must degrade gracefully when 3D transforms are unavailable and (settled) under `prefers-reduced-motion`.

## Options considered

### (a) CSS 3D-transform flip on DOM digit halves — RECOMMENDED

Each digit is a fixed-width slot containing top and bottom flap elements. The top flap carries the outgoing glyph's upper half and rotates `rotateX(0deg → -90deg)`; the bottom flap carries the incoming glyph's lower half and rotates `rotateX(90deg → 0deg)`; the slot uses `transform-style: preserve-3d` under a `perspective` ancestor; `backface-visibility: hidden` on flaps. A CSS custom property per slot (`--angle` or add/remove of a `.flip` class) drives the transition; TS only sets the class/custom property and swaps glyph text at the flip midpoint.

This is the technique of the production references examined:

- `daformat/react-split-flap-display` (Zero-Clause BSD): Root → Slot → Character → two `Flap` spans (`data-split-flap-flap="top|bottom"`); angles exposed as `--split-flap-top-flap-angle` / `--split-flap-bottom-flap-angle`; top flap "rotates from 0deg down to -90deg while flipping", bottom "from 90deg up to 0deg"; `transform-style: preserve-3d` on every layer; consumer supplies `perspective: 550px` on a parent; default `cubic-bezier(.215,.61,.355,1)`, duration `--split-flap-flip-duration` 800 ms default. Documents two Safari fixes: a `translateZ(0.1px)` to fix a `backface-visibility` glitch during animation, and resetting a turn counter every two turns to avoid Safari precision glitches. README claims "Pure-CSS 3D flip animation, hardware-accelerated." (React component, but the DOM/CSS technique ports 1:1 to vanilla TS.)
- `objectivehtml/FlipClock` (FlipClock.js, MIT, ~2.8k stars, first released 2013, modern version works with vanilla JS): "realistic flip effect" built on CSS3 3D transforms — two card faces per digit, `rotateX` (not rotateY), `perspective`, `backface-visibility: hidden`, JS swaps values at the right moment and triggers the animation class.
- `conartist6/splitflap`: full Solari simulation that flips through the whole glyph set per change using "regular fonts and not images", tick-driven (default `tickLength` 120 ms), adjustable via CSS. **No LICENSE file — do not adapt code from this repo**; cited only as evidence the DOM approach scales to aggressive flap cycling.
- `cp-alley` gist "Split flap display animation": a 2D-only variant — no rotateX/perspective; `overflow: hidden; height: 1em` clipping plus `transition: transform 0.3s` sliding `::before`/`::after` copies (`translateY(-100%) → 0` and `0 → translateY(100%)`). Proof a transform-only pseudo-element trick can *suggest* a flap without 3D — a candidate fallback, though it reads as a slide rather than a flip.

### (b) Canvas rendering

Draw the flap stack on a `<canvas>`; animate the flip with `requestAnimationFrame` redraws for the flip duration.

- MDN: "The `<canvas>` element on its own is just a bitmap and does not provide information about drawn objects. Canvas content is not exposed to accessibility tools as semantic HTML is," and "In general, you should avoid using canvas in an accessible website or app." Requires fallback content inside the element and, in practice, a parallel DOM text mirror for SR users anyway.
- Every animation frame is JS main-thread work (clear, redraw glyphs with manual easing, bitmap upload); CSS transitions on transform/opacity by contrast run compositor-side without JS involvement per frame.
- Implementation must handle devicePixelRatio, text metrics, resize, and loses CSS font features and crisp DOM text.

### (c) Plain DOM text swap + lightweight CSS animation

One text node (or per-digit spans), swap text per tick, run a small fade/slide via transform/opacity.

- Cheapest and simplest; with `font-variant-numeric: tabular-nums` (MDN: figures "all of the same size, allowing them to be easily aligned like in tables"; Baseline "widely available… since January 2020", but effect depends on the font actually containing the OpenType `tnum` variants) or per-digit fixed-width spans, there is no layout shift.
- Fidelity is the failure: a fade/slide is not the mechanical split-flap character that "The Countdown Room" calls for; the 2D gist variant above is the best it gets.
- Best-in-class accessibility: a single real text node inside `role="timer"`.

## Recommendation

**Option (a): DOM split-flap with CSS 3D `rotateX` flaps, driven by a class/custom-property transition, with a static per-digit text-swap fallback (option c's swap, no animation) under `@supports not (transform-style: preserve-3d)`.** Pair with the screen-reader pattern below.

### Why

1. **Fidelity:** it is the only option of the three that produces actual split-flap character (hinged top flap falling, bottom flap rising, perspective foreshortening) at 1 Hz. Both production references (FlipClock.js, daformat) use exactly this geometry.
2. **Cost:** the animation is transform-only → compositor-only. web.dev's animations guide: keep animations on `transform` and `opacity` so they stay in the composite stage of the rendering pipeline; its worked example animating `top`/`left` instead of transform dropped ~50% of frames vs ~1% with transform, and animating layout/paint properties "may not be able to maintain smooth or performant animation." At 1 Hz with a 300–600 ms transition, typically only 1–2 digit slots animate per tick — a handful of small, permanently-promotable layers. `will-change: transform` on the two flap elements per animating slot is justified (they change every second, continuously — web.dev's caution is against premature/permanent promotion of rarely-changing elements); note the fallback `transform: translateZ(0)` for older browsers.
3. **Layout stability:** each digit lives in a fixed-width, fixed-height slot; glyph text is absolutely centered in each half. Zero layout shift by construction, independent of `tabular-nums` font support. (Option c *depends* on `tnum` support or per-digit spans to get the same guarantee.)
4. **Complexity:** moderate and bounded — ~4 elements per digit slot, one CSS transition, a small TS controller that diffs the time string and toggles classes. No framework, no dependency. daformat's README plus FlipClock's customizing-CSS guide give a complete blueprint; daformat is Zero-Clause BSD ("do whatever you want"), FlipClock.js is MIT — both safe to learn from / adapt.
5. **Screen readers:** the text is real DOM. Recommended pattern (next section) keeps a single authoritative, visually-hidden time string and mutes the decorative halves.
6. **Degradation:** `transform-style: preserve-3d` is Baseline "widely available… since September 2015" (MDN), so the 3D path covers effectively all current browsers; the `@supports` fallback collapses to a plain per-digit swap. prefers-reduced-motion is already settled to static text.

### Screen-reader pattern to pair with it

- Wrap the display in `<div role="timer" aria-label="Time remaining">`. MDN: the timer role semantically marks "the remaining time until an end point," has **implicit `aria-live: off`**, so "assistive technologies will not announce updates to a timer" — exactly right for a 1 Hz tick (no per-second spam), while remaining readable when focused/navigated.
- Keep one visually-hidden (`.sr-only`) text node inside it, updated once per tick with the full string (e.g. "09:58"). Set `aria-atomic="true"` so any announcement reads the whole value, not just the changed digits — MDN's clock example shows that without it only "34" is announced on 17:33→17:34, and notes the clear-and-reinject workaround is timing-unreliable.
- Mark every visible flap/glyph node `aria-hidden="true"` (the halves duplicate glyphs; daformat similarly mirrors content on the bottom flap "automatically aria-hidden and inert"). Never put the live text inside the animated nodes.
- For milestones (e.g. T–01:00, T–00:10), temporarily promote: MDN's egg-timer example swaps `role="timer"` → `role="alert"` for ~1 s so the moment is announced despite the implicit `off` (avoid combining `role="alert"` with `aria-live` — VoiceOver iOS double-speaking). Alternative: a separate offscreen `aria-live="polite"` region written to only at milestones.
- The live region must exist in the DOM before content changes (MDN: "Start with an empty live region, then – in a separate step – change the content inside the region").

### When each alternative would be preferable

- **(b) canvas:** only if the display grew to a large Solari board (dozens–hundreds of characters), needed WebGL/post-processing effects, or lived inside an existing canvas scene. Even then MDN's accessibility guidance forces a parallel DOM text path, which is exactly the dual-maintenance cost we avoid at 5 glyphs.
- **(c) text swap + light animation:** if the product downgraded the split-flap aesthetic to "nice-to-have", or as the shipped fallback inside the `@supports` guard — which is how this plan uses it.

## Evidence

| Source | Version / date | Claims used |
|---|---|---|
| web.dev, "How to create high-performance CSS animations" (https://web.dev/articles/animations-guide) | current as of 2026-08-28 | Animate only `transform`/`opacity` (composite stage); top/left example dropped ~50% frames vs ~1% with transform; `will-change` forces layers but "layer creation can itself cause other performance problems" — apply only when needed, spec suggests adding/removing around changes; fallback `transform: translateZ(0)`. |
| MDN, ARIA live regions (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions) | current 2026-08-28 | `aria-live` values off/polite/assertive (no "rude"); polite announces when idle (rapid intermediate updates are dropped); `aria-atomic="true"` makes full content announce (clock example announces "17:34" not "34"); clear-then-inject is timing-unreliable; region must exist before updates; `role="alert"` + `aria-live` causes VoiceOver iOS double-speaking. |
| MDN, `timer` role (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/timer_role) | current 2026-08-28 | "remaining time until an end point"; implicit `aria-live: off`; "Assistive technologies will not announce updates to a timer"; MDN example temporarily swaps role to `alert` at a critical threshold to get one announcement. |
| MDN, `font-variant-numeric` (https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric) | current 2026-08-28 | `tabular-nums`: figures "all of the same size"; Baseline widely available since Jan 2020; no visible effect if the font lacks the OpenType `tnum` variants. |
| MDN, `transform-style` (https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style) | current 2026-08-28 | Baseline widely available since Sept 2015; grouping property values (overflow ≠ visible/clip, opacity < 1, filter, clip-path, mix-blend-mode, `contain: paint`, etc.) force used value `flat` even with `preserve-3d` specified; not inherited — must be set on all non-leaf 3D descendants. |
| MDN, `<canvas>` (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/canvas) | current 2026-08-28 | "just a bitmap and does not provide information about drawn objects"; "In general, you should avoid using canvas in an accessible website or app"; fallback content inside element; no implicit ARIA role. |
| daformat/react-split-flap-display (https://github.com/daformat/react-split-flap-display) | README read 2026-08-28; Zero-Clause BSD | Slot/Flap DOM structure; top flap 0→−90°, bottom 90→0° via CSS custom properties; `transform-style: preserve-3d` on every layer, consumer supplies perspective; `translateZ(0.1px)` Safari backface-visibility fix; Safari precision-glitch turn reset; bottom flap aria-hidden + `inert`; reduced motion NOT addressed. |
| objectivehtml/FlipClock (https://github.com/objectivehtml/flipclock) | MIT, © 2013 Objective HTML; ~2.8k stars | "realistic flip effect" via CSS3 3D transforms: two faces per digit, `rotateX`, `perspective`, `backface-visibility: hidden`, JS-triggered animation classes; modern build works with vanilla JS. |
| conartist6/splitflap (https://github.com/conartist6/splitflap) | read 2026-08-28; **no license** | Solari facsimile rendering "regular fonts and not images"; CSS-tunable animation; 120 ms tick. Code not safe to adapt. |
| cp-alley gist, split-flap animation (https://gist.github.com/cp-alley/f967aa32d568ec583df82d45e8cb7981) | read 2026-08-28 | 2D transform-only approximation: `overflow: hidden; height: 1em`, `transition: transform 0.3s`, pseudo-element `content: attr(data-letter)` copies sliding in/out; no ARIA, no reduced-motion — illustrates both the fallback trick and the a11y pitfalls to avoid. |

## Tradeoffs, risks, confidence

- **R1 — `preserve-3d` flattening traps:** any grouping property (`overflow: hidden`, `opacity < 1`, `filter`, `clip-path`, `mix-blend-mode`, `contain: paint`) on a 3D-context element silently forces `flat` (MDN). Mitigation: keep `preserve-3d` elements property-clean; clip glyphs on the leaf flap halves, not on the rotating elements or slot; test in the slot/colon composition.
- **R2 — Safari quirks:** backface-visibility glitch during animation and precision drift on long-running transforms, both documented by daformat with concrete fixes (`translateZ(0.1px)`, turn resets). Bounded, known workarounds.
- **R3 — Over-promotion cost:** six digit slots × 2–3 layers of composited surfaces is a small, fixed layer budget; still, apply `will-change` only to flap elements, and verify in Chrome Layers/FPS panels per web.dev debugging guidance (FPS meter, paint flashing).
- **R4 — Announcement spam / silence:** implicit `aria-live: off` avoids spam but means only focused reads announce; milestones must be explicitly promoted (role="alert" swap) or they pass in silence. QA with VoiceOver + NVDA.
- **R5 — Timer drift:** not a technique differentiator, but per-second flips must be scheduled from wall-clock targets (`Date.now()`/`performance.now()` deltas), not naive `setInterval(1000)` accumulation, or the flap cadence drifts from the true deadline.
- **Canvas option downsides:** main-thread per-frame work, DPR/text-metric complexity, and a mandatory parallel DOM text mirror for a11y — strictly worse than (a) at this scale; only wins at large glyph counts.
- **Text-swap option downsides:** fails the aesthetic requirement; retained as the fallback tier.
- **Confidence: high** on technique selection (multiple independent production implementations converge on the same geometry; performance claims grounded in web.dev/MDN pipeline docs). **Medium** on Safari edge behavior until tested in-house (fixes are documented secondhand).

## Implementation consequences & plan updates (T9)

1. T9 builds the countdown as DOM split-flap (option a): per-digit slot (fixed width/height), top/bottom flap elements, `transform-style: preserve-3d`, perspective on the display container, `backface-visibility: hidden`, transition on `transform` only (≈300–600 ms, split-flap easing e.g. `cubic-bezier(.215,.61,.355,1)`).
2. TS controller diffs the formatted `mm:ss` string each tick and flips only changed digit slots (add/remove `.flip` class or set `--angle` custom property; swap glyph at midpoint). Schedule ticks from wall-clock deadline, not accumulated interval.
3. `will-change: transform` on flap elements; avoid grouping properties on 3D-context ancestors.
4. Accessibility: `role="timer"` + `aria-label` wrapper; single `.sr-only` text node with `aria-atomic="true"` updated per tick; `aria-hidden="true"` on all visible flap/glyph nodes; milestone promotion (role="alert" swap ~1 s) at T–01:00 and T–00:10.
5. Fallbacks: `@supports not (transform-style: preserve-3d)` → static per-digit swap (no animation); `prefers-reduced-motion` → settled static text + numeric inactivity countdown. Both share the same SR pattern.
6. License hygiene: reference daformat (Zero-Clause BSD) and FlipClock.js (MIT) techniques; do not copy conartist6/splitflap (no license).
7. QA additions to T9 checklist: Safari backface check, Layers/FPS panel check during a minute of ticking, VoiceOver/NVDA pass on the timer region, `@supports` fallback smoke test.

## Delegation record

- Researched and authored by the research-track subagent for **deep-research-supreme** (track: R2, technique selection), 2026-08-28.
- Deliverable: this record + 5-line return summary; feeds synthesis and T9 implementation.
