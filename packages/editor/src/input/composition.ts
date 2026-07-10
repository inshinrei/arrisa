/**
 * IME composition lifecycle helpers: start/update/end, composition range
 * info for DOM reconciliation, and deferred focus-change transactions.
 */
import {EditorSelection} from "@arrisa/state"
import type {Mark} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import type {DOMNode} from "../dom"
import {eqArray} from "../util"
import {isFocusChange} from "./facets"

const LOG_input = false

export type CompositionInfo = {
    fromB: number
    toB: number
    text: string
    target: Text | null
    wrapCursor?: Mark.Set | null
}

export function getCompositionInfo(editor: Arrisa): CompositionInfo | null {
    let wrap = editor.inputState.wrappingComposition
    if (wrap) {
        let sel = editor.state.selection.head
        return {
            fromB: sel,
            toB: sel,
            text: "",
            target: null,
            wrapCursor: wrap,
        }
    }

    let comp = editor.inputState.findComposition()
    if (!comp) return null
    let value = comp.target.nodeValue!
    return {
        fromB: comp.targetPos,
        toB: comp.targetPos + value.length,
        text: value,
        target: comp.target,
    }
}

export function findCompositionSelection(node: DOMNode, offset: number, target: Text, targetPos: number) {
    if (node == target) return targetPos + offset
    if (node.compareDocumentPosition(target) & 2 /* preceding */) return targetPos + target.nodeValue!.length
    return targetPos
}

export function compositionEnd(editor: Arrisa) {
    let comp = editor.inputState.composing
    editor.inputState.composing = null
    editor.inputState.compositionEndedAt = Date.now()
    if (comp && comp.target) {
        editor.observer.addDirtyRange(comp.targetPos, comp.targetPos + comp.target.nodeValue!.length)
        editor.flush()
    }
}

export function compositionUpdate(editor: Arrisa, event: CompositionEvent) {
    LOG_input && console.log(event.type, !!editor.inputState.composing)
    if (!editor.inputState.composing) {
        editor.inputState.composing = {changes: 0, target: null, targetPos: 0}

        let wrap: Mark.Set | null = null
        if (!editor.inputState.composing.changes && !event.data) {
            let sel = editor.state.selection,
                rSel = editor.state.sel
            if (
                sel.empty &&
                ((sel instanceof EditorSelection.Text && sel.marks) || (!rSel.head.inText && rSel.head.index)) &&
                !eqArray(rSel.head.nodeBefore?.tag.marks, rSel.activeMarks)
            )
                wrap = rSel.activeMarks
        }

        if (wrap)
            try {
                editor.inputState.wrappingComposition = wrap
                editor.flush()
            } finally {
                editor.inputState.wrappingComposition = null
            }
    }
}

export function updateForFocusChange(editor: Arrisa) {
    setTimeout(() => {
        if (editor.hasFocus != editor.inputState.notifiedFocused) {
            editor.inputState.notifiedFocused = editor.hasFocus
            editor.dispatch({annotations: isFocusChange.of(editor.hasFocus)})
        }
    }, 10)
}
