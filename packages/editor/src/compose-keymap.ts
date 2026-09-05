/**
 * Compact keymap for single-field / compose UIs.
 *
 * Disables {@link KeyBinding.useDefaultKeymap} and installs a subset of
 * {@link KeyBinding.defaultKeymap}: enter/break, delete unit/word/line-end,
 * arrows (unit/line/word/doc), Home/End, select-all, undo/redo.
 * Omits page motion, transpose, and macOS emacs-style Ctrl bindings.
 */
import {EditorState} from "@arrisa/state"
import {
    Command,
    deleteToLineEnd,
    deleteUnit,
    deleteWord,
    enter,
    insertLineBreak,
    moveByLine,
    moveByUnit,
    moveByWord,
    moveToDocSide,
    moveToLineSide,
    redo,
    selectAll,
    undo,
} from "@arrisa/command"
import {KeyBinding} from "./key-map"

const composeBindings: readonly KeyBinding.Spec[] = [
    {key: "Enter", run: enter},
    {key: "Shift-Enter", run: insertLineBreak},
    {key: "Backspace", run: Command.bind(deleteUnit, "backward")},
    {key: "Delete", run: Command.bind(deleteUnit, "forward")},
    {key: "Ctrl-Backspace", mac: "Alt-Backspace", run: Command.bind(deleteWord, "backward")},
    {key: "Ctrl-Delete", mac: "Alt-Delete", run: Command.bind(deleteWord, "forward")},
    {mac: "Cmd-Backspace", run: Command.bind(deleteToLineEnd, "backward")},
    {mac: "Cmd-Delete", run: Command.bind(deleteToLineEnd, "forward")},
    {
        key: "ArrowLeft",
        run: Command.bind(moveByUnit, {dir: "left"}),
        shift: Command.bind(moveByUnit, {dir: "left", extend: true}),
    },
    {
        key: "ArrowRight",
        run: Command.bind(moveByUnit, {dir: "right"}),
        shift: Command.bind(moveByUnit, {dir: "right", extend: true}),
    },
    {
        key: "ArrowDown",
        run: Command.bind(moveByLine, {dir: "down"}),
        shift: Command.bind(moveByLine, {dir: "down", extend: true}),
    },
    {
        key: "ArrowUp",
        run: Command.bind(moveByLine, {dir: "up"}),
        shift: Command.bind(moveByLine, {dir: "up", extend: true}),
    },
    {
        key: "Mod-ArrowLeft",
        run: Command.bind(moveByWord, {dir: "left"}),
        shift: Command.bind(moveByWord, {dir: "left", extend: true}),
    },
    {
        key: "Mod-ArrowRight",
        run: Command.bind(moveByWord, {dir: "right"}),
        shift: Command.bind(moveByWord, {dir: "right", extend: true}),
    },
    {
        mac: "Cmd-ArrowLeft",
        run: Command.bind(moveToLineSide, {dir: "left"}),
        shift: Command.bind(moveToLineSide, {dir: "left", extend: true}),
    },
    {
        mac: "Cmd-ArrowRight",
        run: Command.bind(moveToLineSide, {dir: "right"}),
        shift: Command.bind(moveToLineSide, {dir: "right", extend: true}),
    },
    {
        mac: "Cmd-ArrowUp",
        run: Command.bind(moveToDocSide, {side: "start"}),
        shift: Command.bind(moveToDocSide, {side: "start", extend: true}),
    },
    {
        mac: "Cmd-ArrowDown",
        run: Command.bind(moveToDocSide, {side: "end"}),
        shift: Command.bind(moveToDocSide, {side: "end", extend: true}),
    },
    {
        key: "Home",
        run: Command.bind(moveToLineSide, {dir: "backward"}),
        shift: Command.bind(moveToLineSide, {dir: "backward", extend: true}),
    },
    {
        key: "End",
        run: Command.bind(moveToLineSide, {dir: "forward"}),
        shift: Command.bind(moveToLineSide, {dir: "forward", extend: true}),
    },
    {
        key: "Mod-Home",
        run: Command.bind(moveToDocSide, {side: "start"}),
        shift: Command.bind(moveToDocSide, {side: "start", extend: true}),
    },
    {
        key: "Mod-End",
        run: Command.bind(moveToDocSide, {side: "end"}),
        shift: Command.bind(moveToDocSide, {side: "end", extend: true}),
    },
    {key: "Mod-a", run: selectAll},
    {key: "Mod-z", run: undo},
    {key: "Mod-y", mac: "Mod-Shift-z", run: redo},
    {linux: "Ctrl-Shift-z", run: redo},
]

/** Extension: disable the full default keymap and install compose-field bindings. */
export function composeKeymap(): EditorState.Extension {
    return [KeyBinding.useDefaultKeymap.of(false), composeBindings.map(KeyBinding.of)]
}
