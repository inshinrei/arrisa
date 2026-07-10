/**
 * Rebuild a document while applying a change set (slice tokens + mark mods).
 */
import {ValidationError} from "../util/error"
import {Node, Plot} from "../model/node"
import type {Schema} from "../schema/schema"
import {Pos} from "../model/pos"
import type {SliceWalker} from "../model/slice"
import {type Modification, applyModifications} from "./modification"

class BuildContext {
    children: Plot[] = []
    constructor(
        readonly tag: Plot.Tag,
        readonly parent: BuildContext | null,
    ) {}
}

class Builder implements Pos.Walker, SliceWalker {
    stack: BuildContext
    modifications: readonly Modification[] | null = null
    schema: Schema

    constructor(doc: Plot.Doc) {
        this.schema = doc.schema
        this.stack = new BuildContext(doc.tag, null)
    }

    add(node: Node) {
        if (this.modifications) {
            if (node.isPlot) throw new ValidationError("Invalid modification on non-leaf node")
            node = node.withMarks(applyModifications(this.modifications, node.marks, node.type))
        }
        node.pushTo(this.stack.children)
    }

    enterPlot(plot: Plot) {
        this.open(plot.tag)
    }

    leavePlot() {
        if (this.modifications) throw new ValidationError("Invalid modification on close token")
        if (!this.stack.parent) throw new ValidationError("Surplus close token after " + this.stack.children)
        let top = this.stack
        this.stack = this.stack.parent
        this.add(top.tag.create(top.children))
    }

    skip(node: Node) {
        this.add(node)
    }

    open(tag: Plot.Tag) {
        if (this.modifications) tag = tag.withMarks(applyModifications(this.modifications, tag.marks, tag.type))
        this.stack = new BuildContext(tag, this.stack)
    }

    close() {
        this.leavePlot()
    }

    node(node: Node) {
        this.skip(node)
    }

    finish() {
        if (this.stack.parent) throw new ValidationError("Invalid change")
        return this.schema.doc(this.stack.children)
    }
}

export {BuildContext, Builder}
