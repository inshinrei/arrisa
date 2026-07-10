import {Attributes, ChangeSet, type Node} from "@arrisa/doc"
import {pushSafeAttrs} from "../safe-dom-attrs"
import {EditorState, Transaction, EditorSelection} from "@arrisa/state"
import {Arrisa as CommandArrisa} from "@arrisa/command"
import type {PhraseSet} from "@arrisa/phrases"
import {StyleModule, type StyleSpec} from "../style-mod"
import {
    clipboardOutputFilter,
    clipboardOutputHTMLFilter,
    clipboardTextSerializer,
    clipboardOutputTextFilter,
    clipboardInputFilter,
    clipboardInputHTMLFilter,
    clipboardTextParser,
    clipboardInputTextFilter,
    htmlSanitize,
    trustedHTMLPolicy,
} from "../clipboard"
import {exceptionSink, logException as reportException} from "../util"
import {
    eventHandler,
    eventObserver,
    mouseSelectionStyle,
    dragBehavior,
    dropHandler,
    pasteHandler,
    isFocusChange,
    getCompositionInfo,
    InputState,
} from "../input"
import {cursorBlinkRate, CursorLayer, colorScheme, theme, styleID, baseDarkID, baseLightID, buildTheme, lightDarkIDs, baseStyles} from "../theme"
import {DocTile, updateAttributes} from "../tile"
import {ViewState, scrollIntoView, ScrollTarget} from "../view"
import {DOMObserver} from "../dom"
import {
    type DOMNode,
    getRoot,
    clearScratchRange,
    scrollRectIntoView,
} from "../dom"
import {coordsAtPos} from "../dom"
import {setDOMSelection, moveToLineBoundary, moveVertically} from "../dom"
import browser from "../browser"
import {editorPlugin, PluginInstance} from "./plugin"
import {Plugin as ArrisaPlugin} from "./plugin-api"
import {Update as ArrisaUpdate} from "./update"
import {createWrapElement} from "./wrap-element"

const dirCompartment = EditorState.Compartment.define()

const enum Flush {
    No,
    Yes,
    Read,
}

/// This class implements the editor's user interface. It wraps the
/// editable DOM surface and possibly other elements such as panels.
export class Arrisa {
    /// Filter functions run on a document slice before it is serialized to the clipboard.
    static clipboardOutputFilter = clipboardOutputFilter
    /// Filter functions run on an HTML string before it is put onto the clipboard.
    static clipboardOutputHTMLFilter = clipboardOutputHTMLFilter
    /// Convert a document slice to a plain-text string for the clipboard.
    /// Serializers are tried in order of precedence until one returns a string.
    static clipboardTextSerializer = clipboardTextSerializer
    /// Filter to run on the plain text representation of content put onto the clipboard.
    static clipboardOutputTextFilter = clipboardOutputTextFilter
    /// Filter functions run on a slice after it is read from the clipboard.
    static clipboardInputFilter = clipboardInputFilter
    /// Filter functions run on HTML text that is read from the clipboard.
    static clipboardInputHTMLFilter = clipboardInputHTMLFilter
    /// Custom parsers for plain text from the clipboard. Tried in order until one returns a slice.
    static clipboardTextParser = clipboardTextParser
    /// Filter to run on plain text read from the clipboard.
    static clipboardInputTextFilter = clipboardInputTextFilter
    /// Sanitize clipboard HTML before `innerHTML` (XSS boundary). First value wins.
    /// Plug DOMPurify or similar for untrusted paste; schema filters are not enough.
    static htmlSanitize = htmlSanitize
    /// App Trusted Types policy for clipboard HTML. Arrisa never creates an identity policy.
    static trustedHTMLPolicy = trustedHTMLPolicy
    /// Facet that allows you to register handlers to override paste behavior.
    static pasteHandler = pasteHandler
    /// Facet for custom drop handlers. When the drop should move an existing
    /// range, the `move` parameter will hold the origin range.
    static dropHandler = dropHandler
    /// Annotation added to transactions created because the editor's focused
    /// status changed. Holds `true` when the editor gained focus, `false` when it lost focus.
    static isFocusChange = isFocusChange
    /// Facet to add a style module to an editor. Modules are mounted in the
    /// editor's {@link Arrisa.root document root}.
    static styleModule = EditorState.Facet.define<StyleModule>()
    /// Scroll handlers can override how editor content is scrolled into view.
    /// If they return `true`, no further handling happens. Scroll handlers should
    /// never initiate editor updates.
    static scrollHandler =
        EditorState.Facet.define<(editor: Arrisa, target: {from: number; to: number} & Arrisa.ScrollSpec) => boolean>()
    /// Allows you to provide a function called when the library catches an
    /// exception from extension code. Useful for debugging and logging.
    /// See {@link Arrisa.logException}.
    static exceptionSink = exceptionSink
    /// Facet that can be used to register a function to be called after the
    /// editor updates. Dispatching transactions from such a function is allowed,
    /// but will cause a new, separate update to happen.
    static updateListener = EditorState.Facet.define<(update: Arrisa.Update) => void>()
    /// Facet that controls whether the editor content DOM is editable.
    /// When its highest-precedence value is `false`, the element will not have
    /// its `contenteditable` attribute set. A non-editable editor will, by default,
    /// not be focusable. You can set a content attribute of `tabindex: 0` to make
    /// an uneditable Arrisa focusable.
    static editable = EditorState.Facet.define<boolean, boolean>({
        combine: (values) => (values.length ? values[0] : true),
    })
    /// Controls the length of a full cursor blink cycle, in milliseconds.
    /// Defaults to 1200. Can be set to 0 to disable blinking.
    static cursorBlinkRate = cursorBlinkRate
    /// Allows you to influence the way mouse selection happens. Functions are
    /// called for a `mousedown` event and can return an object that overrides how
    /// the selection is computed from that mouse click or drag.
    static mouseSelectionStyle = mouseSelectionStyle
    /// Facet used to configure whether a given selection drag event should move
    /// or copy the selection. The predicate is called with the mousedown event and
    /// should return `true` when the drag should move the content. Default: move
    /// when holding Alt on Mac and Control otherwise.
    static dragMovesSelection = dragBehavior
    /// Controls whether a dark or light color scheme is active (`"light"`,
    /// `"dark"`, or `"auto"`). Defaults to `"light"`. Does not automatically invert
    /// colors — provide theme styles for dark mode when needed.
    static colorScheme = colorScheme
    /// Content Security Policy nonce to use when creating style sheets.
    /// Holds the empty string when no nonce has been provided.
    static cspNonce = EditorState.Facet.define<string, string>({combine: (values) => (values.length ? values[0] : "")})
    /// Additional DOM attributes for the editor's editable content element.
    static contentAttributes = EditorState.Facet.define<AttrSource>()
    /// DOM attributes for the editor's outer wrapper element.
    static editorAttributes = EditorState.Facet.define<AttrSource>()
    /// State effect used to include screen reader announcements in a transaction.
    /// Added to a visually hidden element with `aria-live="polite"`.
    static announce = Transaction.Effect.define<string>()
    /// @internal for testing
    static DocTile = DocTile
    /// Extensions can indicate space around the sides of the scrolling element
    /// that should be considered blocked from view when scrolling something into
    /// view (for example a gutter). Same Facet instance as the command protocol
    /// so panel chrome is visible to page-step motion.
    static coveredMargins = CommandArrisa.coveredMargins

    /// The document or shadow root that the editor lives in.
    root: DocumentOrShadowRoot = document
    /// The outer DOM element that represents the editor.
    readonly dom: HTMLElement
    /// The DOM element that can be styled to scroll. (Note that it may not have
    /// been given a height, so you can't always assume this is scrollable.)
    readonly scrollDOM: HTMLElement
    /// The editable DOM element holding the editor content. Prefer dispatching
    /// transactions over mutating this DOM directly.
    readonly contentDOM: HTMLElement
    /// @internal
    inputState!: InputState
    /// @internal
    viewState: ViewState
    /// @internal
    docTile!: DocTile
    /// @internal
    plugins: PluginInstance[] = []
    /// @internal
    connected = false
    /// @internal
    lastFlush = Date.now()
    /// @internal
    observer: DOMObserver
    /// @internal
    domReaders: ((editor: Arrisa) => void)[] = []
    /// @internal
    domWriters: ((editor: Arrisa) => void)[] = []
    private announceDOM: HTMLElement
    private id = "arrisa-" + Math.floor(Math.random() * 0xffffff).toString(16)
    private pluginMap: Map<Arrisa.Plugin<any>, PluginInstance | null> = new Map()
    private editorAttrs: Attributes = Attributes.none
    private contentAttrs: Attributes = Attributes.none
    private styleModules!: readonly StyleModule[]
    private flushing = Flush.No
    private willFlush = false
    private flushFunc: () => void
    private autoColorScheme: "light" | "dark" = "light"

    private constructor(spec: Arrisa.Spec) {
        this.flushFunc = () => {
            if (this.willFlush) this.flush()
        }
        this.dispatch = this.dispatch.bind(this)

        this.dom = createWrapElement(this)

        this.contentDOM = document.createElement("arrisa-content")

        this.scrollDOM = document.createElement("arrisa-scroller")
        this.scrollDOM.tabIndex = -1
        this.scrollDOM.appendChild(this.contentDOM)

        this.announceDOM = document.createElement("arrisa-announced")
        this.announceDOM.setAttribute("aria-live", "polite")

        this.dom.appendChild(this.announceDOM)
        this.dom.appendChild(this.scrollDOM)

        this.viewState = new ViewState(spec.state || EditorState.create(spec as EditorState.Spec))
        if (spec.scrollTo && spec.scrollTo.is(scrollIntoView))
            this.viewState.scrollTarget = spec.scrollTo.value.clip(this.viewState.state)
        this.plugins = [cursorPlugin, ...this.state.facet(editorPlugin)].map((spec) => new PluginInstance(spec))
        for (let plugin of this.plugins) plugin.update(this)
        this.inputState = new InputState(this)
        this.docTile = DocTile.create(this.state, this.contentDOM)
        this.updateAttrs()
        this.observer = new DOMObserver(this)

        if (spec.parent) spec.parent.appendChild(this.dom)
    }


    /// The current editor state.
    get state() {
        return this.viewState.state
    }

    /// @internal
    get flushedState() {
        return this.viewState.flushedState
    }

    /// Whether an IME composition is active.
    get composing() {
        return !!this.inputState.composing
    }

    /// Whether the current composition has applied at least one change.
    get compositionStarted() {
        return this.inputState.composing && this.inputState.composing.changes > 0
    }

    /// @internal
    get win() {
        return this.dom.ownerDocument.defaultView || window
    }

    /// Check whether the editor has focus.
    get hasFocus(): boolean {
        // Safari return false for hasFocus when the context menu is open
        // or closing, which leads us to ignore selection changes from the
        // context menu because it looks like the editor isn't focused.
        // This kludges around that.
        return (
            (this.dom.ownerDocument.hasFocus() ||
                (browser.safari && this.inputState?.lastContextMenu > Date.now() - 3e4)) &&
            this.root.activeElement == this.contentDOM
        )
    }

    /// Get the CSS classes for the currently active editor themes.
    get themeClasses() {
        let scheme = this.state.facet(colorScheme)
        if (scheme == "auto") scheme = this.autoColorScheme
        return styleID + " " + (scheme == "dark" ? baseDarkID : baseLightID) + " " + this.state.facet(theme)
    }

    /// Create a new editor. Provide `parent` or mount {@link Arrisa.dom} yourself.
    static create(spec: Arrisa.Spec) {
        return new Arrisa(spec)
    }

    /// Returns an effect that can be added to a transaction to scroll a
    /// position or selection into view.
    static scrollIntoView(pos: number | EditorSelection, options: Arrisa.ScrollSpec = {}): Transaction.Effect<unknown> {
        let [from, to, assoc]: [number, number, -1 | 1] =
            typeof pos == "number"
                ? [pos, pos, -1]
                : [pos.from, pos.to, pos.empty ? pos.headSide : pos.head < pos.anchor ? -1 : 1]
        return scrollIntoView.of(
            new ScrollTarget(from, to, assoc, {
                y: options.y || "nearest",
                x: options.x || "nearest",
                yMargin: options.yMargin ?? 5,
                xMargin: options.xMargin ?? 5,
            }),
        )
    }

    /// Add an
    /// [`aria-label`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-label)
    /// attribute to the editable element holding the given string or phrase.
    static label(label: string | PhraseSet.Ref): EditorState.Extension {
        return Arrisa.editorAttributes.of(
            typeof label == "string" ? {"aria-label": label} : (editor) => ({"aria-label": label(editor.state)}),
        )
    }

    /// Register a DOM event handler on the editor content element (or scroll
    /// handlers for scroll events on the scroll chain). The first handler that
    /// returns true is assumed to have handled the event.
    static domEventHandler<Event extends keyof HTMLElementEventMap>(
        event: Event,
        handler: (event: HTMLElementEventMap[Event], editor: Arrisa) => boolean | void,
    ): EditorState.Extension {
        return eventHandler.of({event, handler: handler as any})
    }

    /// Register a DOM event observer. Unlike handlers, observers always run and
    /// should not call `preventDefault`.
    static domEventObserver<Event extends keyof HTMLElementEventMap>(
        event: Event,
        observer: (event: HTMLElementEventMap[Event], editor: Arrisa) => void,
    ): EditorState.Extension {
        return eventObserver.of({event, observer: observer as any})
    }

    /// Create a theme extension from a style-mod style spec. Rules are prefixed
    /// with a generated scope class. Use `&` for the editor wrapper,
    /// `&dark` / `&light` for color-scheme variants.
    static theme(spec: Record<string, StyleSpec>): EditorState.Extension {
        let prefix = StyleModule.newName()
        return [
            theme.of(prefix),
            Arrisa.styleModule.of(
                buildTheme(`.${prefix}`, spec, {
                    "&dark": `.${prefix}.${baseDarkID}`,
                    "&light": `.${prefix}.${baseLightID}`,
                }),
            ),
        ]
    }

    /// Load a set of style rules (lower precedence than {@link Arrisa.theme}).
    /// Supports `&`, `&dark`, and `&light` selectors.
    static styles(spec: Record<string, StyleSpec>): EditorState.Extension {
        return EditorState.prec.lowest(Arrisa.styleModule.of(buildTheme("." + styleID, spec, lightDarkIDs)))
    }

    /// Simple theme that sets a height and enables vertical overflow scrolling
    /// on the scroller (the default styling makes height fit its content).
    static scrolling(height: number | string): EditorState.Extension {
        return Arrisa.theme({
            "&": {
                height: typeof height == "number" ? `${height}px` : height,
            },
            "arrisa-scroller": {
                overflowY: "auto",
            },
        })
    }

    /// @internal
    setConnected(value: boolean) {
        if (value == this.connected) return
        this.connected = value
        if (value) {
            this.root = getRoot(this.dom.parentNode!) || document
            this.mountStyles()
            this.inputState.connect()
            if (!this.viewState.initialized) this.viewState.initialMeasure(this)
            for (let plugin of this.plugins) plugin.connect(this)
            this.observer.connect()
            if (this.viewState.pending.length || this.domReaders.length || this.domWriters.length) this.scheduleFlush()
            this.docTile.connect()
        } else {
            this.root = document
            this.observer.disconnect()
            for (let plugin of this.plugins) plugin.disconnect(this)
            this.inputState.disconnect()
            this.docTile.disconnect()
            clearScratchRange()
        }
    }

    /// All editor state updates go through this. Takes a transaction or
    /// transaction spec and updates the editor to the new state. Bound to the
    /// instance (need not be called as a method). Applies transaction appenders.
    /// The `state` property updates immediately; DOM update is deferred to the
    /// next animation frame flush.
    dispatch(tr: Transaction | Transaction.Spec): void {
        if (this.flushing != Flush.No) throw new Error("Cannot dispatch new updates during the editor flush phase")
        if (!(tr instanceof Transaction)) tr = this.state.update(tr)
        else if (tr.startState != this.state) throw new Error("Dispatching a transaction starting from the wrong state")
        for (let t of Transaction.append(tr as Transaction)) this.viewState.update(t)
        this.scheduleFlush()
    }

    /// @internal
    scheduleFlush() {
        if (!this.willFlush && this.flushing == Flush.No && this.connected) {
            this.win.requestAnimationFrame(this.flushFunc)
            this.willFlush = true
        }
    }

    /// @internal
    flush() {
        if (!this.connected || this.inputState.pendingComposition || this.inputState.pendingDeletion) return
        if (!this.viewState.pending.some((tr) => tr.selection)) this.observer.pollSelection()
        let {flushedState, state} = this.viewState
        let update = Arrisa.Update.create(this, flushedState, state, this.viewState.pending)

        this.willFlush = false
        this.flushing = Flush.Yes
        this.lastFlush = Date.now()
        let domChanges = this.observer.takeDirty()
        this.viewState.flush()
        try {
            this.observer.ignore(() => this.runUpdate(update, domChanges))
            domChanges = null
            for (let i = 0; ; i++) {
                if (i > 5) {
                    console.warn("Editor flush loop restarted more than 5 times")
                    break
                }
                let write = this.domWriters
                this.domWriters = []
                for (let f of write) f(this)
                let flags = this.viewState.measure(this)
                let read = this.domReaders
                this.domReaders = []
                this.flushing = Flush.Read
                for (let f of read) f(this)
                this.flushing = Flush.Yes
                if (!flags && !this.domWriters.length) break
                update.flags |= flags
                if (flags) this.runUpdate(Arrisa.Update.create(this, state, state, [], flags), null)
            }
        } finally {
            this.flushing = Flush.No
        }
        if (this.viewState.scrollTarget) {
            this.scrollTo(this.viewState.scrollTarget)
            this.viewState.scrollTarget = null
        }
        if (!update.empty)
            for (let listener of this.state.facet(Arrisa.updateListener)) {
                try {
                    listener(update)
                } catch (e) {
                    reportException(this.state, e, "update listener")
                }
            }
        this.checkDir()
    }

    /// Schedule a function that needs to read from the (flushed) DOM layout.
    scheduleDOMRead(read: (editor: Arrisa) => void) {
        this.scheduleFlush()
        if (this.domReaders.indexOf(read) < 0) this.domReaders.push(read)
    }

    /// Schedule a function that needs to modify the DOM. Use after a
    /// {@link Arrisa.scheduleDOMRead | DOM read} so read and write phases stay separate.
    scheduleDOMWrite(write: (editor: Arrisa) => void) {
        this.scheduleFlush()
        if (this.domWriters.indexOf(write) < 0) this.domWriters.push(write)
    }

    /// Get the value of a specific plugin, if present. Plugins that crash can be
    /// dropped, so always check the return value.
    plugin<T extends Arrisa.Plugin.Value>(plugin: Arrisa.Plugin<T>): T | null {
        let known = this.pluginMap.get(plugin)
        if (known === undefined || (known && known.spec != plugin))
            this.pluginMap.set(plugin, (known = this.plugins.find((p) => p.spec == plugin && !p.deactivated) || null))
        return known && (known.update(this).value as T)
    }

    /// Find the position at the end or start of the (wrapped) line. Returns null
    /// when the head is not in a textblock.
    moveToLineBoundary(start: EditorSelection, forward: boolean): EditorSelection.Text | null {
        this.ensureFlushed()
        return moveToLineBoundary(this, start, forward)
    }

    /// Move a cursor position vertically. When `distance` isn't given, moves to
    /// the vertical element below or above the start. Otherwise `distance` is a
    /// positive pixel offset. Uses {@link EditorSelection.goalColumn} when set.
    /// If `allowNode` is true, may return a node selection on a block node.
    moveVertically(start: EditorSelection, forward: boolean, distance?: number, allowNode?: boolean) {
        this.ensureFlushed()
        return moveVertically(this, start, forward, distance, allowNode)
    }

    /// Find the DOM parent node and offset (child offset if `node` is an element,
    /// character offset when it is a text node) at the given document position.
    domAtPos(pos: number, assoc: -1 | 1 = -1): {node: DOMNode; offset: number} {
        this.ensureFlushed()
        let tilePos = this.docTile.resolve(pos, assoc)
        return {node: tilePos.tile.dom, offset: tilePos.offset}
    }

    /// Get the DOM element for the node at the given position, if any.
    nodeDOM(pos: number): Element | null {
        this.ensureFlushed()
        let tile = this.docTile.nodeTile(pos)
        if (!tile || tile.dom.nodeType != 1) return null
        return tile.dom as Element
    }

    /// Find the document position at the given DOM node/offset. Useful for
    /// associating positions with DOM events.
    posAtDOM(node: DOMNode, offset: number = 0) {
        this.ensureFlushed()
        return this.docTile.posFromDOM(node, offset, 1)
    }

    /// Find the Arrisa document node represented by the given DOM node, or one
    /// of its parent nodes, if any. Will not return the outer document node.
    nodeFromDOM(node: Element): {pos: number; node: Node} | null {
        this.ensureFlushed()
        let tile = this.docTile.nearest(node, true)
        return tile && tile != this.docTile ? {pos: tile.posBefore, node: tile.node!} : null
    }

    /// Get the document position at the given screen coordinates.
    posAtCoords(coords: {x: number; y: number}): {pos: number; side: -1 | 1; target: number | null} {
        this.ensureFlushed()
        let elt = ((this.root as any).elementFromPoint ? this.root : this.dom.ownerDocument).elementFromPoint(
            coords.x,
            coords.y,
        )
        let tile = (elt && this.docTile.nearest(elt)) || this.docTile
        return tile.posAtCoords(this.state, coords.x, coords.y)
    }

    /// Get the screen coordinates at the given document position.
    /// `side` selects the element before (-1) or after (1) the position.
    coordsAtPos(pos: number, assoc: -1 | 1 = -1): DOMRect {
        this.ensureFlushed()
        return coordsAtPos(this, pos, assoc)
    }

    /// Return the rectangle around a given node or character. If there is no
    /// element directly after `pos`, this will return null.
    coordsForElement(pos: number) {
        this.ensureFlushed()
        return this.docTile.coordsForElement(pos)
    }

    /// Put focus on the editor.
    focus() {
        if (this.connected)
            this.observer.ignore(() => {
                this.contentDOM.focus({preventScroll: true})
                if (this.willFlush && this.flushing == Flush.No) this.flush()
                setDOMSelection(this)
            })
    }

    /// @internal
    getScrollMargins() {
        let left = 0,
            right = 0,
            top = 0,
            bottom = 0
        for (let source of this.state.facet(Arrisa.coveredMargins)) {
            let m = source(this)
            if (m) {
                if (m.left != null) left = Math.max(left, m.left)
                if (m.right != null) right = Math.max(right, m.right)
                if (m.top != null) top = Math.max(top, m.top)
                if (m.bottom != null) bottom = Math.max(bottom, m.bottom)
            }
        }
        return {left, right, top, bottom}
    }

    /// @internal
    configureColorScheme(scheme: "light" | "dark") {
        if (this.autoColorScheme == scheme) return
        this.autoColorScheme = scheme
        if (!this.state.facet(colorScheme)) this.observer.ignore(() => this.updateAttrs())
    }


    private scrollTo(target: ScrollTarget) {
        for (let handler of this.state.facet(Arrisa.scrollHandler)) {
            try {
                if (handler(this, target)) return true
            } catch (e) {
                reportException(this.state, e, "scroll handler")
            }
        }

        let {from, to, assoc} = target
        let rect = this.coordsAtPos(from, from == to ? assoc : 1)
        if (from != to) {
            let other = this.coordsAtPos(to, -1)
            let left = Math.min(rect.left, other.left),
                top = Math.min(rect.top, other.top)
            rect = new DOMRect(
                left,
                top,
                Math.max(rect.right, other.right) - left,
                Math.max(rect.bottom, other.bottom) - top,
            )
        }

        let margins = this.getScrollMargins()
        let targetRect = new DOMRect(
            rect.left + margins.left,
            rect.top + margins.top,
            rect.width - margins.left - margins.right,
            rect.height - margins.top - margins.bottom,
        )
        let {offsetWidth, offsetHeight} = this.scrollDOM
        scrollRectIntoView(
            this.scrollDOM,
            targetRect,
            assoc,
            target.spec.x,
            target.spec.y,
            Math.max(Math.min(target.spec.xMargin, offsetWidth), -offsetWidth),
            Math.max(Math.min(target.spec.yMargin, offsetHeight), -offsetHeight),
            this.state.textLTR,
        )
    }

    /// @internal
    private runUpdate(update: Arrisa.Update, domChanges: ChangeSet.Sections | null) {
        let composition = this.composing ? getCompositionInfo(this) : null
        let changes = domChanges
            ? ChangeSet.composeSections(domChanges, update.changes.sections)
            : update.changes.sections
        let prevDocTile = this.docTile
        if (!update.empty) {
            this.updatePlugins(update)
            this.inputState.update(update)
            this.showAnnouncements(update.transactions)
            if (this.state.facet(Arrisa.styleModule) != this.styleModules) this.mountStyles()
            this.updateAttrs()
        }
        this.docTile = prevDocTile.update(update.state, changes, this.connected, composition)

        if (
            (composition?.wrapCursor || (!composition && (prevDocTile != this.docTile || update.selectionSet))) &&
            this.hasFocus
        )
            setDOMSelection(this)
        this.observer.clear()
        if (this.docTile != prevDocTile) for (let plugin of this.plugins) plugin.docUpdate(this)
    }

    /// @internal
    private updatePlugins(update: Arrisa.Update) {
        let specs = update.state.facet(editorPlugin)
        let configChange = specs != update.startState.facet(editorPlugin)
        if (configChange) {
            let newPlugins: PluginInstance[] = []
            for (let spec of [cursorPlugin, ...specs]) {
                let found = this.plugins.findIndex((p) => p.spec == spec)
                if (found < 0) {
                    let plugin = new PluginInstance(spec)
                    newPlugins.push(plugin)
                    if (this.connected) plugin.connect(this)
                } else {
                    let plugin = this.plugins[found]
                    plugin.mustUpdate = update
                    newPlugins.push(plugin)
                }
            }
            for (let plugin of this.plugins) if (!newPlugins.includes(plugin)) plugin.remove(this)
            this.plugins = newPlugins
            this.pluginMap.clear()
        } else {
            for (let p of this.plugins) p.mustUpdate = update
        }
        for (let i = 0; i < this.plugins.length; i++) this.plugins[i].update(this)
        if (configChange) this.inputState.ensureHandlers(update.state)
    }

    /// @internal
    private updateAttrs() {
        let editorAttrs = attrsFromFacet(this, Arrisa.editorAttributes, ["class", this.themeClasses])
        let contentAttrs = attrsFromFacet(this, Arrisa.contentAttributes, [
            "aria-multiline",
            "true",
            ...(this.state.readOnly ? ["aria-readonly", "true"] : []),
            "contenteditable",
            String(this.state.facet(Arrisa.editable)),
            "role",
            "textbox",
            "translate",
            "no",
            "id",
            this.id,
        ])

        let changedContent = updateAttributes(this.contentDOM, this.contentAttrs, contentAttrs)
        this.contentAttrs = contentAttrs
        let changedEditor = updateAttributes(this.dom, this.editorAttrs, editorAttrs)
        this.editorAttrs = editorAttrs
        return changedContent || changedEditor
    }

    /// @internal
    private checkDir() {
        if (this.viewState.styleLTR != this.state.textLTR) {
            let value = EditorState.textLTR.of(this.viewState.styleLTR)
            this.dispatch({
                effects:
                    dirCompartment.get(this.state) == null
                        ? EditorState.appendConfig.of(EditorState.prec.highest(dirCompartment.of(value)))
                        : dirCompartment.reconfigure(value),
            })
        }
    }

    /// @internal
    private showAnnouncements(trs: readonly Transaction[]) {
        let first = true
        for (let tr of trs)
            for (let effect of tr.effects)
                if (effect.is(Arrisa.announce)) {
                    if (first) this.announceDOM.textContent = ""
                    first = false
                    let div = this.announceDOM.appendChild(document.createElement("div"))
                    div.textContent = effect.value
                }
    }

    private mountStyles() {
        this.styleModules = this.state.facet(Arrisa.styleModule)
        let nonce = this.state.facet(Arrisa.cspNonce)
        StyleModule.mount(
            this.root as Document | ShadowRoot,
            this.styleModules.concat(baseStyles).reverse(),
            nonce ? {nonce} : undefined,
        )
    }

    /// @internal
    private ensureFlushed() {
        if (!this.connected) throw new Error("Editor is not connected to the DOM")
        if (this.willFlush && (this.viewState.pending.some((tr) => tr.docChanged) || this.observer.dirty)) {
            if (this.flushing == Flush.Yes) throw new Error("Trying to read from unflushed editor during flush")
            if (this.inputState.pendingComposition || this.inputState.pendingDeletion)
                throw new Error("Trying to read editor DOM between beforeinput and input for composition")
            if (this.flushing == Flush.No) this.flush()
        }
    }
}

function attrsFromFacet(editor: Arrisa, facet: EditorState.Facet<AttrSource>, base: string[]): Attributes {
    for (let sources = editor.state.facet(facet), i = sources.length - 1; i >= 0; i--) {
        let source = sources[i],
            value = typeof source == "function" ? source(editor) : source
        pushSafeAttrs(base, value)
    }
    return base
}

export namespace Arrisa {
    /// The type of object given to {@link Arrisa.create}.
    export interface Spec extends Partial<EditorState.Spec> {
        /// The editor's initial state. If not given, a new state is
        /// created by passing this configuration object to {@link
        /// EditorState.create}, using its `doc`, `selection`, and
        /// `config` fields (if provided).
        state?: EditorState
        /// When present, the editor is immediately appended to the given
        /// element on creation. (Otherwise, you'll have to place the
        /// editor {@link Arrisa.dom element} in the document yourself.)
        parent?: Element | DocumentFragment
        /// Pass an effect created with {@link Arrisa.scrollIntoView}
        /// here to set an initial scroll position.
        scrollTo?: Transaction.Effect<any>
    }

    /// Options passed to {@link Arrisa.scrollIntoView}.
    export type ScrollSpec = {
        /// By default (`"nearest"`) the position will be vertically
        /// scrolled only the minimal amount required to move the given
        /// position into view. You can set this to `"start"` to move it
        /// to the top of the editor, `"end"` to move it to the bottom, or
        /// `"center"` to move it to the center.
        y?: "nearest" | "start" | "end" | "center"
        /// Effect similar to `y`, but for the horizontal scroll position.
        x?: "nearest" | "start" | "end" | "center"
        /// Extra vertical distance to add when moving something into
        /// view. Not used with the `"center"` strategy. Defaults to 5.
        /// Must be less than the height of the editor.
        yMargin?: number
        /// Extra horizontal distance to add. Not used with the `"center"`
        /// strategy. Defaults to 5. Must be less than the width of the
        /// editor.
        xMargin?: number
    }

    /// The interface that objects registered with {@link
    /// Arrisa.mouseSelectionStyle} must conform to.
    export interface MouseSelectionStyle {
        /// Return a new selection for the mouse gesture that starts with
        /// the event that was originally given to the constructor, and ends
        /// with the event passed here. In case of a plain click, those may
        /// both be the `mousedown` event, in case of a drag gesture, the
        /// latest `mousemove` event will be passed.
        ///
        /// When `extend` is true, that means the new selection should, if
        /// possible, extend the start selection.
        get: (curEvent: MouseEvent, extend: boolean) => EditorSelection
        /// Called when the editor is updated while the gesture is in
        /// progress. When the document changes, it may be necessary to map
        /// some data (like the original selection or start position)
        /// through the changes.
        ///
        /// This may return `true` to indicate that the `get` method should
        /// get queried again after the update, because something in the
        /// update could change its result. Be wary of infinite loops when
        /// using this (where `get` returns a new selection, which will
        /// trigger `update`, which schedules another `get` in response).
        update: (update: Arrisa.Update) => boolean | void
    }

    /// Log or report an unhandled exception in client code. Should
    /// probably only be used by extension code that allows client code to
    /// provide functions, and calls those functions in a context where an
    /// exception can't be propagated to calling code in a reasonable way
    /// (for example when in an event handler).
    ///
    /// Either calls a handler registered with {@link
    /// Arrisa.exceptionSink}, `window.onerror`, if defined, or
    /// `console.error` (in which case it'll pass `context`, when given,
    /// as first argument).
    export function logException(state: EditorState, exception: any, context?: string) {
        reportException(state, exception, context)
    }

    // Re-export plugin/update APIs under the Arrisa namespace (same call sites).
    export import Plugin = ArrisaPlugin
    export const Update = ArrisaUpdate
    export type Update = ArrisaUpdate
}

const cursorPlugin: Arrisa.Plugin<any> = Arrisa.Plugin.fromClass(CursorLayer)

export type AttrSource = Record<string, string | null> | ((editor: Arrisa) => Record<string, string | null>)

// re-export UpdateFlag for convenience
export {UpdateFlag} from "../view"
