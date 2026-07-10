/**
 * Command protocol: pure and view-backed editing actions, optional handlers,
 * and dispatch against a {@link Arrisa} target.
 *
 * **Pure vs view commands**
 * - {@link Command.Pure} only needs `{state}` and returns a {@link Transaction.Spec}
 *   (or `false` when inapplicable). Callers apply the result themselves.
 * - Full {@link Command} may use view APIs (line geometry, DOM metrics) and may
 *   return a boolean or a transaction spec.
 *
 * **Handlers** — extensions can register overrides via {@link Command.handler}.
 * The first handler that returns a truthy result wins; otherwise the command
 * body runs.
 */
import {EditorSelection, EditorState, type Transaction} from "@arrisa/state"

/**
 * Minimal view surface required by view-dependent commands and menu controls.
 * The full editor view implements this; tests can supply a lightweight mock.
 */
export interface Arrisa {
    readonly state: EditorState

    dispatch(...specs: Transaction.Spec[]): void

    moveToLineBoundary(sel: EditorSelection, forward: boolean): EditorSelection.Text | null

    moveVertically(
        sel: EditorSelection,
        forward: boolean,
        distance?: number,
        allowNode?: boolean,
    ): EditorSelection | null

    readonly scrollDOM: {readonly clientHeight: number}

    readonly dom: {readonly ownerDocument: Document}
}

export namespace Arrisa {
    /**
     * Covered chrome around the scroll viewport (toolbars, panels, gutters).
     * Used by page-step motion and by the editor when scrolling into view.
     * Defined once here so command and editor share a single Facet identity.
     */
    export type CoveredMargins = {top?: number; bottom?: number; left?: number; right?: number}

    export const coveredMargins = EditorState.Facet.define<(editor: Arrisa) => CoveredMargins | null>()
}

/** Handler map: command identity → ordered list of override handlers. */
const commandHandler = EditorState.Facet.define<
    [Command<any>, Command<any>],
    Map<Command<any>, readonly Command<any>[]>
>({
    combine(handlers) {
        let map = new Map<Command<any>, Command<any>[]>()
        for (let [cmd, handler] of handlers) {
            let list = map.get(cmd)
            if (!list) map.set(cmd, (list = []))
            list.push(handler)
        }
        return map
    },
})

/**
 * A command invoked with a view target and parameter.
 * Returns `false`/`true` when the action is done without a further transaction,
 * or a {@link Transaction.Spec} for the caller / {@link Command.dispatch} to apply.
 */
export type Command<Param = null> = (target: Arrisa, param: Param) => boolean | Transaction.Spec

export namespace Command {
    /**
     * State-only command: no view APIs. Returns a transaction spec or `false`.
     * Assignable where a full {@link Command} is expected when only `state` is used.
     */
    export type Pure<Param = null> = (target: {state: EditorState}, param: Param) => false | Transaction.Spec

    /** Register an override handler for `command` (first success wins). */
    export function handler<Param>(command: Command<Param>, handler: Command<Param>): EditorState.Extension {
        return commandHandler.of([command, handler] as [Command<any>, Command<any>])
    }

    /** Bind a command to a fixed parameter for menus / keymaps. */
    export function bind<Param>(command: Command<Param>, param: Param): Command.Bound {
        return {command, param} as Command.Bound
    }

    /** Opaque bound command + parameter (structural match only). */
    export type Bound = {
        readonly tag: unique symbol
        readonly command: Command<any>
        readonly param: any
    }

    export function dispatch(editor: Arrisa, command: Command<null> | Command.Bound): boolean
    export function dispatch<Param>(editor: Arrisa, command: Command<Param>, param: Param): boolean
    export function dispatch<Param>(editor: Arrisa, command: Command<any> | Command.Bound, p?: Param): boolean {
        let {command: cmd, param} = typeof command == "object" ? command : {command, param: p ?? null}
        let handlers = editor.state.facet(commandHandler).get(cmd)
        if (handlers)
            for (let handler of handlers) {
                let result = handler(editor, param)
                if (result) {
                    if (typeof result != "boolean") editor.dispatch(result)
                    return true
                }
            }
        let result = cmd(editor, param)
        if (typeof result != "boolean") editor.dispatch(result)
        return !!result
    }
}
