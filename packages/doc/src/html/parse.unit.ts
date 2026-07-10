import {describe, expect, it} from "vitest"
import {Schema} from "../schema/schema"
import {Mark} from "../model/mark"
import {Leaf, Plot} from "../model/node"
import {parse} from "./parse"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold, em])
    return {schema, paragraph, bold, em}
}

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
        // support simple tag and comma-separated tag lists; ignore attribute selectors for stubs
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

function el(name: string, ...content: (DomNode | string)[]) {
    let node = new DomEl(name.toUpperCase())
    for (let c of content) {
        if (typeof c == "string") node.append(new DomText(c))
        else node.append(c)
    }
    return node
}

function textOf(doc: Plot.Doc) {
    return doc.textContent()
}

describe("parse.Rule.Set", () => {
    let {schema} = basicSchema()

    it("builds element rules from schema shapes", () => {
        let rules = parse.Rule.Set.fromSchema(schema)
        expect(rules.elementRules.some((r) => r.selector == "p" || r.selector?.includes("p"))).toBe(true)
        expect(rules.elementRules.some((r) => r.selector == "strong")).toBe(true)
    })

    it("caches rule sets per schema", () => {
        expect(parse.Rule.Set.fromSchema(schema)).toBe(parse.Rule.Set.fromSchema(schema))
    })

    it("matchElement returns the matching rule", () => {
        let rules = parse.Rule.Set.fromSchema(schema)
        let p = el("p", "x")
        let match = rules.matchElement(p as unknown as Element)
        expect(match?.rule.tag).toBeTruthy()
    })
})

describe("parse", () => {
    let {schema, bold} = basicSchema()

    it("parses a simple paragraph", () => {
        let root = el("div", el("p", "hello"))
        let doc = parse(schema, root as unknown as Element)
        expect(textOf(doc)).toBe("hello")
        expect(doc.content[0].name).toBe("paragraph")
    })

    it("parses strong marks", () => {
        let root = el("div", el("p", el("strong", "hi")))
        let doc = parse(schema, root as unknown as Element)
        let leaf = (doc.content[0] as Plot).content[0] as Leaf<string>
        expect(leaf.param).toBe("hi")
        expect(leaf.marks.some((m) => m.eq(bold))).toBe(true)
    })

    it("ignores script/style tags", () => {
        let root = el("div", el("script", "evil()"), el("p", "ok"))
        let doc = parse(schema, root as unknown as Element)
        expect(textOf(doc)).toBe("ok")
    })

    it("collapses whitespace in normal paragraphs", () => {
        let root = el("div", el("p", "  a   b  "))
        let doc = parse(schema, root as unknown as Element)
        expect(textOf(doc)).toBe("a b")
    })

    it("skips ignoreContent elements (regression)", () => {
        let {schema: s, paragraph} = basicSchema()
        // custom rule: p content ignores .meta
        let rules = parse.Rule.Set.of([
            {
                selector: "p",
                tag: paragraph,
                ignoreContent: ".meta",
            },
            {
                selector: "span.meta",
                ignore: true,
            },
            {
                selector: "strong",
                mark: bold,
            },
        ])
        let meta = el("span", "skip")
        meta.attrs.class = "meta"
        // extend matches for class
        let orig = meta.matches.bind(meta)
        meta.matches = (sel: string) => {
            if (sel == ".meta" || sel == "span.meta") return true
            return orig(sel)
        }
        let p = el("p", "keep", meta, "me")
        // make p's children see .meta selector
        for (let ch of p.children) {
            if (ch.nodeType == 1) {
                let e = ch as DomEl
                let base = e.matches.bind(e)
                e.matches = (sel: string) => (sel == ".meta" || sel == "span.meta" ? e === meta : base(sel))
            }
        }
        let root = el("div", p)
        let doc = parse(s, root as unknown as Element, {ruleSet: rules})
        expect(textOf(doc)).toBe("keepme")
    })
})

describe("parse.slice", () => {
    let {schema} = basicSchema()

    it("returns tokens for a partial paragraph fragment", () => {
        let root = el("div", el("p", "ab"))
        let {slice, context} = parse.slice(schema, root as unknown as Element)
        expect(slice.length).toBeGreaterThan(0)
        expect(Array.isArray(context)).toBe(true)
        // full parse of same content should yield a coherent doc when wrapped
        let full = parse(schema, root as unknown as Element)
        expect(full.textContent()).toBe("ab")
    })
})
