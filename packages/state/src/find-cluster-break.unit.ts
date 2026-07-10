import {describe, expect, it} from "vitest"
import {findClusterBreak, isExtendingChar} from "./find-cluster-break"

/** Collect forward cluster breaks; `spec` marks expected breaks with `|`. */
function expectedBreaks(spec: string): {text: string; breaks: number[]} {
    let breaks: number[] = []
    let text = spec
    let next: number
    while ((next = text.indexOf("|")) > -1) {
        breaks.push(next)
        text = text.slice(0, next) + text.slice(next + 1)
    }
    return {text, breaks}
}

function collectForward(text: string): number[] {
    let found: number[] = []
    for (let i = 0; ;) {
        let next = findClusterBreak(text, i)
        if (next == text.length) break
        found.push((i = next))
    }
    return found
}

describe("findClusterBreak", () => {
    function testPipe(spec: string) {
        it(spec, () => {
            let {text, breaks} = expectedBreaks(spec)
            expect(collectForward(text)).toEqual(breaks)
        })
    }

    testPipe("a|b|c|d")
    testPipe("a|é̠|ő|x")
    testPipe("😎|🙉")
    testPipe("👨‍🎤|💪🏽|👩‍👩‍👧‍👦|❤")
    testPipe("🇩🇪|🇫🇷|🇪🇸|x|🇮🇹")

    it("returns pos for empty string and at end", () => {
        expect(findClusterBreak("", 0)).toBe(0)
        expect(findClusterBreak("ab", 2)).toBe(2)
    })

    it("moves backward over a base + combining mark", () => {
        let s = "e\u0301"
        expect(findClusterBreak(s, s.length, false)).toBe(0)
        expect(findClusterBreak(s, 1, false)).toBe(0)
    })

    it("stops after the base when includeExtending is false", () => {
        let s = "e\u0301"
        expect(findClusterBreak(s, 0, true, false)).toBe(1)
        expect(findClusterBreak(s, 0, true, true)).toBe(2)
    })

    it("realigns when pos is mid-surrogate", () => {
        let s = "😎x" // 😎 is two UTF-16 units
        expect(findClusterBreak(s, 0)).toBe(2)
        expect(findClusterBreak(s, 1)).toBe(2)
        expect(findClusterBreak(s, 2)).toBe(3)
    })

    it("joins across ZWJ", () => {
        expect(findClusterBreak("a\u200db", 0)).toBe(3)
        expect(findClusterBreak("a\u200db", 3, false)).toBe(0)
    })

    it("pairs regional indicators as flag clusters", () => {
        // Single RI (odd): one cluster of 2 code units
        let one = "\u{1F1E9}" // 🇩
        expect(findClusterBreak(one, 0)).toBe(2)
        // Two RIs form a flag (🇩🇪)
        let flag = "🇩🇪"
        expect(findClusterBreak(flag, 0)).toBe(4)
        // Three RIs: first pair is a flag, leftover RI is its own cluster
        let three = "🇩🇪\u{1F1EB}" // 🇩🇪 + 🇫
        expect(collectForward(three)).toEqual([4])
        expect(findClusterBreak(three, 4)).toBe(6)
    })

    it("steps ASCII one code unit at a time forward and back", () => {
        expect(findClusterBreak("abc", 0)).toBe(1)
        expect(findClusterBreak("abc", 1)).toBe(2)
        expect(findClusterBreak("abc", 3, false)).toBe(2)
        expect(findClusterBreak("abc", 2, false)).toBe(1)
        expect(findClusterBreak("abc", 1, false)).toBe(0)
        expect(findClusterBreak("abc", 0, false)).toBe(0)
    })
})

describe("isExtendingChar", () => {
    it("is true for combining marks", () => {
        expect(isExtendingChar(0x300)).toBe(true) // COMBINING GRAVE ACCENT
        expect(isExtendingChar(0x301)).toBe(true) // COMBINING ACUTE ACCENT
        expect(isExtendingChar(0x20e3)).toBe(true) // COMBINING ENCLOSING KEYCAP
    })

    it("is false for base letters, ZWJ, and low code points", () => {
        expect(isExtendingChar(0x61)).toBe(false) // a
        expect(isExtendingChar(0x200d)).toBe(false) // ZWJ (not in Extend table)
        expect(isExtendingChar(0)).toBe(false)
        expect(isExtendingChar(767)).toBe(false) // just below first Extend range
    })
})
