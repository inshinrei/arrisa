import {describe, expect, it, vi} from "vitest"
import {Command, insertText} from "@arrisa/command"
import {Leaf, Node, Slice} from "@arrisa/doc"
import {Arrisa, Tooltip} from "@arrisa/editor"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {CodeBlock, Link, Paragraph} from "@arrisa/types"
import {blockDoc, codeBlock, paragraph} from "./block"
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

function pasteEvent(data: {plain?: string; html?: string; uriList?: string}): ClipboardEvent {
    return {
        clipboardData: {
            getData(type: string) {
                if (type == "text/plain") return data.plain ?? ""
                if (type == "Text") return data.plain ?? ""
                if (type == "text/html") return data.html ?? ""
                if (type == "text/uri-list") return data.uriList ?? ""
                return ""
            },
        },
    } as ClipboardEvent
}

function runPasteOver(editor: {state: EditorState}, event: ClipboardEvent) {
    return editor.state.facet(Arrisa.pasteHandler).some((h) => h(editor as any, event, Slice.empty, []))
}

function emptyCaretState() {
    return makeState([blockDoc(), paragraph(), link()], {selection: 1})
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
        expect(isLinkPasteUrl("https://example.com\n")).toBe(false)
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

    it("opens a floating prompt by default on an unmarked range", () => {
        let state = rangedState()
        let editor = mockEditor(state)
        expect(runToggle(editor)).toBe(true)
        let tips = editor.state.facet(Tooltip.show).filter(Boolean)
        expect(tips.length).toBeGreaterThan(0)
    })

    it("custom cancel focuses the editor", () => {
        let req: LinkPromptRequest | undefined
        let state = rangedState({
            prompt: (r) => {
                req = r
            },
        })
        let editor = mockEditor(state)
        let focus = vi.fn()
        editor.focus = focus
        expect(runToggle(editor)).toBe(true)
        req!.cancel()
        expect(focus).toHaveBeenCalled()
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

describe("link.button.enable", () => {
    it("is false iff selection.empty", () => {
        let empty = makeState([blockDoc(), paragraph(), link()], {selection: 1})
        expect(empty.selection.empty).toBe(true)
        expect(link.button.enable!(empty)).toBe(false)
        let ranged = rangedState()
        expect(ranged.selection.empty).toBe(false)
        expect(link.button.enable!(ranged)).toBe(true)
    })
})

describe("link.pasteOver", () => {
    it("inserts a lone https URL at an empty caret as a Link", () => {
        let url = "https://example.com"
        let editor = mockEditor(emptyCaretState())
        expect(runPasteOver(editor, pasteEvent({plain: url}))).toBe(true)
        expect(editor.state.doc.textContent()).toBe(url)
        expect(linkAt(editor.state)?.value).toBe(url)
        expect(editor.state.selection.empty).toBe(true)
        expect(editor.state.selection.from).toBe(1 + url.length)
        expect(editor.dispatched.at(-1)!.userEvent).toBe("paste.link")
    })

    it("trims trailing newline/spaces then marks", () => {
        let url = "https://example.com"
        let editor = mockEditor(emptyCaretState())
        expect(runPasteOver(editor, pasteEvent({plain: url + "\n  "}))).toBe(true)
        expect(editor.state.doc.textContent()).toBe(url)
        expect(linkAt(editor.state)?.value).toBe(url)
        expect(editor.dispatched.at(-1)!.userEvent).toBe("paste.link")
    })

    it("returns false for javascript: at an empty caret", () => {
        let editor = mockEditor(emptyCaretState())
        expect(runPasteOver(editor, pasteEvent({plain: "javascript:alert(1)"}))).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
        expect(linkAt(editor.state)).toBeFalsy()
    })

    it("returns false for www.example.com at an empty caret", () => {
        let editor = mockEditor(emptyCaretState())
        expect(runPasteOver(editor, pasteEvent({plain: "www.example.com"}))).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
    })

    it("returns false when clipboard is a URL plus more text", () => {
        let editor = mockEditor(emptyCaretState())
        expect(runPasteOver(editor, pasteEvent({plain: "https://example.com more"}))).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
    })

    it("marks only the pasted URL when the paragraph already has surrounding text", () => {
        let url = "https://example.com"
        let prefix = "hello "
        let extensions = [blockDoc(), paragraph(), link()]
        let proto = makeState(extensions)
        let doc = proto.schema.doc([Paragraph.create([Leaf.text(prefix)])])
        let state = makeState(extensions, {
            doc,
            selection: EditorSelection.cursor(1 + prefix.length),
        })
        let editor = mockEditor(state)
        expect(runPasteOver(editor, pasteEvent({plain: url}))).toBe(true)
        expect(editor.state.doc.textContent()).toBe(prefix + url)
        expect(linkAt(editor.state, 1)).toBeFalsy()
        expect(linkAt(editor.state, 1 + prefix.length)?.value).toBe(url)
        expect(editor.dispatched.at(-1)!.userEvent).toBe("paste.link")
    })

    it("returns false when text/html is present even if plain is a URL", () => {
        let editor = mockEditor(emptyCaretState())
        expect(
            runPasteOver(
                editor,
                pasteEvent({
                    plain: "https://example.com",
                    html: "<a href=\"https://example.com\">https://example.com</a>",
                }),
            ),
        ).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
    })

    it("wraps a non-empty selection with the URL and does not insert the URL string", () => {
        let url = "https://example.com"
        let editor = mockEditor(rangedState())
        expect(runPasteOver(editor, pasteEvent({plain: url}))).toBe(true)
        expect(editor.state.doc.textContent()).toBe("hello")
        expect(linkAt(editor.state)?.value).toBe(url)
        expect(editor.dispatched.at(-1)!.userEvent).toBe("paste.link")
    })

    it("returns false inside a code block", () => {
        let extensions = [blockDoc(), paragraph(), codeBlock(), link()]
        let proto = makeState(extensions)
        let doc = proto.schema.doc([CodeBlock.create([Leaf.text("x")])])
        let state = makeState(extensions, {doc, selection: 1})
        expect(state.sel.head.parent.node.type.hasRole(Node.Role.Code)).toBe(true)
        let editor = mockEditor(state)
        expect(runPasteOver(editor, pasteEvent({plain: "https://example.com"}))).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
        expect(linkAt(editor.state)).toBeFalsy()
        expect(editor.state.doc.textContent()).toBe("x")
    })

    it("does not extend the Link mark when typing after a caret-pasted URL", () => {
        let url = "https://example.com"
        let editor = mockEditor(emptyCaretState())
        expect(runPasteOver(editor, pasteEvent({plain: url}))).toBe(true)
        let from = editor.state.selection.from
        expect(Command.dispatch(editor, insertText, {from, to: from, insert: " x", userEvent: "input.type"})).toBe(true)
        expect(editor.state.doc.textContent()).toBe(url + " x")
        let extra = editor.state.doc.resolve(1 + url.length).nodeAfter
        expect(extra).toBeTruthy()
        expect(Link.isInSet(extra!.tag.marks)).toBeFalsy()
    })
})
