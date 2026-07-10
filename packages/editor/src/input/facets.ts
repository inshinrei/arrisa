/**
 * Input-related editor facets: DOM handlers/observers, mouse selection style,
 * drag/paste overrides, and the focus-change transaction annotation.
 */
import {EditorState, Transaction} from "@arrisa/state"
import type {Slice, Plot} from "@arrisa/doc"
import type {Arrisa} from "../editor"

/** DOM handlers that may preventDefault when they return true. */
export const eventHandler = EditorState.Facet.define<
    {event: string; handler: (event: Event, editor: Arrisa) => boolean | void},
    Record<string, ((event: Event, editor: Arrisa) => boolean | void)[]>
>({
    combine: (handlers) => {
        let result: Record<string, ((event: Event, editor: Arrisa) => boolean | void)[]> = Object.create(null)
        for (let {event, handler} of handlers) (result[event] || (result[event] = [])).push(handler)
        return result
    },
})

/** DOM observers that always run and never claim exclusive handling. */
export const eventObserver = EditorState.Facet.define<
    {event: string; observer: (event: Event, editor: Arrisa) => void},
    Record<string, ((event: Event, editor: Arrisa) => void)[]>
>({
    combine: (observers) => {
        let result: Record<string, ((event: Event, editor: Arrisa) => void)[]> = Object.create(null)
        for (let {event, observer} of observers) (result[event] || (result[event] = [])).push(observer)
        return result
    },
})

/** Key codes treated as pure modifiers (shift/ctrl/alt/meta/caps). */
export const modifierCodes = [16, 17, 18, 20, 91, 92, 224, 225]

/** Custom mouse-selection strategies (click/drag). First non-null wins. */
export const mouseSelectionStyle = EditorState.Facet.define<MakeSelectionStyle>()

export type MakeSelectionStyle = (editor: Arrisa, event: MouseEvent) => Arrisa.MouseSelectionStyle | null

/** Predicate: true when a drag should *move* rather than copy the selection. */
export const dragBehavior = EditorState.Facet.define<(event: MouseEvent) => boolean>()

/** Override default drop insertion. Returning true means the handler handled it. */
export const dropHandler =
    EditorState.Facet.define<
        (
            editor: Arrisa,
            event: DragEvent,
            pos: number,
            move: {from: number; to: number} | null,
            slice: Slice,
            context: readonly Plot.Tag[],
        ) => boolean
    >()

/** Override default paste. Returning true means the handler handled it. */
export const pasteHandler =
    EditorState.Facet.define<
        (editor: Arrisa, event: ClipboardEvent, slice: Slice, context: readonly Plot.Tag[]) => boolean
    >()

/** Annotation on transactions created because focus entered or left the editor. */
export const isFocusChange = Transaction.Annotation.define<boolean>()
