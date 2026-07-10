/**
 * Test helpers for high-level command and menu unit tests (not public API).
 */
import {type EditorState, type Transaction} from "@arrisa/state"
import {type Command, type Arrisa} from "./command"
import {apply} from "./util/test-helpers"

export {apply, para, run, stateFromBlocks, testSchema} from "./util/test-helpers"

/** Run a pure command and apply its transaction when present. */
export function runPure<Param = null>(
    state: EditorState,
    cmd: Command.Pure<Param>,
    ...args: Param extends null ? [] : [Param]
) {
    let param = (args.length ? args[0] : null) as Param
    let spec = cmd({state}, param)
    if (!spec) return {state, applied: false as const, spec: false as const}
    return {state: apply(state, spec), applied: true as const, spec}
}

/** Minimal Arrisa mock; override view methods as needed per test. */
export function mockArrisa(
    state: EditorState,
    overrides: Partial<Arrisa> & {
        moveToLineBoundary?: Arrisa["moveToLineBoundary"]
        moveVertically?: Arrisa["moveVertically"]
    } = {},
): Arrisa & {dispatched: Transaction.Spec[]} {
    let dispatched: Transaction.Spec[] = []
    let current = state
    let editor: Arrisa & {dispatched: Transaction.Spec[]} = {
        get state() {
            return current
        },
        dispatched,
        dispatch(...specs) {
            for (let s of specs) {
                dispatched.push(s)
                current = apply(current, s)
            }
        },
        moveToLineBoundary: () => null,
        moveVertically: () => null,
        scrollDOM: {clientHeight: 400},
        dom: {
            ownerDocument: {
                defaultView: {innerHeight: 800} as Window,
            } as Document,
        },
        ...overrides,
    }
    return editor
}
