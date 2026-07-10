import {describe, expect, it} from "vitest"
import {Schema} from "../schema/schema"
import {Mark} from "../model/mark"
import {Leaf, Plot} from "../model/node"
import {Slice, Token} from "../model/slice"
import {
    applyModifications,
    applyModsToSlice,
    combineMods,
    compareModification,
    compareModifications,
    filterMods,
    invertMods,
    isAdd,
    isRemove,
    modCancels,
    modificationFromJSON,
    modificationToJSON,
    type Modification,
} from "./modification"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold, em])
    return {schema, paragraph, bold, em}
}

describe("isAdd / isRemove", () => {
    let {bold} = basicSchema()

    it("discriminates add vs remove", () => {
        expect(isAdd({add: bold})).toBe(true)
        expect(isRemove({add: bold})).toBe(false)
        expect(isRemove({remove: bold})).toBe(true)
        expect(isAdd({remove: bold})).toBe(false)
    })
})

describe("applyModifications", () => {
    let {bold, em} = basicSchema()

    it("adds and removes marks in order", () => {
        let marks = applyModifications([{add: bold}], Mark.none, Leaf.Text)
        expect(bold.isInSet(marks)).toBeTruthy()
        marks = applyModifications([{add: em}, {remove: bold}], marks, Leaf.Text)
        expect(bold.isInSet(marks)).toBeNull()
        expect(em.isInSet(marks)).toBeTruthy()
    })
})

describe("modification JSON", () => {
    let {schema, bold, em} = basicSchema()

    it("round-trips add and remove", () => {
        let add: Modification = {add: bold}
        let remove: Modification = {remove: em}
        expect(modificationToJSON(add)).toEqual({add: "strong", value: null})
        expect(modificationToJSON(remove)).toEqual({remove: "em", value: null})
        expect(compareModification(modificationFromJSON(schema, modificationToJSON(add)), add)).toBe(true)
        expect(compareModification(modificationFromJSON(schema, modificationToJSON(remove)), remove)).toBe(true)
    })

    it("rejects unknown marks and invalid JSON", () => {
        expect(() => modificationFromJSON(schema, {add: "nope", value: null})).toThrow(/Unknown mark/)
        expect(() => modificationFromJSON(schema, {add: 1 as any, value: null})).toThrow(/Invalid modification/)
    })
})

describe("compare / combine / filter / cancel", () => {
    let {bold, em} = basicSchema()

    it("compareModifications checks length and each entry", () => {
        let a: Modification[] = [{add: bold}]
        expect(compareModifications(a, a)).toBe(true)
        expect(compareModifications(a, [{add: bold}])).toBe(true)
        expect(compareModifications(a, [{add: em}])).toBe(false)
        expect(compareModifications(a, [{add: bold}, {remove: em}])).toBe(false)
    })

    it("combineMods concatenates or picks the non-null side", () => {
        expect(combineMods(null, null)).toBeNull()
        expect(combineMods([{add: bold}], null)).toEqual([{add: bold}])
        expect(combineMods(null, [{remove: em}])).toEqual([{remove: em}])
        expect(combineMods([{add: bold}], [{remove: em}])).toEqual([{add: bold}, {remove: em}])
    })

    it("modCancels treats same-type non-set adds as cancelling", () => {
        expect(modCancels({add: bold}, {add: bold})).toBe(true)
        expect(modCancels({remove: bold}, {add: bold})).toBe(true)
        expect(modCancels({add: bold}, {remove: bold})).toBe(true)
        expect(modCancels({add: em}, {add: bold})).toBe(false)
        expect(modCancels({remove: bold}, {remove: bold})).toBe(false)
    })

    it("filterMods drops mods cancelled by against", () => {
        expect(filterMods(null, [{add: bold}])).toBeNull()
        expect(filterMods([{add: bold}], null)).toEqual([{add: bold}])
        expect(filterMods([{add: bold}, {add: em}], [{add: bold}])).toEqual([{add: em}])
    })
})

describe("invertMods", () => {
    let {bold, em} = basicSchema()

    it("inverts remove to add", () => {
        expect(invertMods([{remove: bold}], Leaf.text("x"))).toEqual([{add: bold}])
    })

    it("inverts add to remove when the mark was not already present", () => {
        expect(invertMods([{add: bold}], Leaf.text("x"))).toEqual([{remove: bold}])
    })

    it("restores the previous value when add replaced an existing mark", () => {
        let tagged = Leaf.text("x", [em])
        // adding bold on a node that already had em: invert of add bold is remove bold
        expect(invertMods([{add: bold}], tagged)).toEqual([{remove: bold}])
        // adding em when em already exists restores the existing instance
        expect(invertMods([{add: em}], tagged)).toEqual([{add: em}])
    })
})

describe("applyModsToSlice", () => {
    let {paragraph, bold} = basicSchema()

    it("returns the same slice when mods are null", () => {
        let slice = Slice.of([Leaf.text("a")])
        expect(applyModsToSlice(slice, null)).toBe(slice)
    })

    it("applies mods to open tags and nodes", () => {
        let slice = Slice.of([paragraph, Leaf.text("hi"), Plot.End])
        let out = applyModsToSlice(slice, [{add: bold}])
        expect((out.content[0] as Plot.Tag).marks.some((m) => m.eq(bold))).toBe(true)
        expect((out.content[1] as Leaf<string>).marks.some((m) => m.eq(bold))).toBe(true)
        expect(out.content[2]).toBe(Token.End)
    })

    it("joins adjacent text nodes after marking", () => {
        let slice = Slice.of([Leaf.text("a"), Leaf.text("b")])
        let out = applyModsToSlice(slice, [{add: bold}])
        expect(out.content.length).toBe(1)
        expect((out.content[0] as Leaf<string>).param).toBe("ab")
        expect((out.content[0] as Leaf<string>).marks.some((m) => m.eq(bold))).toBe(true)
    })
})
