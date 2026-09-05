import {describe, expect, it} from "vitest"
import {type Command} from "@arrisa/command"
import {Leaf} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {Link, Paragraph} from "@arrisa/types"
import {blockDoc, paragraph} from "./block"
import {isLinkPasteUrl, link, type LinkConfig, type LinkPromptRequest} from "./link"
import {makeState} from "./test-helpers"

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

function runToggle(editor: {state: EditorState}) {
    return (link.button.run as Command)(editor as any, null)
}

function linkAt(state: EditorState, pos = 1) {
    let node = state.doc.resolve(pos).nodeAfter
    return node ? Link.isInSet(node.tag.marks) : null
}

function rangedState(config?: LinkConfig, marks?: readonly import("@arrisa/doc").Mark[]) {
    let extensions = [blockDoc(), paragraph(), link(config)]
    let proto = makeState(extensions)
    let doc = proto.schema.doc([Paragraph.create([Leaf.text("hello", marks)])])
    return makeState(extensions, {doc, selection: EditorSelection.range(1, 6)})
}

describe("isLinkPasteUrl", () => {
    it("accepts common absolute URL schemes", () => {
        expect(isLinkPasteUrl("https://example.com")).toBe(true)
        expect(isLinkPasteUrl("http://example.com/path")).toBe(true)
        expect(isLinkPasteUrl("mailto:a@b.com")).toBe(true)
        expect(isLinkPasteUrl("xmpp:user@host")).toBe(true)
    })

    it("rejects data, javascript, relative, and malformed paste targets", () => {
        expect(isLinkPasteUrl("data:text/plain,hi")).toBe(false)
        expect(isLinkPasteUrl("javascript:alert(1)")).toBe(false)
        expect(isLinkPasteUrl("")).toBe(false)
        expect(isLinkPasteUrl("example.com")).toBe(false)
        expect(isLinkPasteUrl("/relative")).toBe(false)
        expect(isLinkPasteUrl("ftp://example.com")).toBe(false)
        expect(isLinkPasteUrl("https://example.com more")).toBe(false)
        expect(isLinkPasteUrl(" see https://example.com")).toBe(false)
        expect(isLinkPasteUrl("https://example.com ")).toBe(false)
    })
})

describe("link.button.run", () => {
    it("removes a link on a linked range without prompting", () => {
        let prompted = false
        let state = rangedState(
            {prompt: () => {
                prompted = true
            }},
            [Link.of("https://example.com")],
        )
        let editor = mockEditor(state)
        expect(runToggle(editor)).toBe(true)
        expect(prompted).toBe(false)
        expect(linkAt(editor.state)).toBeFalsy()
    })

    it("invokes a custom prompt and apply sanitizes hrefs", () => {
        let req: LinkPromptRequest | undefined
        let state = rangedState({
            prompt: (r) => {
                req = r
            },
        })
        let editor = mockEditor(state)
        expect(runToggle(editor)).toBe(true)
        expect(req).toBeTruthy()
        expect(req!.from).toBe(1)
        expect(req!.to).toBe(6)
        expect(typeof req!.apply).toBe("function")
        expect(typeof req!.cancel).toBe("function")
        req!.apply("javascript:alert(1)")
        expect(linkAt(editor.state)).toBeFalsy()
        req!.apply("https://ok.example")
        expect(linkAt(editor.state)?.value).toBe("https://ok.example")
    })

    it("applies the link to the original range after the selection moves", () => {
        let req: LinkPromptRequest | undefined
        let state = rangedState({
            prompt: (r) => {
                req = r
            },
        })
        let editor = mockEditor(state)
        expect(runToggle(editor)).toBe(true)
        editor.dispatch({selection: EditorSelection.cursor(1)})
        expect(editor.state.selection.empty).toBe(true)
        req!.apply("https://ok.example")
        expect(linkAt(editor.state)?.value).toBe("https://ok.example")
        expect(editor.state.selection.from).toBe(1)
        expect(editor.state.selection.to).toBe(6)
    })

    it("returns false for prompt: false on an unmarked range", () => {
        let state = rangedState({prompt: false})
        let editor = mockEditor(state)
        expect(runToggle(editor)).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
        expect(linkAt(editor.state)).toBeFalsy()
    })

    it("returns false on an empty selection", () => {
        let state = makeState([blockDoc(), paragraph(), link()], {selection: 1})
        let editor = mockEditor(state)
        expect(state.selection.empty).toBe(true)
        expect(runToggle(editor)).toBe(false)
    })
})
