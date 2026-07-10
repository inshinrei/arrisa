/**
 * Shared schema/state fixtures for command unit tests (not part of public API).
 */
import {Leaf, Mark, Node, Plot, Schema, type Node as DocNode} from "@arrisa/doc"
import {EditorSelection, EditorState, type Transaction} from "@arrisa/state"

export type TestSchema = {
    schema: Schema
    paragraph: Plot.Tag
    blockquote: Plot.Tag
    listItem: Plot.Tag
    bulletList: Plot.Tag
    bold: Mark
    docType: Plot.Type
}

/** Doc may hold paragraphs, blockquotes, and bullet lists. */
export function testSchema(): TestSchema {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
        defaultBlock: true,
    })
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let blockquote = Plot.define("blockquote", {
        blockContent: paragraph,
        shape: {element: "blockquote"},
    })
    let listItem = Plot.define("list_item", {
        blockContent: paragraph,
        shape: {element: "li"},
        defining: true,
    })
    let bulletList = Plot.define("bullet_list", {
        blockContent: listItem,
        role: Node.Role.List,
        shape: {element: "ul"},
        autoJoin: true,
        defining: true,
    })
    let docType = Plot.defineDoc({blockContent: [paragraph, blockquote, bulletList]})
    let schema = Schema.define([docType, paragraph, blockquote, listItem, bulletList, bold])
    return {schema, paragraph, blockquote, listItem, bulletList, bold, docType}
}

export function para(s: TestSchema, text: string, marks?: Mark.Set) {
    return s.paragraph.create(text ? [Leaf.text(text, marks)] : [])
}

/** Build a state from a list of block nodes with a cursor (or selection). */
export function stateFromBlocks(
    blocks: (s: TestSchema) => readonly DocNode[],
    selection: number | EditorSelection = 1,
) {
    let s = testSchema()
    let doc = s.schema.doc(blocks(s))
    let sel = typeof selection == "number" ? EditorSelection.cursor(selection) : selection
    let state = EditorState.create({
        doc,
        selection: sel,
        config: [EditorState.schemaElement.of(s.schema.elements)],
    })
    return {state, ...s, doc: state.doc}
}

export function apply(state: EditorState, spec: Transaction.Spec) {
    return state.update(spec).state
}

export function run(
    state: EditorState,
    cmd: (state: EditorState, ...rest: any[]) => Transaction.Spec | false,
    ...args: any[]
) {
    let spec = cmd(state, ...args)
    if (!spec) return {state, applied: false as const, spec: false as const}
    return {state: apply(state, spec), applied: true as const, spec}
}
