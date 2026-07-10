/**
 * Text and background color mark extensions.
 *
 * {@link color} / {@link backgroundColor} register the mark types and a menu
 * submenu that hosts {@link ColorPicker}. Empty selection updates stored marks
 * on the cursor; non-empty ranges add or remove the color across the selection.
 *
 * Palette defaults and layout facets live on {@link ColorPicker} (see
 * `color-picker.ts`).
 */
import {Menu} from "@arrisa/command"
import {type ChangeSet, type Mark} from "@arrisa/doc"
import {Arrisa} from "@arrisa/editor"
import {phrases} from "@arrisa/phrases"
import {EditorSelection, EditorState} from "@arrisa/state"
import {BackgroundColor, Color, isSafeCssColor} from "@arrisa/types"
import {ColorPicker} from "./color-picker"

export {ColorPicker} from "./color-picker"

/**
 * Apply or clear a color mark on the current selection.
 * Empty string `value` removes the mark; non-empty adds `mark.of(value)`.
 * Non-empty values must pass {@link isSafeCssColor} (defense in depth).
 */
function setColor(editor: Arrisa, mark: Mark.Type<string>, value: string) {
    if (value && !isSafeCssColor(value)) return
    let {state} = editor,
        {selection} = state
    if (selection instanceof EditorSelection.Text && selection.empty) {
        let selMarks = selection.marks || state.sel.head.marks()
        let newMarks = value ? mark.of(value).addToSet(selMarks) : mark.removeFromSet(selMarks)
        editor.dispatch({
            selection: EditorSelection.Text.create({
                anchor: selection.anchor,
                headSide: selection.headSide,
                goalColumn: selection.goalColumn,
                marks: newMarks,
            }),
            userEvent: value ? "mark.add" : "mark.remove",
        })
    } else if (value) {
        editor.dispatch({
            changes: selection.ranges.map((r) => ({from: r.from, to: r.to, add: mark.of(value)})),
            userEvent: "mark.add",
        })
    } else {
        let changes: ChangeSet.Spec[] = []
        for (let {from, to} of selection.ranges) {
            state.doc.iterate(from, to, (node, pos) => {
                let has = mark.isInSet(node.marks)
                if (has) changes.push({from: Math.max(from, pos), to: Math.min(to, pos + node.length), remove: has})
            })
        }
        editor.dispatch({changes, userEvent: "mark.remove"})
    }
}

function colorControl(mark: Mark.Type<string>) {
    return Menu.CustomControl.define({
        render(editor, done) {
            let view = editor as Arrisa
            return ColorPicker.create(view, (value) => {
                done()
                setColor(view, mark, value)
                view.focus()
            })
        },
    })
}

/** Foreground text color mark with palette submenu. */
export function color(): EditorState.Extension {
    return [EditorState.schemaElement.of(Color), color.button, ColorPicker.theme]
}

export namespace color {
    export const button = Menu.Submenu.define({
        label: {
            icon: "M5 8A3 3 0 0 1 8 5h28a3 3 0 0 1 3 3v30l23-23a3 3 0 0 1 4 0l20 20a3 3 0 0 1 0 4L63 61H92a3 3 0 0 1 3 3v28a3 3 0 0 1-3 3H22a17 17 0 0 1-12-5A17 17 0 0 1 5 78m34-1 41-41-16-16L39 45zM30 78a8 8 0 1 0-17 0 8 8 0 0 0 17 0M89 89v-22H57l-23 23zM5 8v70zm0 70V78z",
        },
        description: phrases.ref("text_color"),
        arrow: false,
        parent: Menu.Group.inline,
        rank: 80,
        content: [colorControl(Color)],
    })
}

/** Background / highlight color mark with palette submenu. */
export function backgroundColor(): EditorState.Extension {
    return [EditorState.schemaElement.of(BackgroundColor), backgroundColor.button, ColorPicker.theme]
}

export namespace backgroundColor {
    export const button = Menu.Submenu.define({
        label: {
            icon: "M67 9a11 11 0 0 1 16 0l8 8a11 11 0 0 1 0 16l-2 2-45 51a3 3 0 0 1-2 1h-17a3 3 0 0 1-1 0l-2 2A3 3 0 0 1 19 89h-11a3 3 0 0 1-2-5l8-8A3 3 0 0 1 13 75v-17a3 3 0 0 1 1-2l51-45zm-1 8L20 59l21 21 42-46zm20 12 0 0a6 6 0 0 0 0-8L79 13a6 6 0 0 0-8 0l0 0zM35 81 19 65v9L26 81z",
        },
        description: phrases.ref("background_color"),
        arrow: false,
        parent: Menu.Group.inline,
        rank: 85,
        content: [colorControl(BackgroundColor)],
    })
}
