import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {PhraseSet} from "./phrase-set"
import {phrases, tablePhrases} from "./catalogs"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

function makeState(extensions: EditorState.Extension = []) {
    let {schema, paragraph} = basicSchema()
    let doc = schema.doc([paragraph.create([Leaf.text("x")])])
    let state = EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
    return {state, schema, paragraph, doc}
}

describe("PhraseSet.define", () => {
    it("returns defaults and freezes the phrase map", () => {
        let set = PhraseSet.define({hello: "Hello", bye: "Goodbye"})
        expect(set.phrases.hello).toBe("Hello")
        expect(Object.isFrozen(set.phrases)).toBe(true)
    })
})

describe("PhraseSet.get", () => {
    it("returns the default phrase when no override is registered", () => {
        let set = PhraseSet.define({greet: "Hello"})
        let {state} = makeState()
        expect(set.get(state, "greet")).toBe("Hello")
    })

    it("interpolates $1, $2, bare $, and $$", () => {
        let set = PhraseSet.define({
            a: "A $1 B $2",
            bare: "value is $",
            dollar: "costs $$ $1",
            missing: "x $9 y",
        })
        let {state} = makeState()
        expect(set.get(state, "a", "one", "two")).toBe("A one B two")
        expect(set.get(state, "bare", 42)).toBe("value is 42")
        expect(set.get(state, "dollar", 5)).toBe("costs $ 5")
        expect(set.get(state, "missing", "a")).toBe("x $9 y")
    })

    it("leaves the template unchanged when no inserts are passed", () => {
        let set = PhraseSet.define({t: "keep $1"})
        let {state} = makeState()
        expect(set.get(state, "t")).toBe("keep $1")
    })
})

describe("PhraseSet.translate / translatePartial", () => {
    it("translate replaces all phrases for the set", () => {
        let set = PhraseSet.define({a: "A", b: "B"})
        let {state} = makeState(set.translate({a: "α", b: "β"}))
        expect(set.get(state, "a")).toBe("α")
        expect(set.get(state, "b")).toBe("β")
    })

    it("translatePartial overrides only provided keys", () => {
        let set = PhraseSet.define({a: "A", b: "B"})
        let {state} = makeState(set.translatePartial({a: "α"}))
        expect(set.get(state, "a")).toBe("α")
        expect(set.get(state, "b")).toBe("B")
    })

    it("higher-precedence / earlier providers win on key conflicts", () => {
        let set = PhraseSet.define({x: "default"})
        // Same precedence: first in the extension list wins (see facet combine).
        let {state} = makeState([set.translatePartial({x: "first"}), set.translatePartial({x: "second"})])
        expect(set.get(state, "x")).toBe("first")

        let high = makeState([
            set.translatePartial({x: "low"}),
            EditorState.prec.high(set.translatePartial({x: "high"})),
        ])
        expect(set.get(high.state, "x")).toBe("high")
    })

    it("does not leak overrides across different phrase sets", () => {
        let a = PhraseSet.define({k: "A"})
        let b = PhraseSet.define({k: "B"})
        let {state} = makeState(a.translatePartial({k: "override-A"}))
        expect(a.get(state, "k")).toBe("override-A")
        expect(b.get(state, "k")).toBe("B")
    })
})

describe("PhraseSet.didChange", () => {
    it("is false when only the document changes", () => {
        let set = PhraseSet.define({x: "X"})
        let {state} = makeState(set.translatePartial({x: "Y"}))
        let next = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("!")])},
        }).state
        expect(PhraseSet.didChange(state, next)).toBe(false)
        expect(set.get(next, "x")).toBe("Y")
    })

    it("is true when phrase overrides are reconfigured", () => {
        let set = PhraseSet.define({x: "X"})
        let {state} = makeState()
        let next = state.update({
            effects: EditorState.appendConfig.of(set.translatePartial({x: "Y"})),
        }).state
        expect(PhraseSet.didChange(state, next)).toBe(true)
        expect(set.get(next, "x")).toBe("Y")
    })
})

describe("PhraseSet.ref", () => {
    it("binds a tag so get and ref agree", () => {
        let set = PhraseSet.define({pair: "$1 and $2"})
        let {state} = makeState()
        let ref = set.ref("pair")
        expect(ref(state, "a", "b")).toBe(set.get(state, "pair", "a", "b"))
        expect(ref(state, 1, 2)).toBe("1 and 2")
    })
})

describe("built-in catalogs", () => {
    it("exposes core UI phrases", () => {
        let {state} = makeState()
        expect(phrases.get(state, "undo")).toBe("Undo")
        expect(phrases.get(state, "dialog_close")).toBe("close")
    })

    it("interpolates table dimension phrases", () => {
        let {state} = makeState()
        expect(tablePhrases.get(state, "dimensions_live", 3, 4)).toBe("3 by 4")
        expect(tablePhrases.get(state, "dimensions_title", 2, 5)).toBe(
            "Table dimensions 2 by 5. Use arrow keys to change.",
        )
        expect(tablePhrases.get(state, "add_col_after")).toBe("Add column after")
    })
})
