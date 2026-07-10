/**
 * Shared view-layer helpers used across editor modules.
 *
 * - {@link eqArray} — structural equality for arrays of `.eq`-able values
 * - {@link exceptionSink} / {@link logException} — report errors from extension
 *   code without hard-crashing the editor
 */
import {EditorState} from "@arrisa/state"

/**
 * Deep equality for arrays of values that implement `.eq`.
 * Treats `null`/`undefined` as equal only to the same nullish value.
 */
export function eqArray<T extends {eq(b: T): boolean}>(a?: readonly T[] | null, b?: readonly T[] | null) {
    if (!a || !b) return a == b
    if (a == b) return true
    if (a.length != b.length) return false
    for (let i = 0; i < a.length; i++) if (!a[i].eq(b[i])) return false
    return true
}

/**
 * Facet for a custom exception handler. When set, {@link logException} calls
 * the highest-precedence handler instead of `window.onerror` / `console`.
 */
export const exceptionSink = EditorState.Facet.define<(exception: any) => void>()

/**
 * Report an exception from extension code.
 * Precedence: facet handler → `window.onerror` → `console.error` (with optional context).
 */
export function logException(state: EditorState, exception: any, context?: string) {
    let handler = state.facet(exceptionSink)
    if (handler.length) handler[0](exception)
    else if (typeof window != "undefined" && window.onerror)
        window.onerror(String(exception), context, undefined, undefined, exception)
    else if (context) console.error(context + ":", exception)
    else console.error(exception)
}
