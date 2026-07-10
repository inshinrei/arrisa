import {describe, expect, it} from "vitest"
import {isSafeAttributeName} from "./safe-attr"

describe("isSafeAttributeName", () => {
    it("allows common legitimate attributes", () => {
        for (let name of [
            "class",
            "id",
            "href",
            "src",
            "style",
            "type",
            "name",
            "value",
            "aria-label",
            "aria-selected",
            "data-value",
            "data-x",
            "viewBox",
            "xmlns",
            "role",
            "tabindex",
        ]) {
            expect(isSafeAttributeName(name), name).toBe(true)
        }
    })

    it("rejects event handler names", () => {
        for (let name of ["onclick", "onerror", "ONCLICK", "onLoad", "onmouseover"]) {
            expect(isSafeAttributeName(name), name).toBe(false)
        }
    })

    it("rejects known dangerous attribute names", () => {
        for (let name of ["srcdoc", "SRCDOC", "formaction", "FormAction", "xlink:href", "XLINK:HREF"]) {
            expect(isSafeAttributeName(name), name).toBe(false)
        }
    })

    it("rejects empty, overlong, and invalid syntax", () => {
        expect(isSafeAttributeName("")).toBe(false)
        expect(isSafeAttributeName("a".repeat(129))).toBe(false)
        expect(isSafeAttributeName("has space")).toBe(false)
        expect(isSafeAttributeName(`"><script`)).toBe(false)
        expect(isSafeAttributeName("0bad")).toBe(false)
        expect(isSafeAttributeName("foo/bar")).toBe(false)
    })

    it("allows names at the length limit", () => {
        expect(isSafeAttributeName("a".repeat(128))).toBe(true)
    })
})
