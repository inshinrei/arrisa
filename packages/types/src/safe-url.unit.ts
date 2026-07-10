import {describe, expect, it} from "vitest"
import {isSafeLinkHref, sanitizeLinkHref, isSafeImageSrc, sanitizeImageSrc} from "./safe-url"

describe("sanitizeLinkHref", () => {
    it("accepts default absolute schemes", () => {
        expect(sanitizeLinkHref("https://example.com")).toBe("https://example.com")
        expect(sanitizeLinkHref("http://example.com/path")).toBe("http://example.com/path")
        expect(sanitizeLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com")
        expect(sanitizeLinkHref("xmpp:user@host")).toBe("xmpp:user@host")
    })

    it("accepts relative when allowed", () => {
        expect(sanitizeLinkHref("/path")).toBe("/path")
        expect(sanitizeLinkHref("#frag")).toBe("#frag")
        expect(sanitizeLinkHref("./rel")).toBe("./rel")
    })

    it("rejects dangerous schemes", () => {
        expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull()
        expect(sanitizeLinkHref("JAVASCRIPT:alert(1)")).toBeNull()
        expect(sanitizeLinkHref("vbscript:msgbox(1)")).toBeNull()
        expect(sanitizeLinkHref("data:text/html,<script>")).toBeNull()
        expect(sanitizeLinkHref("file:///etc/passwd")).toBeNull()
    })

    it("rejects scheme-relative and empty", () => {
        expect(sanitizeLinkHref("//evil.example")).toBeNull()
        expect(sanitizeLinkHref("")).toBeNull()
        expect(sanitizeLinkHref("   ")).toBeNull()
    })

    it("respects allowRelative false", () => {
        expect(sanitizeLinkHref("/path", {allowRelative: false})).toBeNull()
        expect(isSafeLinkHref("https://ok", {allowRelative: false})).toBe(true)
    })
})

describe("sanitizeImageSrc", () => {
    it("accepts http(s) and blob", () => {
        expect(sanitizeImageSrc("https://cdn.example/a.png")).toBe("https://cdn.example/a.png")
        expect(sanitizeImageSrc("http://x/y.jpg")).toBe("http://x/y.jpg")
        expect(sanitizeImageSrc("blob:https://example/uuid")).toBe("blob:https://example/uuid")
    })

    it("rejects javascript and non-image data by default", () => {
        expect(sanitizeImageSrc("javascript:alert(1)")).toBeNull()
        expect(sanitizeImageSrc("data:text/html,x")).toBeNull()
        expect(sanitizeImageSrc("data:image/png;base64,abc")).toBeNull()
    })

    it("allows data:image when opted in", () => {
        expect(sanitizeImageSrc("data:image/png;base64,abc", {allowDataImage: true})).toBe(
            "data:image/png;base64,abc",
        )
        expect(sanitizeImageSrc("data:text/html,x", {allowDataImage: true})).toBeNull()
    })

    it("accepts relative by default", () => {
        expect(isSafeImageSrc("/img.png")).toBe(true)
        expect(isSafeImageSrc("//evil", {allowRelative: true})).toBe(false)
    })
})
