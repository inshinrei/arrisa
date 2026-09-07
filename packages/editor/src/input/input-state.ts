/**
 * Per-editor input bookkeeping: DOM event handler registry, IME composition
 * target tracking, mouse selection, and focus/scroll timestamps.
 */
import {Command, collapseSelection} from "@arrisa/command"
import {EditorState, EditorSelection} from "@arrisa/state"
import type {Mark} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import browser from "../browser"
import {logException} from "../util"
import {textNodeBefore, textNodeAfter} from "../dom"
import {Tile} from "../tile"
import {eventHandler, eventObserver} from "./facets"
import {eventBelongsToEditor, MouseSelection} from "./mouse"
import {baseHandlers, baseObservers} from "./handlers"

/** Chrome outside `editor.dom` that should not collapse a range. */
export const outsidePointerChromeSelector =
    "arrisa-tooltip, .arrisa-tooltip, arrisa-floating-menu, .arrisa-floating-menu, arrisa-link-prompt, .arrisa-link-prompt, arrisa-menubar, .arrisa-menubar"

type OutsidePointerTarget = {
    closest?: (sel: string) => unknown
    parentElement?: {closest?: (sel: string) => unknown} | null
    nodeType?: number
}

function isDomNode(entry: unknown): boolean {
    return typeof Node != "undefined" ? entry instanceof Node : typeof (entry as OutsidePointerTarget)?.nodeType == "number"
}

let chromeByEditor = new WeakMap<object, Set<{contains(node: any): boolean}>>()

export function addOutsidePointerChrome(editor: object, root: {contains(node: any): boolean}) {
    let set = chromeByEditor.get(editor)
    if (!set) chromeByEditor.set(editor, (set = new Set()))
    set.add(root)
}

export function outsidePointerChromeRoots(editor: object): Iterable<{contains(node: any): boolean}> {
    return chromeByEditor.get(editor) ?? emptyChrome
}

const emptyChrome: Iterable<{contains(node: any): boolean}> = []

/** True when a document `pointerdown` should collapse a non-empty selection. */
export function shouldCollapseOnOutsidePointer(
    editorDom: {contains(node: any): boolean},
    path: readonly unknown[] | null | undefined,
    selectionEmpty: boolean,
    chromeRoots?: Iterable<{contains(node: any): boolean}>,
): boolean {
    if (selectionEmpty || !path || !path.length) return false
    for (let entry of path) {
        if (entry == editorDom) return false
        if (isDomNode(entry) && editorDom.contains(entry)) return false
        if (chromeRoots) {
            for (let root of chromeRoots) {
                if (entry == root) return false
                if (isDomNode(entry) && typeof root.contains == "function" && root.contains(entry)) return false
            }
        }
        let node = entry as OutsidePointerTarget
        let el = typeof node.closest == "function" ? node : node.parentElement
        if (el && typeof el.closest == "function" && el.closest(outsidePointerChromeSelector)) return false
    }
    return true
}

const LOG_input = false

export class InputState {
    shiftKey = false
    lastKeyCode: number = 0
    lastKeyTime: number = 0
    lastTouchTime = 0
    lastScrollTop = 0
    lastScrollLeft = 0

    lastContextMenu: number = 0
    scrollHandlers: ((event: Event) => boolean | void)[] = []

    handlers: {
        [event: string]: {
            observers: readonly HandlerFunction[]
            handlers: readonly HandlerFunction[]
        }
    } = Object.create(null)

    composing: null | {changes: number; target: Text | null; targetPos: number} = null

    compositionEndedAt = 0

    compositionPendingKey = false

    pendingComposition: {from: number; to: number; text: string} | null = null

    pendingDeletion: {from: number; to: number} | null = null
    wrappingComposition: Mark.Set | null = null

    mouseSelection: MouseSelection | null = null

    draggedContent: EditorSelection | null = null

    notifiedFocused: boolean

    constructor(readonly editor: Arrisa) {
        this.handleEvent = this.handleEvent.bind(this)
        this.onOutsidePointer = this.onOutsidePointer.bind(this)
        this.notifiedFocused = editor.hasFocus

        if (browser.safari) editor.contentDOM.addEventListener("input", () => null)
    }

    handleEvent(event: Event) {
        if (!eventBelongsToEditor(this.editor, event) || this.ignoreDuringComposition(event)) return
        if (event.type == "keydown" && this.keydown(event as KeyboardEvent)) return
        if (event.type == "keyup" && (event as KeyboardEvent).keyCode == 16) this.shiftKey = false
        this.runHandlers(event.type, event)
    }

    runHandlers(type: string, event: Event) {
        let handlers = this.handlers[type]
        if (handlers) {
            for (let observer of handlers.observers) observer(this.editor, event)
            for (let handler of handlers.handlers) {
                if (event.defaultPrevented) break
                if (handler(this.editor, event)) {
                    event.preventDefault()
                    break
                }
            }
        }
    }

    ensureHandlers(state: EditorState) {
        let handlers = computeHandlers(state),
            prev = this.handlers,
            dom = this.editor.contentDOM
        for (let type in handlers)
            if (type != "scroll") {
                let passive = !handlers[type].handlers.length
                let exists: (typeof prev)["type"] | null = prev[type]
                if (exists && passive != !exists.handlers.length) {
                    dom.removeEventListener(type, this.handleEvent)
                    exists = null
                }
                if (!exists) dom.addEventListener(type, this.handleEvent, {passive})
            }
        for (let type in prev) if (type != "scroll" && !handlers[type]) dom.removeEventListener(type, this.handleEvent)
        this.handlers = handlers
    }

    keydown(event: KeyboardEvent) {
        LOG_input &&
            console.log(
                "keydown",
                event.key,
                ["shift", "alt", "ctrl", "meta"].filter((k) => (event as any)[k + "Key"]).join(),
            )

        this.lastKeyCode = event.keyCode
        this.lastKeyTime = Date.now()
        this.shiftKey = event.keyCode == 16 || event.shiftKey
        return false
    }

    ignoreDuringComposition(event: Event): boolean {
        if (!/^key/.test(event.type)) return false
        if (this.composing && this.composing.changes) return true

        if (
            browser.safari &&
            !browser.ios &&
            this.compositionPendingKey &&
            Date.now() - this.compositionEndedAt < 100
        ) {
            this.compositionPendingKey = false
            return true
        }
        return false
    }

    startMouseSelection(mouseSelection: MouseSelection) {
        if (this.mouseSelection) this.mouseSelection.disconnect()
        this.mouseSelection = mouseSelection
    }

    update(update: Arrisa.Update) {
        if (this.mouseSelection) this.mouseSelection.update(update)
        if (this.draggedContent && update.docChanged)
            this.draggedContent = this.draggedContent.map(update.changes, update.state)
        if (update.transactions.length) this.lastKeyCode = 0
        if (this.composing) this.composing.targetPos = update.changes.mapPos(this.composing.targetPos, -1)
    }

    findComposition(): {target: Text; targetPos: number} | null {
        let comp = this.composing
        if (!comp) return null
        let {focusNode, focusOffset} = this.editor.observer.selectionRange
        if (!focusNode) return null
        let before = textNodeBefore(focusNode, focusOffset),
            after = textNodeAfter(focusNode, focusOffset)
        let newTarget: Text | null
        if (!before || !after || before == after) {
            newTarget = before || after
        } else {
            let tileBefore = Tile.get(before),
                tileAfter = Tile.get(after)
            newTarget =
                !tileBefore || (tileBefore as any).text != before.nodeValue
                    ? before
                    : !tileAfter || (tileAfter as any).text != after.nodeValue
                      ? after
                      : comp.target == after
                        ? after
                        : before
        }
        if (!newTarget) return (comp.target = null)
        if (newTarget != comp.target) {
            let pos = this.editor.docTile.posBeforeDOM(newTarget)
            if (pos == null) return (comp.target = null)
            comp.target = newTarget
            comp.targetPos = this.editor.viewState.mapPosPending(pos, -1)
        }
        return comp as {target: Text; targetPos: number}
    }

    connect() {
        this.ensureHandlers(this.editor.state)
        this.editor.dom.ownerDocument.addEventListener("pointerdown", this.onOutsidePointer, true)
    }

    disconnect() {
        if (this.mouseSelection) this.mouseSelection.disconnect()
        this.editor.dom.ownerDocument.removeEventListener("pointerdown", this.onOutsidePointer, true)
    }

    onOutsidePointer(event: PointerEvent) {
        if (!this.editor.connected) return
        if (
            !shouldCollapseOnOutsidePointer(
                this.editor.dom,
                event.composedPath(),
                this.editor.state.selection.empty,
                outsidePointerChromeRoots(this.editor),
            )
        )
            return
        Command.dispatch(this.editor, collapseSelection)
    }
}

type HandlerFunction = (editor: Arrisa, event: Event) => boolean | void

function bindHandler(handler: (event: Event, editor: Arrisa) => boolean | void): HandlerFunction {
    return (editor, event) => {
        try {
            return handler(event, editor)
        } catch (e) {
            logException(editor.state, e)
        }
    }
}

function computeHandlers(state: EditorState) {
    let result: {
        [event: string]: {
            observers: HandlerFunction[]
            handlers: HandlerFunction[]
        }
    } = Object.create(null)
    function record(type: string) {
        return result[type] || (result[type] = {observers: [], handlers: []})
    }
    let h = state.facet(eventHandler),
        o = state.facet(eventObserver)
    for (let type in h) for (let handler of h[type]) record(type).handlers.push(bindHandler(handler))
    for (let type in o) for (let observer of o[type]) record(type).observers.push(bindHandler(observer))
    for (let type in baseHandlers) record(type).handlers.push((baseHandlers as any)[type])
    for (let type in baseObservers) record(type).observers.push((baseObservers as any)[type])
    return result
}

