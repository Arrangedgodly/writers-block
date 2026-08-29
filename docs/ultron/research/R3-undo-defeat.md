# R3 — Defeating native undo of a programmatically cleared textarea

## Question + affected task IDs

**R3 (narrowed):** Does programmatically clearing a textarea (`element.value = ''`) or replacing the editor node reliably defeat the NATIVE undo stack (Ctrl/Cmd+Z, edit-menu Undo, mobile undo gestures) across current Chrome, Safari, and Firefox on desktop and mobile? What must T4 build so "not resurrectable via undo (verified in tests)" actually holds?

**Affected tasks:** T4 (permanence guard — primary), T9 (write surface — must expose a teardown/replacement seam), T10 (deleted beat — mounts the replacement surface, moves focus), T13 (timing hardening — real-browser undo verification, manual protocol).

Editor choice (textarea vs contenteditable) is settled: textarea. Contenteditable appears below only as an evidence baseline.

## Constraints & criteria

- Deletion must be permanent: no storage write on the deletion path; text cleared from live memory; native undo (keyboard, menu, shake/toolbar gesture) must not resurrect the draft.
- Acceptance (plan.md T4): "tests assert — no storage write on deletion path; textarea value cleared; editor element replaced so Ctrl+Z cannot resurrect; memory references dropped."
- Vanilla TS + Vite static app; no frameworks, no custom undo stack; must not degrade normal typing/IME during the session.
- Tests run in Vitest/jsdom — jsdom implements no native undo, so unit tests assert the DOM-level strategy; real undo attempts are verified in T13's manual per-browser protocol.

## What the spec says (and doesn't)

1. **The HTML spec is silent on undo for programmatic value changes.** The `value` IDL setter for `<textarea>` runs four steps — save old API value, set raw value, set dirty flag true, move cursor to end — with no undo semantics at all; the word "undo" does not appear on the textarea element page (WHATWG HTML LS, `form-elements.html#the-textarea-element`, fetched 2026-08-28). There is no requirement that user agents either preserve or clear field undo history on script value writes; behavior is engine-defined.
2. **The spec's undo-manager work was abandoned.** HTML5 once defined an undo history / `UndoManager` interface; it was never implemented (Mozilla bug 617532 never shipped) and the section no longer exists in the Living Standard. Successor drafts (W3C UndoManager and DOM Transaction; Niwa's Undo API) remain unimplemented proposals. Nothing in spec-land will rescue or standardize this for us.
3. **Spec-derived resurrection vector — `form.reset()` / child text content.** Raw value and child text content are separate: children-changed steps sync child text → raw value only while the dirty flag is false, and form reset "sets the dirty value flag back to false, and the raw value to its child text content." So `el.value = ''` leaves the old text in the textarea's DOM child text nodes (`el.textContent` still holds the draft), where a later reset (or any dirty-flag loss) can restore it. Permanence must scrub child text too (`el.defaultValue = ''` does "string replace all" on children), not just `value`. Simplest hard rule: never put the editor inside a `<form>`.
4. **Input Events Level 2** defines `beforeinput` `inputType` `historyUndo` ("undo the last editing action") and `historyRedo`, fired for editing attempts on text controls and editing hosts; all `beforeinput` events are cancelable **except** those inside an IME composition (`insertCompositionText`), and `getTargetRanges()` returns an empty array for the history types. `preventDefault()` on `beforeinput` blocks the undo — a legal, spec-sanctioned interception point (Chrome 60+, Firefox 87+; Baseline since 2021-03).

## Observed engine behavior (the decisive matrix)

- **Chrome/Blink — value-set WIPES the field's undo stack.** Chromium issue 40656690 "Input undo/redo buffer cleared after js changes input value" (same family as 40143087; tracker pages now sign-in-walled, so title-level evidence), corroborated by Stack Overflow 16195644 (2013) and 69503315 (2021) and the Chrome DevRel article "Native Undo & Redo for the Web" (2018): a programmatic value set "doesn't generate an undoable event." After `el.value = ''`, Ctrl+Z does nothing in Chrome. Blink's text-control undo is element-scoped — issue 40626763 ("Undo stack should not leak unreachable input elements") shows undo entries holding references to *removed* inputs, i.e., entries never transfer to a new node.
- **Firefox/Gecko — value-set WIPES the field's undo stack, intentionally.** Bugzilla 1523270 "Editable component (textarea) ctrl+z undo history lost after JavaScript value change": artificial value changes wipe textarea/input undo history so Undo cannot revert them (behavior adopted around Fx 57–64, tied to perf bug 1346723). Masayuki Nakano closed it **INVALID / intentional**: "won't change the behavior back"; the sanctioned undoable path is `execCommand('insertText')` (supported in fields since Fx 89, bug 1220696). Comment also notes "Some browsers discard undo history by setting value" — contrasting with Safari, which doesn't.
- **Safari/WebKit — value-set does NOT wipe the undo stack. Undo can resurrect.** WebKit bug 61340 (2011-05-24, FIXED r87204): `RenderTextControl::setInnerTextValue` used to call `frame->editor()->clearUndoRedoOperations()` "whenever script sets new value to input or textarea"; the fix **removed that call**, ChangeLog: "Fixed the bug by removing the offending call to clearUndoRedoOperations." The regression test `LayoutTests/editing/undo/undo-after-setting-value.html` still in the current WebKit main branch (verified 2026-08-28) enforces that setting a text control's value must NOT clear the undo stack. Field reports match: post-programmatic-change, Cmd+Z steps back through prior *user typing* (Anvil forum report; React #17494/#18018 controlled-input undo anomalies; Bugzilla 145075 shows WebKit keeping field undo reachable across unrelated DOM changes while Chrome/Firefox "behave correctly"). Depth of restoration varies (typing-command inverses applied against the current value), but "may resurrect" is certain.
- **Node replacement — the universal killer.** All three engines bind text-control undo state to the element instance: Blink's per-element entries (leak bug above), Gecko's per-text-control editor/transaction manager (destroyed with the node), WebKit's typing commands targeting the control's inner editor. A brand-new textarea starts with an empty undo history; a detached old node is unfocusable and unreachable by menu/gesture undo. The DevRel article corroborates the field-scoped model (a `display:none` field drops out of the undo stack). Confidence: reasoned from engine architecture + the bug record, not a single doc sentence.
- **Mobile.** iOS: shake-to-undo fires the same native undo path in Safari and Chrome on iOS (all WebKit); does not work in iOS Firefox/Edge. Android: no consistent system undo gesture (long-press toolbar "Undo" appears in some contexts; physical keyboard Ctrl+Z works). The same defenses (node replacement + no editable target after deletion) cover mobile; `historyUndo` interception additionally catches toolbar/keyboard-driven undo events where `beforeinput` fires.

### Caveats examined

- **Firefox's separate undo handling:** per-field transaction manager; value-set wipes it (above). Nothing extra needed beyond node replacement. `execCommand` in Firefox works in fields only since Fx 89 — irrelevant to us since we avoid it.
- **IME composition:** if the delete threshold fires mid-composition, `beforeinput` interception is unavailable (composition events are non-cancelable per spec), and clearing `value` mid-composition is engine-quirky (composition may re-commit over the cleared field). Mitigation: **blur the editor first** (forces composition cancel/commit deterministically), then clear, then replace the node — node removal kills the composition host outright. Composition input is already counted as activity by T3, so mid-composition deletion only happens when the user truly abandons an open composition.
- **`document.execCommand('delete')` / `('insertText')`:** MDN is explicit — "Unlike direct DOM manipulation, modifications performed by `execCommand()` **preserve the undo buffer**." That is the exact opposite of T4's goal: an execCommand-driven delete would be undoable by design. Do not use; it is also deprecated. `setRangeText` behaves like a script value write (no undo transaction in the spec) but has cross-browser undo reports; don't rely on it for permanence either.
- **Edit-menu Undo:** dispatches the same editor undo command as the keyboard shortcut — same element-scoped target, same defeat via node replacement; where `beforeinput` fires, it is intercepted identically.
- **Contenteditable baseline (evidence only):** Chrome's CE undo stack "does not include programmatic DOM changes" (contenteditable lab ce-0303) while Safari's CE stack can be *cleared* by programmatic modification (ce-0037) — the same engine split, inverted surface. Nothing there beats node replacement; textarea stands.

## Options considered

| Option | Chrome | Firefox | Safari | Mobile | Cost | Verdict |
|---|---|---|---|---|---|---|
| **A. value-clear only** (`el.value = ''`) | permanent (stack wiped) | permanent (stack wiped) | **FAILS** — stack survives; Cmd+Z restores typed text; iOS shake same | fails on iOS | trivial | rejected alone |
| **B. value-clear + `defaultValue` scrub + node replacement** (blur → `value=''` → `defaultValue=''` → replace/detach node) | permanent | permanent | permanent — fresh node, empty history, old node detached & unfocusable | permanent | small — T10 replaces the surface anyway | **recommended** |
| **C. value-clear + blur + focus reset** | mostly | mostly | partial — removes the undo *target* while focus sits on RE-ARM, but refocusing a still-attached field can reach surviving entries; doesn't scrub child text | partial | trivial | insufficient alone; keep as sequencing detail |
| **D. contenteditable nulled** | baseline | baseline | baseline (stack may clear) | baseline | n/a — editor settled (textarea); CE drags IME/selection complexity | evidence baseline only |
| **E. `beforeinput` historyUndo/historyRedo interceptor** (capture, active only in deleted phase) | blocks undo events (60+) | blocks (87+) | **unreliable** — Safari's form-field `beforeinput` historically contenteditable-first (ce-0043; React #11211 declined to rely on it) | mixed | tiny | defense-in-depth, never primary |

## Recommendation & rationale

**T4 implements layered option B + E:**

1. **Blur** the editor first — deterministically ends any in-flight IME composition and drops the undo target.
2. **Scrub:** `el.value = ''` AND `el.defaultValue = ''` — the second wipes the textarea's child text nodes, closing the `form.reset()`/dirty-flag resurrection vector (spec-derived). Never wrap the editor in a `<form>`.
3. **Replace the node:** detach the old textarea (`old.replaceWith(fresh)` or remove it and mount the SIGNAL LOST board — T10 owns the board; T4 guarantees the old node is **detached**, not hidden). This is the load-bearing layer: it is the only one that defeats native undo in *Safari*, where the undo stack deliberately survives programmatic value writes (r87204).
4. **Interceptor:** capture-phase listener on the write console for `beforeinput` with `inputType` of `historyUndo`/`historyRedo` → `preventDefault()`, armed from deletion until RE-ARM. Cheap insurance for menu/toolbar/keyboard undo wherever `beforeinput` fires (Chrome/Firefox reliably; Safari best-effort).
5. **Memory hygiene + no storage:** null engine-side references to the text buffer and old node so the string is GC-eligible; no `localStorage.setItem` anywhere on the deletion path.

Rationale: value-set alone is provably insufficient (Safari). Node replacement is the only cross-engine guarantee, and it composes cleanly with T10's deleted beat (the surface is being swapped anyway; permanence just requires the old node dies rather than being reused or hidden). The interceptor and blur sequencing cost almost nothing and cover the residual paths (menu undo in Chrome/Firefox, mid-composition edge).

### What T4's test can assert (jsdom/vitest — no native undo exists there)

- After the deletion callback: the old editor node `isConnected === false`; its `value === ''` **and** `textContent === ''` (child-text scrub verified).
- The editor slot contains a node that `!==` the old node; no connected textarea holds non-empty `value`/`textContent`.
- A `localStorage.setItem` spy records zero calls on the deletion path.
- Dispatching a cancelable, bubbling `beforeinput` with `inputType: 'historyUndo'` (and `'historyRedo'`) at the deleted-phase console yields `defaultPrevented === true`.
- Controller teardown: no further state emissions/listeners bound to the old node after deletion.
- **True native-undo verification is physical and belongs to T13's manual protocol:** Chrome/Firefox/Safari desktop (Cmd/Cmd+Z, Edit menu Undo) + iOS shake-to-undo + Android long-press toolbar — none restores text. Record results in production-log.

## Evidence (links, versions, dates, claims)

| # | Source | Date accessed | Claim established |
|---|---|---|---|
| 1 | WHATWG HTML LS — the textarea element (value setter steps; children-changed; reset) — https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element | 2026-08-28 | Spec silent on undo for script value writes; raw value ≠ child text; reset/dirty-flag resurrection vector |
| 2 | WebKit bug 61340 + changeset r87204 — https://bugs.webkit.org/show_bug.cgi?id=61340, https://trac.webkit.org/changeset/87204 | 2026-08-28 | 2011-05-24 fix REMOVED `clearUndoRedoOperations()` from `setInnerTextValue`; WebKit intentionally does not clear undo on programmatic value set |
| 3 | WebKit layout test (main branch) — https://raw.githubusercontent.com/WebKit/WebKit/main/LayoutTests/editing/undo/undo-after-setting-value.html | 2026-08-28 | Current WebKit enforces "does not clear undo stack when setting the value of input or textarea" |
| 4 | Mozilla Bugzilla 1523270 (INVALID, intentional) — https://bugzilla.mozilla.org/show_bug.cgi?id=1523270 | 2026-08-28 | Firefox wipes textarea/input undo on artificial value change; wontfix; execCommand('insertText') is the sanctioned undoable path (Fx 89, bug 1220696) |
| 5 | Chromium issues 40656690 / 40143087 (sign-in-walled; titles) + SO 16195644, SO 69503315, React #18018 — https://issues.chromium.org/issues/40656690 | 2026-08-28 | Chrome clears the input undo/redo buffer after JS value changes (title-level + community corroboration) |
| 6 | Chrome DevRel, "Native Undo & Redo for the Web" (Sam Thorogood, 2018-04-23) — https://dev.to/chromiumdev/-native-undo--redo-for-the-web-3fl3 | 2026-08-28 | Programmatic set "doesn't generate an undoable event"; field-scoped undo (`display:none` removes field from stack); mobile Safari shake fires undo |
| 7 | Chromium issue 40626763 "Undo stack should not leak unreachable input elements" — https://issues.chromium.org/40626763 | 2026-08-28 | Blink undo entries are element-scoped, reference removed nodes, never transfer |
| 8 | WebKit bug 145075 (2015-05-15) — https://bugs.webkit.org/show_bug.cgi?id=145075 | 2026-08-28 | WebKit textarea undo survives unrelated DOM changes (and is fragile to iframe mutation); Chrome/Firefox keep field undo too |
| 9 | W3C Input Events Level 2 — https://www.w3.org/TR/input-events-2/ | 2026-08-28 | `historyUndo`/`historyRedo` defined; `beforeinput` cancelable except within IME composition |
| 10 | MDN Element: beforeinput event — https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event | 2026-08-28 | Baseline since 2021-03 (Fx 87); Safari 10.1+; may not fire / be cancelable for IME/autofill; Safari form-field reliability caveat (ce-0043, React #11211) |
| 11 | MDN Document.execCommand — https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand | 2026-08-28 | Deprecated; execCommand edits "preserve the undo buffer" — must NOT be used for T4 |
| 12 | Undo-manager spec history — https://dvcs.w3.org/hg/undomanager/raw-file/tip/undomanager.html, https://rniwa.github.io/undo-api/, Mozilla bug 617532 | 2026-08-28 | HTML undo-manager section removed; successor proposals unimplemented — no standardized undo API to lean on |
| 13 | iOS shake-to-undo (Apple discussions; Bear community thread) — https://discussions.apple.com/thread/253775275, https://community.bear.app/t/shake-to-undo-not-working-with-edge-on-iphone/15290 | 2026-08-28 | Shake-to-undo active in iOS Safari/Chrome (WebKit); Android lacks a consistent undo gesture |

## Tradeoffs, risks, confidence

- **Doc-established, high confidence:** Chrome wipes on value-set (#5, #6); Firefox wipes on value-set (#4); Safari preserves on value-set (#2, #3 — source history plus a live regression test); `execCommand` preserves undo (#11); `historyUndo` is cancelable outside composition (#9); spec silence on undo semantics (#1).
- **Reasoned, high confidence:** node replacement defeats native undo in all three engines (element-scoped undo state per #6, #7, #8; fresh node = empty history; detached node unreachable). Not single-sentence documented — it is architecture + converging bug evidence.
- **Reasoned, medium confidence:** exact restoration depth of Safari Cmd+Z after `value=''` (field reports, not a controlled matrix — no browser available in this harness for a live spike); whether current Safari fires `beforeinput` `historyUndo` on form fields (historically unreliable — hence interceptor is layer 2, never load-bearing).
- **Reasoned, medium:** mid-composition deletion quirks; mitigated by blur-then-clear-then-replace ordering and node removal killing the composition host.
- **Residual risk:** an engine could conceivably scope field-undo per *document* rather than per element in some future version; the interceptor + focus-move to RE-ARM (T10/T12) + T13 manual verification are the tripwires. jsdom cannot execute native undo, so "not resurrectable via undo (verified in tests)" is satisfied at the strategy level in unit tests and at the behavioral level in T13's protocol — this split should be stated honestly in the production log.
- **Cost:** negligible — a handful of lines in the deletion path plus one capture-phase listener; no runtime cost during normal typing.

## Implementation consequences & plan updates

- **T4 (permanence guard):** implement the 5-step deletion sequence (blur → `value=''` → `defaultValue=''` → replace/detach node → drop refs; no storage write) plus the deleted-phase `historyUndo`/`historyRedo` interceptor. Acceptance additions: `textContent` scrub asserted; `defaultPrevented` on dispatched history events; old node `isConnected === false`. Note in the task that jsdom cannot run native undo — T13 owns the physical check.
- **T9 (write surface):** expose a teardown seam the engine can drive — e.g., a surface handle with `getElement()` / `onTextChange()` / `destroy()` where `destroy()` returns the dead node for replacement, and RE-ARM always mounts a **new** surface instance rather than reusing the old element. Do not place the editor inside a `<form>`; do not cache the draft string anywhere outside the engine's live buffer.
- **T10 (deleted beat):** mounts SIGNAL LOST over the removed editor and focuses RE-ARM immediately — this is also permanence sequencing (no editable target for menu/gesture undo). One deliberate beat; no flash-of-content (already specified).
- **T13 (manual protocol addition):** after deletion, attempt Cmd/Ctrl+Z, Edit-menu Undo, iOS shake-to-undo, Android long-press toolbar Undo in Chrome/Firefox/Safari — assert no resurrection; record per-browser results in production-log.
- **Plan.md impact:** none structural; T4's scope line ("editor node replacement strategy per R3") is validated and now specified. No reopened decisions.

## Decision

- **Priority:** P0 (gate for T4; T4 gates M1).
- **Status:** committed pending synthesis.

## Delegation record

- Researched by the research track subagent for `deep-research-supreme`, 2026-08-28, per plan.md research queue item R3. Primary sources consulted: WHATWG HTML LS, W3C Input Events Level 2, MDN (beforeinput, inputType, execCommand), WebKit Bugzilla + Trac + current layout tests, Mozilla Bugzilla, Chromium issue tracker, Chrome DevRel. No live browser was available in the harness; all behavioral claims are doc/source-based with confidence flags above.
