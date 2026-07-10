/** Bit flags describing tile role, sync state, and decoration placement. */
export const enum TileFlag {
    None = 0,
    /** Inner DOM shell of a document node (not the outer node tile). */
    NodeInner = 1,
    /** Holds document content (plot / textblock content hole). */
    PlotContent = 2,
    /** Mark/wrapper that may span across sibling content. */
    Spanning = 4,
    /** Non-node wrapper (marks, decoration wrappers). */
    Wrapper = 8,
    /** Widget / point decoration at a position. */
    Point = 16,
    PointBefore = 32,
    PointAfter = 64,
    PointSide = PointBefore | PointAfter,
    /** Text tile currently hosting IME composition. */
    Composition = 128,
    /** Length and DOM children are up to date. */
    Synced = 256,
    /** Leaf-like node with no open content hole. */
    Atom = 512,
    HasContent = 1024,
    /** Child sits after the content hole in a multi-child shape. */
    AfterContent = 2048,
    /** Shape has siblings after the content hole. */
    ContentNotLast = 4096,
    /** DOM attributes or content may be stale. */
    Dirty = 8192,
}

/** How an old tile was reused during a content update. */
export const enum Reused {
    /** Tile instance and DOM fully reused. */
    Full = 1,
    /** Only the DOM node reused (new tile wrapper). */
    DOM = 2,
}
