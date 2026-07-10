/**
 * Horizontal sticky menu bar panel backed by `@arrisa/command` menu items.
 *
 * Install with {@link menuBar}. The bar is a top {@link Panel} that resolves
 * `Menu.Item` sources into buttons, submenus, and custom controls. DOM and
 * interaction live in {@link MenuHost}; this module only wires the panel and
 * bar-specific theme/config.
 */
import {EditorState} from "@arrisa/state"
import {Menu} from "@arrisa/command"
import {Arrisa} from "./editor"
import {Panel} from "./panel"
import {MenuHost, sharedMenuTheme} from "./menu-dom"

/**
 * Configuration for {@link menuBar}.
 *
 * Styles/layout are fully overridable via `theme`, `class`, `createDOM`, or CSS
 * variables (`--arrisa-menu-gap`, `--arrisa-menu-padding`, `--arrisa-menu-color`,
 * `--arrisa-menu-item-size`, …).
 */
export interface MenuBarConfig {
    /** Menu structure. Defaults to `[Menu.Group.top.template()]`. */
    template?: Menu.Template | readonly Menu.Template[]
    /** Extra class name(s) on the root element. */
    class?: string
    /** Override root element creation (default: `arrisa-menubar`). */
    createDOM?: () => HTMLElement
    /**
     * Default theme: `true` (include), `false` (omit — style via `Arrisa.theme`
     * or host CSS), or a custom extension replacing the default bar chrome.
     */
    theme?: boolean | EditorState.Extension
}

const barTemplate = EditorState.Facet.define<readonly Menu.Template[], readonly Menu.Template[]>({
    combine: (inputs) => (inputs.length ? inputs[0] : [Menu.Group.top.template()]),
})

const barConfig = EditorState.Facet.define<MenuBarConfig, MenuBarConfig>({
    combine(configs) {
        let conf: MenuBarConfig = {}
        for (let c of configs) conf = {...conf, ...c}
        return conf
    },
})

const menuBarPanel = Panel.show.of((editor) => new MenuBar(editor))

class MenuBar {
    host: MenuHost
    dom: HTMLElement

    constructor(readonly editor: Arrisa) {
        let conf = editor.state.facet(barConfig)
        this.host = new MenuHost(editor, {
            variant: "bar",
            template: barTemplate,
            class: conf.class,
            createDOM: conf.createDOM,
        })
        this.dom = this.host.dom
    }

    update(update: Arrisa.Update) {
        this.host.update(update)
    }

    connect() {
        this.host.connect()
    }

    get top() {
        return true
    }
}

const barShellTheme = Arrisa.styles({
    "arrisa-menubar, .arrisa-menubar": {
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--arrisa-menu-gap, 5px)",
        padding: "var(--arrisa-menu-padding, 3px)",
        color: "var(--arrisa-menu-color)",
        borderBottom: "1px solid var(--arrisa-border-color)",
    },
})

const defaultBarTheme: EditorState.Extension = [sharedMenuTheme, barShellTheme]

/** Menu bar extension; optional config overrides template, DOM, and theme. */
export function menuBar(config: MenuBarConfig = {}): EditorState.Extension {
    let extensions: EditorState.Extension[] = [menuBarPanel, barConfig.of(config)]
    if (config.template)
        extensions.push(barTemplate.of(Array.isArray(config.template) ? config.template : [config.template]))

    let themeOpt = config.theme
    if (themeOpt === false) {
        // consumer supplies styles
    } else if (themeOpt === true || themeOpt === undefined) {
        extensions.push(defaultBarTheme)
    } else {
        extensions.push(themeOpt)
    }
    return extensions
}
