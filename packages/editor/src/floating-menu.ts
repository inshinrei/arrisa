/**
 * Floating selection toolbar. Default UX: appears above a non-empty selection.
 *
 * Menu items come from `Menu.Item` extensions (schema, history, consumer).
 * Positioning uses {@link Tooltip.show}; DOM/interaction via {@link MenuHost}.
 */
import {EditorState} from "@arrisa/state"
import {Menu} from "@arrisa/command"
import {Arrisa} from "./editor"
import {Tooltip} from "./tooltip"
import {isFocusChange} from "./input"
import {MenuHost, sharedMenuTheme} from "./menu-dom"

/** Configuration for {@link floatingMenu}. Styles/layout are fully overridable. */
export interface FloatingMenuConfig {
    /** Menu structure. Defaults to `[Menu.Group.top.template()]`. */
    template?: Menu.Template | readonly Menu.Template[]
    /**
     * When to show the floating menu.
     * Default: non-empty text selection.
     */
    when?: (state: EditorState) => boolean
    /** Prefer placing above the selection. Default true. */
    above?: boolean
    /** Hide when the editor loses focus. Default true. */
    hideOnBlur?: boolean
    /** Optional: override how the tooltip root is created. */
    createDOM?: (editor: Arrisa) => HTMLElement
    /** Extra class name(s) on the root. */
    class?: string
    /**
     * Default theme: `true` (include), `false` (omit — style via `Arrisa.theme`
     * or host CSS), or a custom extension replacing the default floating chrome.
     */
    theme?: boolean | EditorState.Extension
}

export type FloatingMenuResolved = Required<Pick<FloatingMenuConfig, "above" | "hideOnBlur">> & FloatingMenuConfig

const floatingTemplate = EditorState.Facet.define<readonly Menu.Template[], readonly Menu.Template[]>({
    combine: (inputs) => (inputs.length ? inputs[0] : [Menu.Group.top.template()]),
})

const floatingConfig = EditorState.Facet.define<FloatingMenuConfig, FloatingMenuResolved>({
    combine(configs) {
        let conf: FloatingMenuConfig = {}
        for (let c of configs) conf = {...conf, ...c}
        return {
            ...conf,
            above: conf.above !== false,
            hideOnBlur: conf.hideOnBlur !== false,
        }
    },
})

/** Tracks content focus via {@link isFocusChange} for hideOnBlur. */
const editorFocused = EditorState.Field.define<boolean>({
    create() {
        return false
    },
    update(value, tr) {
        let f = tr.annotation(isFocusChange)
        return f === undefined ? value : f
    },
})

/** Default visibility: non-empty selection. */
export function defaultFloatingWhen(state: EditorState): boolean {
    return !state.selection.empty
}

const floatingTooltip = Tooltip.show.compute((state) => {
    let conf = state.facet(floatingConfig)
    let when = conf.when ?? defaultFloatingWhen
    if (!when(state)) return null
    if (conf.hideOnBlur && !state.field(editorFocused)) return null

    let {from, to} = state.selection
    return {
        pos: from,
        end: to,
        above: conf.above,
        strictSide: false,
        create: FloatingMenuView.create,
    }
})

class FloatingMenuView implements Tooltip.View {
    host: MenuHost
    dom: HTMLElement

    private constructor(readonly editor: Arrisa) {
        let conf = editor.state.facet(floatingConfig)
        this.host = new MenuHost(editor, {
            variant: "floating",
            template: floatingTemplate,
            class: conf.class,
            createDOM: conf.createDOM ? () => conf.createDOM!(editor) : undefined,
        })
        this.dom = this.host.dom
    }

    static create(editor: Arrisa) {
        return new FloatingMenuView(editor)
    }

    update(update: Arrisa.Update) {
        this.host.update(update)
    }

    connect() {
        this.host.connect()
    }
}

const floatingShellTheme = Arrisa.styles({
    "arrisa-floating-menu, .arrisa-floating-menu": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "var(--arrisa-menu-gap, 4px)",
        padding: "var(--arrisa-menu-padding, 4px 6px)",
        borderRadius: "var(--arrisa-floating-radius, 8px)",
        backgroundColor: "var(--arrisa-panel-color)",
        boxShadow: "var(--arrisa-floating-shadow, 0 4px 16px rgba(0, 0, 0, 0.12))",
        border: "1px solid var(--arrisa-border-color)",
        color: "var(--arrisa-menu-color, inherit)",
    },
})

const defaultFloatingTheme: EditorState.Extension = [sharedMenuTheme, floatingShellTheme]

/**
 * Floating selection toolbar. Default placement: above selected text.
 * Menu items come from Menu.Item extensions (schema, history, consumer).
 *
 * Styles/layout: override with {@link FloatingMenuConfig.theme}, `class`,
 * `createDOM`, or CSS variables (`--arrisa-menu-gap`, `--arrisa-menu-padding`,
 * `--arrisa-floating-radius`, `--arrisa-floating-shadow`, …).
 */
export function floatingMenu(config: FloatingMenuConfig = {}): EditorState.Extension {
    let extensions: EditorState.Extension[] = [floatingConfig.of(config), editorFocused, floatingTooltip]
    if (config.template) {
        extensions.push(
            floatingTemplate.of(Array.isArray(config.template) ? config.template : [config.template]),
        )
    }

    let themeOpt = config.theme
    if (themeOpt === false) {
        // consumer supplies styles
    } else if (themeOpt === true || themeOpt === undefined) {
        extensions.push(defaultFloatingTheme)
    } else {
        extensions.push(themeOpt)
    }
    return extensions
}
