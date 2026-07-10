/**
 * Textblock maps: project a textblock plot onto a flat string for bidi and
 * cursor motion.
 *
 * Document positions (open/close tokens, multi-unit atoms, nested bounds) do
 * not line up 1:1 with grapheme indices. {@link TextblockMap} builds:
 * - **`text`** — content string used by the bidi algorithm (`\ufffc` for atoms;
 *   spaces for `cursorInsideBounds` wrappers)
 * - **`sections`** — packed runs mapping doc offsets ↔ string indices
 *
 * Section encoding (per `number` in `sections`):
 * ```
 *   (length << Section.Shift) | flag
 *   flag: Text=0 | Atom=1 | BoundBefore=2 | BoundAfter=3
 * ```
 * Cached per plot node via a WeakMap; reused when only `start` changes.
 */
import {Leaf, type Plot} from "@arrisa/doc"
import {findClusterBreak} from "./find-cluster-break"
import {BidiSpan, computeOrder} from "./bidi"

let cache: WeakMap<Plot, TextblockMap> = new WeakMap()

/** Packed section kinds and bit layout for `sections` entries. */
const enum Section {
    Text = 0,
    Atom = 1,
    BoundBefore = 2,
    BoundAfter = 3,
    /** Low bits hold the flag; mask with this. */
    Flag = 3,
    /** Length lives in the high bits after this shift. */
    Shift = 2,
}

/**
 * Bidirectional/cursor projection of one textblock plot.
 * Positions are absolute document positions; indices are into {@link text}.
 */
export class TextblockMap {
    private constructor(
        readonly start: number,
        readonly node: Plot,
        readonly ltr: boolean,
        readonly text: string,
        private _order: readonly BidiSpan[] | null,
        private sections: number[],
    ) {}

    /** Bidi spans for {@link text}; computed lazily. */
    get order() {
        return this._order || (this._order = computeOrder(this.text, this.ltr, []))
    }

    /**
     * Get or build a map for `node`. Reuses cached `text`/`sections`/`order`
     * when only the absolute `start` offset changed.
     */
    static get(start: number, node: Plot, ltr: boolean) {
        let cached = cache.get(node)
        if (cached && cached.start == start && cached.ltr == ltr) return cached
        let result =
            cached && cached.ltr == ltr
                ? new TextblockMap(start, node, ltr, cached.text, cached._order, cached.sections)
                : TextblockMap.create(start, node, ltr)
        cache.set(node, result)
        return result
    }

    private static create(start: number, node: Plot, ltr: boolean) {
        let text = "",
            sections: number[] = [],
            sectionPos = 0
        let flush = (upto: number) => {
            if (upto > sectionPos) sections.push((upto - sectionPos) << Section.Shift)
        }
        let scan = (node: Plot, pos: number) => {
            for (let ch of node.content) {
                if (ch.is(Leaf.Text)) {
                    text += ch.param
                } else if (ch.isLeaf || !ch.inlineContent) {
                    // Object-replacement character: one string unit for the atom.
                    text += "\ufffc"
                    if (ch.length > 1) {
                        flush(pos)
                        sections.push((ch.length << Section.Shift) | Section.Atom)
                        sectionPos = pos + ch.length
                    }
                } else if (ch.type.spec.cursorInsideBounds) {
                    // Treat open/close as spaces so the cursor can sit inside.
                    text += " "
                    scan(ch, pos + 1)
                    text += " "
                } else {
                    // Structural bounds: no string width; map doc open/close only.
                    flush(pos)
                    sections.push((1 << Section.Shift) | Section.BoundAfter)
                    scan(ch, (sectionPos = pos + 1))
                    flush(pos + ch.length - 1)
                    sections.push((1 << Section.Shift) | Section.BoundBefore)
                    sectionPos = pos + ch.length
                }
                pos += ch.length
            }
        }
        scan(node, 0)
        flush(node.contentLength)
        return new TextblockMap(start, node, ltr, text, null, sections)
    }

    /** Document position → index into {@link text} (for content positions). */
    toIndex(pos: number) {
        if (pos < this.start) return 0
        let off = pos - this.start,
            idx = 0
        for (let n of this.sections) {
            let len = n >> Section.Shift,
                flag = n & Section.Flag
            if (flag == Section.Text) {
                if (off <= len) return idx + off
                off -= len
                idx += len
            } else if (flag == Section.Atom) {
                off -= len
                if (off < 0) return idx
                idx++
            } else {
                // BoundBefore / BoundAfter: consume one doc unit, no string advance.
                off--
            }
        }
        return idx
    }

    /** Index into {@link text} → absolute document position. */
    fromIndex(index: number) {
        let off = this.start
        for (let n of this.sections) {
            let len = n >> Section.Shift,
                flag = n & Section.Flag
            if (flag == Section.Text) {
                if (len > index) return off + index
                index -= len
            } else if (flag == Section.Atom) {
                if (!index) return off
                index--
            } else {
                if (!index) return off + (flag == Section.BoundBefore ? 1 : 0)
            }
            off += len
        }
        return off
    }

    /**
     * Move one grapheme cluster in visual order from `start`/`side`.
     * When `skipped` is provided, `skipped[0]` receives the crossed substring.
     */
    moveVisually(
        start: number,
        side: number,
        forward: boolean,
        skipped?: string[],
    ): {pos: number; side: -1 | 1} | null {
        let startIndex = this.toIndex(start),
            {order, ltr} = this
        let spanI = BidiSpan.find(order, startIndex, side)
        let span = order[spanI],
            spanEnd = span.side(forward, ltr)
        if (startIndex == spanEnd) {
            let nextI = (spanI += forward ? 1 : -1)
            if (nextI < 0 || nextI >= order.length) return null
            span = order[(spanI = nextI)]
            startIndex = span.side(!forward, ltr)
            spanEnd = span.side(forward, ltr)
        }
        let nextIndex = findClusterBreak(this.text, startIndex, span.forward(forward, ltr))
        if (nextIndex == startIndex) return null
        if (nextIndex < span.from || nextIndex > span.to) nextIndex = spanEnd
        if (skipped) skipped[0] = this.text.slice(Math.min(startIndex, nextIndex), Math.max(startIndex, nextIndex))

        let nextSpan = spanI == (forward ? order.length - 1 : 0) ? null : order[spanI + (forward ? 1 : -1)]
        if (nextSpan && nextIndex == spanEnd && nextSpan.level + (forward ? 0 : 1) < span.level)
            return {pos: this.fromIndex(nextSpan.side(!forward, ltr)), side: nextSpan.forward(forward, ltr) ? 1 : -1}
        return {pos: this.fromIndex(nextIndex), side: span.forward(forward, ltr) ? -1 : 1}
    }

    /**
     * Skip one word from `start` (letters/numbers via `\p{L}|\p{N}`), refined
     * with `Intl.Segmenter` when available. Returns null if no word content.
     */
    skipWord(start: number, side: number, forward: boolean, visually: boolean): {pos: number; side: -1 | 1} | null {
        let word = "",
            skipped = [""],
            cur: {pos: number; side: -1 | 1} | null = null
        let history = new Map<number, {pos: number; side: -1 | 1}>()
        for (;;) {
            let next,
                char,
                from = cur ? cur.pos : start
            if (visually) {
                next = this.moveVisually(from, cur ? cur.side : side, forward, skipped)
                char = skipped[0]
            } else {
                next = this.moveLogically(from, forward)
                if (next) {
                    let a = this.toIndex(from),
                        b = this.toIndex(next.pos)
                    char = this.text.slice(Math.min(a, b), Math.max(a, b))
                } else {
                    char = ""
                }
            }
            if (!next) break
            if (/\p{L}|\p{N}/u.test(char)) {
                if (forward) word += char
                else word = char + word
                history.set(word.length, next)
            } else if (word) {
                break
            }
            cur = next
        }
        if (!word) return null
        if (!(Intl as any).Segmenter) return cur
        let segments = [...new (Intl as any).Segmenter(undefined, {granularity: "word"}).segment(word)]
        return history.get(segments[forward ? 0 : segments.length - 1].segment.length) || cur
    }

    /** Document position and assoc side at the visual start or end of the block. */
    visualSide(start: boolean): {pos: number; side: -1 | 1} {
        let pos, side: -1 | 1
        if (start) {
            let span = this.order[0]
            ;[pos, side] = span.ltr == this.ltr ? [span.from, 1] : [span.to, -1]
        } else {
            let span = this.order[this.order.length - 1]
            ;[pos, side] = span.ltr == this.ltr ? [span.to, -1] : [span.from, 1]
        }
        return {pos: this.fromIndex(pos), side}
    }

    /** Move one grapheme cluster in logical (string) order. */
    moveLogically(start: number, forward: boolean): {pos: number; side: -1 | 1} | null {
        let index = this.toIndex(start)
        let next = findClusterBreak(this.text, index, forward)
        return next == index ? null : {pos: this.fromIndex(next), side: forward ? -1 : 1}
    }
}
