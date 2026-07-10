import {T, BidiRE} from "./char"
import {BidiSpan, type Isolate} from "./span"
import {types, ensureTypesCapacity, resolveTypes} from "./resolve"

// Emit contiguous same-level spans; recurse into isolates and opposite-dir runs.
function emitSpans(
    line: string,
    from: number,
    to: number,
    level: number,
    baseLevel: number,
    isolates: readonly Isolate[],
    order: BidiSpan[],
) {
    let ourType = level % 2 ? T.R : T.L

    if (level % 2 == baseLevel % 2) {
        // Same dir as base — walk forward
        for (let iCh = from, iI = 0; iCh < to; ) {
            let sameDir = true,
                isNum = false
            if (iI == isolates.length || iCh < isolates[iI].from) {
                let next = types[iCh]
                if (next != ourType) {
                    sameDir = false
                    isNum = next == T.AN
                }
            }
            let recurse: Isolate[] | null = !sameDir && ourType == T.L ? [] : null
            let localLevel = sameDir ? level : level + 1
            let iScan = iCh
            run: for (;;) {
                if (iI < isolates.length && iScan == isolates[iI].from) {
                    if (isNum) break
                    let iso = isolates[iI]
                    if (!sameDir)
                        for (let upto = iso.to, jI = iI + 1; ; ) {
                            if (upto == to) break run
                            if (jI < isolates.length && isolates[jI].from == upto) upto = isolates[jI++].to
                            else if (types[upto] == ourType) break run
                            else break
                        }
                    iI++
                    if (recurse) {
                        recurse.push(iso)
                    } else {
                        if (iso.from > iCh) order.push(new BidiSpan(iCh, iso.from, localLevel))
                        let dirSwap = iso.ltr != !(localLevel % 2)
                        computeSectionOrder(
                            line,
                            dirSwap ? level + 1 : level,
                            baseLevel,
                            iso.inner,
                            iso.from,
                            iso.to,
                            order,
                        )
                        iCh = iso.to
                    }
                    iScan = iso.to
                } else if (iScan == to || (sameDir ? types[iScan] != ourType : types[iScan] == ourType)) {
                    break
                } else {
                    iScan++
                }
            }
            if (recurse) emitSpans(line, iCh, iScan, level + 1, baseLevel, recurse, order)
            else if (iCh < iScan) order.push(new BidiSpan(iCh, iScan, localLevel))
            iCh = iScan
        }
    } else {
        // Opposite dir — walk backward to flip visual span order
        for (let iCh = to, iI = isolates.length; iCh > from; ) {
            let sameDir = true,
                isNum = false
            if (!iI || iCh > isolates[iI - 1].to) {
                let next = types[iCh - 1]
                if (next != ourType) {
                    sameDir = false
                    isNum = next == T.AN
                }
            }
            let recurse: Isolate[] | null = !sameDir && ourType == T.L ? [] : null
            let localLevel = sameDir ? level : level + 1
            let iScan = iCh
            run: for (;;) {
                if (iI && iScan == isolates[iI - 1].to) {
                    if (isNum) break
                    let iso = isolates[--iI]
                    if (!sameDir)
                        for (let upto = iso.from, jI = iI; ; ) {
                            if (upto == from) break run
                            if (jI && isolates[jI - 1].to == upto) upto = isolates[--jI].from
                            else if (types[upto - 1] == ourType) break run
                            else break
                        }
                    if (recurse) {
                        recurse.push(iso)
                    } else {
                        if (iso.to < iCh) order.push(new BidiSpan(iso.to, iCh, localLevel))
                        let dirSwap = iso.ltr != !(localLevel % 2)
                        computeSectionOrder(
                            line,
                            dirSwap ? level + 1 : level,
                            baseLevel,
                            iso.inner,
                            iso.from,
                            iso.to,
                            order,
                        )
                        iCh = iso.from
                    }
                    iScan = iso.from
                } else if (
                    iScan == from ||
                    (sameDir ? types[iScan - 1] != ourType : types[iScan - 1] == ourType)
                ) {
                    break
                } else {
                    iScan--
                }
            }
            if (recurse) emitSpans(line, iScan, iCh, level + 1, baseLevel, recurse, order)
            else if (iScan < iCh) order.push(new BidiSpan(iScan, iCh, localLevel))
            iCh = iScan
        }
    }
}

function computeSectionOrder(
    line: string,
    level: number,
    baseLevel: number,
    isolates: readonly Isolate[],
    from: number,
    to: number,
    order: BidiSpan[],
) {
    let outerType = (level % 2 ? T.R : T.L) as T
    resolveTypes(line, from, to, isolates, outerType)
    emitSpans(line, from, to, level, baseLevel, isolates, order)
}

/** Single LTR span covering `[0, length)` — fast path for pure LTR text. */
export function trivialOrder(length: number) {
    return [new BidiSpan(0, length, 0)]
}

/**
 * Compute visual order spans for a line under base direction `ltr`.
 * `isolates` must be sorted by position; nested isolates stay inside parents.
 */
export function computeOrder(line: string, ltr: boolean, isolates: readonly Isolate[]) {
    if (!line) return [new BidiSpan(0, 0, ltr ? 0 : 1)]
    if (ltr && !isolates.length && !BidiRE.test(line)) return trivialOrder(line.length)

    if (isolates.length) ensureTypesCapacity(line.length)
    let order: BidiSpan[] = [],
        level = ltr ? 0 : 1
    computeSectionOrder(line, level, level, isolates, 0, line.length, order)
    return order
}
