import {none, validate} from "../util/utils"
import {SchemaError, ValidationError} from "../util/error"
import {Node, Leaf, Plot, BaseTag, BaseType} from "../model/node"
import {Mark} from "../model/mark"
import type {Doc} from "../model/node/doc"

/**
 * A schema is a collection of node and mark types, including exactly
 * one document type, plus an optional set of {@link Schema.Override
 * overrides} that modify the relations between those elements. It
 * determines what kind of elements may occur in documents that
 * follow this schema, and where they can show up.
 */
export class Schema {
    private nodesByName: {[name: string]: Node.Type} = Object.create(null)
    private marksByName: {[name: string]: Mark.Type} = Object.create(null)
    private wrappingCache: {[key: string]: readonly Plot.Tag[] | null} = Object.create(null)
    private validated: WeakSet<Node> = new WeakSet()

    private constructor(
        readonly elements: readonly Schema.Element[],
        readonly nodes: readonly Node.Type[],
        readonly marks: readonly Mark.Type[],
        private plotContent: Map<Plot.Type, Node.Query>,
        private markTarget: Map<Mark.Type, Node.Query>,
        private nodeGroup: Map<Node.Type, Set<Node.Group>>,
        readonly docTag: Plot.Tag<null>,
        readonly lineBreak: Leaf | null,
    ) {
        for (let tag of nodes) this.nodesByName[tag.name] = tag
        for (let mark of marks) this.marksByName[mark.name] = mark
    }

    /**
     * Build (or reuse a cached) schema from element specs.
     * Validates content consistency (inline/block child mix, emptyability).
     */
    static define(spec: readonly Schema.Element[]) {
        let cached = findCachedSchema(spec)
        if (cached) return cached

        let tags: Node.Type[] = [Leaf.Text],
            marks: Mark.Type[] = []
        let defaultI = 0
        let tagNames: Set<string> = new Set(),
            markNames: Set<string> = new Set()
        let plotContent = new Map<Plot.Type, Node.Query>()
        let markTarget = new Map<Mark.Type, Node.Query>()
        let nodeGroup = new Map<Node.Type, Set<Node.Group>>()
        nodeGroup.set(Leaf.Text, new Set([Node.Group.Inline, Node.Group.Leaf, Node.Group.All]))
        let overrides: Schema.Override[] = spec.filter((e) => e instanceof Schema.Override).reverse()
        let elements: (Node.Type | Mark.Type | Schema.Override)[] = []

        for (let e of spec) {
            let elt = normalizeElt(e)
            elements.push(elt)
            if (elt instanceof Plot.Type || elt instanceof Leaf.Type) {
                if (tags.includes(elt)) continue
                if (tagNames.has(elt.name)) throw new SchemaError(`Duplicate use of tag name ${elt.name} in schema`)
                tagNames.add(elt.name)
                if (elt.isPlot) {
                    let content =
                        elt.spec.inlineContent === true
                            ? Node.Group.Inline
                            : elt.spec.inlineContent || elt.spec.blockContent!
                    for (let o of overrides) if (o.type == elt && o.content) content = o.content(content)
                    plotContent.set(elt, content)
                }
                if (elt.isPlot && elt.spec.defaultBlock) tags.splice(defaultI++, 0, elt)
                else tags.push(elt)

                let groups = new Set<Node.Group>()
                groups.add(Node.Group.All)
                groups.add(elt.isInline ? Node.Group.Inline : Node.Group.Block)
                groups.add(elt.isLeaf ? Node.Group.Leaf : Node.Group.Plot)
                if (elt.isPlot && elt.isBlock && elt.inlineContent) groups.add(Node.Group.Textblock)
                let given = elt.spec.group instanceof Node.Group ? [elt.spec.group] : elt.spec.group
                for (let o of overrides) if (o.type == elt && o.group) given = o.group
                if (given)
                    for (let g of given)
                        for (let cur: Node.Group | undefined = g; cur; cur = cur.parent) {
                            if (!Node.Group.builtin.includes(cur)) groups.add(cur)
                        }
                nodeGroup.set(elt, groups)
            } else if (elt instanceof Mark.Type) {
                if (marks.includes(elt)) continue
                if (markNames.has(elt.name)) throw new SchemaError(`Duplicate use of mark name ${elt.name} in schema`)
                let target = elt.spec.target || {and: [Node.Group.Inline, Node.Group.Leaf]}
                for (let o of overrides) if (o.type == elt && o.target) target = o.target(target)
                markTarget.set(elt, target)
                markNames.add(elt.name)
                marks.push(elt)
            } else if (!(elt instanceof Schema.Override)) {
                throw new SchemaError(
                    "Unexpected schema element type. You may have multiple versions of @arrisa/doc loaded",
                )
            }
        }
        let docType: Plot.Type<null> | null = null
        let lineBreak: Leaf | null = null
        for (let tag of tags) {
            if (tag.isLeaf) {
                if (tag.hasRole(Node.Role.LineBreak)) {
                    if (tag.isBlock || !tag.default)
                        throw new SchemaError("Line break tags must be inline leaves with a default param")
                    if (lineBreak) throw new SchemaError("Multiple line break tags provided")
                    lineBreak = tag.default as Leaf
                }
            } else {
                if (tag.isDoc) {
                    if (docType) throw new SchemaError("Multiple document types specified")
                    docType = tag as Plot.Type<null>
                }
            }
        }
        if (!docType) throw new SchemaError("A schema must define a document type")
        let schema = new Schema(
            elements,
            tags,
            marks,
            plotContent,
            markTarget,
            nodeGroup,
            docType.default!,
            lineBreak as Leaf | null,
        )
        for (let tag of tags)
            if (tag.isPlot) {
                let sawDefaultable = false
                for (let child of tags)
                    if (schema.canContain(tag, child)) {
                        if (child.default) sawDefaultable = true
                        if (child.isInline != tag.inlineContent)
                            throw new SchemaError(
                                `Node type ${tag.name} has ${
                                    tag.inlineContent ? "block" : "inline"
                                } content, but allows ${child.name} as a child`,
                            )
                    }
                if (!tag.canBeEmpty && !sawDefaultable)
                    throw new SchemaError(
                        `Node ${tag.name} has required content, but all possible children require non-default parameters`,
                    )
            }
        schemaCache.set(spec, new WeakRef(schema))
        return schema
    }

    /** Create a document with this schema's doc tag. */
    doc(children: readonly Node[]): Doc {
        return Plot.Doc.new(this, children)
    }

    /** Deep-validate structure and mark targets; results are memoized per node. */
    validate(node: Node) {
        if (this.validated.has(node)) return
        if (node.isLeaf) {
            this.validateTag(node)
        } else {
            this.validateTag(node.tag)
            if (!node.type.canBeEmpty && node.content.length == 0)
                throw new ValidationError(`Node ${node.name} with block content may not be empty`)
            for (let ch of node.content) {
                if (!this.canContain(node.type, ch.type) || node.inlineContent != ch.type.isInline)
                    throw new ValidationError(`Node type ${node.name} cannot contain child ${ch.name}`)
                this.validate(ch)
            }
        }
        this.validated.add(node)
    }

    validateTag(tag: Node | Plot.Tag) {
        if (this.nodesByName[tag.name] != tag.type) throw new ValidationError(`Tag type ${tag.name} not in schema`)
        for (let mark of tag.marks) this.validateMark(mark, tag.type)
    }

    validateMark(mark: Mark<any>, node: Node.Type) {
        if (this.marksByName[mark.name] != mark.type) throw new ValidationError(`Mark type ${mark.name} not in schema`)
        if (!this.markAllowed(mark.type, node))
            throw new ValidationError(`Mark type ${mark.name} cannot target node ${node.name}`)
    }

    has(elt: Mark<any> | Mark.Type | Node.Type.Ref<any>) {
        if (elt instanceof Mark || elt instanceof BaseTag) elt = elt.type
        return (elt instanceof Mark.Type ? this.marksByName : this.nodesByName)[elt.name] == elt
    }

    matchNode(node: Node.Type, q: Node.Query): boolean {
        if (q instanceof Node.Group) {
            let groups = this.nodeGroup.get(node)
            return groups ? groups.has(q) : false
        }
        if (q instanceof BaseType) return q == node
        if (q instanceof BaseTag) return q.type == node
        if ("and" in q) return q.and.every((sub) => this.matchNode(node, sub))
        return (q as readonly Node.Query[]).some((sub) => this.matchNode(node, sub))
    }

    markAllowed(mark: Mark.Type, node: Node.Type) {
        let target = this.markTarget.get(mark)
        return target ? this.matchNode(node, target) : false
    }

    sharesContent(a: Plot.Type, b: Plot.Type) {
        for (let tp of this.nodes) if (this.canContain(a, tp) && this.canContain(b, tp)) return true
        return false
    }

    withMarksFrom<T extends Node.Tag>(from: Node.Tag, to: T): T {
        if (!from.marks.length) return to
        let marks = to.marks
        for (let mark of from.marks)
            if (this.markAllowed(mark.type, to.type) && (mark.type.set || !mark.isInSet(marks))) {
                let {keepOnTypeChange} = mark.type.spec
                if (keepOnTypeChange && (keepOnTypeChange === true || keepOnTypeChange(from, to)))
                    marks = mark.addToSet(marks)
            }
        return to.withMarks(marks) as T
    }

    canContain(parent: Plot.Type, child: Node.Type) {
        if (child.isPlot && child.isDoc) return false
        let content = this.plotContent.get(parent)
        return content ? this.matchNode(child, content) : false
    }

    defaultContentTag(parent: Plot.Type): Node.Tag | null {
        for (let tag of this.nodes) if (tag.default && this.canContain(parent, tag)) return tag.default
        return null
    }

    defaultContentPlot(parent: Plot.Type): Plot.Tag | null {
        for (let tag of this.nodes) if (tag.default && tag.isPlot && this.canContain(parent, tag)) return tag.default
        return null
    }

    createDefault(parent: Plot.Type): Node {
        let child = this.defaultContentTag(parent)
        if (!child) throw new Error(`No defaultable child node for ${parent.name}`)
        return this.createAndFill(child)
    }

    createAndFill(parent: Node.Tag): Node {
        if (parent.isLeaf) return parent
        return parent.create(parent.type.canBeEmpty ? [] : [this.createDefault(parent.type)])
    }

    /**
     * BFS for a wrapper path of default plot tags so `child` can sit under `parent`.
     * Cached by type-name pair.
     */
    findWrapping(parent: Plot.Type, child: Node.Type): readonly Plot.Tag[] | null {
        let key = `${parent.name}-${child.name}`,
            cached = this.wrappingCache[key]
        if (cached !== undefined) return cached
        return (this.wrappingCache[key] = this.findWrappingInner(parent, child))
    }

    getMark(name: string): Mark.Type | undefined {
        return this.marksByName[name]
    }

    getNode(name: string): Node.Type | undefined {
        return this.nodesByName[name]
    }

    nodeFromJSON(json: Node.JSON): Node {
        let tag = this.tagFromJSON(json),
            children = none as readonly Node[]
        if (tag.isLeaf) return tag
        if (json.content && Array.isArray(json.content)) children = json.content.map((c) => this.nodeFromJSON(c))
        if (tag.type.isDoc) return this.doc(children)
        return tag.create(children)
    }

    tagFromJSON(json: Node.JSON) {
        if (!json || typeof json != "object" || !(json.type in this.nodesByName))
            throw new ValidationError("Invalid tag JSON")
        let type = this.nodesByName[json.type]
        let marks = json.marks ? this.marksFromJSON(json.marks) : none
        let tag =
            "param" in json
                ? type.of(validate(type.spec.validate, json.param), marks)
                : !type.default
                  ? null
                  : marks.length
                    ? type.of(type.default.param, marks)
                    : type.default
        if (!tag) throw new ValidationError(`Missing param for tag type ${type.name}`)
        return tag
    }

    marksFromJSON(json: Record<string, any>): Mark.Set {
        if (!json || typeof json != "object") throw new ValidationError("Invalid mark JSON")
        let marks = none as Mark.Set
        for (let name in json) {
            let mark = this.marksByName[name]
            if (!mark) throw new ValidationError(`Unrecognized mark ${name} in JSON`)
            marks = mark.of(validate(mark.spec.validate, json[name])).addToSet(marks)
        }
        return marks
    }

    docFromJSON(json: Node.JSON) {
        if (!json || json.type != this.docTag.name) throw new ValidationError("Invalid document JSON")
        return this.nodeFromJSON(json) as Doc
    }

    private findWrappingInner(parent: Plot.Type, child: Node.Type): readonly Plot.Tag[] | null {
        let seen: Set<Node.Type> = new Set(),
            work: Plot.Tag[][] = [[]]
        for (let i = 0; i < work.length; i++) {
            let path = work[i],
                at = path.length ? path[path.length - 1].type : parent
            for (let tag of this.nodes)
                if (this.canContain(at, tag)) {
                    if (tag == child) return path
                    if (!seen.has(tag) && !tag.isLeaf && tag.default) {
                        seen.add(tag)
                        work.push(path.concat(tag.default as Plot.Tag))
                    }
                }
        }
        return null
    }
}

const schemaCache = new Map<readonly Schema.Element[], WeakRef<Schema>>()

function findCachedSchema(spec: readonly Schema.Element[]) {
    search: for (let [elts, ref] of schemaCache) {
        let active = ref.deref()
        if (!active) {
            schemaCache.delete(elts)
        } else if (elts.length == spec.length) {
            for (let i = 0; i < spec.length; i++) {
                let a = normalizeElt(spec[i]),
                    b = normalizeElt(elts[i])
                if (a != b && !(a instanceof Schema.Override && b instanceof Schema.Override && a.eq(b)))
                    continue search
            }
            return active
        }
    }
}

function normalizeElt(elt: Schema.Element): Node.Type | Mark.Type | Schema.Override {
    return elt instanceof Plot.Tag || elt instanceof Leaf || elt instanceof Mark ? elt.type : (elt as any)
}

export namespace Schema {
    export type Element = Node.Tag | Node.Type | Mark | Mark.Type | Schema.Override

    /** Schema-level override of mark targets, plot content, or node groups. */
    export class Override {
        declare tag: "schema.override"

        private constructor(
            readonly type: Mark.Type | Node.Type,
            readonly target?: (query: Node.Query) => Node.Query,
            readonly content?: (query: Node.Query) => Node.Query,
            readonly group?: readonly Node.Group[],
        ) {}

        static markTarget(mark: Mark.Type | Mark, target: Node.Query | ((target: Node.Query) => Node.Query)) {
            return new Schema.Override(
                mark instanceof Mark.Type ? mark : mark.type,
                typeof target == "function" ? target : () => target,
            )
        }

        static plotContent(plot: Plot.Type | Plot.Tag, content: Node.Query | ((content: Node.Query) => Node.Query)) {
            return new Schema.Override(
                plot instanceof Plot.Tag ? plot.type : plot,
                undefined,
                typeof content == "function" ? content : () => content,
            )
        }

        static nodeGroup(node: Node.Type | Node.Tag, group: Node.Group | readonly Node.Group[]) {
            return new Schema.Override(
                node instanceof BaseTag ? node.type : (node as Node.Type),
                undefined,
                undefined,
                group instanceof Node.Group ? [group] : group,
            )
        }

        eq(other: Schema.Override) {
            return (
                this == other ||
                (this.type == other.type &&
                    this.target == other.target &&
                    this.content == other.content &&
                    this.group == other.group)
            )
        }
    }
}
