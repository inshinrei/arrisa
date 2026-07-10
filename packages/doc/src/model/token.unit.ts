import {describe, expect, it} from "vitest"
import {Plot} from "./node/plot"
import {Token} from "./token"

describe("Token", () => {
    it("uses distinct type enum values", () => {
        expect(Token.Type.Open).not.toBe(Token.Type.Close)
        expect(Token.Type.Close).not.toBe(Token.Type.Node)
        expect(Token.Type.Open).not.toBe(Token.Type.Node)
    })

    it("exposes a shared close-plot End sentinel", () => {
        expect(Token.End.tokenType).toBe(Token.Type.Close)
        expect(Token.End.toString()).toBe("[end]")
        expect(Token.End).toBe(Plot.End)
    })
})
