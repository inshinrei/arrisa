/**
 * Playground chrome for document + messenger modes.
 * Uses `@arrisa/schema` presets (not hand-rolled mark wiring).
 */
import {Command, Menu, undo as cmdUndo, redo as cmdRedo} from "@arrisa/command"
import {history, undo as histUndo, redo as histRedo} from "@arrisa/history"
import {Arrisa, menuBar, floatingMenu, placeholder} from "@arrisa/editor"
import {
    basicSchema,
    messengerSchema,
    bulletList,
    orderedList,
    blockquote,
    horizontalRule,
    codeBlock,
} from "@arrisa/schema"
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
 * Messenger mode: messenger format marks + floating selection toolbar.
 * `exclusivity: "none"` = free stacking; pass `"code-strike"` to isolate mono/strike.
 */
export function chatExtensions(): EditorState.Extension {
    return [
        messengerSchema({exclusivity: "none"}),
        historyChrome(),
        floatingMenu({
            template: Menu.Group.inline.template(),
            above: true,
            class: "pg-chat-formatter",
        }),
        placeholder("Message…"),
        Arrisa.label("Messenger compose"),
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

export function createChatEditor(parent: HTMLElement): Arrisa {
    return Arrisa.create({
        parent,
        doc: "",
        config: chatExtensions(),
    })
}
