import {none as empty} from "../util/utils"

/**
 * Flat, sorted DOM attribute bag: `[name, value, name, value, …]`.
 * Keys are unique and ordered lexicographically so merge/eq walk in linear time.
 */
export type Attributes = readonly string[]

export namespace Attributes {
    /** Shared empty attribute list (identity-equal with `util/none`). */
    export const none: Attributes = empty

    /** True when both bags have the same keys and values in the same order. */
    export function eq(a: Attributes, b: Attributes): boolean {
        if (a == b) return true
        if (a.length != b.length) return false
        for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false
        return true
    }

    /**
     * Similarity score for two bags (0 = identical; lower = more different).
     * Each mismatched value or key present on only one side decrements the score by 1.
     */
    export function compare(a: Attributes, b: Attributes): number {
        for (let iA = 0, iB = 0, score = 0; ;) {
            if (iA < a.length && iB < b.length && a[iA] == b[iB]) {
                if (a[iA + 1] != b[iB + 1]) score--
                iA += 2
                iB += 2
            } else if (iA < a.length && (iB == b.length || a[iA] < b[iB])) {
                score--
                iA += 2
            } else if (iB < b.length) {
                score--
                iB += 2
            } else {
                return score
            }
        }
    }

    /**
     * Union of two sorted bags. On key collision, `b` wins except:
     * - `class` values are space-joined (`a` then `b`)
     * - `style` values are semicolon-joined (`a` then `b`)
     * Returns `a` or `b` by reference when the other side is empty.
     */
    export function merge(a: Attributes, b: Attributes): Attributes {
        if (!a.length) return b
        if (!b.length) return a
        let result: string[] = []
        for (let iA = 0, iB = 0; ;) {
            let kA = iA < a.length ? a[iA] : null,
                kB = iB < b.length ? b[iB] : null
            if (kA == kB) {
                if (kA == null) return result
                let value = b[iB + 1]
                if (kA == "class") value = a[iA + 1] + " " + value
                else if (kA == "style") value = a[iA + 1] + ";" + value
                result.push(kA, value)
                iA += 2
                iB += 2
            } else if (kA != null && (kB == null || kA < kB)) {
                result.push(kA, a[iA + 1])
                iA += 2
            } else {
                result.push(kB!, b[iB + 1])
                iB += 2
            }
        }
    }

    /**
     * Insert or update a pair in a mutable sorted bag (in place).
     * Existing `class` / `style` values are appended (space / semicolon); other keys are replaced.
     */
    export function push(a: string[], name: string, value: string): void {
        let i = 0
        while (i < a.length && a[i] < name) i += 2
        if (i < a.length && a[i] == name) {
            if (name == "class") a[i + 1] += " " + value
            else if (name == "style") a[i + 1] += ";" + value
            else a[i + 1] = value
        } else {
            a.splice(i, 0, name, value)
        }
    }

    /**
     * Build a sorted bag from a plain object.
     * Skips `_` (reserved) and `null` values. Keys matching `style/<prop>` are folded into
     * a single `style` attribute as `"prop: value"` (joined with `;` when multiple).
     * Returns {@link Attributes.none} when nothing remains.
     */
    export function read(obj: Record<string, string | null>): Attributes {
        let result: string[] = []
        for (let prop in obj)
            if (prop != "_") {
                let value = obj[prop]
                if (value != null) {
                    if (/^style\//.test(prop)) {
                        value = prop.slice(6) + ": " + value
                        prop = "style"
                    }
                    Attributes.push(result, prop, value)
                }
            }
        return result.length ? result : Attributes.none
    }

    /** Value for `name`, or `null` if the key is absent. */
    export function get(attrs: Attributes, name: string): string | null {
        for (let i = 0; i < attrs.length; i += 2) if (attrs[i] == name) return attrs[i + 1]
        return null
    }
}
