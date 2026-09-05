import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {embeddedMenu} from "./embedded-menu"
import {editorPlugin} from "./editor/plugin-api"
import {Arrisa} from "./editor"

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

function makeState(extensions: EditorState.Extension) {
    let {doc, elements} = makeDoc()
    return EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(elements), extensions],
    })
}

function mockEl(tag: string) {
    let classes = new Set<string>()
    let el: any = {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        childNodes: [] as any[],
        parentNode: null,
        role: "",
        classList: {
            add(name: string) {
                if (name) classes.add(name)
            },
            remove(name: string) {
                classes.delete(name)
            },
            contains(name: string) {
                return classes.has(name)
            },
        },
        addEventListener() {},
        setAttribute() {},
        appendChild(child: any) {
            if (child.parentNode) child.parentNode.removeChild(child)
            child.parentNode = el
            el.childNodes.push(child)
            return child
        },
        removeChild(child: any) {
            el.childNodes = el.childNodes.filter((c: any) => c != child)
            child.parentNode = null
            return child
        },
    }
    Object.defineProperty(el, "textContent", {
        set() {
            for (let c of el.childNodes) c.parentNode = null
            el.childNodes = []
        },
    })
    return el
}

function withMockDocument(run: () => void) {
    let prev = (globalThis as any).document
    ;(globalThis as any).document = {
        createElement(name: string) {
            return mockEl(name)
        },
    }
    try {
        run()
    } finally {
        ;(globalThis as any).document = prev
    }
}

describe("embeddedMenu", () => {
    it("registers a plugin and default top template", () => {
        let parent = {appendChild() {}, children: []} as any
        let state = makeState(embeddedMenu({parent}))
        expect(state.facet(editorPlugin).length).toBeGreaterThan(0)
    })

    it("omits default theme when theme is false", () => {
        let parent = {} as HTMLElement
        let withTheme = makeState(embeddedMenu({parent, theme: true}))
        let noTheme = makeState(embeddedMenu({parent, theme: false}))
        expect(noTheme.facet(Arrisa.styleModule).length).toBeLessThan(withTheme.facet(Arrisa.styleModule).length)
    })

    it("copies editor theme classes onto the menu root, not the host parent", () => {
        let parent = mockEl("div")
        let state = makeState(embeddedMenu({parent, class: "host-toolbar"}))
        let editor = {
            state,
            themeClasses: "theme-a light",
            contentDOM: {id: "content"},
        } as any
        withMockDocument(() => {
            let plugin = state.facet(editorPlugin)[0]
            let value = plugin.create(editor) as any
            value.connect()
            expect(value.host.dom.classList.contains("theme-a")).toBe(true)
            expect(value.host.dom.classList.contains("light")).toBe(true)
            expect(value.host.dom.classList.contains("host-toolbar")).toBe(true)
            expect(parent.classList.contains("theme-a")).toBe(false)
            editor.themeClasses = "theme-b dark"
            value.update({
                state: editor.state,
                startState: editor.state,
                docChanged: false,
                selectionSet: false,
            })
            expect(value.host.dom.classList.contains("theme-a")).toBe(false)
            expect(value.host.dom.classList.contains("theme-b")).toBe(true)
            expect(value.host.dom.classList.contains("dark")).toBe(true)
            expect(value.host.dom.classList.contains("host-toolbar")).toBe(true)
        })
    })
})

