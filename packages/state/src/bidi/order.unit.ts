import {describe, expect, it} from "vitest"
import {computeOrder, trivialOrder} from "./order"
import {BidiSpan, type Isolate} from "./span"

function spans(line: string, ltr = true, isolates: readonly Isolate[] = []) {
    return computeOrder(line, ltr, isolates).map(s => [s.from, s.to, s.level] as const)
}

/** True when spans cover `[0, line.length)` without gaps/overlaps (order is visual, not logical). */
function covers(line: string, order: readonly BidiSpan[]) {
    if (!order.length) return line.length == 0
    let sorted = order.slice().sort((a, b) => a.from - b.from || a.to - b.to)
    if (sorted[0].from != 0 || sorted[sorted.length - 1].to != line.length) return false
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].from != sorted[i - 1].to) return false
    }
    return true
}

describe("trivialOrder", () => {
    it("returns a single level-0 span", () => {
        expect(trivialOrder(5)).toEqual([new BidiSpan(0, 5, 0)])
        expect(trivialOrder(0)).toEqual([new BidiSpan(0, 0, 0)])
    })
})

describe("computeOrder", () => {
    it("handles empty lines", () => {
        expect(spans("", true)).toEqual([[0, 0, 0]])
        expect(spans("", false)).toEqual([[0, 0, 1]])
    })

    it("uses the trivial LTR path for pure ASCII", () => {
        let line = "hello world"
        expect(spans(line)).toEqual([[0, line.length, 0]])
        expect(computeOrder(line, true, [])).toEqual(trivialOrder(line.length))
    })

    it("embeds a pure Hebrew run in LTR base as level 1", () => {
        let line = "שלום"
        expect(spans(line)).toEqual([[0, line.length, 1]])
    })

    it("splits mixed LTR + Hebrew + LTR", () => {
        // "ab" + "אב" + "cd"
        let line = "abאבcd"
        expect(spans(line)).toEqual([
            [0, 2, 0],
            [2, 4, 1],
            [4, 6, 0],
        ])
    })

    it("keeps European numbers as L after strong L (W7)", () => {
        let line = "hello 123"
        // whole line is L after W7 — single span
        expect(spans(line)).toEqual([[0, line.length, 0]])
    })

    it("treats European digits after Arabic as AN (higher level inside RTL)", () => {
        // Arabic + EN digits → W2 turns EN into AN; visual order emits AN then RTL run
        let line = "اب12"
        expect(covers(line, computeOrder(line, true, []))).toBe(true)
        // visual: [digits level 2, Arabic level 1]
        expect(spans(line)).toEqual([
            [2, 4, 2],
            [0, 2, 1],
        ])
    })

    it("covers pure LTR text under RTL base with embedding", () => {
        let line = "hello"
        let order = computeOrder(line, false, [])
        expect(covers(line, order)).toBe(true)
        // L chars under RTL base → level 2
        expect(spans(line, false)).toEqual([[0, line.length, 2]])
    })

    it("covers mixed text under RTL base without gaps", () => {
        let line = "abאבcd"
        let order = computeOrder(line, false, [])
        expect(covers(line, order)).toBe(true)
        expect(order.every(s => s.from < s.to || line.length == 0)).toBe(true)
    })

    it("resolves simple brackets without breaking coverage", () => {
        let line = "a(b)c"
        expect(covers(line, computeOrder(line, true, []))).toBe(true)
        expect(covers(line, computeOrder(line, false, []))).toBe(true)

        let rtl = "א(ב)ג"
        expect(covers(rtl, computeOrder(rtl, true, []))).toBe(true)
        expect(covers(rtl, computeOrder(rtl, false, []))).toBe(true)
    })

    it("re-resolves isolates separately from surrounding text", () => {
        // "ab" + isolate("אב") + "cd"  — isolate marks Hebrew as its own section
        let line = "abאבcd"
        let isolates: Isolate[] = [{from: 2, to: 4, ltr: false, inner: []}]
        let order = computeOrder(line, true, isolates)
        expect(covers(line, order)).toBe(true)
        // Surrounding LTR stays level 0; isolate interior is RTL
        expect(order.some(s => s.from == 0 && s.to == 2 && s.level == 0)).toBe(true)
        expect(order.some(s => s.from == 2 && s.to == 4 && s.level % 2 == 1)).toBe(true)
        expect(order.some(s => s.from == 4 && s.to == 6 && s.level == 0)).toBe(true)
    })

    it("handles nested isolates", () => {
        // a + outer RTL isolate containing inner LTR "hello" + z
        let line = "aבבhelloבבz"
        let isolates: Isolate[] = [
            {
                from: 1,
                to: 10,
                ltr: false,
                inner: [{from: 3, to: 8, ltr: true, inner: []}],
            },
        ]
        let order = computeOrder(line, true, isolates)
        expect(covers(line, order)).toBe(true)
        expect(spans(line, true, isolates)).toEqual([
            [0, 1, 0],
            [8, 10, 1],
            [3, 8, 2],
            [1, 3, 1],
            [10, 11, 0],
        ])
    })

    it("always produces abutting spans covering the full line", () => {
        let cases: [string, boolean, Isolate[]][] = [
            ["", true, []],
            ["ascii only", true, []],
            ["שלום עולם", true, []],
            ["hello שלום world", true, []],
            ["اب12", true, []],
            ["(test)", false, []],
            ["x", true, [{from: 0, to: 1, ltr: true, inner: []}]],
        ]
        for (let [line, ltr, isolates] of cases) {
            let order = computeOrder(line, ltr, isolates)
            expect(covers(line, order), `coverage for ${JSON.stringify(line)} ltr=${ltr}`).toBe(true)
        }
    })
})
