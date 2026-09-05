import {describe, expect, it} from "vitest"
import {Plot, Schema} from "@arrisa/doc"
import {TileFlag} from "../tile/flag"
import {DOMObserver} from "./observer"

function installMutationObserverStub() {
    let prev = (globalThis as any).MutationObserver
    ;(globalThis as any).MutationObserver = class {
        observe() {}
        disconnect() {}
        takeRecords() {
            return []
        }
    }
    return () => {
        if (prev === undefined) delete (globalThis as any).MutationObserver
        else (globalThis as any).MutationObserver = prev
    }
}

describe("DOMObserver.findMutation", () => {
    it("expands an empty dirty range to the enclosing textblock", () => {
        let restore = installMutationObserverStub()
        try {
            let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
            let docType = Plot.defineDoc({blockContent: paragraph})
            let schema = Schema.define([docType, paragraph])
            let doc = schema.doc([paragraph.create([])])
            // Empty paragraph spans 0..2; caret/widget point at pos 1 is zero-width.
            let pointDom = {nodeType: 1} as any
            let pointTile = {
                ignoreMutations: false,
                flags: TileFlag.None,
                dom: pointDom,
                posBefore: 1,
                posAfter: 1,
            }
            let editor = {
                contentDOM: {nodeType: 1},
                root: {getSelection: () => null},
                scheduleFlush() {},
                flushedState: {doc},
                docTile: {
                    nearest(target: any) {
                        return target === pointDom ? pointTile : null
                    },
                },
            } as any

            let observer = new DOMObserver(editor)
            let range = observer.findMutation({
                type: "characterData",
                target: pointDom,
            } as MutationRecord)

            expect(range).toEqual([0, 2])
            expect(pointTile.flags & TileFlag.Dirty).toBeTruthy()
        } finally {
            restore()
        }
    })
})
