import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState, EditorSelection} from "@arrisa/state"
import {Menu, selectAll} from "@arrisa/command"
import {defaultFloatingWhen, floatingMenu} from "./floating-menu"
import {Tooltip} from "./tooltip"

function makeDoc(text = "hello") {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {
        schema,
        doc: schema.doc([paragraph.create([Leaf.text(text)])]),
        elements: schema.elements,
    }
}

function makeState(
    extensions: EditorState.Extension,
    opts: {text?: string; selection?: EditorSelection} = {},
) {
    let {doc, elements} = makeDoc(opts.text ?? "hello")
    return EditorState.create({
        doc,
        selection: opts.selection,
        config: [EditorState.schemaElement.of(elements), extensions],
    })
}

describe("defaultFloatingWhen", () => {
    it("is false for empty cursor selection", () => {
        let state = makeState([])
        expect(defaultFloatingWhen(state)).toBe(false)
    })

    it("is true for non-empty range", () => {
        // doc layout: <p> open(0) "hello"(1-5) close(6) → select chars 1..4
        let state = makeState([], {selection: EditorSelection.range(1, 4)})
        expect(defaultFloatingWhen(state)).toBe(true)
    })
})

describe("floatingMenu", () => {
    it("provides no tooltip when selection is empty", () => {
        let state = makeState([
            floatingMenu({hideOnBlur: false}),
            Menu.Button.define({label: "All", run: selectAll, parent: Menu.Group.inline, rank: 10}),
        ])
        let tips = state.facet(Tooltip.show).filter(Boolean)
        expect(tips.length).toBe(0)
    })

    it("shows a tooltip above a non-empty selection when hideOnBlur is false", () => {
        let state = makeState(
            [
                floatingMenu({hideOnBlur: false, above: true}),
                Menu.Button.define({label: "All", run: selectAll, parent: Menu.Group.inline, rank: 10}),
            ],
            {selection: EditorSelection.range(1, 4)},
        )
        let tips = state.facet(Tooltip.show).filter((t): t is Tooltip => !!t)
        expect(tips.length).toBe(1)
        expect(tips[0].pos).toBe(1)
        expect(tips[0].end).toBe(4)
        expect(tips[0].above).toBe(true)
    })

    it("hides when hideOnBlur is true and editor is not focused", () => {
        let state = makeState(
            [
                floatingMenu({hideOnBlur: true}),
                Menu.Button.define({label: "All", run: selectAll, parent: Menu.Group.inline, rank: 10}),
            ],
            {selection: EditorSelection.range(1, 3)},
        )
        // editorFocused field defaults to false
        let tips = state.facet(Tooltip.show).filter(Boolean)
        expect(tips.length).toBe(0)
    })

    it("omits default theme when theme is false", () => {
        // Smoke: construction succeeds; host supplies styles.
        let state = makeState([
            floatingMenu({hideOnBlur: false, theme: false}),
            Menu.Button.define({label: "All", run: selectAll, parent: Menu.Group.inline, rank: 10}),
        ], {selection: EditorSelection.range(1, 4)})
        let tips = state.facet(Tooltip.show).filter((t): t is Tooltip => !!t)
        expect(tips.length).toBe(1)
    })

    it("respects custom when predicate", () => {
        let state = makeState(
            [
                floatingMenu({
                    hideOnBlur: false,
                    when: () => false,
                }),
            ],
            {selection: EditorSelection.range(1, 5)},
        )
        expect(state.facet(Tooltip.show).filter(Boolean).length).toBe(0)
    })
})
