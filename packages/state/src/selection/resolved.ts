/**
 * Document-resolved selection: anchor/head as {@link Pos} values with lazy
 * range resolution and active-mark lookup for typing / input rules.
 */
import {type Mark, type Plot, Pos} from "@arrisa/doc"
import {EditorSelection} from "./base"
import {Text} from "./text"

export class Resolved {
    anchor: Pos
    head: Pos

    private constructor(
        readonly doc: Plot.Doc,
        readonly selection: EditorSelection,
    ) {
        this.anchor = doc.resolve(selection.anchor)
        this.head = selection.empty ? this.anchor : doc.resolve(selection.head)
    }

    private _ranges: readonly {from: Pos; to: Pos}[] | null = null

    get ranges() {
        return this._ranges || (this._ranges = this.resolveRanges())
    }

    get from() {
        return this.anchor.pos < this.head.pos ? this.anchor : this.head
    }

    get to() {
        return this.anchor.pos > this.head.pos ? this.anchor : this.head
    }

    get replacementRange(): {from: Pos; to: Pos} {
        let repl = this.selection.replacementRange
        if (repl.from == this.selection.from && repl.to == this.selection.to) return this
        return {from: this.doc.resolve(repl.from), to: this.doc.resolve(repl.to)}
    }

    /** Marks stored on the selection, else marks spanning the replacement range. */
    get activeMarks(): Mark.Set {
        let repl = this.replacementRange
        return (this.selection instanceof Text && this.selection.marks) || repl.from.marks(repl.to)
    }

    static create(doc: Plot.Doc, selection: EditorSelection) {
        return new Resolved(doc, selection)
    }

    private resolveRanges(): readonly {from: Pos; to: Pos}[] {
        return this.selection.ranges.map(({from, to}) => ({from: this.doc.resolve(from), to: this.doc.resolve(to)}))
    }
}

// createResolved is installed on EditorSelection in ./selection (export
// initializer) so library tree-shaking cannot drop the wiring.
