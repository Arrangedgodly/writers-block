# R1 — Hidden-tab timer throttling semantics & wall-clock reconciliation

**Decision priority:** P0
**Status:** committed pending synthesis
**Delegation record:** research track subagent for deep-research-supreme, 2026-08-28
**Affected tasks:** T3 (Inactivity controller), T13 (Timing hardening verification)
**Project:** The Disappearing Draft (vanilla TS + Vite static app)

---

## 1. Research question

What are the exact current timer-throttling semantics for hidden/background tabs — `setTimeout`, `setInterval`, `requestAnimationFrame` — in current Chrome, Safari, and Firefox on desktop and mobile (including intensive throttling, timer alignment, rAF pausing, page freezing)? And which event pattern (`visibilitychange` vs `focus` vs `pageshow`, with timestamps captured at event time) guarantees correct reconciliation of elapsed wall-clock when the page becomes visible again **without double-firing state transitions** (e.g., delete firing both from a late timer callback and from the visibility handler)?

## 2. Constraints & evaluation criteria

Product-confirmed constraints (docs/ultron/plan.md):

- Timing is wall-clock based (`performance.now()`/`Date.now()` deltas). **The clock keeps running while the tab is hidden** — an idle overstay past the delete threshold while hidden must apply deletion when the page returns (T3 acceptance: "hidden-tab overshoot past delete threshold applies deletion on visibility return").
- `blur` keeps the loop running (a visible-but-unfocused window is not idle forgiveness).
- Zero accumulated ticks — no drift across slow/janky frames; state is a pure function of `(now, lastInputAt, …)` (T2 contract).
- Transitions must be single-fire: the delete beat is a deliberate, unrecoverable sequence (T4/T10 depend on it firing exactly once).
- No persistence on the deletion path (informs but does not change event choice).

Evaluation criteria for candidate patterns:

1. **Correctness under all hidden regimes** — 1s clamp, 1/min intensive throttling, full suspension (WebKit/iOS), page freeze (Chrome), bfcache, occluded windows, Firefox-Android discard.
2. **No double transitions** — late timer callback + event handler must converge to one delete.
3. **No missed transitions** — some trigger must always fire on return (visibilitychange is not 100% reliable on iOS Safari).
4. **Implementation effort** — must fit T3's "medium" budget and T2's pure-function core.

## 3. Findings — throttling semantics (primary sources)

### 3.1 Baseline (all browsers, spec'd)

WHATWG HTML Standard, §8.7 "Timers" (living standard; `html.spec.whatwg.org/multipage/timers-and-user-prompts.html`, accessed 2026-08-28):

- Exact rule: *"If nestingLevel is greater than 5, and timeout is less than 4, then set timeout to 4."* and *"Timers can be nested; after five such nested timers, however, the interval is forced to be at least four milliseconds."*
- *"This API does not guarantee that timers will run exactly on schedule."* Timers also include an *"Optionally, wait a further implementation-defined length of time"* padding step, whose note explains it lets user agents pad timeouts to optimize device power usage.
- `setTimeout` and `setInterval` share the same timer-initialization steps and ID map; nesting level counts invocations of the algorithm, *"not of a particular method"* — both count toward the chain depth. `clearTimeout`/`clearInterval` are interchangeable.
- **The spec mandates nothing about hidden documents** — all background throttling is browser policy layered on top.

MDN `Window.setTimeout` (accessed 2026-08-28), quoting the spec: *"As specified in the HTML standard, browsers will enforce a minimum timeout of 4 milliseconds once a nested call to setTimeout has been scheduled 5 times."*

### 3.2 Chrome (desktop + Android)

**Three tiers** (MDN `setTimeout`, "Timeouts in inactive tabs", accessed 2026-08-28; canonical source: developer.chrome.com/blog/timer-throttling-in-chrome-88, Chrome 88, January 2021, page last updated 2021-01-18):

1. **Minimal throttling** — page visible, recently audible, or otherwise active: *"Timers run close to the requested interval."*
2. **Throttling** — hidden but nesting < 5, **or hidden < 5 minutes**, or WebRTC active (`RTCPeerConnection` with an `open` `RTCDataChannel` or `live` `MediaStreamTrack`): *"Timers in this state are checked once per second, which may be batched together with other timers that have similar timeouts."* → **hidden-tab timers effectively quantize to ~1 s.**
3. **Intensive throttling** (Chrome 88, Jan 2021) — requires ALL of: nesting/chain count ≥ 5, page hidden > 5 minutes, silent > 30 s (audible audio in the last 30 s exempts; *"silent audio tracks don't count"*), no WebRTC: *"the browser will check these timers once per minute"* (batched). → **chained timers in long-hidden silent tabs fire at most 1×/min.**
   - Alignment: chromestatus.com/feature/4718288976216064 ("Intensive throttling of JavaScript timer wake ups"): throttled wake-ups are coalesced/aligned to a **shared wall-clock one-minute boundary** (all background tabs fire together). Applies once the window's top window has been hidden ≥ 5 min. Chrome 90 removed the `#intensive-wake-up-throttling` flag — permanently on; only the `IntensiveWakeUpThrottlingEnabled` enterprise policy can disable it.
   - Announced in blog.chromium.org/2020/11/tab-throttling-and-more-performance.html (M87 window, Nov 2020): *"JavaScript timer wake-ups in background tabs are throttled to once per minute"*, up to ~5× CPU reduction for hidden tabs.
   - Relevant to this app (5 s/10 s delays, non-chained timers): a single non-chained `setTimeout` scheduled while hidden sits in tier 2 (~1 s granularity), but a controller that reschedules itself per tick is by definition chained — after 5 reschedules it is chain-eligible; intensive tier needs hidden > 5 min, which a write session can easily outlive.
- **Occluded windows**: Chrome (86+) treats fully occluded windows as hidden for visibility purposes — MDN Page Visibility API: visibilitychange fires when *"the document is entirely obscured by another window"*; occlusion counts toward the 5-minute intensive-throttling threshold (Windows occlusion detection; see cmdrkeene.com/disabling-browser-occlusion-throttling/ for practical notes). Cross-browser, occlusion detection is NOT universal — on some platforms a covered window stays `visible`.
- **Freezing (Page Lifecycle API)** — developer.chrome.com/docs/web-platform/page-lifecycle-api: states Active/Passive/Hidden/Frozen/Terminated/Discarded. When frozen, *"things like JavaScript timers and fetch callbacks will not run"* — timers stop **entirely** (worse than 1/min). Freeze heuristics (developer.chrome.com/blog/freezing-on-energy-saver): pages **hidden and silent for more than five minutes** that are CPU-intensive are targeted (Energy Saver); Memory Saver can discard tabs outright (tab reloads on activation — no in-page code runs at all). Escape hatches (audio, WebRTC, alerts, etc.) do not apply to this silent app.
- **rAF in Chrome**: developer.chrome.com/blog/timer-throttling-in-chrome-88: *"requestAnimationFrame waits for the page to become visible, so it doesn't use CPU when the page is hidden."* No firing while hidden.

### 3.3 Safari / WebKit (macOS + iOS)

- Design intent: WebKit bug 150515 — *"Safari background tabs should be fully suspended where possible"* (long-standing WebKit direction: suspend background pages, scheduling one-shot timers based on visibility).
- macOS: community measurements (Stack Overflow 42157422, 65423070) show background-tab timers clamped to ≥ 1 s with spikes to several seconds, and timers **fully pausing** when the window is minimized/backgrounded — Safari throttles harder than Chrome and can stop rather than slow. Nolan Lawson ("Why do browsers throttle JavaScript timers?", 2025-08-31): Safari throttles `setTimeout` more aggressively than Chrome/Firefox even in the **foreground** (Safari 18.4 median ~26.7 ms vs Chrome 139 ~4.2 ms), and *"everything I said about setTimeout could also be said about setInterval."*
- iOS: in inactive tabs the OS can pause the whole JS environment (timers stop completely) — classic observation documented by Raymond Camden (raymondcamden.com, 2013, still representative) and echoed in WebKit bug 150515 direction.
- **visibilitychange reliability on iOS Safari**: documented cases of backgrounded iOS tabs stalling *without* firing `visibilitychange` (github.com/boardsesh/boardsesh issue #2426); iOS web-app modes where `visibilitychange:hidden` only fires on app switch (ITNEXT "Hide and seek: how to make sense of page events in your web app"); historical WebKit bug 151234 / w3c/page-visibility#58 (visibility/rendering sync bugs on iOS). → iOS Safari is the platform where a single-`visibilitychange` pattern is weakest.
- Safari 16+ ships Background Tab Suspension (developer debug flag "Disable Background Tab Suspension" exists — support discussions).

### 3.4 Firefox

- Desktop: *"Firefox Desktop has a minimum timeout of 1 second for inactive tabs."* (MDN `setTimeout`, accessed 2026-08-28; pref `dom.min_background_timeout_value` = 1000 ms per about:config lore — superuser.com/questions/1500289). Plus budget-based throttling for background windows (Bugzilla 1181073 and related; `dom.timeout.enable_budget_timer_throttling` family).
- **Firefox for Android: "a minimum timeout of 15 minutes for inactive tabs and may unload them entirely."** (MDN, exact quote) — treat FfA background tabs as effectively frozen/discarded; in-page reconciliation cannot be guaranteed; reload-path handling (T13's session-over protocol) is the only backstop.
- Tracking scripts get 10 s min delays in background (not applicable to us).
- Audio exemption: *"Firefox does not throttle inactive tabs if the tab contains an AudioContext."* (Not usable — the app is deliberately silent.)

### 3.5 requestAnimationFrame (all browsers)

- MDN `Window.requestAnimationFrame` (accessed 2026-08-28), exact: *"requestAnimationFrame() calls are paused in most browsers when running in background tabs or hidden iframes, in order to improve performance and battery life."* Callback receives a `DOMHighResTimeStamp` (*"indicating the end time of the previous frame's rendering"*).
- Consequence: **rAF cannot be the clock while hidden** (it simply stops), but it is the perfect foreground tick: no ticks fire during hiddenness, so there is no such thing as an "overdue rAF" — the first tick after `visible` reconciles with fresh timestamps.

### 3.6 Which clock survives hiding?

- **`performance.now()` can itself be frozen**: w3c/hr-time issue #65 ("can performance.now() timers be frozen for background tabs") — Chrome may freeze the `performance.now()` counter while a tab is frozen; Chromium issue 41450546 documents `performance.now()` drifting from `Date.now()` because Chrome halts the counter in certain conditions. Under Chrome's freeze regime, a `performance.now()` delta can **exclude** the hidden duration.
- **`Date.now()` is wall-clock** and advances during throttling, suspension, freeze, and bfcache. Since the product decision is "the clock KEEPS RUNNING when the tab is hidden," the hidden-duration source of truth must be `Date.now()` (captured at event time in handlers). `performance.now()` remains ideal for smooth per-frame interpolation in the foreground, but every wall-clock anchor (`lastInputAt`, boundary comparisons on reconcile) must be `Date.now()`-based — and any rAF-timestamp interpolation must be re-anchored to `Date.now()` on each reconcile so accumulated foreground drift can't accumulate across hide/show cycles.

### 3.7 Event semantics & ordering

- MDN Page Visibility API (accessed 2026-08-28): visibilitychange fires when the user *"minimizes the window, switches to another tab, or the document is entirely obscured by another window"*; `visible` = *"the page is the foreground tab of a non-minimized window"*; `hidden` includes *"the device's screen is off."* Explicit guidance that focus/blur are imperfect proxies: *"watching for blur and focus events on the window helps you know when your page is not the active page, but it does not tell you that your page is actually hidden to the user."*
- Chrome Page Lifecycle docs: state machine Hidden→Passive via `visibilitychange` (to visible), Passive→Active via `focus`; from Frozen: `resume` then `pageshow`. Caveat quoted: *"a focus event does not necessarily signal a state change. It only signals a state change if the page did not previously have input focus."* Chrome's own advice is to rely on `visibilitychange`, not `focus`, for lifecycle tracking.
- **Ordering is NOT interoperable**: community evidence (WICG focus-visible issue #115 logs, Sentry discussions, trivago engineering) shows `focus` firing before `visibilitychange` in some browsers/versions and after in others. Consensus: do not depend on the order; treat the events as independent signals and dedupe.
- `pageshow` (with `event.persisted`) is the bfcache-restore signal (Page Lifecycle docs: use `pagehide`/`pageshow` for termination/restore detection; Chrome docs pair Frozen→restored with `resume` then `pageshow`). It does not fire on ordinary tab switches.

## 4. Options considered

### Option A — single-`visibilitychange` source of truth

Listen only to `visibilitychange`; on `visible`, reconcile from `Date.now()` vs `lastInputAt`.

- **Fit:** matches Chrome's official guidance; simplest; no ordering concerns.
- **Correctness risk:** iOS Safari is documented to sometimes not fire `visibilitychange` on background stall/return (boardsesh #2426) and has historical visibility-sync bugs (WebKit 151234). Occluded-but-still-`visible` windows on platforms without occlusion detection never reconcile (acceptable — rAF keeps ticking there, so the clock is live). bfcache restore without a visibility flip can be missed.
- **Effort:** minimal.
- **Edge cases:** iOS suspension quirk is the killer — a missed event means the deleted state is not applied on return until the next rAF tick (which usually follows shortly after real rendering resumes — partially self-healing, but not guaranteed prompt).

### Option B — rAF loop + visibility gate

Drive everything from a rAF loop; gate the loop on `document.hidden` (stop scheduling when hidden, restart on visible).

- **Fit:** rAF is paused in background tabs anyway (MDN), so nothing fires while hidden; the first post-visible frame reconciles with a fresh timestamp. Natural for per-frame opacity (T2's `opacity` per frame). Cheap.
- **Correctness risk:** relies on rAF resuming promptly — on iOS after suspension the first frame can lag; if the user returns but rendering is delayed, deletion application is delayed by that render latency. No JS-driven transition can fire while hidden (fine per product decision — deletion applies on return). Doesn't by itself cover bfcache restore.
- **Effort:** low.
- **Edge cases:** iOS first-frame latency; occluded-but-`visible` windows keep ticking (correct — clock runs); needs `visibilitychange` anyway to restart the loop, so it degenerates toward A plus a frame gate.

### Option C — timer + plural events, deduped by phase-checked state machine (recommended)

One `reconcile()` entry point; multiple triggers all call it: a next-boundary `setTimeout` fallback (so deletion can also land while hidden-but-throttled, e.g. Chrome's 1 s/1 min tiers), `visibilitychange` (primary), `focus` (secondary — covers iOS visibilitychange misses and pure focus returns), `pageshow` (bfcache restore; inspect `event.persisted`). `reconcile()` recomputes phase from `(Date.now(), lastInputAt, config)` via T2's pure function and **applies a transition only when the phase actually changes**; terminal phases (`deleted`, `survived`/disarmed) absorb all further triggers; every reconcile clears and reschedules the fallback timer.

- **Fit:** exactly T3's contract ("immediate reconciliation on visibilitychange/focus", "zero accumulated ticks", "hidden-tab overshoot applies deletion on visibility return").
- **Correctness risk:** lowest — double-fire is structurally impossible because there is exactly one transition-application point and the phase check makes it idempotent; a late throttled timer callback after the visibility handler already deleted sees `phase === 'deleted'` and no-ops. Missed events are covered by trigger redundancy (any one of the three plus the timer suffices).
- **Effort:** low-medium — it is mostly wiring around T2's pure function.
- **Edge cases handled:** focus-before/after-visibilitychange ordering is irrelevant (both just call `reconcile()`; ordering cannot matter because state is derived, not accumulated). iOS visibilitychange miss → `focus` fires on return. bfcache → `pageshow` with `persisted`. Freeze/1-per-minute → the fallback timer may be late or never; events reconcile on return. Firefox-Android discard → no in-page recovery possible; reload path (T13) declares session-over.

## 5. Recommendation

**Adopt Option C, with Option B's rAF as the foreground rendering tick.**

T3 implements:

1. **Timestamps.** Wall-clock anchor is `Date.now()` only. `lastInputAt` is stamped `Date.now()` on every text-changing input (`beforeinput`/`input` incl. paste/IME). Every `reconcile()` captures `Date.now()` at event time inside the handler. Foreground opacity interpolation may use the rAF callback timestamp, but must re-anchor to `Date.now()` on every reconcile (no cross-cycle drift). Do NOT use `performance.now()` deltas to measure hidden duration — Chrome can freeze that clock during page freeze (w3c/hr-time#65; Chromium 41450546), which would silently under-count the overstay.
2. **Events.** `document.addEventListener('visibilitychange', reconcile)` (primary; check `document.visibilityState === 'visible'` inside, not the event alone); `window.addEventListener('focus', reconcile)` (secondary; idempotent); `window.addEventListener('pageshow', reconcile)` (bfcache restore; read `event.persisted` for telemetry/tests only — reconcile logic is identical). Do not branch on event order; handlers are interchangeable triggers.
3. **Loop.** rAF loop runs only while `document.visibilityState === 'visible'` (scheduling continues; browsers simply pause it while hidden — no explicit gate strictly required, but check visibility in the tick so a paused-then-resumed tick reconciles before painting). Each tick calls `reconcile()` (cheap: one pure-function call) — opacity is computed per frame from wall-clock, never a CSS transition (matches plan.md line 11).
4. **Fallback timer.** One `setTimeout` scheduled for the next phase boundary (`min(fadeStart, deleteAt, sessionEnd) − now`), cleared and rescheduled by every `reconcile()`. It exists so deletion can land while hidden in Chrome's ~1 s / 1-per-minute tiers; if the engine never runs it (WebKit suspension, Chrome freeze), the return-event reconcile is the guarantee.
5. **Double-fire prevention (phase-checked transitions).** Single transition application: `const next = derivePhase(now, lastInputAt, fadeDelayMs, deleteThresholdMs, sessionEndAt); if (next !== current) { current = next; emit(next); }` where `emit('deleted')` runs the T4 permanence teardown exactly once — terminal `deleted` (and `survived`/disarmed-at-zero) absorb every later trigger, so a late timer callback after the visibility handler's delete is a no-op. `reconcile()` is idempotent and re-entrant safe; `clearTimeout` precedes any transition emission.

Rationale: the evidence shows three distinct hidden regimes that no single mechanism covers (Chrome's tiered throttling + freeze; WebKit full suspension + iOS event flakiness; Firefox desktop 1 s / Android 15-min+discard), while the cost of plural triggers is near zero **iff** all triggers converge on one phase-checked, timestamp-derived reconcile. This is also exactly the shape the community consensus recommends for the ordering problem ("treat as independent signals and dedupe") and what T2's pure function makes nearly free.

## 6. Evidence index

| # | Claim | Source | Version/date |
|---|-------|--------|--------------|
| E1 | 4 ms clamp after nesting > 5; timers not guaranteed on schedule; implementation-defined padding; setTimeout/setInterval share rules & ID map | WHATWG HTML §8.7 Timers — https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html | living standard, accessed 2026-08-28 |
| E2 | "browsers will enforce a minimum timeout of 4 milliseconds once a nested call to setTimeout has been scheduled 5 times"; "Firefox Desktop has a minimum timeout of 1 second for inactive tabs"; "Firefox for Android has a minimum timeout of 15 minutes for inactive tabs and may unload them entirely"; "Firefox does not throttle inactive tabs if the tab contains an AudioContext"; Chrome minimal/throttling/intensive tier table (1 s checks; 1/min checks) | MDN Window.setTimeout — https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout | accessed 2026-08-28 |
| E3 | Intensive throttling conditions (chain ≥5, hidden >5 min, silent >30 s, no WebRTC) and 1/min batched checks; audio exemption; rAF "waits for the page to become visible" | Chrome Developers — https://developer.chrome.com/blog/timer-throttling-in-chrome-88 | Chrome 88, Jan 2021; page updated 2021-01-18 |
| E4 | M87 background wake-ups once per minute; ~5× CPU cut | Chromium blog — https://blog.chromium.org/2020/11/tab-throttling-and-more-performance.html | Nov 2020 |
| E5 | Intensive wake-ups coalesced/aligned to a shared wall-clock one-minute boundary after 5 min hidden; flag removed Chrome 90 (always-on; enterprise policy only) | chromestatus.com/feature/4718288976216064; https://stackoverflow.com/questions/67115330 | Chrome 90, 2021 |
| E6 | Frozen pages: "JavaScript timers and fetch callbacks will not run"; states Hidden→Passive via visibilitychange, Passive→Active via focus, Frozen→ resume+pageshow; "a focus event does not necessarily signal a state change" | Page Lifecycle API — https://developer.chrome.com/docs/web-platform/page-lifecycle-api | accessed 2026-08-28 |
| E7 | Freeze heuristics: hidden & silent > 5 min, CPU-intensive pages (Energy Saver); Memory Saver discards | https://developer.chrome.com/blog/freezing-on-energy-saver | accessed 2026-08-28 |
| E8 | visibilitychange fires on minimize/tab-switch/full occlusion; `hidden` includes screen off; focus/blur are imperfect proxies | MDN Page Visibility API — https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API | accessed 2026-08-28 |
| E9 | "requestAnimationFrame() calls are paused in most browsers when running in background tabs or hidden iframes, in order to improve performance and battery life." | MDN requestAnimationFrame — https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame | accessed 2026-08-28 |
| E10 | Safari background tabs designed to be fully suspended; macOS timers clamp ~1 s then fully pause when minimized; iOS JS pauses in inactive tabs | WebKit bug 150515 — https://bugs.webkit.org/show_bug.cgi?id=150515; SO 42157422, 65423070; raymondcamden.com/2013/01/20/FYI-iOS-JavaScript-and-inactive-tabs | bug 2015-onward; observations current |
| E11 | iOS Safari: backgrounded tabs can stall without firing visibilitychange; historical visibility sync bugs | github.com/boardsesh/boardsesh issue #2426; WebKit bug 151234; w3c/page-visibility#58 | current |
| E12 | focus-vs-visibilitychange order is not interoperable; consensus: dedupe independent signals | WICG focus-visible #115 — https://github.com/WICG/focus-visible/issues/115; Sentry sentry-javascript#13300; SO 58148482 | current |
| E13 | performance.now() may be frozen during Chrome freeze; drifts from Date.now(); Date.now() is the wall-clock survivor | w3c/hr-time#65 — https://github.com/w3c/hr-time/issues/65; Chromium issue 41450546 | current |
| E14 | Foreground timer floors: Safari 18.4 ~26.7 ms vs Chrome 139 ~4.2 ms; setInterval treated identically; Chrome background clamp "1 second" | Nolan Lawson, "Why do browsers throttle JavaScript timers?" — https://nolanlawson.com/2025/08/31/why-do-browsers-throttle-javascript-timers/ | 2025-08-31 |

## 7. Tradeoffs, risks, confidence

- **Tradeoff — plural triggers vs purity:** listening to three events adds surface area, but because every handler is the same idempotent `reconcile()`, the surface is linear, not combinatorial. Cost is bounded and testable with mocked events (T3 acceptance already assumes mocked-event tests).
- **Tradeoff — `Date.now()` vs monotonicity:** `Date.now()` can jump on system clock changes (NTP, manual). Mitigation: clamp non-monotonic backwards jumps (if `now < lastInputAt`, treat as no-op) and re-stamp `lastInputAt` on next real input. For a 5–10 s product window this is a minor, testable risk. `performance.now()`'s smoothness is retained for per-frame interpolation only.
- **Risk — Firefox for Android (15-min clamp + unload) and Chrome Memory Saver discard:** in-page reconciliation is impossible once the tab is discarded; the reload path must declare session-over with no storage write (already T13 scope). Residual risk: user expectation on FfA. Accepted.
- **Risk — deletion while hidden:** the fallback timer can fire deletion while the tab is hidden (Chrome tiers allow late wake-ups). This is spec-compatible with the product decision (clock keeps running) and desired — the draft must not survive a hidden overstay merely because the tab stayed hidden. If product later prefers "delete only on return," delete the fallback timer; the pattern is unchanged.
- **Risk — occluded-but-`visible` windows:** on platforms without occlusion detection, the loop keeps running (rAF continues) — correct behavior, no reconciliation needed. On Chrome desktop, occlusion flips `visibilityState` to `hidden` and full throttling applies — reconciliation on un-occlusion follows the same event path. Covered.
- **Confidence: HIGH** for the recommendation and the Chrome/Firefox-desktop semantics (primary docs, exact quotes). **MEDIUM-HIGH** for Safari/iOS specifics (behavior is real and well-corroborated, but documented via bug trackers and community measurement rather than a versioned WebKit spec page; the plural-trigger design deliberately does not depend on any single Safari quirk being true).

## 8. Implementation consequences & plan updates

**T3 (Inactivity controller) — adopt directly:**

- Wall-clock anchors use `Date.now()` exclusively (`lastInputAt`, all boundary comparisons); rAF timestamp allowed only for intra-cycle interpolation, re-anchored each reconcile; guard against backwards clock jumps.
- Listen: `visibilitychange` (check `visibilityState === 'visible'`), `focus`, `pageshow` — all invoking one `reconcile()`; no ordering assumptions; handlers interchangeable.
- One pending `setTimeout` at the next boundary from `min(fadeStart, deleteAt, sessionEnd) − now`, cleared/rescheduled on every reconcile.
- Phase-checked transitions from T2's `derivePhase`: emit only on change; `deleted`/disarmed terminal; deletion side effect (T4) therefore exactly-once.
- Tests to add beyond plan: (a) late timer fires after visibility-handler delete → no second `deleted` emission; (b) `focus` then `visibilitychange` both firing in one return → single transition; (c) `pageshow persisted` after long bfcache → deletion applied; (d) `performance.now()` frozen mock changes nothing (clock is `Date.now()`-driven); (e) backwards `Date.now()` jump is clamped.

**T13 (Timing hardening verification) — extend manual protocol:**

1. Hidden overstay: switch tabs past threshold → return → deleted (primary acceptance, unchanged).
2. Long-hide tier: hide > 5 min (Chrome intensive 1/min) with active session → return → correct wall-clock phase (deletion if past threshold).
3. Minimized window on Safari (full suspension) → restore → correct phase.
4. bfcache: navigate away & back (`pageshow.persisted`) past threshold → deletion applied.
5. Occluded window (fully cover with another window) on Chrome → un-cover → correct phase.
6. Energy Saver / Memory Saver (Chrome) — expect freeze/discard; verify reload shows session-over, no storage write.
7. Firefox Android: background > 15 min → tab may unload → verify session-over path.
8. Foreground tolerance spot-check (~100 ms) unchanged; additionally verify no double delete beat in any of the above (single `SIGNAL LOST`).

No changes to T2's signature; `derivePhase(now, lastInputAt, …)` already takes `now` — controller simply always passes `Date.now()`.

## 9. Decision

- **Priority:** P0 (blocks T3 controller design; T13 protocol derives from it).
- **Status:** committed pending synthesis.
- **Recommendation:** Option C — plural-event, phase-checked, `Date.now()`-anchored `reconcile()` with rAF foreground tick and one boundary `setTimeout` fallback.
- **Strongest alternative:** Option A (visibilitychange-only) — adequate on Chrome, weakest on iOS Safari (E11).
