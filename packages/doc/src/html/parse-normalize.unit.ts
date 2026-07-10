import {describe, expect, it} from "vitest"
import {normalizers, ignoreTags, blockTags} from "./parse-normalize"

interface StubNode {
    nodeType: number
    parentNode: StubEl | null
    nextSibling: StubNode | null
    previousSibling: StubNode | null
}

class StubText implements StubNode {
    nodeType = 3
    parentNode: StubEl | null = null
    nextSibling: StubNode | null = null
    previousSibling: StubNode | null = null
    constructor(readonly nodeValue: string) {}
}

class StubEl implements StubNode {
    nodeType = 1
    firstChild: StubNode | null = null
    parentNode: StubEl | null = null
    nextSibling: StubNode | null = null
    previousSibling: StubNode | null = null
    children: StubNode[] = []

    constructor(readonly nodeName: string) {}

    get lastChild() {
        return this.children[this.children.length - 1] || null
    }

    appendChild(child: StubNode) {
        if (child.parentNode) child.parentNode.removeChild(child)
        child.parentNode = this
        let prev = this.lastChild
        if (prev) prev.nextSibling = child
        child.previousSibling = prev
        child.nextSibling = null
        this.children.push(child)
        this.firstChild = this.children[0]
        return child
    }

    removeChild(child: StubNode) {
        let i = this.children.indexOf(child)
        if (i < 0) return child
        let prev = this.children[i - 1] || null
        let next = this.children[i + 1] || null
        if (prev) prev.nextSibling = next
        if (next) next.previousSibling = prev
        this.children.splice(i, 1)
        this.firstChild = this.children[0] || null
        child.parentNode = null
        child.nextSibling = null
        child.previousSibling = null
        return child
    }
}

function el(name: string, ...kids: StubNode[]) {
    let node = new StubEl(name.toUpperCase())
    for (let k of kids) node.appendChild(k)
    return node
}

describe("tag sets", () => {
    it("lists common ignore and block tags", () => {
        expect(ignoreTags.has("script")).toBe(true)
        expect(ignoreTags.has("style")).toBe(true)
        expect(blockTags.has("p")).toBe(true)
        expect(blockTags.has("li")).toBe(true)
        expect(blockTags.has("span")).toBe(false)
    })
})

describe("normalizeList", () => {
    it("nests a following ul under the previous li", () => {
        let nested = el("ul", el("li", new StubText("nested")))
        let item = el("li", new StubText("item"))
        let list = el("ul", item, nested)
        normalizers.ul(list as unknown as Element)
        expect(list.children.length).toBe(1)
        expect(list.children[0]).toBe(item)
        expect(item.children.some((c) => c === nested)).toBe(true)
    })

    it("nests a following ol under the previous li", () => {
        let nested = el("ol", el("li", new StubText("2")))
        let item = el("li", new StubText("1"))
        let list = el("ol", item, nested)
        normalizers.ol(list as unknown as Element)
        expect(item.children).toContain(nested)
        expect(list.children).toEqual([item])
    })

    it("does not nest when the previous sibling is not an li", () => {
        let nested = el("ul", el("li", new StubText("x")))
        let list = el("ul", nested)
        normalizers.ul(list as unknown as Element)
        expect(list.children).toEqual([nested])
    })
})
