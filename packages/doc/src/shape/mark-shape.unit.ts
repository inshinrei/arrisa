import {describe, expect, it} from "vitest"
import {SchemaError} from "../util/error"
import {Attributes} from "./attributes"
import {Elt} from "./elt"
import {AttributeShape, ElementShape} from "./mark-shape"

describe("ElementShape", () => {
    it("stores the element name from the spec", () => {
        let shape = new ElementShape({element: "strong"})
        expect(shape.name).toBe("strong")
    })

    it("returns Attributes.none when attributes are omitted", () => {
        let shape = new ElementShape({element: "em"})
        expect(shape.attrs(null)).toBe(Attributes.none)
        expect(shape.attrs(undefined as any)).toBe(Attributes.none)
    })

    it("shares static attributes across calls and sorts keys", () => {
        let shape = new ElementShape({
            element: "a",
            attributes: {href: "/x", class: "link"},
        })
        let a = shape.attrs(null)
        let b = shape.attrs(null)
        expect(a).toBe(b)
        expect(a).toEqual(["class", "link", "href", "/x"])
    })

    it("rebuilds dynamic attributes from the param", () => {
        let shape = new ElementShape<{href: string}>({
            element: "a",
            attributes: (param) => ({href: param.href}),
        })
        let a = shape.attrs({href: "/one"})
        let b = shape.attrs({href: "/two"})
        expect(a).not.toBe(b)
        expect(a).toEqual(["href", "/one"])
        expect(b).toEqual(["href", "/two"])
    })

    it("folds style/* properties via Attributes.read", () => {
        let shape = new ElementShape({
            element: "span",
            attributes: {"style/color": "red", class: "c"},
        })
        expect(shape.attrs(null)).toEqual(["class", "c", "style", "color: red"])
    })
})

describe("AttributeShape — single attribute", () => {
    let noDefault = {hasDefault: false}
    let withDefault = {hasDefault: true}

    it("builds a shared bag from a static value", () => {
        let shape = new AttributeShape({attribute: "title", value: "tip"}, noDefault)
        let a = shape.get(null)
        let b = shape.get(null)
        expect(a).toBe(b)
        expect(a).toEqual(["title", "tip"])
        expect(shape.target).toBe(null)
    })

    it("uses the param when value is 0", () => {
        let shape = new AttributeShape<string>({attribute: "arrisa-open", value: 0}, noDefault)
        expect(shape.get("start")).toEqual(["arrisa-open", "start"])
        expect(shape.get("end")).toEqual(["arrisa-open", "end"])
    })

    it("throws SchemaError when value is 0 and hasDefault is true", () => {
        expect(
            () => new AttributeShape<string>({attribute: "title", value: 0}, withDefault),
        ).toThrow(SchemaError)
        expect(
            () => new AttributeShape<string>({attribute: "title", value: 0}, withDefault),
        ).toThrow(/parameter-less marks cannot use 0 as value/)
    })

    it("builds attrs from a function value", () => {
        let shape = new AttributeShape<{level: number}>(
            {attribute: "data-level", value: (p) => String(p.level)},
            noDefault,
        )
        expect(shape.get({level: 2})).toEqual(["data-level", "2"])
    })

    it("returns Attributes.none when the value function returns null", () => {
        let shape = new AttributeShape<string | null>(
            {attribute: "title", value: (p) => p},
            noDefault,
        )
        expect(shape.get(null)).toBe(Attributes.none)
        expect(shape.get("ok")).toEqual(["title", "ok"])
    })

    it("folds style/* attributes for static, param, and function values", () => {
        let staticShape = new AttributeShape({attribute: "style/color", value: "red"}, noDefault)
        expect(staticShape.get(null)).toEqual(["style", "color: red"])

        let paramShape = new AttributeShape<string>({attribute: "style/color", value: 0}, noDefault)
        expect(paramShape.get("blue")).toEqual(["style", "color: blue"])

        let fnShape = new AttributeShape<{c: string}>(
            {attribute: "style/color", value: (p) => p.c},
            noDefault,
        )
        expect(fnShape.get({c: "green"})).toEqual(["style", "color: green"])
        expect(fnShape.get({c: null as any})).toBe(Attributes.none)
    })

    it("parses preferTarget into a selector", () => {
        let shape = new AttributeShape(
            {attribute: "class", value: "mark", preferTarget: "span.x"},
            noDefault,
        )
        expect(shape.target).not.toBe(null)
        expect(shape.target!.match(Elt.mk("span", {class: "x y"}))).toBe(true)
        expect(shape.target!.match(Elt.mk("span", {class: "y"}))).toBe(false)
        expect(shape.target!.match(Elt.mk("div", {class: "x"}))).toBe(false)
    })

    it("throws on invalid preferTarget", () => {
        expect(
            () =>
                new AttributeShape(
                    {attribute: "class", value: "mark", preferTarget: "div#id"},
                    noDefault,
                ),
        ).toThrow(/Invalid element selector/)
    })
})

describe("AttributeShape — attribute bag", () => {
    let noDefault = {hasDefault: false}

    it("builds a shared bag from static attributes", () => {
        let shape = new AttributeShape(
            {attributes: {class: "c", href: "/x"}},
            noDefault,
        )
        let a = shape.get(null)
        let b = shape.get(null)
        expect(a).toBe(b)
        expect(a).toEqual(["class", "c", "href", "/x"])
        expect(shape.target).toBe(null)
    })

    it("rebuilds dynamic attributes from the param", () => {
        let shape = new AttributeShape<{href: string; title?: string}>(
            {
                attributes: (param) => {
                    let bag: Record<string, string> = {href: param.href}
                    if (param.title) bag.title = param.title
                    return bag
                },
            },
            noDefault,
        )
        expect(shape.get({href: "/a"})).toEqual(["href", "/a"])
        expect(shape.get({href: "/b", title: "go"})).toEqual(["href", "/b", "title", "go"])
    })

    it("sets preferTarget on bag-form shapes", () => {
        let shape = new AttributeShape(
            {attributes: {class: "mark"}, preferTarget: ".inner"},
            noDefault,
        )
        expect(shape.target!.match(Elt.mk("span", {class: "inner"}))).toBe(true)
        expect(shape.get(null)).toEqual(["class", "mark"])
    })
})
