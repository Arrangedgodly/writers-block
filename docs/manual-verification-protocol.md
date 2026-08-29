# Manual Verification Protocol — The Disappearing Draft (T13)

The core promise is time: fade at the configured instant, permanent deletion at the
configured instant, correct across every way a real browser can starve, suspend, freeze,
discard, reload, or undo a page. The fake-clock suites (`src/engine/timing.test.ts`,
`src/engine/controller.test.ts`, `src/ui/router.test.ts` — 185 tests) prove the invariants
headlessly: exact fade/delete boundaries, disarm-at-zero tie precedence, no state skip,
drift-free wall-clock derivation, single-emission terminal phases, plural-event reconcile
(visibilitychange/focus/pageshow/boundary timer), reload-mid-session storage silence, and
the R3 DOM-level deletion sequence.

**What no jsdom run can prove — and these protocols exist to check:**

1. A real browser's hidden-tab scheduler (R1: Chrome's 1s/1-per-minute tiers, WebKit
   suspension, page freeze, Memory Saver discard, Firefox-Android unload).
2. Real native undo engines (R3: jsdom implements none; Safari deliberately preserves
   undo across programmatic value sets — WebKit r87204 — which is why node replacement
   is the load-bearing layer).
3. Real reload/navigation (jsdom cannot navigate; the automated test models it with
   beforeunload/pagehide + a fresh router over the surviving storage adapter).
4. Human-visible tolerance (±100ms) of the fade/deletion instants.

Run the app once and keep it running for all protocols:

```bash
npm run dev          # or: npm run build && npm run preview
```

Open the console in each browser under test. **Every protocol:** record PASS/FAIL per
browser in the results table at the end and copy the completed table into
`docs/ultron/production-log.md` (T13 entry). A FAIL on any expectation is a real bug —
file it against T13, do not annotate it away.

Presets (fixed): GENTLE = FADE 10s / LOSS 30s · STANDARD = FADE 5s / LOSS 10s ·
BRUTAL = FADE 3s / LOSS 6s.

---

## Protocol A — Hidden-tab overstay (R1)

**The product decision under test:** the wall clock keeps running while the tab is
hidden. An idle overstay past the loss limit must end in the deleted state, applied
exactly once — whether the boundary timer fired while hidden (Chrome's throttled tiers
allow it) or the return-event reconcile applied it on the way back.

### A1. Basic overstay — every browser

1. Open the app. Configure: difficulty **GENTLE**, duration **3 min**. Press **ARM**.
2. Type continuously for ~10 seconds, ending with a recognizable marker line:
   `HIDDEN TAB OVERSTAY MARKER A1`.
3. Stop typing and **immediately switch to another tab** (Cmd+T then click away, or
   click an existing tab). Note the wall-clock time of your last keystroke.
4. Stay away **45 seconds** (wall clock — use a watch/timer, not the app).
5. Switch back to the app tab.

**Expect (all must hold):**

- [ ] The **SIGNAL LOST** board is showing (deleted state) — never a half-faded editor,
      never an "undead" armed/fading state.
- [ ] Exactly **one** red beat / one SIGNAL LOST (no double flash, no re-announcement
      flicker — deletion fires once).
- [ ] **RE-ARM** has focus (keyboard: pressing Enter goes to setup).
- [ ] No textarea is present anywhere on the board.
- [ ] **VIEW ARCHIVE → Setup → VIEW ARCHIVE**: no new entry was written for this session.
- [ ] Console: no errors.

| Browser | PASS/FAIL | Notes (which path applied: deleted-already-on-return vs deleted-on-the-return-instant) |
|---|---|---|
| Chrome desktop | ☐ | |
| Safari desktop | ☐ | |
| Firefox desktop | ☐ | |
| iOS Safari (if available) | ☐ | |

### A2. Long-hide intensive throttling — Chrome desktop (>5 min)

Chrome (88+, permanently on) throttles chained timer wake-ups to once per minute once a
tab has been hidden >5 min; fully frozen pages run no JS at all.

1. Configure: GENTLE, duration **custom 15 min**. ARM, type ~10s incl. the marker
   `LONG HIDE A2`, then hide the tab for **5 min 30 s** minimum.
2. Return.

**Expect:** SIGNAL LOST, exactly one beat, nothing archived, no console errors
(same checklist as A1). The deletion may have landed at ~30s (boundary timer in the
1s tier), during the 1-per-minute tier, on `resume`, or on the return instant — all
correct; only the final state and the single beat are contractual.

- [ ] Chrome desktop PASS/FAIL: ☐  — observed: ____________

### A3. Minimized / app-hidden window — Safari desktop (full suspension)

WebKit suspends minimized/backgrounded windows entirely (R1 §3.3): no timers, no rAF,
possibly no events until restore.

1. Configure GENTLE 3 min. ARM, type ~10s incl. `MINIMIZE A3`, then **minimize the
   window** (Cmd+M) — do not just switch tabs. Stay minimized 45 s+, then restore.
2. Repeat once with **hide app** (Cmd+H) instead of minimize.

**Expect:** SIGNAL LOST on restore, exactly one beat, nothing archived (A1 checklist).

- [ ] Safari minimize PASS/FAIL: ☐  — [ ] Safari Cmd+H PASS/FAIL: ☐

### A4. bfcache restore (`pageshow.persisted`) — Chrome + Safari + Firefox desktop

1. Configure GENTLE 3 min. ARM, type ~10s incl. `BFCACHE A4`.
2. In the SAME tab, navigate away (type any URL, e.g. `example.com`, in the address bar).
3. Wait 45 s+, then press **Back**.

**Expect, two legitimate outcomes — record which one happened:**

- [ ] **bfcache restore** (near-instant, typing state gone): SIGNAL LOST board, one beat,
      nothing archived (the `pageshow` reconcile applied the overstay), no console errors.
- [ ] **full reload** (browser evicted the page): the **setup** screen (session-over,
      protocol D expectations), nothing archived, no console errors.

| Browser | Outcome (bfcache / reload) | PASS/FAIL |
|---|---|---|
| Chrome | | ☐ |
| Safari | | ☐ |
| Firefox | | ☐ |

### A5. Occluded window — Chrome desktop

Chrome (86+) treats a fully occluded window as hidden.

1. Configure GENTLE 3 min. ARM, type ~10s incl. `OCCLUSION A5`.
2. **Completely cover** the app window with another window (not minimized, not another
   tab — the window must be entirely obscured). Wait 45 s+, then un-cover.

**Expect:** SIGNAL LOST, one beat, nothing archived (A1 checklist).

- [ ] Chrome desktop PASS/FAIL: ☐

### A6. Freeze / Memory-Saver discard — Chrome desktop

1. With Energy Saver on (or simply a long hide), hide the armed GENTLE session
   (marker `FREEZE A6`) for 6+ minutes, silent. Alternatively force it: open
   `chrome://discards` and click **Discard now** on the app's tab, then return to it.
2. Return to the tab.

**Expect, two legitimate outcomes — record which:**

- [ ] **Frozen-then-resumed**: SIGNAL LOST (the return reconcile covers the whole gap),
      one beat, nothing archived.
- [ ] **Discarded-then-reloaded**: setup screen (session-over), nothing archived, no
      console errors — the reload path is the only backstop once a tab is discarded (R1).

- [ ] Chrome PASS/FAIL: ☐  — outcome: ____________

### A7. Firefox for Android (if available)

FfA clamps inactive-tab timers to 15 min minimums and may unload tabs entirely.

1. Arm a GENTLE session (marker `FFA A7`), type, background the browser 15+ min.
2. Return to the tab.

**Expect:** either SIGNAL LOST (one beat) or — if the tab was unloaded — the setup
screen; in both cases nothing archived, no console errors.

- [ ] Firefox Android PASS/FAIL: ☐  — outcome: ____________

---

## Protocol B — Foreground tolerance (±100 ms vs configured values)

The engine computes opacity per frame from wall clock (never a CSS transition) with a
boundary `setTimeout` fallback; both paths land on the same instant. Tolerance beyond
~100 ms at 60 Hz indicates drift and is a real bug.

### B1. Frame-accurate measurement (recommended)

1. Start a **screen recording at ≥30 fps** with a running clock visible in frame (the
   OS clock with seconds, or the recording tool's timeline).
2. Configure **GENTLE 3 min**. ARM. Type continuously for ~10 s.
3. **Freeze** (stop typing) at a clearly identifiable instant (say the moment the clock
   ticks to a whole second). Stop the recording at ~T+35 s.
4. Frame-step the recording:
   - the first frame where the text's opacity is visibly < 1 → **fade start**;
   - the frame where SIGNAL LOST first appears → **deletion**.

**Expect:**

- [ ] Fade start ≈ **T + 10.00 s ± 100 ms** (GENTLE fade delay 10 s).
- [ ] Deletion ≈ **T + 30.00 s ± 100 ms** (GENTLE loss limit 30 s).
- [ ] Decay is smooth/linear between the two (no jumps, no stalls, no snap-back).

### B2. Optional quick check — other presets + CPU stress

- [ ] STANDARD: fade ~5.00 s, deletion ~10.00 s (±100 ms).
- [ ] BRUTAL: fade ~3.00 s, deletion ~6.00 s (±100 ms).
- [ ] With DevTools Performance → CPU throttle **4×**: fade/deletion still land at
      10.00 s / 30.00 s wall clock (slow frames may stretch the *visible* instant by a
      frame or two; the wall-clock instants must not drift) — record actuals.

### B3. Interaction checks (any preset)

- [ ] Typing at ANY point during the fade restores full opacity instantly (no ramp-back).
- [ ] The countdown readout tracks wall clock (matches a watch at each second tick).
- [ ] With OS reduce-motion on: no animated fade; instead the static **SIGNAL FADING**
      banner + numeric inactivity countdown appears at ~10 s and reaches 0:00 at ~30 s.

| Browser | B1 fade Δ | B1 delete Δ | PASS/FAIL |
|---|---|---|---|
| Chrome | ☐ ms | ☐ ms | ☐ |
| Safari | ☐ ms | ☐ ms | ☐ |
| Firefox | ☐ ms | ☐ ms | ☐ |

---

## Protocol C — Native undo attempts after deletion (R3)

R3's deletion sequence: blur → `value=''` → `defaultValue=''` → **detach the editor
node** → drop references, plus a deleted-phase `historyUndo`/`historyRedo`
`beforeinput` interceptor. jsdom proves the sequence; only a real engine can attempt
resurrection. **Safari is the load-bearing browser** (it preserves field undo across
programmatic value sets — the node replacement exists for it).

1. Configure **BRUTAL** (fast: fade 3 s / loss 6 s) or GENTLE, duration 3 min. ARM.
2. Type several separate edits so native undo has multiple levels, ending with the
   marker line `UNDO DEFEAT MARKER C1 — must never return`. Make at least 3 distinct
   typing bursts (undo levels).
3. Idle to deletion. On the **SIGNAL LOST** board, attempt every resurrection path:

   - [ ] **Cmd+Z** (macOS) / **Ctrl+Z** (Windows/Linux) — press **10 times**.
   - [ ] **Cmd+Shift+Z** / **Ctrl+Shift+Z** (redo) and **Ctrl+Y**.
   - [ ] **Edit-menu Undo**: macOS menu bar Edit → Undo; Firefox ≡ menu → Edit → Undo;
         Chrome ⋮ menu → Edit (Cut/Copy/Paste area) → Undo, if offered.
   - [ ] **iOS**: shake the device (Shake to Undo); three-finger swipe-left; three-finger
         double-tap. (Safari AND Chrome on iOS — both WebKit.)
   - [ ] **Android** (if available): long-press the page → toolbar Undo
         (Chrome/Firefox); hardware-keyboard Ctrl+Z.

4. Press **RE-ARM** → new session → click into the FRESH editor → press Cmd/Ctrl+Z.

**Expect (all must hold — any text returning is a FAIL and a real R3 breach):**

- [ ] Nothing appears on the deleted board during any attempt (board never changes).
- [ ] No draft text appears in the fresh editor after RE-ARM + undo (fresh node = empty
      undo history; the old node is detached and unreachable).
- [ ] VIEW ARCHIVE: no entry for the deleted session.
- [ ] Undo still works NORMALLY where it should: mid-write in a live session, in the
      wind-down editor, and in setup fields (the interceptor is deleted-phase only).

| Browser | Cmd/Ctrl+Z | menu/redo | gesture | RE-ARM fresh-editor undo | PASS/FAIL |
|---|---|---|---|---|---|
| Chrome desktop | ☐ | ☐ | n/a | ☐ | ☐ |
| Firefox desktop | ☐ | ☐ | n/a | ☐ | ☐ |
| Safari desktop | ☐ | ☐ | n/a | ☐ | ☐ |
| iOS Safari | ☐ | n/a | ☐ | ☐ | ☐ |
| iOS Chrome | ☐ | n/a | ☐ | ☐ | ☐ |
| Android Chrome (if avail.) | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## Protocol D — Reload / exit mid-session

jsdom cannot navigate; the automated proof covers unload-event silence + fresh-mount
session-over (`src/ui/router.test.ts`, "reload / exit mid-session"). The physical check:

1. **Pre-seed:** run one short survived session (type to 0:00, DONE) so the archive has
   exactly one entry. Note it: VIEW ARCHIVE shows 1 row.
2. ARM a second session (**GENTLE 3 min**), type `RELOAD MARKER D — must not persist`.
3. **Variant D1 (armed phase):** within ~5 s of your last keystroke (text still solid),
   press **Cmd+R / F5**.
4. **Variant D2 (fade phase):** re-arm, type, wait until the text is visibly fading,
   then reload.
5. Also try: **hard reload** (Cmd+Shift+R), and after D1, **Back** then **Forward**.

**Expect after every variant:**

- [ ] The **setup** screen boots (session-over — no session state survives a reload).
- [ ] DevTools → Application → Local Storage → key `the-disappearing-draft:archive`:
      the payload contains **exactly the pre-seeded entry** — no new entry, no edit, no
      trace of `RELOAD MARKER D` (byte-for-byte the pre-session value is ideal).
- [ ] VIEW ARCHIVE: still exactly the one pre-seeded row; its text intact.
- [ ] Console: zero errors on the fresh load.
- [ ] A new session arms and runs normally afterwards.

| Browser | D1 | D2 | hard reload | Back/Forward | PASS/FAIL |
|---|---|---|---|---|---|
| Chrome | ☐ | ☐ | ☐ | ☐ | ☐ |
| Safari | ☐ | ☐ | ☐ | ☐ | ☐ |
| Firefox | ☐ | ☐ | ☐ | ☐ | ☐ |
| iOS Safari (if avail.) | ☐ | ☐ | n/a | n/a | ☐ |

---

## Completed results (copy into docs/ultron/production-log.md, T13 entry)

| Protocol | Chrome desktop | Safari desktop | Firefox desktop | iOS Safari | Android |
|---|---|---|---|---|---|
| A1 basic overstay | | | | | |
| A2 intensive throttling | | — | — | — | — |
| A3 minimize/hide | — | | — | — | — |
| A4 bfcache | | | | — | — |
| A5 occlusion | | — | — | — | — |
| A6 freeze/discard | | — | — | — | — |
| A7 FfA unload | — | — | — | — | |
| B foreground tolerance | | | | — | — |
| C undo defeat | | | | | |
| D reload no-write | | | | | — |

Verified by: ________________  Date: ____________  App commit/build: ____________
