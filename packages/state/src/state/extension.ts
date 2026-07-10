/**
 * Extension values: nested arrays, wrappers with `.extension`, fields, providers, etc.
 * Structural type — intentionally open so FacetProvider / Field / Prec / Compartment match.
 */
export type Extension = {extension: Extension} | readonly Extension[]
