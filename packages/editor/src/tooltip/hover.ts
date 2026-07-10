/**
 * Public tooltip API: facet-driven tooltips, hover sources, and the hover host
 * that stacks multiple hover sections into one positioned tooltip.
 *
 * The structural {@link Tooltip} shape is also declared in `./types` so
 * `manager.ts` can import it without a module cycle.
 */
import {logException} from "../util"
import {EditorState, Transaction} from "@arrisa/state"
import {Arrisa} from "../editor"
import {TooltipViewManager, tooltipPlugin, tooltipConfig, showTooltip} from "./manager"
import type {Tooltip as TooltipShape, HoverTooltipSource} from "./types"

export type {HoverTooltipSource} from "./types"

/** @see types.Tooltip — public interface merged with {@link Tooltip} namespace below. */
export interface Tooltip extends TooltipShape {}

export const closeHoverTooltipEffect = Transaction.Effect.define<null>()

export namespace Tooltip {
    export function configure(
        config: {
            position?: "fixed" | "absolute"

            parent?: HTMLElement

            tooltipSpace?: (editor: Arrisa) => DOMRect
        } = {},
    ): EditorState.Extension {
        return tooltipConfig.of(config)
    }

    export type View = TooltipShape.View

    export const show = showTooltip

    export function get(editor: Arrisa, tooltip: Tooltip): Tooltip.View | null {
        let plugin = editor.plugin(tooltipPlugin)
        if (!plugin) return null
        let found = plugin.manager.tooltips.indexOf(tooltip)
        return found < 0 ? null : plugin.manager.tooltipViews[found]
    }

    export function reposition(editor: Arrisa) {
        let plugin = editor.plugin(tooltipPlugin)
        if (plugin) plugin.maybeMeasure()
    }

    export function hover(
        source: HoverTooltipSource,
        options: hover.Spec = {},
    ): {extension: EditorState.Extension; active: EditorState.Field<readonly Tooltip[]>} {
        let setHover = Transaction.Effect.define<readonly Tooltip[]>()
        let hoverState = EditorState.Field.define<readonly Tooltip[]>({
            create() {
                return []
            },

            update(value, tr) {
                if (value.length) {
                    if (options.hideOnChange && (tr.docChanged || tr.selection)) value = []
                    else if (options.hideOn) value = value.filter((v) => !options.hideOn!(tr, v))
                    if (tr.docChanged) {
                        let mapped = []
                        for (let tooltip of value) {
                            let newPos = tr.changes.mapPos(tooltip.pos, -1, "around")
                            if (newPos != null) {
                                let copy: Tooltip = Object.assign(Object.create(null), tooltip)
                                copy.pos = newPos
                                if (copy.end != null) copy.end = tr.changes.mapPos(copy.end)
                                mapped.push(copy)
                            }
                        }
                        value = mapped
                    }
                }
                for (let effect of tr.effects) {
                    if (effect.is(setHover)) value = effect.value
                    if (effect.is(closeHoverTooltipEffect)) value = []
                }
                return value
            },

            provide: (f) => showHoverTooltip.from(f),
        })

        return {
            active: hoverState,
            extension: [
                hoverState,
                Arrisa.Plugin.define(
                    (editor) => new HoverPlugin(editor, source, hoverState, setHover, options.hoverTime || Hover.Time),
                ),
                showHoverTooltipHost,
            ],
        }
    }

    export namespace hover {
        export type Spec = {
            hideOn?: (tr: Transaction, tooltip: Tooltip) => boolean

            hideOnChange?: boolean | "touch"

            hoverTime?: number
        }

        export function has(state: EditorState) {
            return state.facet(showHoverTooltip).some((x) => x)
        }

        export const closeAll = closeHoverTooltipEffect.of(null)
    }
}


/** Facet of active hover tooltip lists (combined by concatenation). */
export const showHoverTooltip = EditorState.Facet.define<readonly Tooltip[], readonly Tooltip[]>({
    combine: (inputs) => inputs.reduce((a, i) => a.concat(i), []),
})

/** Host view that embeds multiple hover tooltips as sections of one bubble. */
export class HoverTooltipHost implements Tooltip.View {
    dom: HTMLElement
    connected: boolean = false
    private readonly manager: TooltipViewManager

    private constructor(readonly editor: Arrisa) {
        this.dom = document.createElement("arrisa-tooltip-hover")
        this.manager = new TooltipViewManager(
            editor,
            showHoverTooltip,
            (t, p) => this.createHostedView(t, p),
            (t) => t.dom.remove(),
        )
    }

    get offset() {
        return this.passProp("offset")
    }

    get getCoords() {
        return this.passProp("getCoords")
    }

    get overlap() {
        return this.passProp("overlap")
    }

    get resize() {
        return this.passProp("resize")
    }

    static create(editor: Arrisa) {
        return new HoverTooltipHost(editor)
    }

    createHostedView(tooltip: Tooltip, prev: Tooltip.View | null) {
        let hostedView = tooltip.create(this.editor)
        hostedView.dom.classList.add("arrisa-tooltip-section")
        this.dom.insertBefore(hostedView.dom, prev ? prev.dom.nextSibling : this.dom.firstChild)
        if (this.connected && hostedView.connect) hostedView.connect(this.editor)
        return hostedView
    }

    connect(editor: Arrisa) {
        for (let t of this.manager.tooltipViews) t.connect?.(editor)
        this.connected = true
    }

    disconnect(editor: Arrisa) {
        for (let t of this.manager.tooltipViews) t.disconnect?.(editor)
        this.connected = false
    }

    positioned(space: DOMRect) {
        for (let hostedView of this.manager.tooltipViews) {
            if (hostedView.positioned) hostedView.positioned(space)
        }
    }

    update(update: Arrisa.Update) {
        this.manager.update(update)
    }

    remove(editor: Arrisa) {
        for (let t of this.manager.tooltipViews) t.remove?.(editor)
    }

    passProp<Key extends keyof Tooltip.View>(name: Key): Tooltip.View[Key] | undefined {
        let value: Tooltip.View[Key] | undefined = undefined
        for (let view of this.manager.tooltipViews) {
            let given = view[name]
            if (given !== undefined) {
                if (value === undefined) value = given
                else if (value !== given) return undefined
            }
        }
        return value
    }
}

export const showHoverTooltipHost: EditorState.Extension = Tooltip.show.compute((state) => {
    let tooltips = state.facet(showHoverTooltip)
    if (tooltips.length === 0) return null

    return {
        pos: Math.min(...tooltips.map((t) => t.pos)),
        end: Math.max(...tooltips.map((t) => t.end ?? t.pos)),
        create: HoverTooltipHost.create,
        above: tooltips[0].above,
        arrow: tooltips.some((t) => t.arrow),
    }
})

export const enum Hover {
    /** Default delay before opening a hover tooltip (ms). */
    Time = 300,
    /** Pixel margin used when deciding the pointer still covers a range. */
    MaxDist = 6,
}

/** Plugin: mousemove dwell detection and hover tooltip lifecycle. */
export class HoverPlugin {
    lastMove: {x: number; y: number; target: HTMLElement; time: number}
    hoverTimeout = -1
    restartTimeout = -1
    pending: {pos: number} | null = null

    constructor(
        readonly editor: Arrisa,
        readonly source: HoverTooltipSource,
        readonly field: EditorState.Field<readonly Tooltip[]>,
        readonly setHover: Transaction.Effect.Type<readonly Tooltip[]>,
        readonly hoverTime: number,
    ) {
        this.lastMove = {x: 0, y: 0, target: editor.dom, time: 0}
        this.checkHover = this.checkHover.bind(this)
        editor.dom.addEventListener("mouseleave", (this.mouseleave = this.mouseleave.bind(this)))
        editor.dom.addEventListener("mousemove", (this.mousemove = this.mousemove.bind(this)))
    }

    get active() {
        return this.editor.state.field(this.field)
    }

    get tooltip() {
        let plugin = this.editor.plugin(tooltipPlugin)
        let index = plugin ? plugin.manager.tooltips.findIndex((t) => t.create == HoverTooltipHost.create) : -1
        return index > -1 ? plugin!.manager.tooltipViews[index] : null
    }

    update() {
        if (this.pending) {
            this.pending = null
            clearTimeout(this.restartTimeout)
            this.restartTimeout = setTimeout(() => this.startHover(), 20)
        }
    }

    checkHover() {
        this.hoverTimeout = -1
        if (this.active.length) return
        let hovered = Date.now() - this.lastMove.time
        if (hovered < this.hoverTime) this.hoverTimeout = setTimeout(this.checkHover, this.hoverTime - hovered)
        else this.startHover()
    }

    startHover() {
        clearTimeout(this.restartTimeout)
        let {editor, lastMove} = this
        let {pos, side} = editor.posAtCoords(lastMove)
        let open = this.source(editor, pos, side || -1)

        if ((open as any)?.then) {
            let pending = (this.pending = {pos})
            ;(open as Promise<Tooltip | null>).then(
                (result) => {
                    if (this.pending == pending) {
                        this.pending = null
                        if (result && !(Array.isArray(result) && !result.length))
                            editor.dispatch({effects: this.setHover.of(Array.isArray(result) ? result : [result])})
                    }
                },
                (e) => logException(editor.state, e, "hover tooltip"),
            )
        } else if (open && !(Array.isArray(open) && !open.length)) {
            editor.dispatch({effects: this.setHover.of(Array.isArray(open) ? open : [open])})
        }
    }

    mousemove(event: MouseEvent) {
        this.lastMove = {x: event.clientX, y: event.clientY, target: event.target as HTMLElement, time: Date.now()}
        if (this.hoverTimeout < 0) this.hoverTimeout = setTimeout(this.checkHover, this.hoverTime)
        let {active, tooltip} = this
        if ((active.length && tooltip && !isInTooltip(tooltip.dom, event)) || this.pending) {
            let {pos} = active[0] || this.pending!,
                end = active[0]?.end ?? pos
            if (
                pos == end
                    ? this.editor.posAtCoords(this.lastMove).pos != pos
                    : !isOverRange(this.editor, pos, end, event.clientX, event.clientY, Hover.MaxDist)
            ) {
                this.editor.dispatch({effects: this.setHover.of([])})
                this.pending = null
            }
        }
    }

    mouseleave(event: MouseEvent) {
        clearTimeout(this.hoverTimeout)
        this.hoverTimeout = -1
        let {active} = this
        if (active.length) {
            let {tooltip} = this
            let inTooltip = tooltip && tooltip.dom.contains(event.relatedTarget as HTMLElement)
            if (!inTooltip) this.editor.dispatch({effects: this.setHover.of([])})
            else this.watchTooltipLeave(tooltip!.dom)
        }
    }

    watchTooltipLeave(tooltip: HTMLElement) {
        let watch = (event: MouseEvent) => {
            tooltip.removeEventListener("mouseleave", watch)
            if (this.active.length && !this.editor.dom.contains(event.relatedTarget as HTMLElement))
                this.editor.dispatch({effects: this.setHover.of([])})
        }
        tooltip.addEventListener("mouseleave", watch)
    }

    remove() {
        clearTimeout(this.hoverTimeout)
        this.editor.dom.removeEventListener("mouseleave", this.mouseleave)
        this.editor.dom.removeEventListener("mousemove", this.mousemove)
    }
}

const tooltipMargin = 4

/** Whether the pointer is inside the tooltip (including arrow and margin). */
export function isInTooltip(tooltip: HTMLElement, event: MouseEvent) {
    let {left, right, top, bottom} = tooltip.getBoundingClientRect(),
        arrow
    if ((arrow = tooltip.querySelector(".arrisa-tooltip-arrow"))) {
        let arrowRect = arrow.getBoundingClientRect()
        top = Math.min(arrowRect.top, top)
        bottom = Math.max(arrowRect.bottom, bottom)
    }
    return (
        event.clientX >= left - tooltipMargin &&
        event.clientX <= right + tooltipMargin &&
        event.clientY >= top - tooltipMargin &&
        event.clientY <= bottom + tooltipMargin
    )
}

/**
 * Whether `(x, y)` still covers the document range `[from, to]`.
 * Content bounds are expanded by `margin` pixels so small pointer slips
 * do not immediately dismiss hover tooltips.
 */
export function isOverRange(editor: Arrisa, from: number, to: number, x: number, y: number, margin: number) {
    let rect = editor.contentDOM.getBoundingClientRect()
    if (rect.left - margin > x || rect.right + margin < x || rect.top - margin > y || rect.bottom + margin < y)
        return false
    let pos = editor.posAtCoords({x, y}).pos
    return pos >= from && pos <= to
}
