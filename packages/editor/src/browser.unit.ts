import {describe, expect, it} from "vitest"
import browser from "./browser"

describe("browser", () => {
    it("exports a stable flag object with expected keys and types", () => {
        let keys = [
            "mac",
            "windows",
            "linux",
            "edge",
            "gecko",
            "gecko_version",
            "chrome",
            "chrome_version",
            "ios",
            "android",
            "webkit",
            "webkit_version",
            "safari",
            "safari_version",
            "blink",
        ] as const
        for (let k of keys) expect(k in browser).toBe(true)

        expect(typeof browser.mac).toBe("boolean")
        expect(typeof browser.windows).toBe("boolean")
        expect(typeof browser.linux).toBe("boolean")
        expect(typeof browser.gecko).toBe("boolean")
        expect(typeof browser.chrome).toBe("boolean")
        expect(typeof browser.ios).toBe("boolean")
        expect(typeof browser.android).toBe("boolean")
        expect(typeof browser.webkit).toBe("boolean")
        expect(typeof browser.safari).toBe("boolean")

        expect(typeof browser.gecko_version).toBe("number")
        expect(typeof browser.chrome_version).toBe("number")
        expect(typeof browser.webkit_version).toBe("number")
        expect(typeof browser.safari_version).toBe("number")
    })

    it("uses non-negative version numbers", () => {
        expect(browser.gecko_version).toBeGreaterThanOrEqual(0)
        expect(browser.chrome_version).toBeGreaterThanOrEqual(0)
        expect(browser.webkit_version).toBeGreaterThanOrEqual(0)
        expect(browser.safari_version).toBeGreaterThanOrEqual(0)
    })
})
