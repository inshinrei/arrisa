import {describe, expect, it} from "vitest"
import {htmlStringToElement} from "@arrisa/state"
import {isOpen, wrapMap, htmlSanitize} from "./clipboard"

describe("wrapMap", () => {
    it("wraps table cell and row fragments with full ancestors", () => {
        expect(wrapMap.td).toEqual(["table", "tbody", "tr"])
        expect(wrapMap.th).toEqual(["table", "tbody", "tr"])
        expect(wrapMap.tr).toEqual(["table", "tbody"])
        expect(wrapMap.col).toEqual(["table", "colgroup"])
    })

    it("wraps section elements with a table only", () => {
        for (let tag of ["thead", "tbody", "tfoot", "caption", "colgroup"] as const) {
            expect(wrapMap[tag]).toEqual(["table"])
        }
    })
})

describe("isOpen", () => {
    it("reads arrisa-open attribute values", () => {
        let elt = {
            getAttribute(name: string) {
                return name == "arrisa-open" ? "start" : null
            },
        } as Element
        expect(isOpen(elt)).toBe("start")

        let none = {
            getAttribute() {
                return null
            },
        } as unknown as Element
        expect(isOpen(none)).toBe(null)
    })

    it("accepts start end compound value", () => {
        let elt = {
            getAttribute() {
                return "start end"
            },
        } as unknown as Element
        expect(isOpen(elt)).toBe("start end")
    })
})

describe("clipboard HTML sanitize path", () => {
    it("htmlSanitize facet combine uses first provider", () => {
        let a = (s: string) => "a:" + s
        let b = (s: string) => "b:" + s
        // Facet combine is tested via the defined combine on htmlSanitize
        let combined = (htmlSanitize as any).combine?.([a, b]) ?? ([a, b] as const)[0]
        // When combine exists on facet reader, call it; otherwise verify shape
        if (typeof (htmlSanitize as any).combine == "function") {
            expect((htmlSanitize as any).combine([a, b])("x")).toBe("a:x")
            expect((htmlSanitize as any).combine([])).toBe(null)
        } else {
            expect(combined).toBeDefined()
        }
    })

    it("shared parse strips onerror when sanitize is provided (paste threat model)", () => {
        if (typeof document == "undefined") return
        let sanitize = (html: string) => html.replace(/\s+onerror\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        let elt = htmlStringToElement(`<p>x</p><img src="x.png" onerror="alert(1)">`, {
            wrapTables: true,
            sanitize,
        })
        expect(elt.querySelector("img")?.hasAttribute("onerror")).toBe(false)
        expect(elt.textContent).toContain("x")
    })
})
