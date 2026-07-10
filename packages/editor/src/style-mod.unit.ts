import {describe, expect, it} from "vitest"
import {StyleModule} from "./style-mod"

/** Compiled rule list from a module (stable order). */
function rules(module: StyleModule): string[] {
    return module.rules
}

describe("StyleModule", () => {
    it("renders objects to CSS text", () => {
        expect(
            rules(
                new StyleModule({
                    main: {color: "red", border: "1px solid green"},
                }),
            ),
        ).toEqual(["main {color: red; border: 1px solid green;}"])
    })

    it("handles multiple rules", () => {
        expect(
            rules(
                new StyleModule({
                    one: {color: "green"},
                    two: {color: "blue"},
                }),
            ),
        ).toEqual(["one {color: green;}", "two {color: blue;}"])
    })

    it("supports &-nesting", () => {
        expect(
            rules(
                new StyleModule({
                    main: {
                        color: "yellow",
                        "&:hover": {fontWeight: "bold"},
                    },
                }),
            ),
        ).toEqual(["main:hover {font-weight: bold;}", "main {color: yellow;}"])
    })

    it("can replace multiple & markers", () => {
        expect(
            rules(
                new StyleModule({
                    main: {
                        "p &, div &": {color: "blue"},
                    },
                }),
            ),
        ).toEqual(["p main, div main {color: blue;}"])
    })

    it("supports media queries", () => {
        expect(
            rules(
                new StyleModule({
                    "@media screen and (min-width: 400px)": {
                        main: {
                            fontFamily: '"URW Bookman"',
                            MozBoxSizing: "border-box",
                        },
                    },
                }),
            ),
        ).toEqual([
            '@media screen and (min-width: 400px) {main {font-family: "URW Bookman"; -moz-box-sizing: border-box;}}',
        ])
    })

    it("can render keyframes", () => {
        expect(
            rules(
                new StyleModule({
                    "@keyframes foo": {
                        "0%": {color: "blue"},
                        "50%": {color: "red"},
                    },
                }),
            ),
        ).toEqual(["@keyframes foo {0% {color: blue;} 50% {color: red;}}"])
    })

    it("doesn't mangle keyframe names with finish", () => {
        expect(
            rules(
                new StyleModule(
                    {
                        "@keyframes foo": {
                            "0%": {color: "blue"},
                            "50%": {color: "red"},
                        },
                    },
                    {finish: (s) => ".foo " + s},
                ),
            ),
        ).toEqual(["@keyframes foo {0% {color: blue;} 50% {color: red;}}"])
    })

    it("can render multiple instances of a property", () => {
        expect(
            rules(
                new StyleModule({
                    main: {
                        color: "rgba(100, 100, 100, .5)",
                        color_2: "grey",
                    },
                }),
            ),
        ).toEqual(["main {color: rgba(100, 100, 100, .5); color: grey;}"])
    })

    it("can expand multiple selectors at once", () => {
        expect(
            rules(
                new StyleModule({
                    "one, two": {
                        "&.x": {
                            color: "yellow",
                        },
                    },
                }),
            ),
        ).toEqual(["one.x, two.x {color: yellow;}"])
    })

    it("allows processing of selectors via finish", () => {
        expect(
            rules(
                new StyleModule(
                    {
                        "abc, cba": {color: "yellow"},
                        "@media stuff": {abc: {fontWeight: "bold"}},
                    },
                    {
                        finish: (x) => x.replace(/a/g, "u"),
                    },
                ),
            ),
        ).toEqual(["ubc, cbu {color: yellow;}", "@media stuff {ubc {font-weight: bold;}}"])
    })

    it("getRules joins rules with newlines", () => {
        let mod = new StyleModule({
            one: {color: "green"},
            two: {color: "blue"},
        })
        expect(mod.getRules()).toBe("one {color: green;}\ntwo {color: blue;}")
    })

    it("newName returns unique names with the style-mod prefix", () => {
        let a = StyleModule.newName()
        let b = StyleModule.newName()
        expect(a).toMatch(/^\u037c[0-9a-z]+$/)
        expect(b).toMatch(/^\u037c[0-9a-z]+$/)
        expect(a).not.toBe(b)
    })

    it("throws when a nested object is used outside an @-block", () => {
        expect(
            () =>
                new StyleModule({
                    main: {
                        // Invalid: object value without being under @media / @keyframes / etc.
                        color: {nested: "red"} as unknown as string,
                    },
                }),
        ).toThrow(RangeError)
        expect(
            () =>
                new StyleModule({
                    main: {
                        bogus: {color: "red"},
                    },
                }),
        ).toThrow(/primitive value/)
    })
})
