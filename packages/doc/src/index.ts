/**
 * @arrisa/doc — document model, schema, changes, and HTML I/O.
 *
 * Layering: util → shape → model → schema → change / html.
 */
export {Node, Leaf, Plot} from "./model/node"
export {Mark} from "./model/mark"

// Shape is a type-only namespace (erased at runtime). Re-export as type so Vite/ESM
// does not fail looking for a value named Shape.
export type {Shape} from "./shape/shape"
export {Elt, Attributes, NodeShape, isSafeAttributeName} from "./shape/shape"

export {Schema} from "./schema/schema"
export {SchemaError, ValidationError} from "./util/error"

export {ChangeSet} from "./change/change"
export {Slice, Token} from "./model/slice"

export {Pos} from "./model/pos"

export {parse} from "./html/parse"
export {serialize} from "./html/serialize"
