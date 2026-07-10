import type {Schema} from "../schema/schema"
import {ValidationError} from "../util/error"
import type {Node} from "./node/types"
import type {Leaf} from "./node/leaf"
import {Plot} from "./node/plot"
import {TextOutput} from "./node/text"
import {Token as TokenNS} from "./token"

/**
 * Stream tokens used by slices and change sets:
 * - **Open** — {@link Plot.Tag} enters a plot
 * - **Close** — {@link Token.End} leaves a plot
 * - **Node** — a full {@link Node} (leaf or closed plot)
 */
export type Token = Node | Plot.Tag | typeof TokenNS.End

export namespace Token {
    export import Type = TokenNS.Type
    export const End = TokenNS.End
}

/**
 * Contiguous open/node/close token sequence representing a document fragment
 * (possibly open on either side). Used by replace steps and HTML slice I/O.
 */
export class Slice {
    static empty = new Slice([])
    readonly length: number

    private constructor(readonly content: readonly Token[]) {
        this.length = content.reduce((l, e) => l + (e.tokenType == Token.Type.Node ? e.length : 1), 0)
    }

    static of(content: readonly Token[]) {
        return new Slice(content)
    }

    static fromJSON(schema: Schema, json: Slice.JSON) {
        if (!Array.isArray(json)) throw new ValidationError("Invalid slice JSON")
        return new Slice(
            json.map((value) => {
                if (value === ".") return Token.End
                if (!value || typeof value.type != "string") throw new ValidationError("Invalid slice JSON")
                let type = schema.getNode(value.type)
                return type?.isLeaf || "content" in value ? schema.nodeFromJSON(value) : schema.tagFromJSON(value)
            }),
        )
    }

    eq(other: Slice) {
        if (other.content.length != this.content.length) return false
        for (let i = 0; i < this.content.length; i++) {
            let a = this.content[i],
                b = other.content[i]
            if (a == Token.End) {
                if (b != Token.End) return false
            } else if (a.tokenType == Token.Type.Node) {
                if (!(b.tokenType == Token.Type.Node && (a as Node).eq(b as Node))) return false
            } else if (a.tokenType == Token.Type.Open) {
                if (!(b.tokenType == Token.Type.Open && (a as Plot.Tag).eq(b as Plot.Tag))) return false
            }
        }
        return true
    }

    run(track: SliceWalker, startPos = 0) {
        let pos = startPos
        for (let elt of this.content) {
            if (elt.tokenType == Token.Type.Open) track.open(elt as Plot.Tag, pos++)
            else if (elt.tokenType == Token.Type.Node) {
                track.node(elt as Node, pos)
                pos += (elt as Node).length
            } else track.close(pos++)
        }
    }

    slice(from: number, to = this.length) {
        if (from == to) return Slice.empty
        let result: Token[] = [],
            off = 0
        for (let elt of this.content) {
            let start = off
            off += elt.tokenType == Token.Type.Node ? (elt as Node).length : 1
            if (off <= from) continue
            if (start < from || off > to) {
                let inner = (elt as Node).sliceInner(
                    Math.max(0, from - start),
                    Math.min((elt as Plot).length, to - start),
                )
                for (let piece of inner.content) result.push(piece)
            } else {
                result.push(elt)
            }
            if (off >= to) break
        }
        return new Slice(result)
    }

    concat(other: Slice) {
        let content = this.content.slice()
        let i = 0
        if (
            content.length &&
            other.content.length &&
            other.content[0].tokenType == Token.Type.Node &&
            content[content.length - 1].tokenType == Token.Type.Node
        ) {
            ;(other.content[0] as Node).pushTo(content as Node[])
            i = 1
        }
        for (; i < other.content.length; i++) content.push(other.content[i])
        return new Slice(content)
    }

    textContent(
        options: {
            blockSeparator?: string
            leafText?: string | ((node: Leaf) => string)
        } = {},
    ) {
        let {blockSeparator = "\n", leafText} = options
        let out = new TextOutput(
            blockSeparator,
            leafText == null ? undefined : typeof leafText == "string" ? () => leafText : leafText,
        )
        for (let tok of this.content) {
            if (tok.tokenType == Token.Type.Open) {
                if ((tok as Plot.Tag).isTextblock) out.openBlock()
            } else if (tok.tokenType == Token.Type.Node) {
                let node = tok as Node
                if (node.isLeaf) out.serialize(node)
                else (node as Plot).iterate((n) => !out.serialize(n))
            }
        }
        return out.text
    }

    toString() {
        return `<${this.content.join()}>`
    }

    toJSON(): Slice.JSON {
        return this.content.map((e) => (e.tokenType == Token.Type.Close ? "." : (e as Node | Plot.Tag).toJSON()))
    }
}

export namespace Slice {
    export type JSON = readonly (Node.JSON | ".")[]
}

/** Callback interface for walking slice tokens in document order. */
export interface SliceWalker {
    node(node: Node, pos: number): void
    open(tag: Plot.Tag, pos: number): void
    close(pos: number): void
}
