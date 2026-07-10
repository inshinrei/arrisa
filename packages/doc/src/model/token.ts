/**
 * Slice / change-set stream tokens: open plot, close plot, or full node.
 * Kept in a dependency-free module so node types can reference token kinds
 * without importing {@link Slice}.
 */
export namespace Token {
    export enum Type {
        Open,
        Close,
        Node,
    }

    /** Close-plot sentinel shared as {@link Plot.End}. */
    export const End = {
        tokenType: Type.Close as Type.Close,
        toString() {
            return "[end]"
        },
    }
}

export type TokenEnd = typeof Token.End
