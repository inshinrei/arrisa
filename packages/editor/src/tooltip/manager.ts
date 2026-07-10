/**
 * Tooltip view manager and positioning plugin.
 *
 * {@link showTooltip} enables the plugin. Views are matched across updates by
 * the identity of `tooltip.create`. Measure splits into DOM read
 * ({@link TooltipViewManager} consumers call schedule) and write so layout
 * thrashing is avoided; fixed positioning may fall back to absolute on Safari
 * or when an offset parent is present.
 */
import browser from "../browser"
import {EditorState} from "@arrisa/state"
import {Arrisa} from "../editor"
import type {Tooltip} from "./types"
import {windowRect} from "../dom"

/** Geometry snapshot used when writing tooltip positions. */
export type Measured = {
    visible: DOMRect
    parent: DOMRect
    pos: (DOMRect | null)[]
    size: DOMRect[]
    space: DOMRect
    scaleX: number
    scaleY: number
    makeAbsolute: boolean
}

const Outside = "-10000px"

export const enum Arrow {
    Size = 7,
    Offset = 14,
}

const noOffset = {x: 0, y: 0}

/** Syncs facet tooltip list to live {@link Tooltip.View} instances. */
export class TooltipViewManager {
    tooltips: readonly Tooltip[]
    tooltipViews: readonly Tooltip.View[]
    private input: readonly (Tooltip | null)[]

    constructor(
        editor: Arrisa,
        private readonly facet: EditorState.Facet.Reader<readonly (Tooltip | null)[]>,
        private readonly createTooltipView: (tooltip: Tooltip, after: Tooltip.View | null) => Tooltip.View,
        private readonly removeTooltipView: (tooltipView: Tooltip.View) => void,
    ) {
        this.input = editor.state.facet(facet)
        this.tooltips = this.input.filter((t) => t) as Tooltip[]
        let prev: Tooltip.View | null = null
        this.tooltipViews = this.tooltips.map((t) => (prev = createTooltipView(t, prev)))
    }

    update(update: Arrisa.Update, above?: boolean[]) {
        let input = update.state.facet(this.facet)
        let tooltips = input.filter((x) => x) as Tooltip[]
        if (input === this.input) {
            for (let t of this.tooltipViews) if (t.update) t.update(update)
            return false
        }

        let tooltipViews: Tooltip.View[] = [],
            newAbove: boolean[] | null = above ? [] : null
        for (let i = 0; i < tooltips.length; i++) {
            let tip = tooltips[i],
                known = -1
            if (!tip) continue
            for (let i = 0; i < this.tooltips.length; i++) {
                let other = this.tooltips[i]
                if (other && other.create == tip.create) known = i
            }
            if (known < 0) {
                tooltipViews[i] = this.createTooltipView(tip, i ? tooltipViews[i - 1] : null)
                if (newAbove) newAbove[i] = !!tip.above
            } else {
                let tooltipView = (tooltipViews[i] = this.tooltipViews[known])
                if (newAbove) newAbove[i] = above![known]
                if (tooltipView.update) tooltipView.update(update)
            }
        }
        for (let t of this.tooltipViews)
            if (tooltipViews.indexOf(t) < 0) {
                this.removeTooltipView(t)
                if (update.editor.connected) t.disconnect?.(update.editor)
                t.remove?.(update.editor)
            }
        if (above) {
            newAbove!.forEach((val, i) => (above[i] = val))
            above.length = newAbove!.length
        }

        this.input = input
        this.tooltips = tooltips
        this.tooltipViews = tooltipViews
        return true
    }
}

export type TooltipConfig = {
    position: "fixed" | "absolute"
    parent: HTMLElement | null
    tooltipSpace: (editor: Arrisa) => DOMRect
}

export const tooltipConfig = EditorState.Facet.define<Partial<TooltipConfig>, TooltipConfig>({
    combine: (values) => ({
        position: browser.ios ? "absolute" : values.find((conf) => conf.position)?.position || "fixed",
        parent: values.find((conf) => conf.parent)?.parent || null,
        tooltipSpace: values.find((conf) => conf.tooltipSpace)?.tooltipSpace || ((editor) => windowRect(editor.win)),
    }),
})

const knownHeight = new WeakMap<Tooltip.View, number>()

export const enum C {
    minVertSpace = 15,
}

export const tooltipPlugin = Arrisa.Plugin.fromClass(
    class {
        manager: TooltipViewManager
        above: boolean[] = []
        inView = true
        position: "fixed" | "absolute"
        madeAbsolute = false
        parent: HTMLElement | null
        declare container: HTMLElement
        classes: string
        intersectionObserver: IntersectionObserver | null
        resizeObserver: ResizeObserver | null
        lastTransaction = 0
        measureTimeout = -1

        constructor(readonly editor: Arrisa) {
            let config = editor.state.facet(tooltipConfig)
            this.position = config.position
            this.parent = config.parent
            this.classes = editor.themeClasses
            this.createContainer()
            this.measure = this.measure.bind(this)
            this.resizeObserver =
                typeof ResizeObserver == "function" ? new ResizeObserver(() => this.measureSoon()) : null
            this.manager = new TooltipViewManager(
                editor,
                showTooltip,
                (t, p) => this.createTooltip(t, p),
                (t) => {
                    if (this.resizeObserver) this.resizeObserver.unobserve(t.dom)
                    t.dom.remove()
                },
            )
            this.above = this.manager.tooltips.map((t) => !!t.above)
            this.intersectionObserver =
                typeof IntersectionObserver == "function"
                    ? new IntersectionObserver(
                          (entries) => {
                              if (
                                  Date.now() > this.lastTransaction - 50 &&
                                  entries.length > 0 &&
                                  entries[entries.length - 1].intersectionRatio < 1
                              )
                                  this.measureSoon()
                          },
                          {threshold: [1]},
                      )
                    : null
            this.observeIntersection()
            this.maybeMeasure()
        }

        createContainer() {
            if (this.parent) {
                this.container = document.createElement("arrisa-tooltip-root")
                this.container.style.position = "relative"
                this.container.className = this.editor.themeClasses
                this.parent.appendChild(this.container)
            } else {
                this.container = this.editor.dom
            }
        }

        observeIntersection() {
            if (this.intersectionObserver && this.editor.connected) {
                this.intersectionObserver.disconnect()
                for (let tooltip of this.manager.tooltipViews) this.intersectionObserver.observe(tooltip.dom)
            }
        }

        measureSoon() {
            if (this.measureTimeout < 0)
                this.measureTimeout = setTimeout(() => {
                    this.measureTimeout = -1
                    this.maybeMeasure()
                }, 50)
        }

        update(update: Arrisa.Update) {
            if (update.transactions.length) this.lastTransaction = Date.now()
            let updated = this.manager.update(update, this.above)
            if (updated) this.observeIntersection()
            let shouldMeasure = updated || update.geometryChanged
            let newConfig = update.state.facet(tooltipConfig)
            if (newConfig.position != this.position && !this.madeAbsolute) {
                this.position = newConfig.position
                for (let t of this.manager.tooltipViews) t.dom.style.position = this.position
                shouldMeasure = true
            }
            if (newConfig.parent != this.parent) {
                if (this.parent) this.container.remove()
                this.parent = newConfig.parent
                this.createContainer()
                for (let t of this.manager.tooltipViews) this.container.appendChild(t.dom)
                shouldMeasure = true
            } else if (this.parent && this.editor.themeClasses != this.classes) {
                this.classes = this.container.className = this.editor.themeClasses
            }
            if (shouldMeasure) this.maybeMeasure()
        }

        createTooltip(tooltip: Tooltip, prev: Tooltip.View | null) {
            let tooltipView = tooltip.create(this.editor)
            let before = prev ? prev.dom : null
            tooltipView.dom.classList.add("arrisa-tooltip")
            if (tooltip.arrow && !tooltipView.dom.querySelector(".arrisa-tooltip > arrisa-tooltip-arrow")) {
                let arrow = document.createElement("arrisa-tooltip-arrow")
                tooltipView.dom.appendChild(arrow)
            }
            tooltipView.dom.style.position = this.position
            tooltipView.dom.style.top = Outside
            tooltipView.dom.style.left = "0px"
            this.container.insertBefore(tooltipView.dom, before)
            if (this.editor.connected) tooltipView.connect?.(this.editor)
            if (this.resizeObserver && this.editor.connected) this.resizeObserver.observe(tooltipView.dom)
            return tooltipView
        }

        connect(editor: Arrisa) {
            editor.win.addEventListener("resize", (this.measureSoon = this.measureSoon.bind(this)))
            for (let t of this.manager.tooltipViews) {
                t.connect?.(editor)
                if (this.resizeObserver) this.resizeObserver.observe(t.dom)
            }
            this.observeIntersection()
        }

        disconnect(editor: Arrisa) {
            this.editor.win.removeEventListener("resize", this.measureSoon)
            for (let t of this.manager.tooltipViews) {
                t.disconnect?.(editor)
                if (this.resizeObserver) this.resizeObserver.unobserve(t.dom)
            }
            if (this.intersectionObserver) this.intersectionObserver.disconnect()
        }

        remove() {
            for (let tooltipView of this.manager.tooltipViews) {
                tooltipView.dom.remove()
                if (this.editor.connected) tooltipView.disconnect?.(this.editor)
                tooltipView.remove?.(this.editor)
            }
            if (this.parent) this.container.remove()
            clearTimeout(this.measureTimeout)
        }

        measure() {
            let measure = this.readMeasure()
            this.editor.scheduleDOMWrite(() => this.writeMeasure(measure))
        }

        readMeasure(): Measured {
            let scaleX = 1,
                scaleY = 1,
                makeAbsolute = false
            if (this.position == "fixed" && this.manager.tooltipViews.length) {
                let {dom} = this.manager.tooltipViews[0]
                if (browser.safari) {
                    let rect = dom.getBoundingClientRect()
                    makeAbsolute = Math.abs(rect.top + 10000) > 1 || Math.abs(rect.left) > 1
                } else {
                    makeAbsolute = !!dom.offsetParent && dom.offsetParent != this.container.ownerDocument.body
                }
            }
            if (makeAbsolute || this.position == "absolute") {
                let measure = this.parent || this.container,
                    rect = measure.getBoundingClientRect()
                if (rect.width && rect.height) {
                    scaleX = rect.width / measure.offsetWidth
                    scaleY = rect.height / measure.offsetHeight
                }
            }
            let visible = this.editor.scrollDOM.getBoundingClientRect(),
                margins = this.editor.getScrollMargins()
            let visLeft = visible.left + margins.left,
                visTop = visible.top + margins.top
            return {
                visible: new DOMRect(
                    visLeft,
                    visTop,
                    visible.right - margins.right - visLeft,
                    visible.bottom - margins.bottom - visTop,
                ),
                parent: this.parent ? this.container.getBoundingClientRect() : this.editor.dom.getBoundingClientRect(),
                pos: this.manager.tooltips.map((t, i) => {
                    let tv = this.manager.tooltipViews[i]
                    return tv.getCoords ? tv.getCoords(t.pos) : this.editor.coordsAtPos(t.pos)
                }),
                size: this.manager.tooltipViews.map(({dom}) => dom.getBoundingClientRect()),
                space: this.editor.state.facet(tooltipConfig).tooltipSpace(this.editor),
                scaleX,
                scaleY,
                makeAbsolute,
            }
        }

        writeMeasure(measured: Measured) {
            if (measured.makeAbsolute) {
                this.madeAbsolute = true
                this.position = "absolute"
                for (let t of this.manager.tooltipViews) t.dom.style.position = "absolute"
            }

            let {visible, space, scaleX, scaleY} = measured
            let others = []
            for (let i = 0; i < this.manager.tooltips.length; i++) {
                let tooltip = this.manager.tooltips[i],
                    tView = this.manager.tooltipViews[i],
                    {dom} = tView
                let pos = measured.pos[i],
                    size = measured.size[i]

                if (
                    !pos ||
                    (tooltip.clip !== false &&
                        (pos.bottom <= Math.max(visible.top, space.top) ||
                            pos.top >= Math.min(visible.bottom, space.bottom) ||
                            pos.right < Math.max(visible.left, space.left) - 0.1 ||
                            pos.left > Math.min(visible.right, space.right) + 0.1))
                ) {
                    dom.style.top = Outside
                    continue
                }
                let arrow: HTMLElement | null = tooltip.arrow ? tView.dom.querySelector("arrisa-tooltip-arrow") : null
                let arrowHeight = arrow ? Arrow.Size : 0
                let width = size.right - size.left,
                    height = knownHeight.get(tView) ?? size.bottom - size.top
                let offset = tView.offset || noOffset,
                    ltr = this.editor.state.textLTR
                let left =
                    size.width > space.right - space.left
                        ? ltr
                            ? space.left
                            : space.right - size.width
                        : ltr
                          ? Math.max(
                                space.left,
                                Math.min(pos.left - (arrow ? Arrow.Offset : 0) + offset.x, space.right - width),
                            )
                          : Math.min(
                                Math.max(space.left, pos.left - width + (arrow ? Arrow.Offset : 0) - offset.x),
                                space.right - width,
                            )
                let above = this.above[i]
                if (
                    !tooltip.strictSide &&
                    (above
                        ? pos.top - height - arrowHeight - offset.y < space.top
                        : pos.bottom + height + arrowHeight + offset.y > space.bottom) &&
                    above == space.bottom - pos.bottom > pos.top - space.top
                )
                    above = this.above[i] = !above
                let spaceVert = (above ? pos.top - space.top : space.bottom - pos.bottom) - arrowHeight
                if (spaceVert < height && tView.resize !== false) {
                    if (spaceVert < C.minVertSpace) {
                        dom.style.top = Outside
                        continue
                    }
                    knownHeight.set(tView, height)
                    dom.style.height = (height = spaceVert) / scaleY + "px"
                } else if (dom.style.height) {
                    dom.style.height = ""
                }
                let top = above ? pos.top - height - arrowHeight - offset.y : pos.bottom + arrowHeight + offset.y
                let right = left + width
                if (tView.overlap !== true)
                    for (let r of others)
                        if (r.left < right && r.right > left && r.top < top + height && r.bottom > top)
                            top = above ? r.top - height - 2 - arrowHeight : r.bottom + arrowHeight + 2
                if (this.position == "absolute") {
                    dom.style.top = (top - measured.parent.top) / scaleY + "px"
                    setLeftStyle(dom, (left - measured.parent.left) / scaleX)
                } else {
                    dom.style.top = top / scaleY + "px"
                    setLeftStyle(dom, left / scaleX)
                }
                if (arrow) {
                    let arrowLeft = pos.left + (ltr ? offset.x : -offset.x) - (left + Arrow.Offset - Arrow.Size)
                    arrow.style.left = arrowLeft / scaleX + "px"
                }

                if (tView.overlap !== true) others.push({left, top, right, bottom: top + height})
                dom.classList.toggle("arrisa-tooltip-above", above)
                dom.classList.toggle("arrisa-tooltip-below", !above)
                if (tView.positioned) tView.positioned(measured.space)
            }
        }

        maybeMeasure() {
            if (this.manager.tooltips.length) this.editor.scheduleDOMRead(this.measure)
        }
    },
    (plugin) => plugin.eventObserver("scroll", (event, editor, value) => value.maybeMeasure()),
)

/** Set `style.left` only when the value changes by more than 1px. */
export function setLeftStyle(elt: HTMLElement, value: number) {
    let current = parseInt(elt.style.left, 10)
    if (isNaN(current) || Math.abs(value - current) > 1) elt.style.left = value + "px"
}

/** Base tooltip + arrow styles (defined before {@link showTooltip} so `enables` can reference them). */
export const styles: EditorState.Extension = Arrisa.styles({
    ".arrisa-tooltip": {
        zIndex: 500,
        boxSizing: "border-box",
        backgroundColor: "var(--arrisa-panel-color)",
        boxShadow: "0 0 8px 0 rgba(128, 128, 128, 0.2)",
        font: "var(--arrisa-dialog-font)",
    },
    ".arrisa-tooltip-section:not(:first-child)": {
        borderTop: "1px solid var(--arrisa-border-color)",
    },
    "arrisa-tooltip-arrow": {
        display: "block",
        height: `${Arrow.Size}px`,
        width: `${Arrow.Size * 2}px`,
        position: "absolute",
        zIndex: -1,
        overflow: "hidden",
        "&:before, &:after": {
            content: "''",
            position: "absolute",
            width: 0,
            height: 0,
            borderLeft: `${Arrow.Size}px solid transparent`,
            borderRight: `${Arrow.Size}px solid transparent`,
        },
        ".arrisa-tooltip-above &": {
            bottom: `-${Arrow.Size}px`,
            "&:before": {
                borderTop: `${Arrow.Size}px solid var(--arrisa-border-color)`,
            },
            "&:after": {
                borderTop: `${Arrow.Size}px solid var(--arrisa-panel-color)`,
                bottom: "1px",
            },
        },
        ".arrisa-tooltip-below &": {
            top: `-${Arrow.Size}px`,
            "&:before": {
                borderBottom: `${Arrow.Size}px solid var(--arrisa-border-color)`,
            },
            "&:after": {
                borderBottom: `${Arrow.Size}px solid var(--arrisa-panel-color)`,
                top: "1px",
            },
        },
    },
})

/** Facet of tooltips to show (null entries ignored). Enables the tooltip plugin. */
export const showTooltip = EditorState.Facet.define<Tooltip | null>({
    enables: () => [tooltipPlugin, styles],
})

