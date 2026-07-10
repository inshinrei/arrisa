import {describe, expect, it, vi, afterEach} from "vitest"
import {htmlStringToElement, toAssignableHTML, wrapMap} from "./html-from-string"

describe("wrapMap", () => {
    it("wraps table cell and row fragments with full ancestors", () => {
        expect(wrapMap.td).toEqual(["table", "tbody", "tr"])
        expect(wrapMap.th).toEqual(["table", "tbody", "tr"])
        expect(wrapMap.tr).toEqual(["table", "tbody"])
        expect(wrapMap.col).toEqual(["table", "colgroup"])
    })
})

describe("toAssignableHTML", () => {
    it("returns plain string by default without creating a Trusted Types policy", () => {
        let createPolicy = vi.fn()
        let prev = (globalThis as any).window
        ;(globalThis as any).window = {trustedTypes: {createPolicy}}
        try {
            expect(toAssignableHTML("<p>hi</p>")).toBe("<p>hi</p>")
            expect(createPolicy).not.toHaveBeenCalled()
        } finally {
            ;(globalThis as any).window = prev
        }
    })

    it("runs sanitize before policy", () => {
        let sanitize = (s: string) => s.replace(/onerror/gi, "x")
        let createHTML = vi.fn((s: string) => `TRUSTED:${s}`)
        let out = toAssignableHTML(`<img onerror=alert(1)>`, {
            sanitize,
            trustedHTMLPolicy: {createHTML},
        })
        expect(createHTML).toHaveBeenCalledWith("<img x=alert(1)>")
        expect(out).toBe("TRUSTED:<img x=alert(1)>")
    })

    it("uses the same policy instance for multiple calls (no createPolicy)", () => {
        let createHTML = vi.fn((s: string) => s)
        let policy = {createHTML}
        toAssignableHTML("a", {trustedHTMLPolicy: policy})
        toAssignableHTML("b", {trustedHTMLPolicy: policy})
        expect(createHTML).toHaveBeenCalledTimes(2)
    })
})

describe("htmlStringToElement", () => {
    afterEach(() => {
        // no global state to reset beyond tests that mock window
    })

    it("strips leading meta tags", () => {
        if (typeof document == "undefined") return
        let elt = htmlStringToElement(`<meta charset="utf-8"><p id="t">ok</p>`, {wrapTables: false})
        expect(elt.querySelector("meta")).toBeNull()
        expect(elt.querySelector("#t")?.textContent).toBe("ok")
    })

    it("wraps bare table cell fragments", () => {
        if (typeof document == "undefined") return
        let elt = htmlStringToElement(`<td>cell</td>`, {wrapTables: true})
        expect(elt.querySelector("td")?.textContent).toBe("cell")
    })

    it("applies sanitize before innerHTML so stripped attributes are absent", () => {
        if (typeof document == "undefined") return
        let sanitize = (html: string) => html.replace(/\s+onerror\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        let elt = htmlStringToElement(`<img src="x" onerror="alert(1)">`, {
            wrapTables: false,
            sanitize,
        })
        let img = elt.querySelector("img")
        expect(img).not.toBeNull()
        expect(img!.hasAttribute("onerror")).toBe(false)
    })
})
