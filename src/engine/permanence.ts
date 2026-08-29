/**
 * Permanence guard for The Disappearing Draft (plan task T4).
 *
 * Deletion must be truly unrecoverable: no storage write on the deletion
 * path, the draft string gone from live memory, and native undo (keyboard,
 * edit-menu, shake/toolbar gesture) unable to resurrect it. The strategy is
 * R3's committed layered sequence (docs/ultron/research/R3-undo-defeat.md,
 * Option B + E, committed 2026-08-28) — each layer numbered below:
 *
 * 1. **blur** — deterministically ends any in-flight IME composition (its
 *    `beforeinput` events are the one non-cancelable class) and drops the
 *    undo target BEFORE any value mutation. Blurring a non-focused editor
 *    is a no-op, so the call is unconditional.
 * 2. **`value = ''`** — the API-value scrub. Chrome/Blink and Firefox/Gecko
 *    wipe the field's undo stack on a programmatic value set (Chromium
 *    issue 40656690; Bugzilla 1523270, closed intentional), so this alone
 *    is permanent there — but Safari/WebKit deliberately PRESERVES the undo
 *    stack across programmatic sets (bug 61340 / r87204 removed the clear,
 *    still enforced by a live WebKit layout test), so it is never enough.
 * 3. **`defaultValue = ''`** — string-replaces the textarea's CHILD TEXT
 *    nodes. Raw value and child text are separate spec state: `el.value=''`
 *    leaves the draft in the DOM children, where a `form.reset()` (or any
 *    dirty-flag loss) would restore it. This closes that vector. The
 *    editor is additionally never wrapped in a `<form>` (router guarantee,
 *    asserted in tests), but the scrub kills the vector regardless.
 * 4. **node replacement (LOAD-BEARING)** — the only cross-engine guarantee.
 *    All three engines bind text-control undo state to the element
 *    instance (Blink per-element entries, Gecko per-field transaction
 *    manager, WebKit typing commands against the control's inner editor).
 *    The old node is DETACHED — never hidden — so it is unfocusable and
 *    unreachable by menu/gesture/keyboard undo; T10's board mounts in its
 *    place and RE-ARM always mounts a FRESH editor with an empty undo
 *    history (T5's router seam). `execCommand` is never used here: it
 *    deliberately preserves the undo buffer — the exact opposite of T4.
 * 5. **historyUndo/historyRedo interceptor (defense in depth)** — a
 *    CAPTURE-phase `beforeinput` listener on the console mount that
 *    `preventDefault()`s undo/redo `inputType`s, armed only while the
 *    deleted board is showing (deletion → RE-ARM). Chrome 60+/Firefox 87+
 *    fire these cancelably; Safari's form-field `beforeinput` is
 *    historically unreliable — which is exactly why this layer is
 *    insurance and layer 4 is the guarantee.
 *
 * Memory hygiene: after `destroyEditor` the node's only string holders
 * (`value`, `defaultValue`/child text) are empty and the node is detached;
 * callers drop their element references (the router nulls `writeRefs` and
 * the controller in `teardownSession`), leaving the draft GC-eligible. No
 * `localStorage` write happens anywhere on this path — the archive is
 * written only at disarm (`survived`), never on deletion.
 *
 * jsdom implements no native undo, so tests here prove the DOM-level
 * SEQUENCE (blur → value/defaultValue scrub → node detached → interceptor
 * armed); the physical per-browser undo attempts (Cmd/Ctrl+Z, Edit-menu
 * Undo, iOS shake, Android long-press toolbar) belong to T13's manual
 * protocol, recorded in docs/ultron/production-log.md.
 */

/**
 * The two `beforeinput` `inputType`s that replay native editing history
 * (Input Events Level 2). Cancelable except inside an IME composition —
 * which layer 1 (blur) has already terminated by the time the interceptor
 * is armed.
 */
export type HistoryInputType = 'historyUndo' | 'historyRedo'

const HISTORY_INPUT_TYPES: ReadonlySet<string> = new Set<HistoryInputType>(['historyUndo', 'historyRedo'])

/** Pure classifier: is this `beforeinput` `inputType` a native history replay? */
export function isHistoryInputType(inputType: string | undefined): boolean {
  return inputType !== undefined && HISTORY_INPUT_TYPES.has(inputType)
}

export interface PermanenceDeps {
  /**
   * The console mount — the interceptor's capture-phase home. It must
   * OUTLIVE screen swaps (the deleted board renders inside it); attaching
   * to the write screen's own node would bind the listener to a node that
   * deletion removes.
   */
  root: HTMLElement
}

export interface PermanenceGuard {
  /**
   * The R3 deletion sequence on one editor: blur → `value=''` →
   * `defaultValue=''` → detach the node. Idempotent — safe on an
   * already-scrubbed/detached editor. Must run BEFORE the caller drops its
   * editor reference (the router calls it ahead of controller teardown and
   * the deleted board render).
   */
  destroyEditor(editor: HTMLTextAreaElement): void
  /** Arm the deleted-phase undo interceptor (capture; idempotent). */
  armUndoInterceptor(): void
  /** Disarm it — RE-ARM / fresh session / router teardown (idempotent). */
  disarmUndoInterceptor(): void
  /** True while the interceptor is armed (must be the deleted phase only). */
  isUndoInterceptorArmed(): boolean
}

class Guard implements PermanenceGuard {
  private readonly root: HTMLElement

  private armed = false

  /**
   * Capture-phase: reaches `beforeinput` dispatched at any descendant
   * before the target's own listeners, and still sees NON-BUBBLING
   * dispatches (the property the tests use to prove the capture flag).
   */
  private readonly onBeforeInput = (event: Event): void => {
    if (isHistoryInputType((event as InputEvent).inputType)) event.preventDefault()
  }

  constructor(deps: PermanenceDeps) {
    this.root = deps.root
  }

  destroyEditor(editor: HTMLTextAreaElement): void {
    // 1. Blur while the field is still live: force-commits/cancels any open
    //    IME composition and moves focus off the undo target.
    editor.blur()

    // 2. API-value scrub (sufficient on Chrome/Firefox; not on Safari).
    editor.value = ''

    // 3. Child-text scrub — the form.reset()/dirty-flag resurrection vector.
    editor.defaultValue = ''

    // 4. Detach the node (REPLACE/DETACH — never hide). The per-element undo
    //    state dies with the node's reachability; T10's board mounts here and
    //    RE-ARM always mounts a fresh editor.
    editor.remove()
  }

  armUndoInterceptor(): void {
    if (this.armed) return
    this.armed = true
    this.root.addEventListener('beforeinput', this.onBeforeInput, true)
  }

  disarmUndoInterceptor(): void {
    if (!this.armed) return
    this.armed = false
    this.root.removeEventListener('beforeinput', this.onBeforeInput, true)
  }

  isUndoInterceptorArmed(): boolean {
    return this.armed
  }
}

export function createPermanenceGuard(deps: PermanenceDeps): PermanenceGuard {
  return new Guard(deps)
}
