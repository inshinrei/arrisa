import {T, charType} from "./char"

/** Contiguous range of text with a single embedding level. */
export class BidiSpan {
    constructor(
        readonly from: number,
        readonly to: number,
        readonly level: number,
    ) {}

    get ltr(): boolean {
        return this.level % 2 == 0
    }

    /**
     * Find the span covering `index` in `order`.
     * When several spans match, `assoc < 0` prefers the left side, `assoc > 0`
     * the right side, and `assoc == 0` the lowest level.
     */
    static find(order: readonly BidiSpan[], index: number, assoc: number) {
        let maybe = -1
        for (let i = 0; i < order.length; i++) {
            let span = order[i]
            if (
                span.from <= index &&
                span.to >= index &&
                (maybe < 0 ||
                    (assoc != 0
                        ? assoc < 0
                            ? span.from < index
                            : span.to > index
                        : order[maybe].level > span.level))
            )
                maybe = i
        }
        if (maybe < 0) throw new RangeError("Index out of range")
        return maybe
    }

    /** Strong direction of a code unit: true = L, false = R/AL, null = weak/neutral. */
    static strongDir(ch: number) {
        let type = charType(ch)
        if (type == T.L) return true
        if (type == T.R || type == T.AL) return false
        return null
    }

    side(end: boolean, ltr: boolean) {
        return (this.ltr == ltr) == end ? this.to : this.from
    }

    forward(forward: boolean, ltr: boolean) {
        return forward == (this.ltr == ltr)
    }
}

/** Sorted, non-empty isolate ranges; nested isolates stay inside their parent. */
export type Isolate = {
    from: number
    to: number
    ltr: boolean
    inner: readonly Isolate[]
}

export function isolatesEq(a: readonly Isolate[], b: readonly Isolate[]) {
    if (a.length != b.length) return false
    for (let i = 0; i < a.length; i++) {
        let iA = a[i],
            iB = b[i]
        if (iA.from != iB.from || iA.to != iB.to || iA.ltr != iB.ltr || !isolatesEq(iA.inner, iB.inner))
            return false
    }
    return true
}
