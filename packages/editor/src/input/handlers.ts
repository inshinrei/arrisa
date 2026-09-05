/**
 * Built-in DOM event handlers/observers: keyboard, mouse, clipboard,
 * drag/drop, beforeinput/input (including IME composition text), and focus.
 */
import {
    Command,
    insertText,
    insertLineBreak,
    enter,
    deleteUnit,
    deleteWord,
    deleteToLineEnd,
    deleteLine,
    setAlignment,
    setDirection,
    undo,
    redo,
    transposeChars,
    toggleStrong,
    toggleEmphasis,
    toggleUnderline,
    deleteSelection,
} from "@arrisa/command"
import {ChangeSet, Slice, Leaf} from "@arrisa/doc"
import {EditorState, EditorSelection} from "@arrisa/state"
import type {Arrisa} from "../editor"
import browser from "../browser"
import {KeyBinding} from "../key-map"
import {readClipboard, writeClipboard} from "../clipboard"
import {
    mouseSelectionStyle,
    dropHandler,
    pasteHandler,
} from "./facets"
import {dragMovesSelection, basicMouseSelection, MouseSelection} from "./mouse"
import {
    compositionEnd,
    compositionUpdate,
    findCompositionSelection,
    updateForFocusChange,
} from "./composition"

const LOG_input = false

export const inputTypeCommands: {[inputType: string]: Command.Bound | Command} = {
    historyUndo: undo,
    historyRedo: redo,
    insertLineBreak: insertLineBreak,
    insertParagraph: enter,
    deleteContentBackward: Command.bind(deleteUnit, "backward"),
    deleteContentForward: Command.bind(deleteUnit, "forward"),
    deleteWordBackward: Command.bind(deleteWord, "backward"),
    deleteWordForward: Command.bind(deleteWord, "forward"),
    deleteSoftLineBackward: Command.bind(deleteToLineEnd, "backward"),
    deleteSoftLineForward: Command.bind(deleteToLineEnd, "forward"),
    deleteHardLineBackward: Command.bind(deleteToLineEnd, "backward"),
    deleteHardLineForward: Command.bind(deleteToLineEnd, "forward"),
    deleteContent: (editor) => {
        let tr = deleteSelection(editor.state)
        if (tr) editor.dispatch(tr)
        return !!tr
    },
    insertTranspose: transposeChars,
    deleteEntireSoftLine: deleteLine,
    formatBold: toggleStrong,
    formatItalic: toggleEmphasis,
    formatUnderline: toggleUnderline,
    formatJustifyCenter: Command.bind(setAlignment, "center"),
    formatJustifyLeft: Command.bind(setAlignment, "left"),
    formatJustifyRight: Command.bind(setAlignment, "right"),
}

export function inputEventRange(event: InputEvent, editor: Arrisa, preferSel = false) {
    let range = event.getTargetRanges()[0]
    // Some browsers / synthetic paths omit target ranges; fall back to selection
    // so beforeinput insertText does not throw and leave the widget unhandled.
    if (!range) {
        let {from, to} = editor.state.selection
        return {from, to}
    }
    let from = editor.docTile.posFromDOM(range.startContainer, range.startOffset, -1)
    let to = range.collapsed ? from : editor.docTile.posFromDOM(range.endContainer, range.endOffset, 1)
    let {pending} = editor.viewState
    if (pending.length) {
        let comp = editor.inputState.composing
        if (preferSel && !comp && from == to) {
            let fromMin = editor.viewState.mapPosPending(from, -1),
                fromMax = editor.viewState.mapPosPending(from, 1)
            if (fromMin <= editor.state.selection.from && fromMax >= editor.state.selection.to) return editor.state.selection
        }
        if (comp && comp.target == range.startContainer) from = comp.targetPos + range.startOffset
        else from = editor.viewState.mapPosPending(from, 1)
        if (comp && comp.target == range.endContainer) to = comp.targetPos + range.endOffset
        else to = editor.viewState.mapPosPending(to, 1)
    }
    return {from, to}
}


export function selectionSlice(state: EditorState) {
    let {selection, doc} = state
    let slice = doc.slice(selection.from, selection.to)
    // Context path reconstruction deferred (Pos API surface incomplete for .path)
    void selection
    let context: readonly any[] = []
    return {slice, context}
}

export function copy(editor: Arrisa, event: ClipboardEvent) {
    let {state} = editor
    let {slice, context} = selectionSlice(state)
    if (event.clipboardData) writeClipboard(state, slice, context, event.clipboardData)
    if (event.type == "cut" && !state.readOnly && !state.selection.empty) {
        editor.dispatch({
            changes: {from: state.selection.from, to: state.selection.to, fit: true},
            userEvent: "delete.cut",
        })
    }
    return true
}

export const baseHandlers: {[e in keyof HTMLElementEventMap]?: (editor: Arrisa, event: HTMLElementEventMap[e]) => boolean} = {
    keydown(editor, event) {
        return KeyBinding.runScopeHandlers(editor, event, "editor")
    },

    mousedown(editor, event) {
        editor.inputState.shiftKey = event.shiftKey
        if (editor.inputState.lastTouchTime > Date.now() - 500) return false
        let style: Arrisa.MouseSelectionStyle | null = null
        for (let makeStyle of editor.state.facet(mouseSelectionStyle)) {
            style = makeStyle(editor, event)
            if (style) break
        }
        if (!style && event.button == 0) style = basicMouseSelection(editor, event)
        if (style) {
            let mustFocus = !editor.hasFocus
            editor.inputState.startMouseSelection(new MouseSelection(editor, event, style, mustFocus))
            if (mustFocus)
                editor.observer.ignore(() => {
                    editor.contentDOM.focus({preventScroll: true})
                    let active = editor.root.activeElement
                    if (active && !active.contains(editor.contentDOM)) (active as HTMLElement).blur()
                })
            let mouseSel = editor.inputState.mouseSelection
            if (mouseSel) {
                mouseSel.start(event)
                return mouseSel.dragging === false
            }
        }
        return false
    },

    dragstart(editor, event) {
        let {selection} = editor.state
        let {inputState} = editor
        if (inputState.mouseSelection) inputState.mouseSelection.dragging = true
        inputState.draggedContent = selection

        if (event.dataTransfer) {
            let {slice, context} = selectionSlice(editor.state)
            writeClipboard(editor.state, slice, context, event.dataTransfer)
            event.dataTransfer.effectAllowed = "copyMove"
        }
        return false
    },

    dragend(editor) {
        editor.inputState.draggedContent = null
        return false
    },

    copy,
    cut: copy,

    drop(editor, event) {
        if (!event.dataTransfer || editor.state.readOnly) return true
        let content = readClipboard(editor.state, event.dataTransfer, editor.state.sel.head, false)
        if (!content) return false

        let dropPos = editor.posAtCoords({x: event.clientX, y: event.clientY}).pos
        let {draggedContent} = editor.inputState
        let del =
            draggedContent && dragMovesSelection(editor, event) ? {from: draggedContent.from, to: draggedContent.to} : null
        if (editor.state.facet(dropHandler).some((f) => f(editor, event, dropPos, del, content.slice, content.context)))
            return true
        let ins = {from: dropPos, insert: content.slice, fit: content.context}
        let changes = ChangeSet.create(editor.state.doc, del ? [del, ins] : ins)
        editor.focus()
        editor.dispatch({
            changes,
            selection: EditorSelection.range(changes.mapPos(dropPos, -1), changes.mapPos(dropPos, 1)),
            userEvent: del ? "move.drop" : "input.drop",
        })
        editor.inputState.draggedContent = null
        return true
    },

    paste(editor, event) {
        if (editor.state.readOnly || !event.clipboardData) return true
        let {state} = editor
        let content = readClipboard(state, event.clipboardData, state.sel.head, editor.inputState.shiftKey)
        if (
            editor.state
                .facet(pasteHandler)
                .some((h) => h(editor, event, content ? content.slice : Slice.empty, content ? content.context : []))
        )
            return true
        if (content) {
            editor.dispatch({
                changes: {
                    from: state.selection.from,
                    to: state.selection.to,
                    insert: content.slice,
                    fit: content.context,
                },
                selection: (cx, changes) => EditorSelection.near(cx, changes.mapPos(state.selection.to, 1), -1),
                userEvent: "input.paste",
                scrollIntoView: true,
            })
        }
        return true
    },

    beforeinput(editor, event) {
        let type = event.inputType

        let command = inputTypeCommands[type]
        if (command) {
            if (
                browser.android &&
                browser.chrome &&
                (type == "deleteContentBackward" || type == "deleteContentForward")
            ) {
                editor.inputState.pendingDeletion = inputEventRange(event, editor)
                LOG_input && console.log("beforeinput", type, editor.inputState.pendingDeletion, "(chrome)")
                return false
            }

            LOG_input && console.log("beforeinput", type, "(command)")
            Command.dispatch(editor, command)
            return true
        }

        if (type == "insertText") {
            if (browser.safari && editor.inputState.composing) compositionEnd(editor)
            let insert = event.data!.replace(/\r\n?|\n/g, " ")
            let {from, to} = inputEventRange(event, editor, true)
            LOG_input && console.log("beforeinput", type, from, to, JSON.stringify(insert))
            Command.dispatch(editor, insertText, {from, to, insert, userEvent: "input.type"})
            return true
        } else if (type == "insertReplacementText" || type == "insertFromYank") {
            let slice = readClipboard(editor.state, event.dataTransfer!, editor.state.sel.head, true)?.slice
            if (slice) {
                let {from, to} = inputEventRange(event, editor)
                let sel = editor.state.selection,
                    touchesSel = from <= sel.to && to >= sel.from
                LOG_input && console.log("beforeinput", type, from, to, slice + "")
                editor.dispatch({
                    changes: {from, to, insert: slice, fit: true},
                    selection: touchesSel
                        ? (cx, changes) => {
                              return EditorSelection.near(cx, changes.mapPos(to, 1), -1)
                          }
                        : undefined,
                    scrollIntoView: touchesSel,
                    userEvent: "insert.replacementText",
                })
                return true
            }
        } else if (type == "insertCompositionText") {
            if (!editor.inputState.composing) editor.inputState.composing = {changes: 0, target: null, targetPos: 0}
            let range = inputEventRange(event, editor)
            LOG_input && console.log("beforeinput", type, range.from, range.to, event.data)
            editor.inputState.pendingComposition = {from: range.from, to: range.to, text: event.data!}
        } else if (type == "formatSetBlockTextDirection") {
            if (event.data == "ltr" || event.data == "rtl") {
                LOG_input && console.log("beforeinput", type, event.data)
                Command.dispatch(editor, setDirection, event.data)
                return true
            }
        }
        LOG_input && console.log("beforeinput", type, "(unhandled)")
        return false
    },

    input(editor, event) {
        let type = event.inputType
        if (type == "insertCompositionText" && editor.inputState.pendingComposition) {
            let {from, to, text} = editor.inputState.pendingComposition
            LOG_input && console.log("input", event.inputType, from, to, text)
            editor.inputState.pendingComposition = null
            let start = !editor.inputState.composing!.changes
            editor.inputState.composing!.changes++
            editor.observer.readSelectionRange()
            let sel = editor.observer.selectionRange
            if (!sel.focusNode) return false
            let comp = editor.inputState.findComposition()
            let userEvent = "input.type.compose" + (start ? ".start" : "")
            if (comp && sel.focusNode) {
                let anchor = findCompositionSelection(sel.anchorNode!, sel.anchorOffset, comp.target, comp.targetPos)
                let head = sel.empty
                    ? anchor
                    : findCompositionSelection(sel.focusNode, sel.focusOffset, comp.target, comp.targetPos)
                if (head != anchor || head != from + text.length) {
                    let {selection} = editor.state
                    let marks =
                        (from == selection.from && to == selection.to && editor.state.sel.activeMarks) ||
                        editor.state.doc.resolve(from).marks(editor.state.doc.resolve(to))

                    editor.dispatch({
                        changes: {from, to, insert: [Leaf.Text.of(text, marks)], fit: true},
                        selection: EditorSelection.range(anchor, head),
                        userEvent,
                    })
                    return false
                }
            }
            Command.dispatch(editor, insertText, {from, to, insert: text, userEvent})
            return false
        } else if (
            browser.android &&
            browser.chrome &&
            (type == "deleteContentBackward" || type == "deleteContentForward") &&
            editor.inputState.pendingDeletion
        ) {
            let {from, to} = editor.inputState.pendingDeletion
            editor.inputState.pendingDeletion = null
            editor.dispatch({
                changes: {from, to, fit: true},
                userEvent: "delete",
            })
            return false
        }
        LOG_input && console.log("input", event.inputType, "(unhandled)")
        return true
    },
}

export const baseObservers: {[e in keyof HTMLElementEventMap]?: (editor: Arrisa, event: HTMLElementEventMap[e]) => void} = {
    scroll(editor) {
        editor.inputState.lastScrollTop = editor.scrollDOM.scrollTop
        editor.inputState.lastScrollLeft = editor.scrollDOM.scrollLeft
    },

    touchstart(editor, e) {
        editor.inputState.lastTouchTime = Date.now()
    },

    touchmove(editor) {
        editor.inputState.lastTouchTime = Date.now()
    },

    focus(editor) {
        if (!editor.scrollDOM.scrollTop && (editor.inputState.lastScrollTop || editor.inputState.lastScrollLeft)) {
            editor.scrollDOM.scrollTop = editor.inputState.lastScrollTop
            editor.scrollDOM.scrollLeft = editor.inputState.lastScrollLeft
        }
        updateForFocusChange(editor)
    },

    blur(editor) {
        editor.observer.clearSelectionRange()
        updateForFocusChange(editor)
    },

    compositionstart: compositionUpdate,
    compositionupdate: compositionUpdate,

    compositionend(editor) {
        LOG_input && console.log("compositionend", !!editor.inputState.composing)
        compositionEnd(editor)
    },

    contextmenu(editor) {
        editor.inputState.lastContextMenu = Date.now()
    },
}
