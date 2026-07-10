import {describe, expect, it} from "vitest"
import {Attributes, Elt} from "@arrisa/doc"
import {
    Decoration,
    AttributeRangeDecoration,
    WrapperRangeDecoration,
    WidgetDecoration,
    ShapeDecoration,
    AttributeDecoration,
    WrapperDecoration,
    memo,
    addAttrs,
    applyDeco,
} from "./decoration"
import {Widget} from "./widget"

describe("Decoration.Point factories", () => {
    it("creates attribute and shape points", () => {
        let attrs = Decoration.Point.attributes({class: "x"})
        expect(attrs).toBeInstanceOf(AttributeDecoration)
        expect(attrs.eq(attrs)).toBe(true)

        let shape = Decoration.Point.shape(Elt.create("span", Attributes.none, ["hi"]))
        expect(shape).toBeInstanceOf(ShapeDecoration)
        expect(shape.side).toBe(1e9)
    })

    it("creates widgets with side/trackMode and rejects huge side", () => {
        let w = Widget.create({render: () => ({nodeType: 3} as any)})
        let deco = Decoration.Point.widget(w, {side: -1})
        expect(deco).toBeInstanceOf(WidgetDecoration)
        expect(deco.side).toBe(-1)
        expect(() => Decoration.Point.widget(w, {side: 1e9})).toThrow(/side/)
    })

    it("requires content hole on wrapper points", () => {
        expect(() => Decoration.Point.wrapper(Elt.create("div", Attributes.none, ["no-hole"]))).toThrow(/content hole/)
        let wrap = Decoration.Point.wrapper(Elt.create("div", Attributes.none, Elt.hole))
        expect(wrap).toBeInstanceOf(WrapperDecoration)
    })
})

describe("Decoration.Range factories and eq", () => {
    it("creates attribute ranges with inclusivity", () => {
        let a = Decoration.Range.attribute("class", "mark", {inclusive: true})
        expect(a).toBeInstanceOf(AttributeRangeDecoration)
        expect(a.inclusiveStart).toBe(true)
        expect(a.inclusiveEnd).toBe(true)

        let b = Decoration.Range.attribute("class", "mark", {inclusive: "start"})
        expect(b.inclusiveStart).toBe(true)
        expect(b.inclusiveEnd).toBe(false)
        expect(a.eq(b)).toBe(false)
        expect(a.eq(Decoration.Range.attribute("class", "mark", {inclusive: true}))).toBe(true)
    })

    it("compares wrapper range elements correctly", () => {
        let a = Decoration.Range.wrapper("span", {attributes: {class: "a"}})
        let b = Decoration.Range.wrapper("span", {attributes: {class: "a"}})
        let c = Decoration.Range.wrapper("span", {attributes: {class: "b"}})
        expect(a).toBeInstanceOf(WrapperRangeDecoration)
        expect(a.eq(b)).toBe(true)
        expect(a.eq(c)).toBe(false)
    })
})

describe("WidgetDecoration.eq", () => {
    it("distinguishes side and trackMode", () => {
        let w = Widget.create({render: () => ({nodeType: 3} as any)})
        let a = new WidgetDecoration(w, 0, "around")
        let b = new WidgetDecoration(w, 0, "around")
        let c = new WidgetDecoration(w, 1, "around")
        let d = new WidgetDecoration(w, 0, "after")
        expect(a.eq(b)).toBe(true)
        expect(a.eq(c)).toBe(false)
        expect(a.eq(d)).toBe(false)
    })
})

describe("memo", () => {
    it("caches by object identity", () => {
        let calls = 0
        let f = memo((obj: {n: number}) => {
            calls++
            return obj.n * 2
        })
        let arg = {n: 3}
        expect(f(arg)).toBe(6)
        expect(f(arg)).toBe(6)
        expect(calls).toBe(1)
        expect(f({n: 3})).toBe(6)
        expect(calls).toBe(2)
    })
})

describe("addAttrs / applyDeco", () => {
    it("adds attributes to Elt shapes", () => {
        let shape = Elt.create("span", Attributes.none, ["x"])
        let next = addAttrs(shape, Attributes.read({class: "c"}), true)
        expect(next).toBeInstanceOf(Elt)
        expect(Attributes.get((next as Elt).attrs, "class")).toBe("c")
    })

    it("wraps non-Elt shapes in span/div", () => {
        let w = Widget.create({render: () => ({nodeType: 3} as any)})
        let next = addAttrs(w, Attributes.read({class: "c"}), true)
        expect(next).toBeInstanceOf(Elt)
        expect((next as Elt).tagName).toBe("span")
    })

    it("applyDeco applies attribute decorations", () => {
        let shape = Elt.create("span", Attributes.none, ["x"])
        let deco = Decoration.Point.attributes({title: "t"}) as AttributeDecoration
        let next = applyDeco(shape, deco, {type: {isInline: true}} as any)
        expect(Attributes.get((next as Elt).attrs, "title")).toBe("t")
    })
})
