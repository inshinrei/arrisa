/**
 * Bit flags packed onto {@link BaseType.flags} for fast node-type queries.
 * Combined at define time from leaf/plot specs (inline, content, doc, etc.).
 */
export const enum NodeFlag {
    None = 0,
    Inline = 1,
    InlineContent = 2,
    Atom = 4,
    Doc = 8,
    NullParam = 16,
    Selectable = 32,
    CanBeEmpty = 64,
}
