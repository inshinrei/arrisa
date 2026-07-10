/**
 * Build inverted history events from transactions and adjacency helpers for
 * join decisions.
 */
import {type ChangeSet} from "@arrisa/doc"
import type {Transaction} from "@arrisa/state"
import {invertedEffects} from "./meta"

export const none: readonly any[] = []

/** User-event prefixes that may merge with a prior event when close in time. */
export const joinableUserEvent = /^(input\.type|delete)($|\.)/

/**
 * Invert a transaction for storage: inverted document changes plus any effects
 * contributed by {@link invertedEffects}. Returns null when there is nothing
 * to undo (empty changes and no effects).
 */
export function eventFromTransaction(tr: Transaction): {
    changes: ChangeSet
    effects: readonly Transaction.Effect<any>[]
} | null {
    let effects: readonly Transaction.Effect<any>[] = none
    for (let invert of tr.startState.facet(invertedEffects)) {
        let result = invert(tr)
        if (result.length) effects = effects.concat(result)
    }
    if (!effects.length && tr.changes.empty) return null
    return {changes: tr.changes.invert(tr.startState.doc), effects}
}

/** True when any changed range of `a` overlaps or touches a range of `b`. */
export function isAdjacent(a: ChangeSet, b: ChangeSet): boolean {
    let ranges: number[] = [],
        adjacent = false
    a.iterChangedRanges((f, t) => ranges.push(f, t))
    b.iterChangedRanges((_f, _t, f, t) => {
        for (let i = 0; i < ranges.length; ) {
            let from = ranges[i++],
                to = ranges[i++]
            if (t >= from && f <= to) adjacent = true
        }
    })
    return adjacent
}

export function conc<T>(a: readonly T[], b: readonly T[]) {
    return !a.length ? b : !b.length ? a : a.concat(b)
}
