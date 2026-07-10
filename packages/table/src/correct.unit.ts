import {describe, expect, it} from "vitest"
import {ChangeSet} from "@arrisa/doc"
import {Correction} from "@arrisa/state"
import {RowSpan} from "@arrisa/types"
import {tableCorrection} from "./correct"
import {makeCell, makeTable, tableSchema} from "./test-helpers"
import {TableMap} from "./table-map"

describe("tableCorrection", () => {
    it("fills missing cells", () => {
        let schema = tableSchema()
        let table = makeTable([
            [makeCell("a"), makeCell("b")],
            [makeCell("c")],
        ])
        let doc = schema.doc([table])
        expect(TableMap.get(table, 1).problems!.some((p) => p.type == "missing")).toBe(true)

        let changes = ChangeSet.create(doc, {from: 0, to: doc.length, insert: [table]})
        let fixed = Correction.check(changes, doc, [tableCorrection])
        expect(fixed).not.toBe(null)
        let next = fixed!.apply(doc)
        let map = TableMap.get(next.firstChild as any, 1)
        expect(map.problems).toBe(null)
        expect(map.width).toBe(2)
        expect(map.height).toBe(2)
    })

    it("clamps overlong rowspan", () => {
        // Single row with rowspan > height (no sibling cells → no collision)
        let schema = tableSchema()
        let table = makeTable([[makeCell("a", {rowSpan: 3})]])
        let doc = schema.doc([table])
        expect(TableMap.get(table, 1).problems!.some((p) => p.type == "overlong_rowspan")).toBe(true)

        let changes = ChangeSet.create(doc, {from: 0, to: doc.length, insert: [table]})
        let fixed = Correction.check(changes, doc, [tableCorrection])
        expect(fixed).not.toBe(null)
        let next = fixed!.apply(doc)
        let map = TableMap.get(next.firstChild as any, 1)
        expect(map.height).toBe(1)
        let origin = map.cellAt(0, 0)!
        let span = map.getCell(origin).mark(RowSpan)
        expect(span).toBeUndefined()
        expect(map.problems).toBe(null)
    })
})
