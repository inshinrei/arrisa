import {describe, expect, it} from "vitest"
import {isLinkPasteUrl} from "./link"

describe("isLinkPasteUrl", () => {
    it("accepts common absolute URL schemes", () => {
        expect(isLinkPasteUrl("https://example.com")).toBe(true)
        expect(isLinkPasteUrl("http://example.com/path")).toBe(true)
        expect(isLinkPasteUrl("mailto:a@b.com")).toBe(true)
        expect(isLinkPasteUrl("xmpp:user@host")).toBe(true)
    })

    it("rejects data, javascript, relative, and malformed paste targets", () => {
        expect(isLinkPasteUrl("data:text/plain,hi")).toBe(false)
        expect(isLinkPasteUrl("javascript:alert(1)")).toBe(false)
        expect(isLinkPasteUrl("")).toBe(false)
        expect(isLinkPasteUrl("example.com")).toBe(false)
        expect(isLinkPasteUrl("/relative")).toBe(false)
        expect(isLinkPasteUrl("ftp://example.com")).toBe(false)
        expect(isLinkPasteUrl("https://example.com more")).toBe(false)
        expect(isLinkPasteUrl(" see https://example.com")).toBe(false)
        expect(isLinkPasteUrl("https://example.com ")).toBe(false)
    })
})
