/**
 * Scheme allowlists for link `href` and image `src` values.
 * Pure string checks — no DOM / base-URI resolution.
 */

const MAX_URL_LENGTH = 2048

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

export type LinkHrefPolicy = {
    /** Default: `http:`, `https:`, `mailto:`, `xmpp:`. No `data:`. */
    schemes?: readonly string[]
    /** Allow relative paths and same-doc fragments (`#…`, `/…`, `./…`). Default true. */
    allowRelative?: boolean
}

export type ImageSrcPolicy = {
    /** Default: `http:`, `https:`, `blob:`. */
    schemes?: readonly string[]
    /** Allow `data:image/…` only (not `data:text/html`). Default false. */
    allowDataImage?: boolean
    /** Allow relative paths. Default true. */
    allowRelative?: boolean
}

const DEFAULT_LINK_SCHEMES = ["http:", "https:", "mailto:", "xmpp:"] as const
const DEFAULT_IMAGE_SCHEMES = ["http:", "https:", "blob:"] as const

function normalizeSchemeList(schemes: readonly string[]): Set<string> {
    let set = new Set<string>()
    for (let s of schemes) set.add(s.toLowerCase().endsWith(":") ? s.toLowerCase() : s.toLowerCase() + ":")
    return set
}

function checkUrl(
    raw: string,
    allowed: Set<string>,
    allowRelative: boolean,
    extra?: (scheme: string, value: string) => boolean,
): string | null {
    if (typeof raw != "string") return null
    let value = raw.trim()
    if (!value || value.length > MAX_URL_LENGTH) return null

    let match = SCHEME_RE.exec(value)
    if (!match) {
        if (!allowRelative || value.startsWith("//")) return null
        // Control chars / whitespace in relative URLs
        if (/[\0-\x1f\x7f]/.test(value)) return null
        return value
    }

    let scheme = match[1].toLowerCase() + ":"
    if (extra && !extra(scheme, value)) return null
    if (!allowed.has(scheme)) return null
    if (/[\0-\x1f\x7f]/.test(value)) return null
    return value
}

/** Whether `href` is safe under the link policy. */
export function isSafeLinkHref(href: string, policy?: LinkHrefPolicy): boolean {
    return sanitizeLinkHref(href, policy) != null
}

/**
 * Returns `href` if safe under the link policy, else `null`
 * (caller drops mark / omits link).
 */
export function sanitizeLinkHref(href: string, policy?: LinkHrefPolicy): string | null {
    let schemes = normalizeSchemeList(policy?.schemes ?? DEFAULT_LINK_SCHEMES)
    let allowRelative = policy?.allowRelative !== false
    return checkUrl(href, schemes, allowRelative)
}

/** Whether `src` is safe under the image policy. */
export function isSafeImageSrc(src: string, policy?: ImageSrcPolicy): boolean {
    return sanitizeImageSrc(src, policy) != null
}

/**
 * Returns `src` if safe under the image policy, else `null`
 * (caller rejects image node).
 */
export function sanitizeImageSrc(src: string, policy?: ImageSrcPolicy): string | null {
    let schemes = normalizeSchemeList(policy?.schemes ?? DEFAULT_IMAGE_SCHEMES)
    let allowRelative = policy?.allowRelative !== false
    let allowDataImage = !!policy?.allowDataImage
    if (allowDataImage) schemes.add("data:")

    return checkUrl(src, schemes, allowRelative, (scheme, value) => {
        if (scheme == "data:") {
            if (!allowDataImage) return false
            // Only image/* payloads
            return /^data:image\/[a-z0-9.+-]+/i.test(value)
        }
        return true
    })
}
