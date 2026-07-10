import {ValidationError} from "./error"

export type DomElement = Element

/** Shared empty array singleton for allocation-free empty sequences. */
export const none: readonly never[] = []

/**
 * Deep equality for plain JSON/attr-shaped values (primitives, arrays, plain objects).
 * Detects cycles; compares own enumerable string keys only.
 */
export function compareDeep(a: any, b: any): boolean {
    return compareDeepInner(a, b, undefined)
}

function compareDeepInner(a: any, b: any, seen: WeakMap<object, WeakSet<object>> | undefined): boolean {
    if (Object.is(a, b)) return true
    if (!a || !b || typeof a != "object" || typeof b != "object") return false

    let array = Array.isArray(a)
    if (Array.isArray(b) != array) return false

    let map = seen
    if (!map) map = new WeakMap()
    let set = map.get(a)
    if (set?.has(b)) return true
    if (!set) {
        set = new WeakSet()
        map.set(a, set)
    }
    set.add(b)

    if (array) {
        if (a.length != b.length) return false
        for (let i = 0; i < a.length; i++) if (!compareDeepInner(a[i], b[i], map)) return false
    } else {
        let keysA = Object.keys(a)
        let keysB = Object.keys(b)
        if (keysA.length != keysB.length) return false
        for (let i = 0; i < keysA.length; i++) {
            let key = keysA[i]
            if (!Object.prototype.hasOwnProperty.call(b, key) || !compareDeepInner(a[key], b[key], map)) return false
        }
    }

    return true
}

export function eqArray<T extends {eq: (other: T) => boolean}>(a: readonly T[], b: readonly T[]): boolean {
    if (a == b) return true
    if (a == null || b == null || a.length != b.length) return false
    for (let i = 0; i < a.length; i++) {
        let left = a[i]
        let right = b[i]
        if (left == right) continue
        if (left == null || right == null || !left.eq(right)) return false
    }
    return true
}

export function validate<T>(validator: string | ((value: T) => void) | undefined, value: T): T {
    if (typeof validator === "string") {
        let types = validator
            .split("|")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        if (types.length == 0) {
            throw new ValidationError(`Invalid type validator ${JSON.stringify(validator)};`)
        }
        let name = value === null ? "null" : typeof value
        if (types.indexOf(name) < 0) {
            throw new ValidationError(`Expected value of type ${types.join("|")}; got ${name};`)
        }
    } else if (validator) {
        validator(value)
    }
    return value
}
