/**
 * Strict CSS color value validator for Color / BackgroundColor marks.
 * Rejects style-injection fragments (`;`, `url(`, etc.).
 */

const MAX_COLOR_LENGTH = 128

// Common CSS named colors + transparent / currentcolor (palette-friendly).
const NAMED = new Set(
    [
        "transparent",
        "currentcolor",
        "black",
        "silver",
        "gray",
        "white",
        "maroon",
        "red",
        "purple",
        "fuchsia",
        "green",
        "lime",
        "olive",
        "yellow",
        "navy",
        "blue",
        "teal",
        "aqua",
        "orange",
        "aliceblue",
        "antiquewhite",
        "aquamarine",
        "azure",
        "beige",
        "bisque",
        "blanchedalmond",
        "blueviolet",
        "brown",
        "burlywood",
        "cadetblue",
        "chartreuse",
        "chocolate",
        "coral",
        "cornflowerblue",
        "cornsilk",
        "crimson",
        "cyan",
        "darkblue",
        "darkcyan",
        "darkgoldenrod",
        "darkgray",
        "darkgreen",
        "darkgrey",
        "darkkhaki",
        "darkmagenta",
        "darkolivegreen",
        "darkorange",
        "darkorchid",
        "darkred",
        "darksalmon",
        "darkseagreen",
        "darkslateblue",
        "darkslategray",
        "darkslategrey",
        "darkturquoise",
        "darkviolet",
        "deeppink",
        "deepskyblue",
        "dimgray",
        "dimgrey",
        "dodgerblue",
        "firebrick",
        "floralwhite",
        "forestgreen",
        "gainsboro",
        "ghostwhite",
        "gold",
        "goldenrod",
        "greenyellow",
        "grey",
        "honeydew",
        "hotpink",
        "indianred",
        "indigo",
        "ivory",
        "khaki",
        "lavender",
        "lavenderblush",
        "lawngreen",
        "lemonchiffon",
        "lightblue",
        "lightcoral",
        "lightcyan",
        "lightgoldenrodyellow",
        "lightgray",
        "lightgreen",
        "lightgrey",
        "lightpink",
        "lightsalmon",
        "lightseagreen",
        "lightskyblue",
        "lightslategray",
        "lightslategrey",
        "lightsteelblue",
        "lightyellow",
        "limegreen",
        "linen",
        "magenta",
        "mediumaquamarine",
        "mediumblue",
        "mediumorchid",
        "mediumpurple",
        "mediumseagreen",
        "mediumslateblue",
        "mediumspringgreen",
        "mediumturquoise",
        "mediumvioletred",
        "midnightblue",
        "mintcream",
        "mistyrose",
        "moccasin",
        "navajowhite",
        "oldlace",
        "olivedrab",
        "orangered",
        "orchid",
        "palegoldenrod",
        "palegreen",
        "paleturquoise",
        "palevioletred",
        "papayawhip",
        "peachpuff",
        "peru",
        "pink",
        "plum",
        "powderblue",
        "rebeccapurple",
        "rosybrown",
        "royalblue",
        "saddlebrown",
        "salmon",
        "sandybrown",
        "seagreen",
        "seashell",
        "sienna",
        "skyblue",
        "slateblue",
        "slategray",
        "slategrey",
        "snow",
        "springgreen",
        "steelblue",
        "tan",
        "thistle",
        "tomato",
        "turquoise",
        "violet",
        "wheat",
        "whitesmoke",
        "yellowgreen",
    ].map((s) => s.toLowerCase()),
)

// #rgb, #rrggbb, #rrggbbaa (3/4/6/8 hex digits)
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// numeric component: int, float, percent, or degree with optional unit for hsl
const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:%|deg|rad|turn|grad)?`
const SEP = String.raw`(?:\s*,\s*|\s+)`
const ALPHA = String.raw`(?:\s*[,/]\s*${NUM})?`

const RGB = new RegExp(`^rgba?\\(\\s*${NUM}(?:${SEP}${NUM}){2}${ALPHA}\\s*\\)$`, "i")
const HSL = new RegExp(`^hsla?\\(\\s*${NUM}(?:${SEP}${NUM}){2}${ALPHA}\\s*\\)$`, "i")

const UNSAFE = /[;{}\\]|\/\/|url\s*\(|expression\s*\(|behavior\s*:|@|[\n\r\u2028\u2029]/i

/** Whether `value` is a safe CSS color for mark storage / style emission. */
export function isSafeCssColor(value: string): boolean {
    return sanitizeCssColor(value) != null
}

/** Returns trimmed color if safe, else `null`. */
export function sanitizeCssColor(value: string): string | null {
    if (typeof value != "string") return null
    let v = value.trim()
    if (!v || v.length > MAX_COLOR_LENGTH) return null
    if (UNSAFE.test(v)) return null

    if (HEX.test(v)) return v
    if (NAMED.has(v.toLowerCase())) return v
    if (RGB.test(v) || HSL.test(v)) return v
    return null
}
