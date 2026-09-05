import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {baseStyles, buildTheme, theme, colorScheme} from "./theme"
import {cursorBlinkRate} from "./draw-cursor"

function makeState(extensions: EditorState.Extension = []) {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
    return EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
}

describe("buildTheme", () => {
    it("prefixes plain selectors with the main class", () => {
        let mod = buildTheme(".main", {
            child: {color: "red"},
        })
        expect(mod.rules).toEqual([".main child {color: red;}"])
    })

    it("expands bare & to the main selector", () => {
        let mod = buildTheme(".main", {
            "&": {display: "flex"},
        })
        expect(mod.rules).toEqual([".main {display: flex;}"])
    })

    it("rewrites named scopes from the scopes map", () => {
        let mod = buildTheme(".main", {
            "&light": {color: "black"},
            "&dark": {color: "white"},
        }, {"&light": ".light", "&dark": ".dark"})
        expect(mod.rules).toContain(".light {color: black;}")
        expect(mod.rules).toContain(".dark {color: white;}")
    })

    it("throws on unknown scoped selectors", () => {
        expect(() =>
            buildTheme(".main", {
                "&foo": {color: "red"},
            }, {}),
        ).toThrow(/Unsupported selector/)
    })
})

describe("baseStyles cursor layer", () => {
    it("gives arrisa-cursor-layer a non-zero box so contain:size can paint", () => {
        let rule = baseStyles.rules.find((r) => /arrisa-cursor-layer \{/.test(r) && /pointer-events:/.test(r))
        expect(rule).toBeTruthy()
        let sized =
            /inset:\s*0/.test(rule!) ||
            (/width:\s*100%/.test(rule!) && /height:\s*100%/.test(rule!)) ||
            (/right:\s*0/.test(rule!) && /bottom:\s*0/.test(rule!))
        expect(sized).toBe(true)
        expect(rule).toMatch(/pointer-events:\s*none/)
        expect(rule).toMatch(/position:\s*absolute/)
    })

    it("does not use contain:size on arrisa-cursor-layer (overflow caret must paint)", () => {
        let rule = baseStyles.rules.find((r) => /arrisa-cursor-layer \{/.test(r) && /pointer-events:/.test(r))
        expect(rule).toBeTruthy()
        expect(rule).not.toMatch(/contain:\s*[^;]*size/)
    })
})

describe("baseStyles placeholder", () => {
    it("gives arrisa-placeholder zero width and pointer-events none", () => {
        let rule = baseStyles.rules.find((r) => /arrisa-placeholder \{/.test(r))
        expect(rule).toBeTruthy()
        expect(rule).toMatch(/width:\s*0/)
        expect(rule).toMatch(/pointer-events:\s*none/)
    })
})

describe("theme facets", () => {
    it("joins theme class names", () => {
        let state = makeState([theme.of("a"), theme.of("b")])
        expect(state.facet(theme)).toBe("a b")
    })

    it("colorScheme uses first value or defaults to light", () => {
        expect(makeState().facet(colorScheme)).toBe("light")
        expect(makeState(colorScheme.of("dark")).facet(colorScheme)).toBe("dark")
        expect(makeState([colorScheme.of("dark"), colorScheme.of("light")]).facet(colorScheme)).toBe("dark")
    })

    it("cursorBlinkRate takes the minimum or defaults to 1200", () => {
        expect(makeState().facet(cursorBlinkRate)).toBe(1200)
        expect(makeState([cursorBlinkRate.of(800), cursorBlinkRate.of(400)]).facet(cursorBlinkRate)).toBe(400)
    })
})
