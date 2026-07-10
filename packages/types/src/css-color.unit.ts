import {describe, expect, it} from "vitest"
import {isSafeCssColor, sanitizeCssColor} from "./css-color"

describe("sanitizeCssColor", () => {
    it("accepts hex colors", () => {
        expect(sanitizeCssColor("#fff")).toBe("#fff")
        expect(sanitizeCssColor("#ffffff")).toBe("#ffffff")
        expect(sanitizeCssColor("#ffffffff")).toBe("#ffffffff")
        expect(sanitizeCssColor("#abc")).toBe("#abc")
    })

    it("accepts rgb/hsl and named", () => {
        expect(isSafeCssColor("rgb(1, 2, 3)")).toBe(true)
        expect(isSafeCssColor("rgba(1,2,3,0.5)")).toBe(true)
        expect(isSafeCssColor("hsl(120, 50%, 50%)")).toBe(true)
        expect(isSafeCssColor("red")).toBe(true)
        expect(isSafeCssColor("transparent")).toBe(true)
        expect(isSafeCssColor("currentcolor")).toBe(true)
    })

    it("rejects style injection payloads", () => {
        expect(sanitizeCssColor("red; background-image: url(http://x)")).toBeNull()
        expect(sanitizeCssColor("url(http://evil)")).toBeNull()
        expect(sanitizeCssColor("expression(alert(1))")).toBeNull()
        expect(sanitizeCssColor("red\nblue")).toBeNull()
        expect(sanitizeCssColor("")).toBeNull()
        expect(sanitizeCssColor("not-a-color")).toBeNull()
    })

    it("accepts typical palette samples", () => {
        for (let c of ["#000000", "#ffffff", "#f44336", "#2196f3", "black", "white"]) {
            expect(isSafeCssColor(c), c).toBe(true)
        }
    })
})
