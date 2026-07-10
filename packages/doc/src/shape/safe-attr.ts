/**
 * Safe DOM attribute name checks for serialization and setAttribute.
 * Blocks event-handler names and a few known dangerous attributes.
 */

/** HTML attribute name safe for setAttribute / HTML serialization. */
export function isSafeAttributeName(name: string): boolean {
    if (!name || name.length > 128) return false
    if (/^on/i.test(name)) return false
    let lower = name.toLowerCase()
    if (lower == "srcdoc" || lower == "formaction" || lower == "xlink:href") return false
    return /^[a-zA-Z_:][\w:.-]*$/.test(name)
}
