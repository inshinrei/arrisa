import {describe, expect, it} from "vitest"
import {pushSafeAttrs, setSafeAttributes} from "./safe-dom-attrs"

describe("pushSafeAttrs", () => {
    it("keeps legitimate attrs and drops event handlers", () => {
        let base: string[] = ["class", "arrisa-content"]
        pushSafeAttrs(base, {
            "aria-label": "editor",
            onclick: "alert(1)",
            "data-x": "1",
            onerror: "x",
        })
        expect(base).toEqual(["aria-label", "editor", "class", "arrisa-content", "data-x", "1"])
        expect(base.includes("onclick")).toBe(false)
        expect(base.includes("onerror")).toBe(false)
    })
})

describe("setSafeAttributes", () => {
    it("never setAttribute for unsafe names", () => {
        let set: string[] = []
        let styleCss = ""
        setSafeAttributes(
            {
                setAttribute(name, value) {
                    set.push(name, value)
                },
                style: {
                    get cssText() {
                        return styleCss
                    },
                    set cssText(v) {
                        styleCss = v
                    },
                },
            },
            {
                type: "url",
                onclick: "alert(1)",
                style: "color: red",
                srcdoc: "<script>",
            },
            {styleAsCssText: true},
        )
        expect(set).toEqual(["type", "url"])
        expect(styleCss).toBe("color: red")
        expect(set.join(" ")).not.toMatch(/onclick|srcdoc/i)
    })
})
