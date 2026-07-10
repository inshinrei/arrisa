import {describe, expect, it} from "vitest"
import {Attributes} from "@arrisa/doc"
import {takeAttributes, updateAttributes} from "./attributes"

function mockElement(initial: Record<string, string> = {}) {
    let map = new Map(Object.entries(initial))
    let elt = {
        get attributes() {
            let names = [...map.keys()].sort()
            let list: {name: string; value: string}[] = names.map((name) => ({name, value: map.get(name)!}))
            return Object.assign(list, {length: list.length})
        },
        setAttribute(name: string, value: string) {
            map.set(name, value)
        },
        removeAttribute(name: string) {
            map.delete(name)
        },
        getAttribute(name: string) {
            return map.has(name) ? map.get(name)! : null
        },
        _map: map,
    }
    return elt as unknown as Element & {_map: Map<string, string>}
}

describe("takeAttributes", () => {
    it("returns none for an empty element", () => {
        expect(takeAttributes(mockElement())).toBe(Attributes.none)
    })

    it("reads all attributes into a sorted list", () => {
        let attrs = takeAttributes(mockElement({class: "c", id: "x"}))
        expect(attrs).toEqual(Attributes.read({class: "c", id: "x"}))
    })
})

describe("updateAttributes", () => {
    it("reports no change when attributes match", () => {
        let dom = mockElement({a: "1", b: "2"})
        let same = Attributes.read({a: "1", b: "2"})
        expect(updateAttributes(dom, same, same)).toBe(false)
        expect(dom.getAttribute("a")).toBe("1")
    })

    it("updates changed values", () => {
        let dom = mockElement({a: "1"})
        let a = Attributes.read({a: "1"})
        let b = Attributes.read({a: "2"})
        expect(updateAttributes(dom, a, b)).toBe(true)
        expect(dom.getAttribute("a")).toBe("2")
    })

    it("adds new attributes and removes missing ones", () => {
        let dom = mockElement({old: "x", keep: "1"})
        let a = Attributes.read({old: "x", keep: "1"})
        let b = Attributes.read({keep: "1", neu: "y"})
        expect(updateAttributes(dom, a, b)).toBe(true)
        expect(dom.getAttribute("old")).toBe(null)
        expect(dom.getAttribute("keep")).toBe("1")
        expect(dom.getAttribute("neu")).toBe("y")
    })

    it("can clear all attributes", () => {
        let dom = mockElement({a: "1"})
        let a = Attributes.read({a: "1"})
        expect(updateAttributes(dom, a, Attributes.none)).toBe(true)
        expect(dom.getAttribute("a")).toBe(null)
    })
})
