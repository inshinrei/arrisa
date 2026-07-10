/**
 * Host for editor chrome panels (dialogs, menu bar, custom UI).
 *
 * Extensions contribute constructors via {@link Panel.show}. The plugin keeps
 * top and bottom {@link PanelGroup}s in sync with facet order, mounts/unmounts
 * DOM, and reports covered scroll margins so content isn't hidden under chrome.
 * Optional {@link Panel.configure} places groups into external containers.
 */
import {EditorState} from "@arrisa/state"
import {Arrisa} from "./editor"
import {rmDOM} from "./dom"

type PanelConfig = {
    topContainer?: HTMLElement

    bottomContainer?: HTMLElement
}

const panelConfig = EditorState.Facet.define<PanelConfig, PanelConfig>({
    combine(configs: readonly PanelConfig[]) {
        let topContainer, bottomContainer
        for (let c of configs) {
            topContainer ||= c.topContainer
            bottomContainer ||= c.bottomContainer
        }
        return {topContainer, bottomContainer}
    },
})

export interface Panel {
    dom: HTMLElement

    /** When true (default for most UI), panel sits above the editor. */
    top?: boolean

    update?(update: Arrisa.Update): void

    connect?(editor: Arrisa): void

    disconnect?(editor: Arrisa): void

    remove?(editor: Arrisa): void
}

const panelPlugin = Arrisa.Plugin.fromClass(
    class {
        input: readonly (null | Panel.Constructor)[]
        specs: readonly Panel.Constructor[]
        panels: Panel[]
        top: PanelGroup
        bottom: PanelGroup

        constructor(editor: Arrisa) {
            this.input = editor.state.facet(Panel.show)
            this.specs = this.input.filter((s) => s) as Panel.Constructor[]
            this.panels = this.specs.map((spec) => spec(editor))
            for (let p of this.panels) p.dom.classList.add("arrisa-panel")
            let conf = editor.state.facet(panelConfig)
            this.top = new PanelGroup(editor, true, conf.topContainer)
            this.bottom = new PanelGroup(editor, false, conf.bottomContainer)
            this.top.sync(
                this.panels.filter((p) => p.top),
                editor,
            )
            this.bottom.sync(
                this.panels.filter((p) => !p.top),
                editor,
            )
        }

        update(update: Arrisa.Update) {
            let conf = update.state.facet(panelConfig)
            if (this.top.container != conf.topContainer) {
                this.top.sync([], update.editor)
                this.top = new PanelGroup(update.editor, true, conf.topContainer)
            }
            if (this.bottom.container != conf.bottomContainer) {
                this.bottom.sync([], update.editor)
                this.bottom = new PanelGroup(update.editor, false, conf.bottomContainer)
            }
            this.top.syncClasses()
            this.bottom.syncClasses()
            let input = update.state.facet(Panel.show)
            if (input != this.input) {
                let specs = input.filter((x) => x) as Panel.Constructor[]
                let panels = [],
                    top: Panel[] = [],
                    bottom: Panel[] = [],
                    mount = []
                for (let spec of specs) {
                    let known = this.specs.indexOf(spec),
                        panel
                    if (known < 0) {
                        panel = spec(update.editor)
                        mount.push(panel)
                    } else {
                        panel = this.panels[known]
                        if (panel.update) panel.update(update)
                    }
                    panels.push(panel)
                    ;(panel.top ? top : bottom).push(panel)
                }
                this.specs = specs
                this.panels = panels
                this.top.sync(top, update.editor)
                this.bottom.sync(bottom, update.editor)
                for (let p of mount) {
                    p.dom.classList.add("arrisa-panel")
                    if (p.connect && update.editor.connected) p.connect(update.editor)
                }
            } else {
                for (let p of this.panels) if (p.update) p.update(update)
            }
        }

        connect(editor: Arrisa) {
            for (let p of this.panels) p.connect?.(editor)
        }

        disconnect(editor: Arrisa) {
            for (let p of this.panels) p.disconnect?.(editor)
        }

        remove(editor: Arrisa) {
            this.top.sync([], editor)
            this.bottom.sync([], editor)
        }
    },
    (plugin) =>
        Arrisa.coveredMargins.of((view) => {
            // Facet is typed against the command protocol; panel needs the full view.
            let editor = view as Arrisa
            let value = editor.plugin(plugin)
            return value && {top: value.top.scrollMargin(), bottom: value.bottom.scrollMargin()}
        }),
)

export namespace Panel {
    export type Constructor = (editor: Arrisa) => Panel

    export const show = EditorState.Facet.define<Panel.Constructor | null>({
        enables: panelPlugin,
    })

    export function get(editor: Arrisa, panel: Panel.Constructor) {
        let plugin = editor.plugin(panelPlugin)
        let index = plugin ? plugin.specs.indexOf(panel) : -1
        return index > -1 ? plugin!.panels[index] : null
    }

    export function configure(config?: PanelConfig): EditorState.Extension {
        return config ? [panelConfig.of(config)] : []
    }
}

class PanelGroup {
    dom: HTMLElement | undefined = undefined
    classes = ""
    panels: Panel[] = []

    constructor(
        readonly editor: Arrisa,
        readonly top: boolean,
        readonly container: HTMLElement | undefined,
    ) {
        this.syncClasses()
    }

    sync(panels: Panel[], editor: Arrisa) {
        for (let p of this.panels)
            if (!panels.includes(p)) {
                if (editor.connected) p.disconnect?.(editor)
                p.remove?.(editor)
            }
        this.panels = panels
        this.syncDOM()
    }

    syncDOM() {
        if (this.panels.length == 0) {
            if (this.dom) {
                this.dom.remove()
                this.dom = undefined
            }
            return
        }

        if (!this.dom) {
            this.dom = document.createElement("arrisa-panels")
            this.dom.className = this.top ? "arrisa-panels-top" : "arrisa-panels-bottom"
            let parent = this.container || this.editor.dom
            parent.insertBefore(this.dom, this.top ? parent.firstChild : null)
        }

        let curDOM = this.dom.firstChild
        for (let panel of this.panels) {
            if (panel.dom.parentNode == this.dom) {
                while (curDOM != panel.dom) curDOM = rmDOM(curDOM!)
                curDOM = curDOM!.nextSibling
            } else {
                this.dom.insertBefore(panel.dom, curDOM)
            }
        }
        while (curDOM) curDOM = rmDOM(curDOM)
    }

    scrollMargin() {
        return !this.dom || this.container
            ? 0
            : Math.max(
                  0,
                  this.top
                      ? this.dom.getBoundingClientRect().bottom -
                            Math.max(0, this.editor.scrollDOM.getBoundingClientRect().top)
                      : Math.min(innerHeight, this.editor.scrollDOM.getBoundingClientRect().bottom) -
                            this.dom.getBoundingClientRect().top,
              )
    }

    syncClasses() {
        if (!this.container || this.classes == this.editor.themeClasses) return
        for (let cls of this.classes.split(" ")) if (cls) this.container.classList.remove(cls)
        for (let cls of (this.classes = this.editor.themeClasses).split(" ")) if (cls) this.container.classList.add(cls)
    }
}
