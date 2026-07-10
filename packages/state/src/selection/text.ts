/**
 * Text selection: a cursor (empty) or range over document positions.
 *
 * `headSide` disambiguates the visual cursor when the head sits at a bidi
 * boundary (−1 = after the previous cluster, 1 = before the next). Stored
 * `marks` override document marks for the next insert when set.
 */
import {type ChangeSet, type Mark, type Plot, ValidationError} from "@arrisa/doc"
import {EditorSelection} from "./base"
import {SelectionType} from "./type"

export class Text extends EditorSelection {
    private constructor(
        anchor: number,
        head: number,
        private _headSide: -1 | 1,
        goalColumn: number | undefined,
        readonly marks: Mark.Set | undefined,
    ) {
        super(anchor, head, goalColumn)
    }

    get headSide() {
        return this._headSide
    }

    get anchorSide() {
        return this.anchor == this.head ? this._headSide : super.anchorSide
    }

    get isCursor(): boolean {
        return this.empty
    }

    static createInner(anchor: number, head: number, side?: -1 | 1, goalColumn?: number, marks?: Mark.Set) {
        return new Text(anchor, head, side ?? (head > anchor ? -1 : 1), goalColumn, marks)
    }

    static create(spec: Text.Spec) {
        let {anchor, head = anchor} = spec
        return Text.createInner(anchor, head, spec.headSide, spec.goalColumn, spec.marks)
    }

    /**
     * Map endpoints through a change set. Non-empty ranges map `from` with
     * assoc +1 and `to` with −1, then restore original head/anchor direction.
     */
    map(change: ChangeSet, _cx: EditorSelection.Context, assoc: -1 | 1 = -1): EditorSelection {
        if (this.empty) {
            let pos = change.mapPos(this.from, assoc)
            return Text.createInner(pos, pos, this.headSide, this.goalColumn, this.marks)
        }
        let from = change.mapPos(this.from, 1)
        let to = Math.max(from, change.mapPos(this.to, -1))
        // Preserve reverse selections (head before anchor).
        let forward = this.head >= this.anchor
        let anchor = forward ? from : to
        let head = forward ? to : from
        return Text.createInner(anchor, head, this.headSide, this.goalColumn, this.marks)
    }

    eq(other: EditorSelection) {
        return (
            other instanceof Text &&
            this.eqPos(other) &&
            this.headSide == other.headSide &&
            (this.marks == other.marks ||
                !!(
                    this.marks &&
                    other.marks &&
                    this.marks.length == other.marks.length &&
                    this.marks.every((p, i) => p.eq(other.marks![i]))
                ))
        )
    }
}

export namespace Text {
    export type Spec = {
        anchor: number
        head?: number
        headSide?: -1 | 1
        goalColumn?: number
        marks?: Mark.Set
    }

    export type JSON = {
        anchor: number
        head?: number
        side?: -1 | 1
        marks?: Record<string, any>
    }

    export const type = new SelectionType(
        "text",
        Text,
        ((sel: Text): JSON => {
            let result: JSON = {anchor: sel.anchor}
            if (sel.headSide != (sel.head > sel.anchor ? -1 : 1)) result.side = sel.headSide
            if (!sel.empty) result.head = sel.head
            if (sel.marks) {
                result.marks = {}
                for (let mark of sel.marks) result.marks[mark.name] = mark.value
            }
            return result
        }) as any,
        ((doc: Plot.Doc, json: JSON) => {
            if (!json || typeof json.anchor != "number")
                throw new ValidationError("Invalid JSON representation for EditorSelection.Text")
            let anchor = json.anchor,
                head = typeof json.head == "number" ? json.head : anchor
            let marks = json.marks ? doc.schema.marksFromJSON(json.marks) : undefined
            return Text.createInner(
                anchor,
                head,
                json.side == 1 || json.side == -1 ? json.side : undefined,
                undefined,
                marks,
            )
        }) as any,
    )
}
