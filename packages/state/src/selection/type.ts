/**
 * Registry entry for a selection kind: JSON tag, class, and (de)serializers.
 * Default types (`text`, `node`) are always present; extras come via
 * {@link EditorSelection.define}.
 */
import type {Plot} from "@arrisa/doc"
import type {EditorSelection} from "./base"

export class SelectionType {
    constructor(
        readonly tag: string,
        readonly cls: any,
        readonly toJSON: (sel: EditorSelection) => unknown,
        readonly fromJSON: (doc: Plot.Doc, json: any) => EditorSelection,
    ) {}
}
