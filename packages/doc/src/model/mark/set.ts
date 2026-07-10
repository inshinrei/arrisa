import {none} from "../../util/utils"

/** Remove the element at `index`, reusing the shared empty singleton when possible. */
export function remove<T>(arr: readonly T[], index: number) {
    return arr.length == 1 ? none : arr.filter((_, i) => i != index)
}

/**
 * Sorted-set union using `compare` (0 = equal). Used for multi-value marks
 * whose values are ordered arrays (`Mark.Type.set`).
 */
export function addSet<T>(a: readonly T[], b: readonly T[], compare: (a: T, b: T) => number) {
    let result: T[] = []
    for (let i = 0, j = 0; ;) {
        if (i == a.length) {
            if (j == b.length) return result
            result.push(b[j++])
        } else if (j == b.length) {
            result.push(a[i++])
        } else {
            let cmp = compare(a[i], b[j])
            if (cmp == 0) {
                result.push(a[i++])
                j++
            } else if (cmp < 0) {
                result.push(a[i++])
            } else {
                result.push(b[j++])
            }
        }
    }
}

/** Sorted-set difference: elements of `a` not present in `b`. */
export function subtractSet<T>(a: readonly T[], b: readonly T[], compare: (a: T, b: T) => number) {
    let result: T[] = []
    for (let i = 0, j = 0; ;) {
        if (i == a.length) return result
        if (j == b.length) {
            result.push(a[i++])
        } else {
            let cmp = compare(a[i], b[j])
            if (cmp == 0) {
                i++
                j++
            } else if (cmp < 0) {
                result.push(a[i++])
            } else {
                j++
            }
        }
    }
}
