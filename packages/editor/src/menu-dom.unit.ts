import {describe, expect, it} from "vitest"
import {Leaf, Mark, Plot, Schema} from "@arrisa/doc"
import {Menu} from "@arrisa/command"
import {EditorSelection, EditorState} from "@arrisa/state"
import {defaultChild, F, findChild, findNextChild, MenuHost, type MenuElement} from "./menu-dom"
import {InputState} from "./input/input-state"

function elt(flags: F, index = 0): MenuElement {
    return {
        dom: {} as Element,
        focusDOM: {} as HTMLElement,
        index,
        item: {} as any,
        flags,
        update() {},
        children: null,
        run: null,
    }
}

describe("menu-dom helpers", () => {
    it("findChild skips disabled items", () => {
        let children = [elt(F.Disabled), elt(0 as F), elt(F.Disabled)]
        expect(findChild(children, true)).toBe(children[1])
        expect(findChild(children, false)).toBe(children[1])
    })

    it("findNextChild wraps and skips hidden", () => {
        let children = [elt(0 as F, 0), elt(F.Hidden, 1), elt(0 as F, 2)]
        expect(findNextChild(children, children[0], 1)).toBe(children[2])
        expect(findNextChild(children, children[2], 1)).toBe(children[0])
        expect(findNextChild(children, children[0], -1)).toBe(children[2])
    })

    it("defaultChild prefers active", () => {
        let children = [elt(0 as F), elt(F.Active), elt(0 as F)]
        expect(defaultChild(children)).toBe(children[1])
        expect(defaultChild([])).toBeNull()
    })
})

function matchesSelector(el: any, sel: string) {
    return sel.split(",").some((part) => {
        let p = part.trim()
        if (!p) return false
        if (p.startsWith(".")) return el.classList.contains(p.slice(1))
        return el.tagName && el.tagName.toLowerCase() == p.toLowerCase()
    })
}

function mockEl(tag: string, ownerDocument: any) {
    let classes = new Set<string>()
    let attrs = new Map<string, string>()
    let listeners = new Map<string, Function[]>()
    let el: any = {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        childNodes: [] as any[],
        parentNode: null as any,
        role: "",
        tabIndex: -1,
        title: "",
        ownerDocument,
        style: {
            display: "",
            setProperty(name: string, value: string) {
                ;(this as any)[name] = value
            },
        },
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
        addEventListener(type: string, handler: Function) {
            let list = listeners.get(type)
            if (!list) listeners.set(type, (list = []))
            list.push(handler)
        },
        removeEventListener(type: string, handler: Function) {
            let list = listeners.get(type)
            if (list) listeners.set(
                type,
                list.filter((h) => h != handler),
            )
        },
        setAttribute(name: string, value: string) {
            attrs.set(name, String(value))
        },
        getAttribute(name: string) {
            return attrs.has(name) ? attrs.get(name)! : null
        },
        removeAttribute(name: string) {
            attrs.delete(name)
        },
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
        closest(sel: string) {
            for (let node: any = el; node; node = node.parentNode) {
                if (matchesSelector(node, sel)) return node
            }
            return null
        },
        contains(node: any) {
            for (let n: any = node; n; n = n.parentNode) {
                if (n === el) return true
            }
            return false
        },
        focus() {},
        _listeners: listeners,
    }
    Object.defineProperty(el, "className", {
        get() {
            return [...classes].join(" ")
        },
        set(value: string) {
            classes.clear()
            for (let cls of String(value).split(/\s+/)) if (cls) classes.add(cls)
        },
    })
    Object.defineProperty(el, "textContent", {
        get() {
            return ""
        },
        set() {
            for (let c of el.childNodes) c.parentNode = null
            el.childNodes = []
        },
    })
    return el
}

function withMockDocument(run: () => void) {
    let prev = (globalThis as any).document
    let doc: any = {
        createElement(name: string) {
            return mockEl(name, doc)
        },
        createElementNS(_ns: string, name: string) {
            return mockEl(name, doc)
        },
        addEventListener() {},
        removeEventListener() {},
        activeElement: null,
    }
    ;(globalThis as any).document = doc
    try {
        run()
    } finally {
        ;(globalThis as any).document = prev
    }
}

function makeDoc(text = "hello world") {
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold])
    return {
        bold,
        schema,
        doc: schema.doc([paragraph.create([Leaf.text(text)])]),
        elements: schema.elements,
    }
}

function makeEditor(
    extensions: EditorState.Extension,
    selection = EditorSelection.range(1, 6),
    parts = makeDoc(),
) {
    let {doc, elements, bold} = parts
    let state = EditorState.create({
        doc,
        selection,
        config: [EditorState.schemaElement.of(elements), extensions],
    })
    let editor: any = {
        get state() {
            return state
        },
        connected: true,
        hasFocus: false,
        themeClasses: "",
        contentDOM: {id: "content", addEventListener() {}, removeEventListener() {}},
        dispatch(...specs: any[]) {
            for (let spec of specs) state = state.update(spec).state
            if (editor.host)
                editor.host.update({
                    state,
                    startState: state,
                    docChanged: true,
                    selectionSet: true,
                    transactions: [],
                })
        },
        focus() {},
        win: globalThis,
    }
    return {editor, bold, getState: () => state}
}

let hostTemplate = EditorState.Facet.define<readonly Menu.Template[], readonly Menu.Template[]>({
    combine: (inputs) => (inputs.length ? inputs[0] : [Menu.Group.top.template()]),
})

function fakePointer(path: unknown[]): PointerEvent {
    return {composedPath: () => path} as unknown as PointerEvent
}

function fakeMouse(target: EventTarget | null): MouseEvent {
    return {
        target,
        defaultPrevented: false,
        preventDefault() {},
    } as unknown as MouseEvent
}

describe("embedded menubar chrome click", () => {
    it("embedded menubar pointerdown + mousedown applies the mark and keeps the range", () => {
        withMockDocument(() => {
            // One makeDoc so button mark identity matches schema marks (Mark.define is unique per call).
            let parts = makeDoc()
            let {bold} = parts
            let button = Menu.Button.toggleMark({
                mark: bold,
                parent: Menu.Group.inline,
                rank: 10,
                description: "Toggle strong emphasis" as any,
                label: {icon: "M0 0"},
            })
            let {editor, getState} = makeEditor([button, hostTemplate.of([Menu.Group.top.template()])], undefined, parts)
            let host = new MenuHost(editor, {variant: "bar", template: hostTemplate})
            editor.dom = {contains: () => false, ownerDocument: document}
            editor.host = host
            let input = new InputState(editor)
            let markBtn = host.elts.find((e) => e.dom.getAttribute("aria-label") == "Toggle strong emphasis")
            expect(markBtn).toBeTruthy()
            let menubar = host.dom
            let parent = {closest: () => null}
            input.onOutsidePointer(fakePointer([markBtn!.dom, menubar, parent, document]))
            host.click(fakeMouse(markBtn!.dom))
            let state = getState()
            expect(state.selection.empty).toBe(false)
            expect(state.selection.from).toBe(1)
            expect(state.selection.to).toBe(6)
            // isInSet returns the mark instance (or null), not a boolean.
            expect(bold.isInSet(state.doc.resolve(1).nodeAfter!.tag.marks)).toBeTruthy()
        })
    })

    it("enable-gated button does not run after collapse, and does run when chrome keeps the range", () => {
        withMockDocument(() => {
            let ran = 0
            let gated = Menu.Button.define({
                run: () => {
                    ran++
                    return true
                },
                enable: (s) => !s.selection.empty,
                parent: Menu.Group.inline,
                rank: 50,
                description: "Create link",
                label: {icon: "M0 0"},
            })
            let {editor, getState} = makeEditor([gated, hostTemplate.of([Menu.Group.top.template()])])
            let host = new MenuHost(editor, {variant: "bar", template: hostTemplate})
            editor.dom = {contains: () => false, ownerDocument: document}
            editor.host = host
            let input = new InputState(editor)
            let btn = host.elts.find((e) => e.dom.getAttribute("aria-label") == "Create link")!
            // Without menubar on the path, capture pointerdown collapses; click must not run.
            input.onOutsidePointer(fakePointer([{closest: () => null}]))
            expect(getState().selection.empty).toBe(true)
            host.click(fakeMouse(btn.dom))
            expect(ran).toBe(0)

            // Restore a range and go through menubar chrome.
            editor.dispatch({selection: EditorSelection.range(1, 6)})
            host.update({
                state: getState(),
                startState: getState(),
                docChanged: false,
                selectionSet: true,
                transactions: [],
            } as any)
            input.onOutsidePointer(fakePointer([btn.dom, host.dom, document]))
            expect(getState().selection.empty).toBe(false)
            host.click(fakeMouse(btn.dom))
            expect(ran).toBe(1)
        })
    })

    it("mousedown on More opens a visible Toggle underline menuitem", () => {
        withMockDocument(() => {
            let ran = 0
            // at:2 wraps only when length > 2 (same threshold as @arrisa/command menu.unit).
            let overflowGroup = Menu.Group.define({parent: Menu.Group.top, rank: 50, overflow: {at: 2}})
            let keep = Menu.Button.define({
                run: () => true,
                parent: overflowGroup,
                rank: 1,
                description: "Keep",
                label: {icon: "M1"},
            })
            let under = Menu.Button.define({
                run: () => {
                    ran++
                    return true
                },
                parent: overflowGroup,
                rank: 2,
                description: "Toggle underline",
                label: {icon: "M2"},
            })
            let extra = Menu.Button.define({
                run: () => true,
                parent: overflowGroup,
                rank: 3,
                description: "Extra wrap",
                label: {icon: "M3"},
            })
            let {editor, getState} = makeEditor([
                overflowGroup,
                keep,
                under,
                extra,
                hostTemplate.of([Menu.Group.top.template()]),
            ])
            let host = new MenuHost(editor, {variant: "bar", template: hostTemplate})
            editor.dom = {contains: () => false, ownerDocument: document}
            editor.host = host
            let input = new InputState(editor)

            let more = host.elts.find((e) => e.children && e.dom.getAttribute("aria-label") == "More")
            expect(more).toBeTruthy()
            let underEl = host.elts.find((e) => e.dom.getAttribute("aria-label") == "Toggle underline")
            expect(underEl).toBeTruthy()
            expect(underEl!.focusDOM.role == "menuitem" || underEl!.dom.role == "menuitem").toBe(true)
            // Closed: list not visible
            expect((more as any).list.style.display).toBe("none")

            input.onOutsidePointer(fakePointer([more!.dom, host.dom, document]))
            host.click(fakeMouse(more!.focusDOM))

            expect(getState().selection.empty).toBe(false)
            expect(host.selection.length).toBeGreaterThan(1)
            expect((more as any).list.style.display).not.toBe("none")
            expect((more as any).list.getAttribute("aria-hidden")).toBe("false")
            expect((underEl!.dom as HTMLElement).style.display).not.toBe("none")
            expect(underEl!.focusDOM.getAttribute("aria-hidden")).not.toBe("true")

            input.onOutsidePointer(fakePointer([underEl!.dom, (more as any).list, more!.dom, host.dom, document]))
            host.click(fakeMouse(underEl!.focusDOM))
            expect(getState().selection.empty).toBe(false)
            expect(ran).toBe(1)
        })
    })
})
