/**
 * Observe content DOM mutations, selection changes, resize/scroll, and
 * color-scheme media queries. Queued mutations become dirty document
 * sections consumed on the next editor flush.
 */
import {ChangeSet} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import {Tile, TileFlag, WidgetTile} from "../tile"
import {
    type DOMNode,
    type SelectionRange,
    DOMSelectionState,
    getSelection,
    hasSelection,
    isEquivalentPosition,
} from "./dom"
import {readDOMSelection} from "./selection"
import browser from "../browser"

const observeOptions: MutationObserverInit = {
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
    attributes: true,
}

export class DOMObserver {
    dom: HTMLElement
    win: Window | null = null

    observer: MutationObserver
    active: boolean = false

    selectionRange: DOMSelectionState = new DOMSelectionState()
    selectionChanged = false

    resizeTimeout = -1
    queue: MutationRecord[] = []

    dirty: ChangeSet.Sections | null = null

    scrollTargets: HTMLElement[] = []
    resizeScroll: ResizeObserver | null = null
    darkThemeQuery: MediaQueryList | null = null

    constructor(private editor: Arrisa) {
        this.dom = editor.contentDOM
        this.observer = new MutationObserver((mutations) => {
            for (let mut of mutations) this.queue.push(mut)
            this.editor.scheduleFlush()
        })

        this.onSelectionChange = this.onSelectionChange.bind(this)
        this.onResize = this.onResize.bind(this)
        this.onScroll = this.onScroll.bind(this)
        this.onColorSchemeChange = this.onColorSchemeChange.bind(this)

        if (typeof ResizeObserver == "function") {
            let lastFlushSeen = 0
            this.resizeScroll = new ResizeObserver(() => {
                if (this.editor.lastFlush != lastFlushSeen) {
                    lastFlushSeen = this.editor.lastFlush
                    this.onResize()
                }
            })
        }
        this.readSelectionRange()
    }

    connect() {
        this.observer.observe(this.dom, observeOptions)
        this.resizeScroll?.observe(this.dom)
        for (let dom = this.dom as any; dom;) {
            if (dom.nodeType == 1) {
                this.scrollTargets.push(dom)
                dom.addEventListener("scroll", this.onScroll)
                dom = dom.assignedSlot || dom.parentNode
            } else if (dom.nodeType == 11) {
                dom = dom.host
            } else {
                break
            }
        }
        let win = (this.win = this.editor.win)
        win.addEventListener("resize", this.onResize)
        win.addEventListener("scroll", this.onScroll)
        win.document.addEventListener("selectionchange", this.onSelectionChange)
        if (typeof win.matchMedia == "function") {
            this.darkThemeQuery = win.matchMedia("(prefers-color-scheme: dark)")
            this.onColorSchemeChange()
            this.darkThemeQuery.addEventListener("change", this.onColorSchemeChange)
        }
    }

    disconnect() {
        this.observer.disconnect()
        this.resizeScroll?.disconnect()
        for (let dom of this.scrollTargets) dom.removeEventListener("scroll", this.onScroll)
        this.scrollTargets = []
        clearTimeout(this.resizeTimeout)
        if (this.win) {
            this.win.removeEventListener("scroll", this.onScroll)
            this.win.removeEventListener("resize", this.onResize)
            this.win.document.removeEventListener("selectionchange", this.onSelectionChange)
            this.win = null
        }
        if (this.darkThemeQuery) {
            this.darkThemeQuery.removeEventListener("change", this.onColorSchemeChange)
            this.darkThemeQuery = null
        }
    }

    onScroll(e: Event) {
        this.editor.inputState.runHandlers("scroll", e)
    }

    onResize() {
        if (this.resizeTimeout < 0)
            this.resizeTimeout = setTimeout(() => {
                this.resizeTimeout = -1
                this.editor.scheduleFlush()
            }, 50)
    }

    onColorSchemeChange() {
        this.editor.configureColorScheme(this.darkThemeQuery!.matches ? "dark" : "light")
    }

    onSelectionChange() {
        this.readSelectionRange()
        if (this.selectionChanged) {
            if (this.editor.inputState.lastTouchTime > Date.now() - 100) this.pollSelection("select.pointer")
            else this.editor.scheduleFlush()
        }
    }

    pollSelection(userEvent = "select") {
        if (
            this.selectionChanged &&
            !this.editor.inputState.pendingComposition &&
            this.editor.hasFocus &&
            hasSelection(this.editor.contentDOM, this.selectionRange)
        ) {
            this.selectionChanged = false
            let sel = readDOMSelection(this.editor, this.selectionRange)
            if (!sel.eqPos(this.editor.state.selection)) this.editor.dispatch({selection: sel, userEvent})
        }
    }

    readSelectionRange() {
        let {editor} = this

        let selection = getSelection(editor.root)
        if (!selection) return false
        let range: SelectionRange = selection
        if (browser.safari && (editor.root as any).nodeType == 11 && editor.root.activeElement == this.dom) {
            let selRange = (selection as any).getComposedRanges(editor.root)[0] as StaticRange
            if (selRange) range = buildSelectionRangeFromRange(editor, selRange)
        }
        if (!range || this.selectionRange.eq(range)) return false
        let context = range.anchorNode && editor.docTile.nearest(range.anchorNode)
        if (context instanceof WidgetTile) return false

        this.selectionRange.setRange(range)
        return (this.selectionChanged = true)
    }

    setSelectionRange(anchor: {dom: DOMNode; offset: number}, head: {dom: DOMNode; offset: number}) {
        this.selectionRange.set(anchor.dom, anchor.offset, head.dom, head.offset)
        this.selectionChanged = false
    }

    clearSelectionRange() {
        this.selectionRange.set(null, 0, null, 0)
        this.selectionChanged = false
    }

    ignore<T>(f: () => T): T {
        let result = f()
        this.clear()
        return result
    }

    clear() {
        this.takeRecords()
        this.readSelectionRange()
    }

    takeRecords() {
        for (let mut of this.observer.takeRecords()) this.queue.push(mut)
        let records = this.queue
        if (records.length) this.queue = []
        return records
    }

    addDirtyRange(from: number, to: number) {
        let sections = from ? [from, -1] : [],
            len = this.editor.flushedState.doc.length
        sections.push(to - from, -2)
        if (to < len) sections.push(len - to, -1)
        this.dirty = this.dirty ? ChangeSet.composeSections(this.dirty, sections) : sections
    }

    processRecords(records: readonly MutationRecord[]) {
        for (let record of records) {
            let range = this.findMutation(record)
            if (range) this.addDirtyRange(range[0], range[1])
        }
    }

    findMutation(record: MutationRecord): [number, number] | null {
        let tile = this.editor.docTile.nearest(record.target)
        if (!tile || tile.ignoreMutations) return null
        tile.flags |= TileFlag.Dirty
        if (record.type == "attributes" || record.type == "characterData") {
            if (tile.dom == record.target) {
                return [tile.posBefore, tile.posAfter]
            } else {
                return childRange(tile, record)
            }
        } else if (record.type == "childList") {
            return childRange(tile, record)
        } else {
            return null
        }
    }

    takeDirty() {
        this.processRecords(this.takeRecords())
        let {dirty} = this
        this.dirty = null
        return dirty
    }
}

function childRange(tile: Tile, record: MutationRecord): [number, number] {
    let childBefore = findChild(tile, record.previousSibling || record.target.previousSibling, -1)
    let childAfter = findChild(tile, record.nextSibling || record.target.nextSibling, 1)
    return [
        childBefore ? tile.posBeforeChild(childBefore) + childBefore.length : tile.posAtStart,
        childAfter ? tile.posBeforeChild(childAfter) : tile.posAtEnd,
    ]
}

function findChild(elt: Tile, dom: Node | null, dir: number): Tile | null {
    while (dom) {
        let cur = Tile.get(dom)
        if (cur && cur.parent == elt) return cur
        let parent = dom.parentNode
        dom = parent != elt.dom ? parent : dir > 0 ? dom.nextSibling : dom.previousSibling
    }
    return null
}

function buildSelectionRangeFromRange(editor: Arrisa, range: StaticRange) {
    let anchorNode = range.startContainer,
        anchorOffset = range.startOffset
    let focusNode = range.endContainer,
        focusOffset = range.endOffset
    let curAnchor = editor.docTile.resolve(editor.state.selection.anchor, -1)

    if (isEquivalentPosition(curAnchor.dom, curAnchor.offset, focusNode, focusOffset))
        [anchorNode, anchorOffset, focusNode, focusOffset] = [focusNode, focusOffset, anchorNode, anchorOffset]
    return {anchorNode, anchorOffset, focusNode, focusOffset}
}
