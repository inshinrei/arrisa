/**
 * Allocation helpers shared by fields, facets, and providers.
 */
export let nextID = 0

export function allocID() {
    return nextID++
}

/** Shared empty readonly array (avoid allocating new `[]` defaults). */
export const none: readonly any[] = []

export function sameArray<T>(a: readonly T[], b: readonly T[]) {
    return a == b || (a.length == b.length && a.every((e, i) => e === b[i]))
}

/** Push `value` if not already present (identity). */
export function addValue<T>(set: T[], value: T) {
    if (set.indexOf(value) < 0) set.push(value)
}
