/**
 * Shared menu DOM for sticky {@link menuBar} and floating selection toolbars.
 *
 * Builds buttons / submenus / custom controls from resolved {@link Menu.Item}s,
 * tracks open/selected/disabled/active/hidden flag bits, and owns keyboard +
 * pointer navigation via {@link MenuHost}.
 */
import {PhraseSet} from "@arrisa/phrases"
import {EditorState} from "@arrisa/state"
import {Menu, Command} from "@arrisa/command"
import {Arrisa} from "./editor"

export interface MenuElement {
    dom: Element
    focusDOM: HTMLElement
    index: number
    item: Menu.Submenu | Menu.Button | Menu.CustomControl
    flags: F
    update(flags: F, editor: Arrisa, update: Arrisa.Update | null): void
    children: readonly MenuElement[] | null
    run: ((editor: Arrisa) => void) | null
}

let nextID = 0

function id(prefix: string) {
    return prefix + "-" + (nextID++ % 0xffffff).toString(16)
}

const SVG = "http://www.w3.org/2000/svg"

export function labelButton(editor: Arrisa, button: HTMLElement, label?: Menu.Label) {
    button.textContent = ""
    if (!label) {
    } else if (typeof label == "function" || typeof label == "string") {
        let span = button.appendChild(document.createElement("span"))
        span.className = "arrisa-button-label"
        span.textContent = typeof label == "string" ? label : label(editor.state)
    } else if ("icon" in label) {
        let svg = button.appendChild(document.createElementNS(SVG, "svg"))
        svg.classList.add("arrisa-icon")
        svg.setAttribute("viewBox", "0 0 100 100")
        let path = svg.appendChild(document.createElementNS(SVG, "path"))
        path.setAttribute("d", (label as {icon: string}).icon)
        if ((label as any).directional && !editor.state.textLTR) svg.setAttribute("transform", "scale(-1, 1)")
    }
}

/** Visual / a11y flag bits for menu elements. */
export const enum F {
    Open = 2,
    Selected = 4,
    Disabled = 8,
    Active = 16,
    Hidden = 32,
}

export class MenuButton implements MenuElement {
    dom: HTMLElement
    flags: F = 0 as F
    index = 0

    constructor(
        readonly item: Menu.Button,
        editor: Arrisa,
    ) {
        this.dom = document.createElement("button")
        this.dom.className = "arrisa-menu-button"
        this.dom.tabIndex = -1
        labelButton(editor, this.dom, item.label)
        if (item.description) {
            let desc = typeof item.description == "function" ? item.description(editor.state) : item.description
            this.dom.title = desc
            this.dom.setAttribute("aria-label", desc)
        }
    }

    get focusDOM() {
        return this.dom
    }

    update(flags: F, editor: Arrisa, _update: Arrisa.Update | null) {
        if (flags != this.flags) {
            if ((flags & F.Hidden) != (this.flags & F.Hidden)) this.dom.style.display = flags & F.Hidden ? "none" : ""
            if ((flags & F.Disabled) != (this.flags & F.Disabled)) {
                if (!(flags & F.Disabled)) this.dom.removeAttribute("aria-disabled")
                else this.dom.setAttribute("aria-disabled", "true")
            }
            if ((flags & F.Selected) != (this.flags & F.Selected)) {
                if (flags & F.Selected) this.dom.setAttribute("aria-selected", "true")
                else this.dom.removeAttribute("aria-selected")
                this.dom.tabIndex = flags & F.Selected ? 0 : -1
            }
            if ((flags & F.Active) != (this.flags & F.Active)) {
                if (flags & F.Active) this.dom.setAttribute("aria-pressed", "true")
                else this.dom.removeAttribute("aria-pressed")
            }
            this.flags = flags
        }
    }

    get children() {
        return null
    }

    run(editor: Arrisa) {
        Command.dispatch(editor, this.item.run)
    }
}

export class MenuControl implements MenuElement {
    dom: HTMLElement
    focusDOM: HTMLElement
    flags: F = 0 as F
    index = 0

    constructor(
        readonly item: Menu.CustomControl,
        editor: Arrisa,
        done: () => void,
    ) {
        let {dom, focus} = item.render(editor, done)
        this.dom = dom
        this.focusDOM = focus || dom
        this.focusDOM.tabIndex = -1
    }

    update(flags: F, _editor: Arrisa, _update: Arrisa.Update | null) {
        if (flags != this.flags) {
            if ((flags & F.Hidden) != (this.flags & F.Hidden)) this.dom.style.display = flags & F.Hidden ? "none" : ""
            if ((flags & F.Disabled) != (this.flags & F.Disabled) && this.item.setEnabled)
                this.item.setEnabled(this.dom, !(flags & F.Disabled))
            if ((flags & F.Selected) != (this.flags & F.Selected)) {
                if (flags & F.Selected) this.focusDOM.setAttribute("aria-selected", "true")
                else this.focusDOM.removeAttribute("aria-selected")
                this.focusDOM.tabIndex = flags & F.Selected ? 0 : -1
            }
            this.flags = flags
        }
    }

    get children() {
        return null
    }

    get run() {
        return null
    }
}

export class MenuSubmenu implements MenuElement {
    dom: HTMLElement
    button: HTMLElement
    list: HTMLElement
    flags: F = 0 as F

    activeChild = -3
    index = 0
    children: readonly MenuElement[]

    constructor(
        readonly item: Menu.Submenu,
        children: readonly (MenuElement | MenuSpacer)[],
        editor: Arrisa,
    ) {
        this.dom = document.createElement("arrisa-submenu")
        this.button = this.dom.appendChild(document.createElement("button"))
        this.button.tabIndex = -1
        this.button.className = "arrisa-menu-button"
        this.button.setAttribute("aria-haspopup", "true")
        this.button.setAttribute("aria-expanded", "false")
        if (item.description) {
            let desc = typeof item.description == "function" ? item.description(editor.state) : item.description
            this.dom.title = desc
            this.dom.setAttribute("aria-label", desc)
        }
        if (item.label) {
            labelButton(editor, this.button, item.label)
            this.activeChild = -2
        }
        if (item.width != null) this.dom.style.setProperty("--arrisa-submenu-width", item.width + "ch")
        if (item.arrow) this.button.classList.add("arrisa-submenu-arrow")
        this.list = this.dom.appendChild(document.createElement("arrisa-menu-list"))
        this.list.style.display = "none"
        this.list.role = "menu"
        this.list.id = id("arrisa-popup")
        this.list.setAttribute("aria-label", this.button.title)
        this.button.setAttribute("aria-controls", this.list.id)
        this.children = children.filter((ch): ch is MenuElement => !(ch instanceof MenuSpacer))
        for (let child of children) {
            this.list.appendChild(child.dom)
            if (!(child instanceof MenuSpacer)) child.focusDOM.role = "menuitem"
        }
    }

    get focusDOM() {
        return this.button
    }

    update(flags: F, editor: Arrisa) {
        if (flags != this.flags) {
            if ((flags & F.Hidden) != (this.flags & F.Hidden)) this.dom.style.display = flags & F.Hidden ? "none" : ""
            if ((flags & F.Disabled) != (this.flags & F.Disabled)) {
                if (!(flags & F.Disabled)) this.button.removeAttribute("aria-disabled")
                else this.button.setAttribute("aria-disabled", "true")
            }
            if ((flags & F.Selected) != (this.flags & F.Selected)) {
                if (flags & F.Selected) this.button.setAttribute("aria-selected", "true")
                else this.button.removeAttribute("aria-selected")
                this.button.tabIndex = flags & F.Selected ? 0 : -1
            }
            if ((flags & F.Open) != (this.flags & F.Open)) {
                this.list.style.display = flags & F.Open ? "" : "none"
                this.button.setAttribute("aria-expanded", flags & F.Open ? "true" : "false")
            }
            this.flags = flags
        }
        if (this.activeChild != -2) {
            let activeChild = this.children.findIndex((ch) => ch.flags & F.Active)
            if (this.activeChild != activeChild) {
                this.activeChild = activeChild
                let label =
                    activeChild < 0 ? this.item.defaultLabel : (this.children[activeChild].item as Menu.Button).label
                labelButton(editor, this.button, label)
            }
        }
    }

    get run() {
        return null
    }
}

export class MenuSpacer {
    dom: HTMLElement

    constructor() {
        this.dom = document.createElement("arrisa-menu-spacer")
    }
}

export type MenuDOM = {
    dom: HTMLElement
    elts: readonly MenuElement[]
    children: readonly MenuElement[]
}

export type MenuDOMOptions = {
    variant: "bar" | "floating"
    /** Root element; defaults to `arrisa-menubar` or `arrisa-floating-menu`. */
    createDOM?: () => HTMLElement
    /** Extra class names on the root. */
    class?: string
    done?: () => void
}

function instantiate(
    item: Menu.Item.Resolved,
    editor: Arrisa,
    flat: MenuElement[],
    done: () => void,
): MenuElement | MenuSpacer {
    let elt: MenuElement
    if (item instanceof Menu.Submenu.Resolved)
        elt = new MenuSubmenu(
            item.item,
            item.content.map((i) => instantiate(i, editor, flat, done)),
            editor,
        )
    else if (item === "|") return new MenuSpacer()
    else if (item instanceof Menu.Button) elt = new MenuButton(item, editor)
    else elt = new MenuControl(item, editor, done)
    elt.index = flat.length
    flat.push(elt)
    return elt
}

/**
 * Build a menu tree DOM from resolved items.
 * Callers own keyboard / selection; use {@link MenuHost} for full interaction.
 */
export function buildMenuDOM(
    editor: Arrisa,
    items: readonly Menu.Item.Resolved[],
    options: MenuDOMOptions,
): MenuDOM {
    let dom = options.createDOM
        ? options.createDOM()
        : document.createElement(options.variant == "floating" ? "arrisa-floating-menu" : "arrisa-menubar")
    if (options.class) {
        for (let cls of options.class.split(/\s+/)) if (cls) dom.classList.add(cls)
    }
    if (options.variant == "floating") dom.classList.add("arrisa-floating-menu")
    if (options.variant == "bar") {
        dom.role = "toolbar"
        if (!dom.classList.contains("arrisa-menubar") && dom.tagName.toLowerCase() != "arrisa-menubar")
            dom.classList.add("arrisa-menubar")
    }

    let elts: MenuElement[] = []
    let done = options.done || (() => {})
    let roots = items.map((i) => instantiate(i, editor, elts, done))
    let children = roots.filter((ch): ch is MenuElement => !(ch instanceof MenuSpacer))
    for (let elt of roots) dom.appendChild(elt.dom)
    return {dom, elts, children}
}

/** Update flag bits for every element given the current selection stack. */
export function updateMenuDOM(
    menu: MenuDOM,
    editor: Arrisa,
    update: Arrisa.Update | boolean | null,
    selection: readonly MenuElement[],
): void {
    let {state} = editor
    let changed = typeof update == "boolean" ? update : !update || update.docChanged || update.selectionSet
    let updateObj = typeof update == "boolean" || !update ? null : update
    for (let i = 0; i < menu.elts.length; i++) {
        let elt = menu.elts[i],
            flags
        if (
            update &&
            (update === true ||
                (elt.item.updateFor ? updateObj!.transactions.some((tr) => elt.item.updateFor!(tr)) : changed))
        ) {
            flags =
                ((elt.item.select ? elt.item.select(state) : true) ? 0 : F.Hidden) |
                ((elt.item.enable ? elt.item.enable(state) : true) ? 0 : F.Disabled) |
                ((elt.item instanceof Menu.Button && elt.item.active ? elt.item.active(state) : false) ? F.Active : 0)
        } else {
            flags = elt.flags & (F.Hidden | F.Disabled | F.Active)
        }
        if (selection.length) {
            let selected = selection.indexOf(elt)
            if (selected == selection.length - 1) flags |= F.Selected
            else if (selected > -1) flags |= F.Open
        }
        elt.update(flags, editor, updateObj)
    }
}

export function findChild(children: readonly MenuElement[], start: boolean) {
    for (let i = start ? 0 : children.length - 1; start ? i < children.length : i >= 0; start ? i++ : i--) {
        let child = children[i]
        if (!(child.flags & F.Disabled)) return child
    }
    return null
}

export function findNextChild(children: readonly MenuElement[], child: MenuElement, dir: -1 | 1) {
    let index = children.indexOf(child)
    if (index < 0) return null
    for (let i = index + dir; ; i += dir) {
        if (i < 0) i = children.length - 1
        else if (i >= children.length) i = 0
        if (i == index) return null
        let next = children[i]
        if (!(next.flags & F.Hidden)) return next
    }
}

export function defaultChild(children: readonly MenuElement[]) {
    return children.length ? children.find((ch) => ch.flags & F.Active) || children[0] : null
}

export type MenuHostOptions = MenuDOMOptions & {
    /** Facet that supplies the menu template (bar vs floating). */
    template: EditorState.Facet.Reader<readonly Menu.Template[]>
}

/**
 * Interactive menu host: rebuilds on template/item changes, keyboard nav,
 * click/submenu open, and flag updates. Used by menubar and floating menu.
 *
 * The root element is stable across rebuilds so tooltip views keep a fixed
 * `dom` reference.
 */
export class MenuHost {
    declare elts: readonly MenuElement[]
    declare children: readonly MenuElement[]
    declare selection: readonly MenuElement[]
    dom: HTMLElement
    focusTimeout = -1
    items: readonly Menu.Item[]
    private menu: MenuDOM

    constructor(
        readonly editor: Arrisa,
        readonly options: MenuHostOptions,
    ) {
        this.dom = options.createDOM
            ? options.createDOM()
            : document.createElement(options.variant == "floating" ? "arrisa-floating-menu" : "arrisa-menubar")
        if (options.class) {
            for (let cls of options.class.split(/\s+/)) if (cls) this.dom.classList.add(cls)
        }
        if (options.variant == "floating") this.dom.classList.add("arrisa-floating-menu")
        if (options.variant == "bar") {
            this.dom.role = "toolbar"
            if (this.dom.tagName.toLowerCase() != "arrisa-menubar") this.dom.classList.add("arrisa-menubar")
        }

        this.items = editor.state.facet(Menu.Item.source)
        this.menu = {dom: this.dom, elts: [], children: []}
        this.elts = []
        this.children = []
        this.selection = []
        this.key = this.key.bind(this)
        this.click = this.click.bind(this)
        this.focusout = this.focusout.bind(this)
        this.globalClick = this.globalClick.bind(this)
        this.dom.addEventListener("keydown", this.key)
        this.dom.addEventListener("mousedown", this.click)
        this.dom.addEventListener("focusout", this.focusout)
        this.fill()
    }

    /** Rebuild item tree into the stable root. */
    private fill() {
        this.dom.textContent = ""
        let resolved = Menu.resolve(this.items, this.editor.state.facet(this.options.template))
        let built = buildMenuDOM(this.editor, resolved, {
            variant: this.options.variant,
            createDOM: () => this.dom,
            done: () => this.up(),
        })
        // buildMenuDOM with createDOM reusing root: children already appended
        this.elts = built.elts
        this.children = built.children
        this.menu = {dom: this.dom, elts: this.elts, children: this.children}
        this.selection = this.children.length ? [this.children[0]] : []
        updateMenuDOM(this.menu, this.editor, true, this.selection)
    }

    rebuild() {
        this.fill()
    }

    update(update: Arrisa.Update) {
        let items = update.state.facet(Menu.Item.source)
        if (
            items != this.items ||
            update.startState.facet(this.options.template) != update.state.facet(this.options.template) ||
            update.startState.textLTR != update.state.textLTR ||
            PhraseSet.didChange(update.startState, update.state)
        ) {
            this.items = items
            this.rebuild()
        } else {
            updateMenuDOM(this.menu, this.editor, update, this.selection)
            if (this.selection.some((e) => e.flags & F.Hidden)) {
                let reset = this.selection[0].flags & F.Hidden ? findChild(this.children, true) : this.selection[0]
                this.setSelection(reset ? [reset] : [], this.dom.contains(document.activeElement))
            }
        }
    }

    connect() {
        this.dom.setAttribute("aria-controls", this.editor.contentDOM.id)
    }

    setSelection(selection: readonly MenuElement[], focus = true) {
        updateMenuDOM(this.menu, this.editor, false, selection)
        if (selection.length > 1 && this.selection.length <= 1)
            this.dom.ownerDocument.addEventListener("mousedown", this.globalClick)
        this.selection = selection
        if (focus && selection.length) selection[selection.length - 1].focusDOM.focus()
    }

    key(event: KeyboardEvent) {
        if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return
        let sLen = this.selection.length
        if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
            if (sLen) {
                let forward = (event.key == "ArrowRight") == (getComputedStyle(this.dom).direction == "ltr")
                let next = findNextChild(this.children, this.selection[0], forward ? 1 : -1)
                this.setSelection(next ? [next] : [])
            }
        } else if (event.key == "ArrowDown" || event.key == "ArrowUp") {
            if (sLen > 1) {
                let parent = this.selection[sLen - 2] as MenuSubmenu
                let next = findNextChild(parent.children, this.selection[sLen - 1], event.key == "ArrowUp" ? -1 : 1)
                if (next) this.setSelection(this.selection.slice(0, sLen - 1).concat(next))
            } else if (sLen == 1 && this.selection[0].children) {
                let inner = defaultChild(this.selection[0].children)
                if (inner) this.setSelection([this.selection[0], inner])
            }
        } else if (event.key == "Home" || event.key == "End") {
            let child = findChild(
                sLen > 1 ? (this.selection[sLen - 2] as MenuSubmenu).children : this.children,
                event.key == "Home",
            )
            if (child) this.setSelection(this.selection.slice(0, sLen - 1).concat(child))
        } else if (event.key == " " || event.key == "Enter") {
            if (sLen) {
                let child = this.selection[sLen - 1]
                if (child.flags & F.Disabled) {
                } else if (child.children) {
                    let inner = defaultChild(child.children)
                    if (inner) this.setSelection(this.selection.concat(inner))
                } else {
                    if (child.run) child.run(this.editor)
                    this.setSelection([this.selection[0]])
                }
            }
        } else if (event.key == "Escape" && sLen > 1) {
            this.setSelection(this.selection.slice(0, sLen - 1))
        } else {
            return
        }
        event.preventDefault()
    }

    click(event: MouseEvent) {
        if (event.defaultPrevented) return
        let target: MenuElement | undefined, idx
        for (let node = event.target as Node | null; ; node = node.parentNode) {
            if (!node || node == this.dom) return
            target = this.elts.find((e) => e.dom == node)
            if (target) break
        }

        // Keep editor selection + focus so floating menus do not dismiss on click.
        event.preventDefault()

        if (target.flags & F.Disabled) {
        } else if (target.children) {
            if ((idx = this.selection.indexOf(target)) > -1 && idx < this.selection.length - 1) {
                this.setSelection(this.selection.slice(0, idx + 1), false)
            } else {
                for (let i = 0; i < this.selection.length; i++) {
                    let {children} = i ? (this.selection[i - 1] as MenuSubmenu) : this
                    if (children.includes(target)) {
                        let next = defaultChild(target.children)
                        if (next) this.setSelection(this.selection.slice(0, i).concat([target, next]), false)
                    }
                }
            }
        } else {
            if (target.run) target.run(this.editor)
            this.setSelection(
                this.children.includes(target) ? [target] : this.selection.length ? [this.selection[0]] : [],
                false,
            )
        }
    }

    globalClick(event: MouseEvent) {
        if (!this.dom.contains(event.target as HTMLElement)) {
            this.dom.ownerDocument.removeEventListener("mousedown", this.globalClick)
            if (this.selection.length > 1) this.setSelection([this.selection[0]], false)
        }
    }

    focusout() {
        window.clearTimeout(this.focusTimeout)
        if (this.selection.length > 1) {
            this.focusTimeout = window.setTimeout(() => {
                let active = this.editor.root.activeElement
                for (let i = 0; i < this.selection.length - 1; i++) {
                    if (!active || !this.selection[i].dom.contains(active)) {
                        this.setSelection([this.selection[0]], false)
                        break
                    }
                }
            }, 20)
        }
    }

    up() {
        if (this.selection.length > 1) this.setSelection([this.selection[0]], false)
    }
}

/** Shared button / submenu / spacer styles used by bar and floating menus. */
export const sharedMenuTheme: EditorState.Extension = Arrisa.styles({
    "&": {
        "--arrisa-menu-item-size": "20px",
        "--arrisa-menu-gap": "5px",
        "--arrisa-menu-padding": "3px",
    },
    "&light": {
        "--arrisa-menu-color": "#555",
    },
    "&dark": {
        "--arrisa-menu-color": "#ccc",
    },

    ".arrisa-menu-button:focus": {
        outline: "1.5px solid var(--arrisa-highlight-color)",
    },

    ".arrisa-menu-button": {
        border: 0,
        padding: "3px",
        borderRadius: "4px",
        boxSizing: "content-box",
        backgroundColor: "transparent",
        font: "inherit",
        color: "inherit",
        height: "var(--arrisa-menu-item-size)",
        textAlign: "left",
        "&[aria-disabled]": {
            opacity: "0.3",
        },
        "&[aria-pressed]": {
            color: "var(--arrisa-highlight-color)",
        },
        "&:hover": {
            backgroundColor: "#88888820",
        },
    },

    ".arrisa-button-label": {
        display: "inline-block",
        minWidth: "var(--arrisa-submenu-width)",
        padding: "0 3px",
    },

    "svg.arrisa-icon": {
        fill: "currentColor",
        width: "var(--arrisa-menu-item-size)",
        height: "var(--arrisa-menu-item-size)",
    },

    "arrisa-menu-spacer": {
        display: "block",
        width: "7px",
    },

    "arrisa-submenu": {
        display: "block",
        position: "relative",
        lineHeight: ".6",
        whiteSpace: "nowrap",
    },

    "arrisa-menu-list": {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "var(--arrisa-menu-gap, 5px)",
        padding: "5px",
        borderRadius: "4px",
        backgroundColor: "var(--arrisa-panel-color)",
        position: "absolute",
        zIndex: "10",
        top: "100%",
        boxShadow: "0 2px 8px 0 rgba(128, 128, 128, 0.2)",
        "& arrisa-menu-list": {
            left: "100%",
            top: 0,
        },
    },

    ".arrisa-submenu-arrow:after": {
        padding: "0 2px",
        fontSize: "80%",
        verticalAlign: "10%",
        opacity: "0.4",
        content: "'▾'",
    },
    ".arrisa-submenu-arrow.arrisa-submenu-arrow-open:after": {
        content: "'▴'",
    },
})
