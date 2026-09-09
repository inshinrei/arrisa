import {describe, expect, it} from "vitest"
import {Leaf, Slice} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {Arrisa, KeyBinding, Tooltip} from "@arrisa/editor"
import {
    Blockquote,
    BulletList,
    CodeBlock,
    Doc,
    InlineDoc,
    Link,
    OrderedList,
    Paragraph,
    Spoiler,
    Strong,
} from "@arrisa/types"
import {composeField} from "./compose-field"
import {flagEntity} from "./entities"
import {formattedTextToDoc} from "./from-formatted"
import {entityToMark} from "./mark-map"
import {docToFormattedText} from "./to-formatted"

function typeChars(state: EditorState, chars: string) {
    let cur = state
    for (let ch of chars) {
        let head = cur.selection.head
        let tr = cur.update({
            changes: {from: head, to: head, insert: Slice.of([Leaf.text(ch)])},
            selection: EditorSelection.cursor(head + ch.length),
            userEvent: "input.type",
        })
        let chain = Transaction.append(tr)
        cur = chain[chain.length - 1]!.state
    }
    return cur
}

describe("composeField", () => {
    it("installs composeSchema and composeKeymap", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(BulletList)).toBe(true)
        expect(state.schema.has(OrderedList)).toBe(true)
        expect(state.schema.has(Blockquote)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(InlineDoc)).toBe(false)
        expect(state.schema.has(Spoiler)).toBe(false)
        expect(state.facet(KeyBinding.useDefaultKeymap)).toBe(false)
    })

    it("shows a floating menu for a non-empty selection", () => {
        let config = composeField({placeholder: false, markdown: false})
        let proto = EditorState.create({doc: "", config})
        let doc = formattedTextToDoc({text: "hello"}, proto.schema)
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 6),
            config,
        })
        // Default hideOnBlur hides the toolbar until the editor is focused.
        state = state.update({annotations: Arrisa.isFocusChange.of(true)}).state
        let tips = state.facet(Tooltip.show).filter(Boolean)
        expect(tips.length).toBeGreaterThan(0)
    })

    it("does not install host elements by default", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.getNode("CustomEmoji")).toBeFalsy()
    })

    it("does not apply spoiler markdown on typing", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false}),
        })
        expect(state.schema.has(Spoiler)).toBe(false)
        state = typeChars(state, "||x||")
        expect(state.doc.textContent()).toBe("||x||")
        let spoiler = false
        state.doc.iterate((node) => {
            if (node.isText && Spoiler.isInSet(node.marks)) spoiler = true
        })
        expect(spoiler).toBe(false)
    })

    it("entityToMark skips spoiler when Spoiler is not in the schema", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(entityToMark(flagEntity("spoiler", 0, 1), state.schema)).toBeNull()
        let doc = formattedTextToDoc({text: "hi", entities: [flagEntity("spoiler", 0, 2)]}, state.schema)
        expect(doc.textContent()).toBe("hi")
        let spoiler = false
        doc.iterate((node) => {
            if (node.isText && Spoiler.isInSet(node.marks)) spoiler = true
        })
        expect(spoiler).toBe(false)
    })
})

function mockEditor(state: EditorState) {
    let current = state
    let dispatched: Transaction.Spec[] = []
    let editor = {
        get state() {
            return current
        },
        dispatched,
        dispatch(...specs: Transaction.Spec[]) {
            for (let s of specs) {
                dispatched.push(s)
                current = current.update(s).state
            }
        },
        focus() {},
        contentDOM: {ownerDocument: {activeElement: null}},
        win: globalThis,
    }
    return editor as any
}

function pasteEvent(plain: string, html = ""): ClipboardEvent {
    return {
        clipboardData: {
            getData(type: string) {
                if (type == "text/plain" || type == "Text") return plain
                if (type == "text/html") return html
                if (type == "text/uri-list") return ""
                return ""
            },
        },
    } as ClipboardEvent
}

function runPasteOver(editor: {state: EditorState}, event: ClipboardEvent) {
    return editor.state.facet(Arrisa.pasteHandler).some((h) => h(editor as any, event, Slice.empty, []))
}

describe("composeField paste-link dump", () => {
    it("caret-pasted https URL dumps as text_url, not only auto url", () => {
        let url = "https://example.com"
        let state = EditorState.create({
            doc: "",
            selection: EditorSelection.cursor(1),
            config: composeField({floating: false, placeholder: false, markdown: false, markdownPaste: false}),
        })
        let editor = mockEditor(state)
        expect(runPasteOver(editor, pasteEvent(url))).toBe(true)
        expect(editor.state.doc.textContent()).toBe(url)
        let leaf = editor.state.doc.resolve(1).nodeAfter
        expect(leaf && Link.isInSet(leaf.tag.marks)).toBeTruthy()
        let ft = docToFormattedText(editor.state.doc)
        expect(ft.text).toBe(url)
        expect(ft.entities?.some((e) => e.type == "text_url" && e.url == url)).toBe(true)
        expect(ft.entities?.some((e) => e.type == "url")).toBeFalsy()
        let auto = docToFormattedText(editor.state.doc, {autoDetect: true})
        expect(auto.entities?.some((e) => e.type == "text_url" && e.url == url)).toBe(true)
    })

    it("does not claim HTML clipboard that already has an anchor", () => {
        let url = "https://example.com"
        let state = EditorState.create({
            doc: "",
            selection: EditorSelection.cursor(1),
            config: composeField({floating: false, placeholder: false, markdown: false, markdownPaste: false}),
        })
        let editor = mockEditor(state)
        expect(
            runPasteOver(editor, pasteEvent(url, `<a href="${url}">${url}</a>`)),
        ).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
    })

    it("marks only the pasted URL when the field already has surrounding text", () => {
        let url = "https://example.com"
        let prefix = "hello "
        let config = composeField({floating: false, placeholder: false, markdown: false, markdownPaste: false})
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([Paragraph.create([Leaf.text(prefix)])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(1 + prefix.length),
            config,
        })
        let editor = mockEditor(state)
        expect(runPasteOver(editor, pasteEvent(url))).toBe(true)
        expect(editor.state.doc.textContent()).toBe(prefix + url)
        let before = editor.state.doc.resolve(1).nodeAfter
        expect(before && Link.isInSet(before.tag.marks)).toBeFalsy()
        let linked = editor.state.doc.resolve(1 + prefix.length).nodeAfter
        expect(linked && Link.isInSet(linked.tag.marks)?.value).toBe(url)
        let ft = docToFormattedText(editor.state.doc)
        expect(ft.text).toBe(prefix + url)
        expect(ft.entities).toEqual([
            {type: "text_url", offset: prefix.length, length: url.length, url},
        ])
    })

    it("does not mark a mixed clipboard that contains a URL plus other text", () => {
        let state = EditorState.create({
            doc: "",
            selection: EditorSelection.cursor(1),
            config: composeField({floating: false, placeholder: false, markdown: false, markdownPaste: false}),
        })
        let editor = mockEditor(state)
        expect(runPasteOver(editor, pasteEvent("see https://example.com"))).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
    })
})
