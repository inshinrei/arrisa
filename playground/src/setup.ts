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

/**
 * Messenger mode via `@arrisa/message` compose preset.
 * Marks + floating toolbar + markdown shortcuts + history.
 */
/** Demo username → id map for mention resolve on `@name `. */
let DEMO_USERS: Record<string, string> = {
    alice: "user-alice",
    bob: "user-bob",
}

export function chatExtensions(): EditorState.Extension {
    return [
        messengerCompose({
            exclusivity: "none",
            codeBlocks: true,
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

/** Block compose field (`composeField`). Chat tab still uses {@link chatExtensions}. */
export function composeExtensions(): EditorState.Extension {
    return [
        composeField({
            floating: {above: true, class: "pg-chat-formatter"},
        }),
        historyChrome(),
        Arrisa.label("Compose field"),
    ]
}

export let DOC_SAMPLE = `<h2>Document playground</h2>
<p>Try <strong>bold</strong>, <em>italic</em>, lists, headings, code blocks, and undo/redo.</p>
<pre><code class="language-ts">let editor = Arrisa.create({parent, config})</code></pre>
<p>Second paragraph for multi-block editing. Type <code>\`\`\`ts </code> (backticks + lang + space) for a fenced code block.</p>`

export function createDocEditor(parent: HTMLElement): Arrisa {
    return Arrisa.create({
        parent,
        doc: DOC_SAMPLE,
        config: docExtensions(),
    })
}

export function createChatEditor(parent: HTMLElement): Arrisa {
    return Arrisa.create({
        parent,
        doc: "",
        config: chatExtensions(),
    })
}
