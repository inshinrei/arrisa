import {describe, expect, it} from "vitest"
import {Leaf, Schema, parse, serialize, ValidationError} from "@arrisa/doc"
import {CodeBlock, CodeBlockLanguage, Paragraph} from "./blocks"
import {Doc} from "./doc"
import {Code} from "./marks"

function codeSchema() {
    return Schema.define([Doc, Paragraph, CodeBlock, CodeBlockLanguage, Code])
}

/** Minimal DOM stubs for HTML parse tests (no jsdom). */
interface DomNode {
    nodeType: number
    nextSibling: DomNode | null
}

class DomText implements DomNode {
    nodeType = 3
    nextSibling: DomNode | null = null
    constructor(public nodeValue: string) {}
}

class DomEl implements DomNode {
    nodeType = 1
    firstChild: DomNode | null = null
    nextSibling: DomNode | null = null
    children: DomNode[] = []
    attrs: Record<string, string> = {}
    style: {length: number; getPropertyValue(name: string): string} = {
        length: 0,
        getPropertyValue: () => "",
    }

    constructor(readonly nodeName: string) {}

    getAttribute(name: string) {
        return this.attrs[name] ?? null
    }

    matches(selector: string) {
        let name = this.nodeName.toLowerCase()
        return selector
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .some((s) => {
                if (s == name) return true
                if (s.startsWith(name + "[") || s.startsWith(name + ".") || s.startsWith(name + "#")) return true
                return false
            })
    }

    querySelector(selector: string): DomEl | null {
        let walk = (node: DomNode): DomEl | null => {
            if (node.nodeType == 1) {
                let el = node as DomEl
                if (el.matches(selector)) return el
                for (let ch of el.children) {
                    let found = walk(ch)
                    if (found) return found
                }
            }
            return null
        }
        for (let ch of this.children) {
            let found = walk(ch)
            if (found) return found
        }
        return null
    }

    append(child: DomNode) {
        if (this.children.length) this.children[this.children.length - 1].nextSibling = child
        this.children.push(child)
        this.firstChild = this.children[0]
        child.nextSibling = null
        return child
    }
}

function el(name: string, attrs: Record<string, string> | null, ...content: (DomNode | string)[]) {
    let node = new DomEl(name.toUpperCase())
    if (attrs) node.attrs = {...attrs}
    for (let c of content) {
        if (typeof c == "string") node.append(new DomText(c))
        else node.append(c)
    }
    return node
}

describe("CodeBlock HTML", () => {
    let schema = codeSchema()

    it("serializes as pre > code", () => {
        let doc = schema.doc([CodeBlock.create([Leaf.text("x = 1")])])
        expect(serialize(doc).toHTML()).toBe("<pre><code>x = 1</code></pre>")
    })

    it("serializes language as class on inner code", () => {
        let tag = CodeBlock.withMarks(CodeBlockLanguage.of("ts").addToSet(CodeBlock.marks))
        let doc = schema.doc([tag.create([Leaf.text("x")])])
        expect(serialize(doc).toHTML()).toBe('<pre><code class="language-ts">x</code></pre>')
    })

    it("parses CommonMark pre > code with language class", () => {
        let root = el("div", null, el("pre", null, el("code", {class: "language-ts"}, "let a")))
        let doc = parse(schema, root as unknown as Element)
        let block = doc.content[0]
        expect(block.type).toBe(CodeBlock.type)
        expect(block.tag.mark(CodeBlockLanguage)).toBe("ts")
        expect(doc.textContent()).toBe("let a")
    })

    it("parses bare pre without nested code", () => {
        let root = el("div", null, el("pre", null, "plain"))
        let doc = parse(schema, root as unknown as Element)
        let block = doc.content[0]
        expect(block.type).toBe(CodeBlock.type)
        expect(block.tag.mark(CodeBlockLanguage)).toBeUndefined()
        expect(doc.textContent()).toBe("plain")
    })

    it("parses legacy data-language on code", () => {
        let root = el("div", null, el("pre", null, el("code", {"data-language": "python"}, "print(1)")))
        let doc = parse(schema, root as unknown as Element)
        let block = doc.content[0]
        expect(block.type).toBe(CodeBlock.type)
        expect(block.tag.mark(CodeBlockLanguage)).toBe("python")
    })

    it("parses inline code mark without becoming a code block", () => {
        let root = el("div", null, el("p", null, el("code", null, "id")))
        let doc = parse(schema, root as unknown as Element)
        expect(doc.content[0].type).toBe(Paragraph.type)
        let text = doc.content[0].content[0]
        expect(text.is(Leaf.Text)).toBe(true)
        expect(Code.isInSet(text.marks)).toBeTruthy()
    })
})

describe("CodeBlockLanguage validate", () => {
    it("rejects empty language on fromJSON", () => {
        let schema = codeSchema()
        expect(() =>
            schema.nodeFromJSON({
                type: "CodeBlock",
                marks: {CodeBlockLanguage: ""},
                content: [{type: "text", text: "x"}],
            }),
        ).toThrow(ValidationError)
    })
})
