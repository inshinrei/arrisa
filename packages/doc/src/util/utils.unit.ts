import {describe, expect, it} from "vitest"
import {compareDeep, eqArray, none, validate} from "./utils"
import {ValidationError} from "./error"

describe("none", () => {
    it("is an empty shared singleton", () => {
        expect(none.length).toBe(0)
        expect(none).toBe(none)
        expect(Array.isArray(none)).toBe(true)
    })
})

describe("compareDeep", () => {
    it("matches identical and equal primitives", () => {
        expect(compareDeep(1, 1)).toBe(true)
        expect(compareDeep("a", "a")).toBe(true)
        expect(compareDeep(true, true)).toBe(true)
        expect(compareDeep(undefined, undefined)).toBe(true)
        expect(compareDeep(null, null)).toBe(true)
    })

    it("rejects unequal primitives", () => {
        expect(compareDeep(1, 2)).toBe(false)
        expect(compareDeep("a", "b")).toBe(false)
        expect(compareDeep(true, false)).toBe(false)
        expect(compareDeep(null, undefined)).toBe(false)
        expect(compareDeep(0, false)).toBe(false)
        expect(compareDeep("", false)).toBe(false)
    })

    it("uses Object.is for NaN and signed zero", () => {
        expect(compareDeep(NaN, NaN)).toBe(true)
        expect(compareDeep(0, -0)).toBe(false)
        expect(compareDeep(-0, -0)).toBe(true)
    })

    it("compares arrays deeply", () => {
        expect(compareDeep([], [])).toBe(true)
        expect(compareDeep([1, 2], [1, 2])).toBe(true)
        expect(compareDeep([1, [2, 3]], [1, [2, 3]])).toBe(true)
        expect(compareDeep([1, 2], [1, 2, 3])).toBe(false)
        expect(compareDeep([1, 2], [1, 3])).toBe(false)
        expect(compareDeep([1], {0: 1, length: 1})).toBe(false)
    })

    it("compares plain objects deeply", () => {
        expect(compareDeep({}, {})).toBe(true)
        expect(compareDeep({a: 1, b: 2}, {a: 1, b: 2})).toBe(true)
        expect(compareDeep({a: {b: 1}}, {a: {b: 1}})).toBe(true)
        expect(compareDeep({a: 1}, {a: 2})).toBe(false)
        expect(compareDeep({a: 1}, {a: 1, b: 2})).toBe(false)
        expect(compareDeep({a: 1, b: 2}, {a: 1})).toBe(false)
        expect(compareDeep({a: 1}, {b: 1})).toBe(false)
    })

    it("ignores inherited enumerable properties", () => {
        let proto = {inherited: 1}
        let a = Object.create(proto)
        a.own = 2
        let b = {own: 2}
        expect(compareDeep(a, b)).toBe(true)
        expect(compareDeep(b, a)).toBe(true)
    })

    it("handles cyclic structures without overflowing", () => {
        let a: any = {x: 1}
        a.self = a
        let b: any = {x: 1}
        b.self = b
        expect(compareDeep(a, b)).toBe(true)

        let c: any = {x: 1}
        c.self = c
        let d: any = {x: 2}
        d.self = d
        expect(compareDeep(c, d)).toBe(false)

        let left: any = {n: 1}
        let right: any = {n: 1}
        left.ref = right
        right.ref = left
        let left2: any = {n: 1}
        let right2: any = {n: 1}
        left2.ref = right2
        right2.ref = left2
        expect(compareDeep(left, left2)).toBe(true)
    })

    it("rejects nullish mixed with objects", () => {
        expect(compareDeep(null, {})).toBe(false)
        expect(compareDeep({}, null)).toBe(false)
        expect(compareDeep(undefined, {})).toBe(false)
    })
})

describe("eqArray", () => {
    function item(id: number) {
        return {
            id,
            eq(other: {id: number}) {
                return this.id === other.id
            },
        }
    }

    it("returns true for the same reference", () => {
        let arr = [item(1)]
        expect(eqArray(arr, arr)).toBe(true)
    })

    it("compares elements with .eq", () => {
        expect(eqArray([item(1), item(2)], [item(1), item(2)])).toBe(true)
        expect(eqArray([item(1)], [item(2)])).toBe(false)
        expect(eqArray([item(1)], [item(1), item(2)])).toBe(false)
        expect(eqArray([], [])).toBe(true)
    })

    it("returns false for nullish arrays", () => {
        expect(eqArray(null as any, [])).toBe(false)
        expect(eqArray([], null as any)).toBe(false)
        expect(eqArray(undefined as any, [item(1)])).toBe(false)
    })

    it("handles nullish elements", () => {
        expect(eqArray([null as any], [null as any])).toBe(true)
        expect(eqArray([null as any], [item(1)])).toBe(false)
        expect(eqArray([item(1)], [null as any])).toBe(false)
    })
})

describe("validate", () => {
    it("returns the value when no validator is provided", () => {
        expect(validate(undefined, 42)).toBe(42)
        expect(validate(undefined, "x")).toBe("x")
    })

    it("accepts matching string type validators", () => {
        expect(validate("number", 1)).toBe(1)
        expect(validate("string", "hi")).toBe("hi")
        expect(validate("number|string", 1)).toBe(1)
        expect(validate("number|string", "hi")).toBe("hi")
        expect(validate("number | null", null)).toBe(null)
        expect(validate(" boolean | undefined ", undefined)).toBe(undefined)
    })

    it("throws ValidationError on type mismatch", () => {
        expect(() => validate("number", "nope")).toThrow(ValidationError)
        expect(() => validate("number", "nope")).toThrow(/Expected value of type number; got string/)
        expect(() => validate("string|boolean", 1)).toThrow(ValidationError)
    })

    it("throws ValidationError for empty type validators", () => {
        expect(() => validate("", 1)).toThrow(ValidationError)
        expect(() => validate("|", 1)).toThrow(ValidationError)
        expect(() => validate(" | ", 1)).toThrow(ValidationError)
    })

    it("runs function validators", () => {
        expect(
            validate((v: number) => {
                if (v < 0) throw new ValidationError("negative")
            }, 1),
        ).toBe(1)

        expect(() =>
            validate((v: number) => {
                if (v < 0) throw new ValidationError("negative")
            }, -1),
        ).toThrow(ValidationError)
    })
})
