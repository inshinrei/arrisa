/**
 * Playground chrome for document + messenger modes.
 */
import {Command, Menu, undo as cmdUndo, redo as cmdRedo} from "@arrisa/command"
import {history, undo as histUndo, redo as histRedo} from "@arrisa/history"
import {Arrisa, menuBar} from "@arrisa/editor"
import {
    basicSchema,
    bulletList,
    orderedList,
    blockquote,
    horizontalRule,
    codeBlock,
} from "@arrisa/schema"
import {composeField, messengerCompose} from "@arrisa/message"
import {phrases} from "@arrisa/phrases"
import type {LinkConfig, LinkPromptRequest} from "@arrisa/schema"
import type {EditorState} from "@arrisa/state"

/** History field + handlers so default keymap Mod-z/y hit real undo/redo. */
function historyChrome(): EditorState.Extension {
    return [
        history(),
        Command.handler(cmdUndo, (ed) => histUndo({state: ed.state})),
        Command.handler(cmdRedo, (ed) => histRedo({state: ed.state})),
    ]
}

function undoRedoMenu(): EditorState.Extension {
    return [
        Menu.Button.define({
            run: cmdUndo,
            label: "Undo",
            description: phrases.ref("undo"),
            parent: Menu.Group.commands,
            rank: 10,
        }),
        Menu.Button.define({
            run: cmdRedo,
            label: "Redo",
            description: phrases.ref("redo"),
            parent: Menu.Group.commands,
            rank: 20,
        }),
    ]
}

/** Document mode: block doc + sticky menu bar. */
export function docExtensions(): EditorState.Extension {
    return [
        basicSchema(),
        codeBlock(),
        bulletList(),
        orderedList(),
        blockquote(),
        horizontalRule(),
        historyChrome(),
        undoRedoMenu(),
        menuBar(),
        Arrisa.scrolling(280),
        Arrisa.label("Document editor"),
    ]
}

/** Demo username → id map for mention resolve on `@name `. */
let DEMO_USERS: Record<string, string> = {
    alice: "user-alice",
    bob: "user-bob",
}

/**
 * Inline/spoiler messenger preset (`messengerCompose`) — kept for inspect/comparison;
 * the Messenger tab mounts {@link composeExtensions} instead.
 */
export function chatExtensions(): EditorState.Extension {
    return [
        messengerCompose({
            exclusivity: "none",
            floating: {
                template: Menu.Group.inline.template(),
                above: true,
                class: "pg-chat-formatter",
            },
            placeholder: "Message…",
            markdown: true,
            markdownPaste: true,
            hostElements: true,
            resolveMention: (name) => DEMO_USERS[name.toLowerCase()] ?? null,
        }),
        historyChrome(),
        Arrisa.label("Messenger compose"),
    ]
}

/** Host-style link field: show `#chat-link-field`, Apply / Escape. */
export function playgroundLinkPrompt(field: HTMLElement): NonNullable<LinkConfig["prompt"]> {
    let input = field.querySelector("input") as HTMLInputElement
    let applyBtn = field.querySelector("#btn-link-apply") as HTMLButtonElement
    let open: LinkPromptRequest | null = null
    let hide = () => {
        field.hidden = true
        open = null
    }
    applyBtn.addEventListener("click", () => {
        if (!open) return
        let req = open
        hide()
        req.apply(input.value)
    })
    input.addEventListener("keydown", (event) => {
        if (event.key == "Enter") {
            event.preventDefault()
            applyBtn.click()
        } else if (event.key == "Escape") {
            event.preventDefault()
            let req = open
            hide()
            req?.cancel()
        }
    })
    return (req) => {
        open = req
        input.value = req.href ?? ""
        field.hidden = false
        input.focus()
    }
}

/** Block compose field — embedded menubar in `toolbar`, no floating toolbar. */
export function composeExtensions(
    toolbar: HTMLElement,
    linkPrompt: NonNullable<LinkConfig["prompt"]>,
): EditorState.Extension {
    return [
        composeField({
            floating: false,
            embedded: {parent: toolbar, class: "pg-compose-tools"},
            linkPrompt,
        }),
        historyChrome(),
        Arrisa.label("Compose field"),
    ]
}

export let DOC_SAMPLE = `<h2>Document playground</h2>
<p>Try <strong>bold</strong>, <em>italic</em>, lists, headings, and undo/redo.</p>
<p>Second paragraph for multi-block editing.</p>`

export function createDocEditor(parent: HTMLElement): Arrisa {
    return Arrisa.create({
        parent,
        doc: DOC_SAMPLE,
        config: docExtensions(),
    })
}

export function createChatEditor(
    parent: HTMLElement,
    toolbar: HTMLElement,
    linkPrompt: NonNullable<LinkConfig["prompt"]>,
): Arrisa {
    return Arrisa.create({
        parent,
        doc: "",
        config: composeExtensions(toolbar, linkPrompt),
    })
}
