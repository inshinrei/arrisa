/**
 * Test fixtures for `@arrisa/collab` unit tests (not public API).
 */
import {ChangeSet, Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorSelection, EditorState, type Transaction as Tr} from "@arrisa/state"
import {collab, type CollabConfig} from "./index"

export function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

/** Editor state with collab installed from a config object. */
export function makeState(text = "hello", config: CollabConfig = {}) {
    return makeStateWith(text, collab(config))
}

/** Editor state with arbitrary extensions (must include collab when testing collab). */
export function makeStateWith(text: string, extensions: EditorState.Extension) {
    let {schema, paragraph} = basicSchema()
    let doc = schema.doc([paragraph.create([Leaf.text(text)])])
    let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(1),
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
    return {state, schema, paragraph, doc}
}

export function apply(state: EditorState, spec: Tr.Spec) {
    return state.update(spec).state
}

/** Insert `text` at document position `from`. */
export function typeAt(state: EditorState, from: number, text: string) {
    return apply(state, {
        changes: {from, to: from, insert: Slice.of([Leaf.text(text)])},
        selection: EditorSelection.cursor(from + text.length),
        userEvent: "input.type",
    })
}

/** Delete the range [from, to). */
export function deleteRange(state: EditorState, from: number, to: number) {
    return apply(state, {
        changes: {from, to, insert: Slice.empty},
        selection: EditorSelection.cursor(from),
        userEvent: "delete.forward",
    })
}

/** Build a ChangeSet that inserts `text` at `from` against `doc`. */
export function insertChange(doc: Plot.Doc, from: number, text: string) {
    return ChangeSet.create(doc, {from, to: from, insert: Slice.of([Leaf.text(text)])})
}
