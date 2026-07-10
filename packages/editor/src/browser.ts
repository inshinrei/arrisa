/**
 * Load-time snapshot of browser / platform capabilities.
 *
 * Values are fixed when this module is first evaluated — not re-probed later.
 * In non-browser realms (`navigator` / `document` missing), flags fall back to
 * empty strings and empty style objects so the object is still safe to import
 * during SSR or unit tests.
 *
 * Prefer branching on these flags for known engine quirks (WebKit space
 * restoration, Mac modifier keys, etc.) rather than re-parsing `userAgent`.
 */

let nav: any = typeof navigator != "undefined" ? navigator : {userAgent: "", vendor: "", platform: ""}
let doc: any = typeof document != "undefined" ? document : {documentElement: {style: {}}}

const edge = /Edge\/(\d+)/.exec(nav.userAgent)
const gecko = !edge && /gecko\/(\d+)/i.test(nav.userAgent)
const chrome = !edge && /Chrome\/(\d+)/.exec(nav.userAgent)
const webkit = "webkitFontSmoothing" in doc.documentElement.style
const safari = !edge && /Apple Computer/.test(nav.vendor)
const ios = safari && (/Mobile\/\w+/.test(nav.userAgent) || nav.maxTouchPoints > 2)

export default {
    /** macOS or iOS (including iPadOS desktop UA). */
    mac: ios || /Mac/.test(nav.platform),
    windows: /Win/.test(nav.platform),
    linux: /Linux|X11/.test(nav.platform),
    /** Legacy Edge match group, or null. */
    edge,
    gecko,
    gecko_version: gecko ? +(/Firefox\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    chrome: !!chrome,
    chrome_version: chrome ? +chrome[1] : 0,
    ios,
    android: /Android\b/.test(nav.userAgent),
    webkit,
    webkit_version: webkit ? +(/\bAppleWebKit\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    safari,
    safari_version: safari ? +(/\bVersion\/(\d+(\.\d+)?)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    /** Blink family (Chrome or legacy Edge). */
    blink: edge || chrome,
}
