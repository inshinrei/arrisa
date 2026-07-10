import {T, charType} from "./char"
import type {Isolate} from "./span"

/** Reused per-line character type buffer (indices match string offsets). */
export let types: T[] = []

let Brackets: Record<number, number> = Object.create(null)
/* https://www.unicode.org/Public/UCD/latest/ucd/BidiBrackets.txt */
for (let p of ["()", "[]", "{}"]) {
    let l = p.charCodeAt(0),
        r = p.charCodeAt(1)
    Brackets[l] = r
    Brackets[r] = -l
}

let BracketStack: number[] = []

const enum Bracketed {
    OppositeBefore = 1,
    EmbedInside = 2,
    OppositeInside = 4,
    MaxDepth = 3 * 63,
}

/** Ensure `types` has no holes up to `len` (isolates leave gaps that must be NI). */
export function ensureTypesCapacity(len: number) {
    while (len > types.length) types[types.length] = T.NI
}

// W1–W3, W5–W7: fill types and apply weak-type resolution in each level run.
function computeCharTypes(line: string, rFrom: number, rTo: number, isolates: readonly Isolate[], outerType: T) {
    for (let iI = 0; iI <= isolates.length; iI++) {
        let from = iI ? isolates[iI - 1].to : rFrom,
            to = iI < isolates.length ? isolates[iI].from : rTo
        let prevType = iI ? T.NI : outerType

        // W1 NSM ← previous; W2 EN←AN after AL; W3 AL→R
        for (let i = from, prev = prevType, prevStrong = prevType; i < to; i++) {
            let type = charType(line.charCodeAt(i))
            if (type == T.NSM) type = prev
            else if (type == T.EN && prevStrong == T.AL) type = T.AN
            types[i] = type == T.AL ? T.R : type
            if (type & T.Strong) prevStrong = type
            prev = type
        }

        // W5/W6 ET/CS; W7 EN→L after strong L
        for (let i = from, prev = prevType, prevStrong = prevType; i < to; i++) {
            let type = types[i]
            if (type == T.CS) {
                if (i < to - 1 && prev == types[i + 1] && prev & T.Num) type = types[i] = prev
                else types[i] = T.NI
            } else if (type == T.ET) {
                let end = i + 1
                while (end < to && types[end] == T.ET) end++
                let replace =
                    (i && prev == T.EN) || (end < rTo && types[end] == T.EN)
                        ? prevStrong == T.L
                            ? T.L
                            : T.EN
                        : T.NI
                for (let j = i; j < end; j++) types[j] = replace
                i = end - 1
            } else if (type == T.EN && prevStrong == T.L) {
                types[i] = T.L
            }
            prev = type
            if (type & T.Strong) prevStrong = type
        }
    }
}

// N0: paired brackets inherit embedding or opposite direction from context.
function processBracketPairs(line: string, rFrom: number, rTo: number, isolates: readonly Isolate[], outerType: T) {
    let oppositeType = outerType == T.L ? T.R : T.L

    for (let iI = 0, sI = 0, context = 0; iI <= isolates.length; iI++) {
        let from = iI ? isolates[iI - 1].to : rFrom,
            to = iI < isolates.length ? isolates[iI].from : rTo
        for (let i = from, ch, br, type; i < to; i++) {
            if ((br = Brackets[(ch = line.charCodeAt(i))])) {
                if (br < 0) {
                    for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
                        if (BracketStack[sJ + 1] == -br) {
                            let flags = BracketStack[sJ + 2]
                            let type = flags & Bracketed.EmbedInside
                                ? outerType
                                : !(flags & Bracketed.OppositeInside)
                                  ? 0
                                  : flags & Bracketed.OppositeBefore
                                    ? oppositeType
                                    : outerType
                            if (type) types[i] = types[BracketStack[sJ]] = type
                            sI = sJ
                            break
                        }
                    }
                } else if (sI >= Bracketed.MaxDepth) {
                    break
                } else {
                    BracketStack[sI++] = i
                    BracketStack[sI++] = ch
                    BracketStack[sI++] = context
                }
            } else if ((type = types[i]) == T.R || type == T.L) {
                let embed = type == outerType
                context = embed ? 0 : Bracketed.OppositeBefore
                for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
                    let cur = BracketStack[sJ + 2]
                    if (cur & Bracketed.EmbedInside) break
                    if (embed) {
                        BracketStack[sJ + 2] |= Bracketed.EmbedInside
                    } else {
                        if (cur & Bracketed.OppositeInside) break
                        BracketStack[sJ + 2] |= Bracketed.OppositeInside
                    }
                }
            }
        }
    }
}

// N1/N2: neutrals take surrounding strong direction, else embedding direction.
function processNeutrals(rFrom: number, rTo: number, isolates: readonly Isolate[], outerType: T) {
    for (let iI = 0, prev = outerType; iI <= isolates.length; iI++) {
        let from = iI ? isolates[iI - 1].to : rFrom,
            to = iI < isolates.length ? isolates[iI].from : rTo
        for (let i = from; i < to; ) {
            let type = types[i]
            if (type == T.NI) {
                let end = i + 1
                for (;;) {
                    if (end == to) {
                        if (iI == isolates.length) break
                        end = isolates[iI++].to
                        to = iI < isolates.length ? isolates[iI].from : rTo
                    } else if (types[end] == T.NI) {
                        end++
                    } else {
                        break
                    }
                }
                let beforeL = prev == T.L
                let afterL = (end < rTo ? types[end] : outerType) == T.L
                let replace = beforeL == afterL ? (beforeL ? T.L : T.R) : outerType
                for (let j = end, jI = iI, fromJ = jI ? isolates[jI - 1].to : rFrom; j > i; ) {
                    if (j == fromJ) {
                        j = isolates[--jI].from
                        fromJ = jI ? isolates[jI - 1].to : rFrom
                    }
                    types[--j] = replace
                }
                i = end
            } else {
                prev = type
                i++
            }
        }
    }
}

/** Run weak + neutral resolution for a section; results land in `types`. */
export function resolveTypes(
    line: string,
    from: number,
    to: number,
    isolates: readonly Isolate[],
    outerType: T,
) {
    computeCharTypes(line, from, to, isolates, outerType)
    processBracketPairs(line, from, to, isolates, outerType)
    processNeutrals(from, to, isolates, outerType)
}
