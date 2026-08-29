// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPermanenceGuard, isHistoryInputType } from './permanence'

// T4 acceptance as jsdom-strategy tests (R3: jsdom runs no native undo —
// these prove the DOM-level SEQUENCE and the interceptor's phase behavior;
// the physical per-browser undo attempts are T13's manual protocol).

// ---------------------------------------------------------------------------
// Instrumentation: record the ORDER of the sequence's mutations on one
// editor instance (own-property accessor shadows + method spies — instance
// level only, so nothing leaks across tests).
// ---------------------------------------------------------------------------

function instrumentEditor(editor: HTMLTextAreaElement, order: string[]): void {
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!
  Object.defineProperty(editor, 'value', {
    configurable: true,
    get: () => valueDesc.get!.call(editor),
    set: (next: string) => {
      order.push('value')
      valueDesc.set!.call(editor, next)
    },
  })
  const defaultDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'defaultValue')!
  Object.defineProperty(editor, 'defaultValue', {
    configurable: true,
    get: () => defaultDesc.get!.call(editor),
    set: (next: string) => {
      order.push('defaultValue')
      defaultDesc.set!.call(editor, next)
    },
  })
  const realBlur = editor.blur.bind(editor)
  vi.spyOn(editor, 'blur').mockImplementation(() => {
    order.push('blur')
    realBlur()
  })
  const realRemove = editor.remove.bind(editor)
  vi.spyOn(editor, 'remove').mockImplementation(() => {
    order.push('remove')
    realRemove()
  })
}

function mountRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.append(root)
  return root
}

/** A cancelable beforeinput with the given inputType, dispatched at `target`. */
function historyBeforeinput(target: HTMLElement, inputType: string, bubbles: boolean): InputEvent {
  const event = new InputEvent('beforeinput', { cancelable: true, bubbles, inputType })
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// isHistoryInputType (pure).
// ---------------------------------------------------------------------------

describe('isHistoryInputType', () => {
  it('classifies exactly the two history inputTypes', () => {
    expect(isHistoryInputType('historyUndo')).toBe(true)
    expect(isHistoryInputType('historyRedo')).toBe(true)
    for (const other of ['insertText', 'insertFromPaste', 'deleteContentBackward', 'insertCompositionText', '', undefined]) {
      expect(isHistoryInputType(other), String(other)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// destroyEditor — the R3 deletion sequence.
// ---------------------------------------------------------------------------

describe('destroyEditor (R3 sequence)', () => {
  it('performs blur → value scrub → defaultValue scrub → node detach, in exactly that order', () => {
    const root = mountRoot()
    const guard = createPermanenceGuard({ root })
    const editor = document.createElement('textarea')
    root.append(editor)
    editor.focus()
    const order: string[] = []
    instrumentEditor(editor, order)

    guard.destroyEditor(editor)

    expect(order).toEqual(['blur', 'value', 'defaultValue', 'remove'])
  })

  it('drops focus: the editor is not the active element after deletion', () => {
    const root = mountRoot()
    const guard = createPermanenceGuard({ root })
    const editor = document.createElement('textarea')
    root.append(editor)
    editor.focus()
    expect(document.activeElement).toBe(editor)

    guard.destroyEditor(editor)

    expect(document.activeElement).not.toBe(editor)
  })

  it('scrubs BOTH value stores and detaches the node (child-text/form.reset vector dead)', () => {
    const root = mountRoot()
    const guard = createPermanenceGuard({ root })
    const editor = document.createElement('textarea')

    // Seed the resurrection vector for real: defaultValue is the child-text
    // store (a textarea parsed with initial content looks exactly like this),
    // then typing sets the dirty API value — after which BOTH stores hold
    // the draft (jsdom implements the spec's two-store split faithfully).
    editor.defaultValue = 'the draft that must die'
    editor.textContent = 'the draft that must die'
    root.append(editor)
    editor.value = 'the draft that must die, edited further'
    expect(editor.textContent).toBe('the draft that must die') // vector present pre-scrub

    // Pin the vector this closes: value='' alone LEAVES the child text.
    editor.value = ''
    expect(editor.textContent).toBe('the draft that must die')

    guard.destroyEditor(editor)

    expect(editor.value).toBe('')
    expect(editor.defaultValue).toBe('')
    expect(editor.textContent).toBe('')
    expect(editor.isConnected).toBe(false)
    expect(root.contains(editor)).toBe(false)
  })

  it('is idempotent — a second call on the dead editor is a harmless no-op', () => {
    const guard = createPermanenceGuard({ root: mountRoot() })
    const editor = document.createElement('textarea')
    editor.value = 'x'
    guard.destroyEditor(editor)
    expect(() => guard.destroyEditor(editor)).not.toThrow()
    expect(editor.value).toBe('')
    expect(editor.isConnected).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The deleted-phase undo interceptor.
// ---------------------------------------------------------------------------

describe('undo interceptor (deleted-phase only, capture)', () => {
  it('starts disarmed; while armed it preventDefaults historyUndo/historyRedo reaching it in capture', () => {
    const root = mountRoot()
    const board = document.createElement('section')
    const button = document.createElement('button')
    board.append(button)
    root.append(board)
    const guard = createPermanenceGuard({ root })
    expect(guard.isUndoInterceptorArmed()).toBe(false)

    // Not armed → history beforeinput passes through untouched.
    expect(historyBeforeinput(board, 'historyUndo', true).defaultPrevented).toBe(false)

    guard.armUndoInterceptor()
    expect(guard.isUndoInterceptorArmed()).toBe(true)

    // Bubbling dispatch at the deleted board (button inside the section).
    expect(historyBeforeinput(button, 'historyUndo', true).defaultPrevented).toBe(true)
    expect(historyBeforeinput(button, 'historyRedo', true).defaultPrevented).toBe(true)
    // Dispatch at the root itself (at-target).
    expect(historyBeforeinput(root, 'historyUndo', true).defaultPrevented).toBe(true)
    // NON-BUBBLING dispatch still intercepted — only a CAPTURE-phase listener
    // on an ancestor can see this, which pins the capture flag.
    expect(historyBeforeinput(button, 'historyUndo', false).defaultPrevented).toBe(true)

    guard.disarmUndoInterceptor()
    expect(guard.isUndoInterceptorArmed()).toBe(false)
    expect(historyBeforeinput(button, 'historyUndo', true).defaultPrevented).toBe(false)
  })

  it('never touches non-history inputTypes — normal editing is never blocked', () => {
    const root = mountRoot()
    const editor = document.createElement('textarea')
    root.append(editor)
    const guard = createPermanenceGuard({ root })
    guard.armUndoInterceptor()

    for (const inputType of ['insertText', 'insertFromPaste', 'insertCompositionText', 'deleteContentBackward', 'deleteByCut']) {
      expect(historyBeforeinput(editor, inputType, true).defaultPrevented, inputType).toBe(false)
    }
  })

  it('arm/disarm are idempotent — double-arm leaves exactly one removable listener', () => {
    const root = mountRoot()
    const board = document.createElement('section')
    root.append(board)
    const guard = createPermanenceGuard({ root })

    guard.armUndoInterceptor()
    guard.armUndoInterceptor()
    guard.disarmUndoInterceptor() // must remove the listener completely
    expect(guard.isUndoInterceptorArmed()).toBe(false)
    expect(historyBeforeinput(board, 'historyUndo', true).defaultPrevented).toBe(false)

    guard.disarmUndoInterceptor() // disarming again is a no-op
    guard.armUndoInterceptor() // and re-arming works afterwards
    expect(historyBeforeinput(board, 'historyRedo', true).defaultPrevented).toBe(true)
  })
})
