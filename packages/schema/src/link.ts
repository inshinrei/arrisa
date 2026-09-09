/**
 * Link mark extension.
 *
 * {@link link} registers the {@link Link} mark plus:
 * - **Mod-k** / menu: toggle — remove links under the selection, or prompt
 *   for `href` when none are present (floating tooltip by default)
 * - **Tooltip**: when the cursor is inside a link, show the URL
 * - **Paste**: if clipboard text is a single absolute URL, either wrap a
 *   non-empty selection as a Link (do not insert the URL string) or insert
 *   the URL already marked at an empty caret
 *
 * Use {@link isLinkPasteUrl} to test the URL regex independently of paste.
 */
import {Command, Menu, applyLink, removeLinks} from "@arrisa/command"
import {ChangeSet, Leaf, Node} from "@arrisa/doc"
import {Arrisa, KeyBinding, Tooltip} from "@arrisa/editor"
import {phrases} from "@arrisa/phrases"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {Link, sanitizeLinkHref, isSafeLinkHref} from "@arrisa/types"
import {cr} from "./dom"

/** Request passed to a host {@link LinkPrompt}. `apply` runs {@link applyLink}. */
export interface LinkPromptRequest {
    editor: Arrisa
    from: number
    to: number
    href?: string
    apply: (href: string) => void
    cancel: () => void
}

/** Host callback that presents add-link UI for {@link LinkPromptRequest}. */
export type LinkPrompt = (req: LinkPromptRequest) => void

export interface LinkConfig {
    /** Default `"floating"`. `false` = no prompt (remove-only). Function = host UI. */
    prompt?: "floating" | false | LinkPrompt
}

type ResolvedPrompt = NonNullable<LinkConfig["prompt"]>

/** Last provided prompt wins; default `"floating"`. */
let linkPrompt = EditorState.Facet.define<ResolvedPrompt, ResolvedPrompt>({
    combine: (values) => (values.length ? values[values.length - 1]! : "floating"),
})

type LinkPromptState = {from: number; to: number; href?: string} | null

let setLinkPrompt = Transaction.Effect.define<LinkPromptState>()

function closeLinkPrompt(editor: Arrisa) {
    if (editor.state.field(linkPromptField, false))
        editor.dispatch({effects: setLinkPrompt.of(null)})
    editor.focus()
}

function applyPromptHref(editor: Arrisa, href: string, from: number, to: number) {
    let {selection} = editor.state
    if (selection.from != from || selection.to != to)
        editor.dispatch({selection: EditorSelection.range(from, to)})
    Command.dispatch(editor, Command.bind(applyLink, href))
    closeLinkPrompt(editor)
}

function createLinkPromptView(editor: Arrisa): Tooltip.View {
    let open = editor.state.field(linkPromptField)
    let input = cr("input", {
        type: "text",
        name: "url",
        "aria-label": phrases.get(editor.state, "link_target"),
        value: open?.href ?? "",
    }) as HTMLInputElement
    let form = cr(
        "form",
        {
            class: "arrisa-link-prompt",
            onsubmit: (event: Event) => {
                event.preventDefault()
                let open = editor.state.field(linkPromptField)
                if (!open) return
                applyPromptHref(editor, input.value, open.from, open.to)
            },
            onkeydown: (event: KeyboardEvent) => {
                if (event.key != "Escape") return
                event.preventDefault()
                closeLinkPrompt(editor)
            },
        },
        input,
        cr("button", {type: "submit"}, phrases.get(editor.state, "create_link")),
    ) as HTMLFormElement
    return {
        dom: form,
        connect() {
            input.focus()
            input.select()
        },
    }
}

let linkPromptTheme = Arrisa.styles({
    ".arrisa-link-prompt": {
        display: "flex",
        gap: "4px",
        padding: "2px 4px",
        fontSize: "90%",
        "& input": {
            minWidth: "12em",
        },
    },
})

let linkPromptField = EditorState.Field.define<LinkPromptState>({
    create: () => null,
    update(value, tr) {
        for (let e of tr.effects) if (e.is(setLinkPrompt)) return e.value
        if (!value || !tr.docChanged) return value
        let from = tr.changes.mapPos(value.from, 1)
        let to = tr.changes.mapPos(value.to, -1)
        if (from >= to) return null
        return {from, to, href: value.href}
    },
    provide: (f) => [
        Tooltip.show.from(f, (open) => {
            if (!open) return null
            return {pos: open.from, end: open.to, create: createLinkPromptView}
        }),
        EditorState.prec.high(
            KeyBinding.of({
                key: "Escape",
                run: (editor) => {
                    if (!editor.state.field(linkPromptField, false)) return false
                    closeLinkPrompt(editor as unknown as Arrisa)
                    return true
                },
            }),
        ),
        linkPromptTheme,
    ],
})

/** Remove existing links in the selection, or prompt for a new URL. */
let toggleLink: Command = (target) => {
    let editor = target as unknown as Arrisa
    if (editor.state.field(linkPromptField, false)) {
        closeLinkPrompt(editor)
        return true
    }
    let {selection} = editor.state
    if (selection.empty) return false
    if (Command.dispatch(editor, removeLinks)) return true
    let prompt = editor.state.facet(linkPrompt)
    if (prompt === false) return false
    let from = selection.from,
        to = selection.to
    const apply = (href: string) => applyPromptHref(editor, href, from, to)
    const cancel = () => closeLinkPrompt(editor)
    if (typeof prompt == "function") {
        prompt({editor, from, to, apply, cancel})
        return true
    }
    editor.dispatch({effects: setLinkPrompt.of({from, to})})
    return true
}

function computeLinkTooltip(state: EditorState): Tooltip | null {
    if (!state.selection.isCursor) return null
    let {head} = state.sel,
        before = head.nodeBefore,
        link = before && Link.isInSet(before.marks)
    if (!link) return null
    let start = head.pos - before!.length,
        end = head.pos,
        siblings = head.parent.node.content
    for (let index = head.index - 1; index > 0 && link.isInSet(siblings[index - 1].marks); )
        start -= siblings[--index].length
    for (let index = head.index; index < siblings.length && link.isInSet(siblings[index].marks); )
        end += siblings[index++].length
    return {
        pos: start,
        end,
        above: false,
        create: () => renderLinkTooltip(link.value),
    }
}

let closeLinkTooltip = Transaction.Effect.define<null>()

let linkTooltipField = EditorState.Field.define<Tooltip | null>({
    create: computeLinkTooltip,
    update(value, tr) {
        if (tr.effects.some((e) => e.is(closeLinkTooltip))) return null
        let sel = tr.selection
        if (!tr.docChanged && (!sel || (value && sel.isCursor && sel.head >= value.pos && sel.head <= value.end!)))
            return value
        return computeLinkTooltip(tr.state)
    },
    provide: (f) => Tooltip.show.from(f),
})

function renderLinkTooltip(target: string) {
    let dom = document.createElement("arrisa-link-tooltip")
    let safe = sanitizeLinkHref(target)
    if (safe) {
        let link = dom.appendChild(document.createElement("a"))
        link.href = safe
        link.textContent = safe
    } else {
        // Legacy / unsafe href: never become a script URL click target
        let text = dom.appendChild(document.createElement("span"))
        text.textContent = target
    }
    return {dom}
}

let linkTooltipTheme = Arrisa.styles({
    "arrisa-link-tooltip": {
        maxWidth: "30em",
        fontSize: "90%",
        textOverflow: "ellipsis",
        whiteSpace: "pre",
        overflow: "hidden",
        borderRadius: "3px",
        padding: "2px 5px",
        marginTop: "1px",
        "& a": {
            textDecoration: "none",
            color: "inherit",
        },
    },
})

/** Link mark with menu, Mod-k, cursor tooltip, and paste-as-link. */
export function link(config: LinkConfig = {}): EditorState.Extension {
    return [
        EditorState.schemaElement.of(Link),
        link.button,
        link.keyBinding,
        link.tooltip,
        link.pasteOver,
        linkPrompt.of(config.prompt ?? "floating"),
        linkPromptField,
    ]
}

export namespace link {
    export const keyBinding = KeyBinding.of({
        key: "Mod-k",
        run: toggleLink,
    })

    export const button = Menu.Button.define({
        run: toggleLink,
        active(state) {
            let {selection, doc} = state,
                found = false
            if (!selection.empty)
                for (let {from, to} of selection.ranges)
                    doc.iterate(from, to, (node) => {
                        if (found) return false
                        if (Link.isInSet(node.marks)) found = true
                    })
            return found
        },
        enable(state) {
            return !state.selection.empty
        },
        label: {
            icon: "M29 41 21 49a19 19 0 1 0 27 27l11-11A19 19 0 0 0 54 34L50 38a6 6 0 0 0-1 1 13 13 0 0 1 5 22L43 72a12 12 0 1 1-18-18l5-5a25 25 0 0 1-1-8zM41 29A19 19 0 0 0 46 59l5-5a13 13 0 0 1-6-21L57 22a12 12 0 1 1 18 18l-5 5c1 3 1 5 1 8l9-9a19 19 0 1 0-27-27z",
        },
        description: phrases.ref("create_link"),
        parent: Menu.Group.inline,
        rank: 50,
    })

    /** Show link target under the cursor; Escape dismisses. */
    export const tooltip: EditorState.Extension = [
        linkTooltipField,
        EditorState.prec.low(
            KeyBinding.of({
                key: "Escape",
                run: (editor) => {
                    if (!editor.state.field(linkTooltipField)) return false
                    editor.dispatch({effects: closeLinkTooltip.of(null)})
                    return true
                },
            }),
        ),
        linkTooltipTheme,
    ]

    /** Apply clipboard URL as a link: wrap a range, or insert a marked URL at the caret. */
    export const pasteOver: EditorState.Extension = Arrisa.pasteHandler.of((editor, event) => {
        let {selection} = editor.state
        let data = event.clipboardData
        if (!data) return false

        let raw = data.getData("text/plain") || data.getData("Text") || data.getData("text/uri-list")
        let text = raw.trim()
        if (!text || !isLinkPasteUrl(text)) return false
        if (!editor.state.schema.has(Link)) return false

        if (!selection.empty) {
            let mark = Link.of(text)
            let changes = ChangeSet.create(editor.state.doc, {
                from: selection.from,
                to: selection.to,
                add: mark,
            })
            if (changes.empty) return false
            editor.dispatch({changes, userEvent: "paste.link", scrollIntoView: true})
            return true
        }

        let html = data.getData("text/html")
        if (html) return false

        if (editor.state.sel.head.parent.node.type.hasRole(Node.Role.Code)) return false

        let href = sanitizeLinkHref(text, {allowRelative: false})
        if (!href) return false

        let from = selection.from
        let to = selection.to
        let marks = Link.of(href).addToSet(editor.state.sel.activeMarks)
        let changes = ChangeSet.create(editor.state.doc, {
            from,
            to,
            insert: [Leaf.text(text, marks)],
            fit: true,
        })
        if (changes.empty) return false

        let next = editor.state.update({
            changes,
            selection: EditorSelection.cursor(from + text.length),
            userEvent: "paste.link",
            scrollIntoView: true,
        })
        let inserted = next.state.doc.resolve(from).nodeAfter
        if (!inserted || !Link.isInSet(inserted.tag.marks)) return false

        editor.dispatch({
            changes,
            selection: EditorSelection.cursor(from + text.length),
            userEvent: "paste.link",
            scrollIntoView: true,
        })
        return true
    })
}

/**
 * Whether plain text is a single absolute URL suitable for paste-as-link
 * (`http(s)`, `mailto`, `xmpp` — no `data:` or `javascript:`, no spaces).
 */
export function isLinkPasteUrl(text: string) {
    if (!text || /\s/.test(text)) return false
    return isSafeLinkHref(text, {allowRelative: false})
}
