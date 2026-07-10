import {describe, expect, it} from "vitest"
import {T, charType} from "./char"
import {BidiSpan} from "./span"

describe("charType", () => {
    it("classifies ASCII letters as L", () => {
        expect(charType("a".charCodeAt(0))).toBe(T.L)
        expect(charType("Z".charCodeAt(0))).toBe(T.L)
        expect(charType(" ".charCodeAt(0))).toBe(T.NI)
    })

    it("classifies European digits as EN", () => {
        expect(charType("0".charCodeAt(0))).toBe(T.EN)
        expect(charType("9".charCodeAt(0))).toBe(T.EN)
    })

    it("classifies Hebrew as R", () => {
        expect(charType("א".charCodeAt(0))).toBe(T.R)
        expect(charType("ת".charCodeAt(0))).toBe(T.R)
    })

    it("classifies Arabic letters as AL and Arabic-Indic digits via table", () => {
        // U+0627 ARABIC LETTER ALEF → AL in ArabicTypes
        expect(charType(0x627)).toBe(T.AL)
        // U+0660 ARABIC-INDIC DIGIT ZERO is in the Arabic block table
        expect(charType(0x660)).toBe(T.AN)
    })

    it("treats object replacement character as neutral", () => {
        expect(charType(0xfffc)).toBe(T.NI)
    })

    it("treats general punctuation spaces as NI", () => {
        expect(charType(0x2000)).toBe(T.NI)
        expect(charType(0x200b)).toBe(T.NI)
    })
})

describe("BidiSpan.strongDir", () => {
    it("returns true for L", () => {
        expect(BidiSpan.strongDir("a".charCodeAt(0))).toBe(true)
    })

    it("returns false for R and AL", () => {
        expect(BidiSpan.strongDir("א".charCodeAt(0))).toBe(false)
        expect(BidiSpan.strongDir(0x627)).toBe(false)
    })

    it("returns null for weak and neutral types", () => {
        expect(BidiSpan.strongDir("1".charCodeAt(0))).toBe(null)
        expect(BidiSpan.strongDir(" ".charCodeAt(0))).toBe(null)
        expect(BidiSpan.strongDir(0xfffc)).toBe(null)
    })
})
