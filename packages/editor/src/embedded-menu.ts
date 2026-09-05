/**
 * Menu toolbar mounted into a host-supplied parent (not a Panel).
 *
 * Install with {@link embeddedMenu}. DOM and interaction live in {@link MenuHost};
 * this module wires the plugin, template, and compact row theme (no bottom border).
 */
import {EditorState} from "@arrisa/state"
import {Menu} from "@arrisa/command"
import {Arrisa} from "./editor"
import {MenuHost, sharedMenuTheme} from "./menu-dom"

/**
 * Configuration for {@link embeddedMenu}.
 *
 * Styles/layout are fully overridable via `theme`, `class`, `createDOM`, or CSS
 * variables (`--arrisa-menu-gap`, `--arrisa-menu-padding`, `--arrisa-menu-color`,
 * `--arrisa-menu-item-size`, …).
 */
export interface EmbeddedMenuConfig {
    /** Host element, or a getter resolved when the editor connects. */
    parent: HTMLElement | (() => HTMLElement)
    /** Menu structure. Defaults to `[Menu.Group.top.template()]`. */
    template?: Menu.Template | readonly Menu.Template[]
    /** Extra class name(s) on the root element. */
    class?: string
    /** Override root element creation (default: `arrisa-menubar`). */
    createDOM?: () => HTMLElement
    /**
     * Default theme: `true` (include), `false` (omit — style via `Arrisa.theme`
     * or host CSS), or a custom extension replacing the default row chrome.
     */
    theme?: boolean | EditorState.Extension
}

const embeddedTemplate = EditorState.Facet.define<readonly Menu.Template[], readonly Menu.Template[]>({
    combine: (inputs) => (inputs.length ? inputs[0] : [Menu.Group.top.template()]),
})

const embeddedConfig = EditorState.Facet.define<EmbeddedMenuConfig, EmbeddedMenuConfig>({
    combine(configs) {
        let conf = {} as EmbeddedMenuConfig
        for (let c of configs) conf = {...conf, ...c}
        return conf
    },
})

class EmbeddedMenu {
    host: MenuHost
    parent: HTMLElement | (() => HTMLElement)
    classes = ""

    constructor(readonly editor: Arrisa) {
        let conf = editor.state.facet(embeddedConfig)
        this.parent = conf.parent
        this.host = new MenuHost(editor, {
            variant: "bar",
            template: embeddedTemplate,
            class: conf.class,
            createDOM: conf.createDOM,
        })
        this.syncTheme()
    }

    private resolveParent() {
        let p = this.parent
        return typeof p == "function" ? p() : p
    }

    /** Theme classes on the menu root so `Arrisa.styles` match outside the editor. */
    private syncTheme() {
        let next = this.editor.themeClasses
        if (next == this.classes) return
        let {classList} = this.host.dom
        for (let cls of this.classes.split(" ")) if (cls) classList.remove(cls)
        for (let cls of next.split(" ")) if (cls) classList.add(cls)
        this.classes = next
    }

    update(update: Arrisa.Update) {
        this.host.update(update)
        this.syncTheme()
    }

    connect() {
        this.host.connect()
        this.syncTheme()
        this.resolveParent().appendChild(this.host.dom)
    }

    disconnect() {
        this.unmount()
    }

    remove() {
        this.unmount()
    }

    private unmount() {
        let {dom} = this.host
        if (dom.parentNode) dom.parentNode.removeChild(dom)
    }
}

const embeddedPlugin = Arrisa.Plugin.fromClass(EmbeddedMenu)

// Themed node is host.dom (outside Arrisa.dom). `&` styles the root; cancel editor border.
const embeddedShellTheme = Arrisa.styles({
    "&": {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: "var(--arrisa-menu-gap, 5px)",
        padding: "var(--arrisa-menu-padding, 3px)",
        color: "var(--arrisa-menu-color)",
        border: "none",
    },
})

const defaultEmbeddedTheme: EditorState.Extension = [sharedMenuTheme, embeddedShellTheme]

/** Toolbar mounted into `config.parent`; optional overrides for template, DOM, and theme. */
export function embeddedMenu(config: EmbeddedMenuConfig): EditorState.Extension {
    let extensions: EditorState.Extension[] = [embeddedPlugin, embeddedConfig.of(config)]
    if (config.template)
        extensions.push(embeddedTemplate.of(Array.isArray(config.template) ? config.template : [config.template]))

    let themeOpt = config.theme
    if (themeOpt === false) {
        // consumer supplies styles
    } else if (themeOpt === true || themeOpt === undefined) {
        extensions.push(defaultEmbeddedTheme)
    } else {
        extensions.push(themeOpt)
    }
    return extensions
}
