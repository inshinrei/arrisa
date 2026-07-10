/**
 * Link mark extension.
 *
 * {@link link} registers the {@link Link} mark plus:
 * - **Mod-k** / menu: toggle — remove links under the selection, or open a
 *   dialog to set `href` when none are present
 * - **Tooltip**: when the cursor is inside a link, show the URL
 * - **Paste**: if the selection is non-empty and clipboard text is a single
 *   URL, apply it as a link mark instead of replacing text
 *
 * Use {@link isLinkPasteUrl} to test the URL regex independently of paste.
 */
import {type Command, Menu} from "@arrisa/command"
import {ChangeSet} from "@arrisa/doc"
import {Arrisa, Dialog, KeyBinding, Tooltip} from "@arrisa/editor"
import {phrases} from "@arrisa/phrases"
import {EditorState, Transaction} from "@arrisa/state"
import {Link, sanitizeLinkHref, isSafeLinkHref} from "@arrisa/types"

/** Remove existing links in the selection, or prompt for a new URL. */
let toggleLink: Command = (target) => {
    let editor = target as unknown as Arrisa
    let open = Dialog.get(editor, "arrisa-link-dialog")
    if (open) {
        if (open.dom.contains(editor.contentDOM.ownerDocument.activeElement)) editor.focus()
        Dialog.close(editor, "arrisa-link-dialog")
        return true
    }
    let {selection, doc} = editor.state
    if (selection.empty) return false
    let remove: ChangeSet.Spec[] = []
    for (let {from, to} of selection.ranges)
        doc.iterate(from, to, (node, pos) => {
            let has = Link.isInSet(node.marks)
            if (has) remove.push({from: pos, to: pos + node.length, remove: has})
        })
    if (remove.length) {
        editor.dispatch({changes: remove, userEvent: "mark.remove"})
    } else {
        Dialog.show(editor, {
            label: phrases.get(editor.state, "link_target"),
            input: {type: "text", name: "url"},
            submitLabel: phrases.get(editor.state, "create_link"),
            class: "arrisa-link-dialog",
            focus: true,
        }).result.then((form) => {
            editor.focus()
            let url = form && (form.elements.namedItem("url") as HTMLInputElement)?.value
            let safe = url ? sanitizeLinkHref(url) : null
            if (safe)
                editor.dispatch({
                    changes: selection.ranges.map((r) => ({from: r.from, to: r.to, add: Link.of(safe)})),
                    userEvent: "mark.add",
                })
        })
    }
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
    for (let index = head.index - 1; index > 0 && link.isInSet(siblings[index - 1].marks);)
        start -= siblings[--index].length
    for (let index = head.index; index < siblings.length && link.isInSet(siblings[index].marks);)
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
export function link(): EditorState.Extension {
    return [EditorState.schemaElement.of(Link), link.button, link.keyBinding, link.tooltip, link.pasteOver]
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

    /** Apply clipboard URL as a link mark when selection is non-empty. */
    export const pasteOver: EditorState.Extension = Arrisa.pasteHandler.of((editor, event) => {
        let {selection} = editor.state,
            data = event.clipboardData
        if (!data || selection.empty) return false
        let text = data.getData("text/plain") || data.getData("Text") || data.getData("text/uri-list")
        if (!text || !isLinkPasteUrl(text)) return false
        let linkMark = Link.of(text)
        let changes = ChangeSet.create(editor.state.doc, {from: selection.from, to: selection.to, add: linkMark})
        if (changes.empty) return false
        editor.dispatch({
            changes,
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
