/**
 * Menu model for toolbars: groups, submenus, buttons, custom controls, and
 * template resolution into a flat list of actionable items.
 *
 * Items register themselves via {@link Menu.Item.source}. Callers build a
 * {@link Menu.Template} (or use {@link Menu.Group.top}) and pass registered
 * items into {@link Menu.resolve}.
 */
import {type Mark} from "@arrisa/doc"
import {phrases, type PhraseSet} from "@arrisa/phrases"
import {EditorState, type Transaction} from "@arrisa/state"
import {Command, type Arrisa} from "./command"
import {toggleMark as toggleMarkCommand} from "./mark"
import {canAddMarkInRange} from "./util/selection"
import {markAllowedByExclusivity} from "./mark-exclusivity"

export namespace Menu {
    export type Item = Group | Submenu | Button | CustomControl

    export namespace Item {
        export interface Spec {
            select?: (state: EditorState) => boolean

            enable?: (state: EditorState) => boolean

            updateFor?: (tr: Transaction) => boolean

            parent?: Group | Submenu

            rank?: number

            description?: PhraseSet.Ref | string
        }

        export class Base {
            select: ((state: EditorState) => boolean) | undefined
            enable: ((state: EditorState) => boolean) | undefined
            updateFor: ((tr: Transaction) => boolean) | undefined
            parent: Group | Submenu | undefined
            rank: number
            description: PhraseSet.Ref | string | undefined

            extension: EditorState.Extension

            constructor(spec: Item.Spec) {
                this.select = spec.select
                this.enable = spec.enable
                this.updateFor = spec.updateFor
                this.parent = spec.parent
                this.rank = spec.rank == null ? 100 : Math.max(0, Math.min(100, spec.rank))
                this.description = spec.description
                let src = Menu.Item.source.of(this as any)
                this.extension = this.parent ? [src, this.parent] : src
            }
        }

        export const source = EditorState.Facet.define<Item>()

        export type Resolved = Button | CustomControl | "|" | Submenu.Resolved
    }

    export type Label = string | PhraseSet.Ref | {icon: string; directional?: boolean}

    export class Button extends Item.Base {
        label: Label
        run: Command.Bound | Command
        active: ((state: EditorState) => boolean) | undefined

        private constructor(readonly spec: Button.Spec) {
            super(spec)
            this.run = spec.run
            this.active = spec.active
            this.label = spec.label
        }

        static define(spec: Button.Spec): Button {
            return new Button(spec)
        }
    }

    export namespace Button {
        export interface Spec extends Item.Spec {
            run: Command.Bound | Command

            active?: (state: EditorState) => boolean

            label: Label
        }

        /** Toolbar button that toggles an inline mark and reports active state. */
        export function toggleMark(config: {
            mark: Mark
            parent?: Menu.Group | Menu.Submenu
            rank?: number
            description?: PhraseSet.Ref
            label: Menu.Label
            /** Extra enable predicate (AND with exclusivity policy). */
            enable?: (state: EditorState) => boolean
        }) {
            let {mark, parent, rank, description, label, enable} = config
            return Menu.Button.define({
                run: Command.bind(toggleMarkCommand, mark),
                active(state) {
                    let {selection} = state
                    if (selection.isCursor) return !!mark.isInSet(state.sel.activeMarks)
                    else return !selection.ranges.some((r) => canAddMarkInRange(state.doc, r.from, r.to, mark))
                },
                enable(state) {
                    if (!markAllowedByExclusivity(state, mark)) return false
                    return enable ? enable(state) : true
                },
                parent,
                rank,
                description,
                label,
            })
        }
    }

    export class CustomControl extends Item.Base {
        render: (editor: Arrisa, done: () => void) => {dom: HTMLElement; focus?: HTMLElement}

        setEnabled: ((dom: Element, enabled: boolean) => void) | undefined

        private constructor(readonly spec: CustomControl.Spec) {
            super(spec)
            this.render = spec.render
            this.setEnabled = spec.setEnabled
        }

        static define(spec: CustomControl.Spec) {
            return new CustomControl(spec)
        }
    }

    export namespace CustomControl {
        export interface Spec extends Item.Spec {
            render: (editor: Arrisa, done: () => void) => {dom: HTMLElement; focus?: HTMLElement}

            setEnabled?: (focus: Element, enabled: boolean) => void
        }
    }

    export class Group {
        margin: boolean
        parent: Group | Submenu | undefined
        rank: number
        content: readonly (Item | "...")[] | undefined
        overflow: {at: number; wrap?: Submenu} | undefined

        extension: EditorState.Extension

        private constructor(readonly spec: Group.Spec) {
            this.margin = !!spec.margin
            this.extension = Item.source.of(this)
            this.parent = spec.parent
            this.rank = spec.rank == null ? 100 : Math.max(0, Math.min(100, spec.rank))
            this.content = spec.content
            this.overflow = spec.overflow
        }

        static define(spec: Group.Spec = {}) {
            return new Group(spec)
        }

        template(...content: (Template | Item | "...")[]) {
            return Template.new(this, content.length ? content : ["..."])
        }
    }

    export namespace Group {
        export interface Spec {
            margin?: boolean

            parent?: Group | Submenu

            rank?: number

            content?: readonly (Item | "...")[]

            overflow?: {at: number; wrap?: Submenu}
        }

        /** Root toolbar group. */
        export const top = Group.define()

        export const commands = Group.define({parent: top, rank: 30})

        export const inline = Group.define({parent: top, rank: 50, margin: true, overflow: {at: 5}})

        export const block = Group.define({parent: top, rank: 70, margin: true})

        export const insert = Group.define({parent: top, rank: 90, margin: true})
    }

    export class Submenu extends Item.Base {
        label: Label | undefined
        defaultLabel: Label | undefined
        arrow: boolean
        width: number | undefined
        content: readonly (Item | "...")[] | undefined

        private constructor(readonly spec: Submenu.Spec) {
            super(spec)
            this.label = spec.label
            this.defaultLabel = spec.defaultLabel
            this.arrow = spec.arrow !== false
            this.width = spec.width
            this.content = spec.content
        }

        static define(spec: Submenu.Spec) {
            return new Submenu(spec)
        }

        template(...content: (Template | Item | "...")[]) {
            return Template.new(this, content.length ? content : ["..."])
        }
    }

    export namespace Submenu {
        export interface Spec extends Item.Spec {
            label?: Label

            defaultLabel?: Label

            arrow?: boolean

            width?: number

            content?: readonly (Item | "...")[]
        }

        export class Resolved {
            private constructor(
                readonly item: Submenu,

                readonly content: readonly Item.Resolved[],
            ) {}

            static new(item: Submenu, content: readonly Item.Resolved[]) {
                return new Resolved(item, content)
            }
        }

        export const textblockStyle = Menu.Submenu.define({
            defaultLabel: phrases.ref("block_style"),
            description: phrases.ref("block_style"),
            parent: Group.top,
            rank: 10,
            width: 10,
        })
    }

    export class Template {
        parent: Group | Submenu | null

        rank: number
        declare private tag: "Template"

        private constructor(
            readonly item: Group | Submenu,

            readonly content: readonly (Template | Item | "...")[],
        ) {
            this.parent = item.parent ?? null
            this.rank = item.rank ?? 100
        }

        static new(item: Group | Submenu, content: readonly (Template | Item | "...")[] = []) {
            return new Template(item, content)
        }
    }

    const defaultOverflow = Submenu.define({
        label: {
            icon: "M57 77a8 8 0 1 1-16 0 8 8 0 0 1 16 0m0-26a8 8 0 1 1-16 0 8 8 0 0 1 16 0m0-26a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
        },
        description: phrases.ref("overflow_more"),
        arrow: false,
    })

    /**
     * Resolve registered `items` against a template into a flat list of
     * buttons, custom controls, submenu trees, and `|` separators.
     *
     * `"..."` in a template expands to children whose `parent` matches the
     * current group/submenu, ordered by rank. Items in `suppress` are skipped.
     */
    export function resolve(
        items: readonly Item[],
        template: Template | readonly Template[] = Group.top.template(),
        suppress?: readonly Item[],
    ): readonly Item.Resolved[] {
        let used = new Map<Item, number>()
        if (suppress) for (let item of suppress) used.set(item, 2)
        function scan(template: Template) {
            used.set(template.item, 1)
            for (let child of template.content) {
                if (child instanceof Template) scan(child)
                else if (typeof child != "string") used.set(child, 1)
            }
        }
        function margin(target: Item.Resolved[]) {
            if (target.length && target[target.length - 1] !== "|") target.push("|")
        }
        function resolve(
            template: Item | Template,
            content: readonly (Template | Item | "...")[] | null,
            target: Item.Resolved[],
            fromTemplate: boolean,
        ) {
            if (template instanceof Template) {
                resolve(template.item, template.content, target, true)
            } else {
                let wasUsed = used.get(template)
                if (fromTemplate ? wasUsed == 2 : wasUsed != null) return
                used.set(template, 2)
                if (template instanceof Submenu || template instanceof Group) {
                    if (template instanceof Group && template.margin) margin(target)
                    let inner: Item.Resolved[] = []
                    for (let elt of content || template.content || ["..."]) {
                        if (elt === "...") {
                            let found: Item[] = items.filter((i) => i.parent == template)
                            for (let item of found.sort((a, b) => (a.rank ?? 100) - (b.rank ?? 100)))
                                resolve(item, null, inner, false)
                        } else {
                            resolve(elt, null, inner, fromTemplate)
                        }
                    }
                    if (inner.length) {
                        if (template instanceof Submenu) {
                            if (inner[inner.length - 1] === "|") inner.pop()
                            if (inner.length) target.push(Submenu.Resolved.new(template, inner))
                        } else {
                            if (template.overflow && inner.length > template.overflow.at) {
                                let overflow = Submenu.Resolved.new(
                                    template.overflow.wrap || defaultOverflow,
                                    inner.slice(template.overflow.at - 1).filter((e) => e != "|"),
                                )
                                inner.length = template.overflow.at - 1
                                inner.push(overflow)
                            }
                            for (let elt of inner) target.push(elt)
                        }
                    }
                    if (template instanceof Group && template.margin) margin(target)
                } else {
                    target.push(template)
                }
            }
        }

        let top: Item.Resolved[] = []
        if (Array.isArray(template)) {
            for (let elt of template) scan(elt)
            for (let elt of template) resolve(elt, null, top, true)
        } else {
            scan(template as Template)
            resolve(template as Template, null, top, true)
        }
        if (top.length && top[top.length - 1] === "|") top.pop()
        return top
    }
}
