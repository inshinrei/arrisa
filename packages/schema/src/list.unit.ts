import {describe, expect, it} from "vitest"
import {BulletList, InlineListItem, ListItem, OrderedList} from "@arrisa/types"
import {blockDoc, paragraph} from "./block"
import {bulletList, orderedList} from "./list"
import {makeState, typeAtEnd} from "./test-helpers"

describe("list factories", () => {
    it("bulletList registers list and block list items by default", () => {
        let state = makeState([blockDoc(), paragraph(), bulletList()])
        expect(state.schema.has(BulletList)).toBe(true)
        expect(state.schema.has(ListItem)).toBe(true)
        expect(state.schema.has(InlineListItem)).toBe(false)
    })

    it("orderedList registers ordered list and block list items by default", () => {
        let state = makeState([blockDoc(), paragraph(), orderedList()])
        expect(state.schema.has(OrderedList)).toBe(true)
        expect(state.schema.has(ListItem)).toBe(true)
    })

    it("blockItems: false uses InlineListItem", () => {
        let bullet = makeState([blockDoc(), paragraph(), bulletList({blockItems: false})])
        expect(bullet.schema.has(InlineListItem)).toBe(true)
        expect(bullet.schema.has(ListItem)).toBe(false)

        let ordered = makeState([blockDoc(), paragraph(), orderedList({blockItems: false})])
        expect(ordered.schema.has(InlineListItem)).toBe(true)
        expect(ordered.schema.has(ListItem)).toBe(false)
    })
})

describe("list input rules", () => {
    it("createOnDash wraps a paragraph in a bullet list", () => {
        let state = makeState([blockDoc(), paragraph(), bulletList()], {selection: 1})
        for (let ch of "- ") {
            let chain = typeAtEnd(state, ch)
            state = chain[chain.length - 1].state
        }
        expect(state.doc.content[0].type).toBe(BulletList.type)
    })

    it("createOnNumber wraps a paragraph in an ordered list", () => {
        let state = makeState([blockDoc(), paragraph(), orderedList()], {selection: 1})
        for (let ch of "1. ") {
            let chain = typeAtEnd(state, ch)
            state = chain[chain.length - 1].state
        }
        expect(state.doc.content[0].type).toBe(OrderedList)
    })
})
