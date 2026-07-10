/**
 * Structure-fitting for change sets: repair open structure after concurrent /
 * open replaces, and fit replacement/deletion ranges to valid parent context.
 */
import {Node, Plot} from "../model/node"
import {Pos} from "../model/pos"
import {Slice, Token} from "../model/slice"
import type {Schema} from "../schema/schema"
import {BuildContext} from "./builder"
import {ChangeSet} from "./change"
import type {SectionData} from "./sections"
import {addSection} from "./sections"

const enum FitFlag {
    None = 0,
    NeedsChild = 1,
    Synthetic = 2,
}

class FitLevel {
    flags = FitFlag.None

    constructor(
        readonly tag: Plot.Tag,
        readonly next: FitLevel | null,
    ) {
        if (!this.tag.type.canBeEmpty) this.flags |= FitFlag.NeedsChild
    }
}

const counter = {
    count: 0,
    skip() {},
    enterPlot() {
        this.count++
    },
    leavePlot() {
        this.count--
    },
    countDelta(pos: Pos, distance: number) {
        this.count = 0
        return pos.advance(distance, this)
    },
}

export class ChangeFitter implements Pos.Walker {
    stack: FitLevel
    inputPos: Pos
    delInputPos: Pos
    pos = 0
    patches: {from: number; to: number; insert: Token[]}[] = []
    stackDelta = 0
    inputDelta = 0
    inserting = false
    activeContext: Pos | null = null
    activeContextPos = -1
    nextSync = -1
    schema: Schema
    lastCoverFrom = -1
    lastCoverTo = -1
    doubleDeleteDelta = 0

    constructor(
        doc: Plot.Doc,
        readonly local: boolean,
    ) {
        this.schema = doc.schema
        this.stack = new FitLevel(doc.tag, null)
        this.inputPos = this.delInputPos = doc.resolve(0)
    }

    getPos(at: number) {
        let {inputPos, delInputPos} = this
        if (inputPos.pos == at) return inputPos
        if (delInputPos.pos == at) return delInputPos
        return inputPos.advance(at - inputPos.pos)
    }

    preserved(from: number, to: number) {
        let {nextSync} = this
        if (nextSync >= from && nextSync <= to) {
            this.stackDelta = 0
            this.nextSync = -1
            if (nextSync > from) this.preserved(from, nextSync)
            this.syncToContext(this.inputPos)
            if (to > nextSync) this.preserved(nextSync, to)
            return
        }

        let inputPos = this.getPos(from)
        if (!this.inputDelta && this.stackDelta) {
            this.syncToContext(inputPos)
            this.stackDelta = 0
        }
        this.activeContext = inputPos
        this.activeContextPos = this.pos
        this.inputPos = inputPos.advance(to - from, this)
    }

    replaced(slice: Slice, from: number, to: number, covering = false) {
        this.doubleDeleteDelta = 0
        if (covering) {
            this.lastCoverFrom = from
            this.lastCoverTo = to
        } else if (slice.length) {
            let overlapFrom = Math.max(from, this.lastCoverFrom)
            let overlapTo = Math.min(to, this.lastCoverTo)
            if (overlapFrom < overlapTo) {
                counter.countDelta(this.getPos(overlapFrom), overlapTo - overlapFrom)
                this.doubleDeleteDelta = counter.count
            }
        }
        if (from != to) {
            this.delInputPos = counter.countDelta(this.getPos(from), to - from)
            this.inputDelta -= counter.count
        }
        this.inserting = true
        slice.run(this, this.pos)
        this.inserting = false

        if (this.local) this.nextSync = Math.max(this.nextSync, localSyncPosAfter((this.inputPos = this.getPos(to))))
    }

    fit(tag: Node.Tag) {
        if (this.schema.canContain(this.stack.tag.type, tag.type)) return true
        let fix: {leave: number; enter: readonly Plot.Tag[]; cost: number; context: boolean} | null = null
        let dDelta = this.stackDelta - this.inputDelta
        for (let level: FitLevel | null = this.stack, leave = 0, leaveCost = 0; level; level = level.next, leave++) {
            if (fix && leaveCost > fix.cost) break
            let enter = this.schema.findWrapping(level.tag.type, tag.type)
            if (enter) {
                let cost = leaveCost + enter.length * 2 - Math.max(0, Math.min(-dDelta, enter.length))
                if (!fix || (fix.cost > cost && !fix.context)) fix = {leave, enter, cost, context: false}
            }
            if (this.activeContextPos == this.pos) {
                let top = this.activeContext?.parent || null
                for (let cx = top, i = 1; cx; cx = cx.parent, i++) {
                    if (this.schema.canContain(level.tag.type, cx.node.type)) {
                        let cost = leaveCost + i * 2 - Math.max(0, Math.min(-dDelta, i))
                        if (!fix || fix.cost > cost || !fix.context) {
                            let enter: Plot.Tag[] = []
                            for (let scan = top; ; scan = scan!.parent) {
                                enter.unshift(scan!.node.tag)
                                if (scan == cx) break
                            }
                            fix = {leave, enter, cost, context: true}
                        }
                        break
                    }
                }
            }
            leaveCost += level.flags & FitFlag.Synthetic ? 0 : dDelta > leave ? 1 : 2
        }
        if (!fix) return false
        for (let i = 0; i < fix.leave; i++) {
            this.insertClose()
            this.stackDelta--
        }
        for (let wrapper of fix.enter) {
            this.patch(0, wrapper)
            this.stack.flags &= ~FitFlag.NeedsChild
            this.stack = new FitLevel(wrapper, this.stack)
            this.stack.flags |= FitFlag.Synthetic
            this.stackDelta++
        }
        return true
    }

    syncToContext(context: Pos) {
        let cur = [],
            sync = []
        for (let l = this.stack as FitLevel | null; l; l = l.next) cur.push(l)
        cur.reverse()
        for (let level: Pos.Plot | null = context.parent; level; level = level.parent) sync.push(level.node.tag)
        sync.reverse()
        while (cur.length > sync.length) {
            this.insertClose()
            cur.pop()
        }
        for (let d = 1; d < Math.min(sync.length, cur.length); d++) {
            if (!this.schema.sharesContent(sync[d].type, cur[d].tag.type)) {
                while (cur.length > d) {
                    this.insertClose()
                    cur.pop()
                }
                break
            }
        }
        for (let i = cur.length; i < sync.length; i++) {
            let tag = sync[i]
            this.stack = new FitLevel(tag, this.stack)
            this.patch(0, tag)
        }
    }

    insertClose() {
        if (this.stack.flags & FitFlag.NeedsChild)
            this.patch(0, this.schema.createDefault(this.stack.tag.type), Plot.End)
        else this.patch(0, Plot.End)
        this.stack = this.stack.next!
    }

    patch(length: number, ...insert: Token[]) {
        let prev = this.patches.length ? this.patches[this.patches.length - 1] : null
        if (prev && prev.to == this.pos) {
            prev.to += length
            for (let tok of insert) prev.insert.push(tok)
        } else {
            this.patches.push({from: this.pos, to: this.pos + length, insert})
        }
    }

    open(tag: Plot.Tag) {
        this.enter(tag)
    }
    close() {
        this.leavePlot()
    }
    node(node: Node) {
        this.skip(node)
    }

    skip(node: Node) {
        if (this.fit(node.tag)) this.stack.flags &= ~FitFlag.NeedsChild
        else this.patch(node.length)
        this.pos += node.length
    }

    enterPlot(node: Plot) {
        this.enter(node.tag)
    }

    enter(tag: Plot.Tag) {
        if (this.inserting) this.inputDelta++
        if (this.doubleDeleteDelta > 0) {
            this.doubleDeleteDelta--
            this.patch(1)
        } else if (this.fit(tag)) {
            this.stack.flags &= ~FitFlag.NeedsChild
            this.stack = new FitLevel(tag, this.stack)
            if (this.inserting) this.stackDelta++
        } else {
            this.patch(1)
        }
        this.pos++
    }

    leavePlot() {
        if (this.inserting) this.inputDelta--
        if (this.doubleDeleteDelta < 0) {
            this.doubleDeleteDelta++
            this.patch(1)
        } else if (this.stack.next) {
            if (this.stack.flags & FitFlag.NeedsChild) this.patch(0, this.schema.createDefault(this.stack.tag.type))
            this.stack = this.stack.next
            if (this.inserting) this.stackDelta++
        } else {
            this.patch(1)
        }
        this.pos++
    }

    finish(): ChangeSet | null {
        while (this.stack.next || (this.stack.flags && FitFlag.NeedsChild)) {
            if (this.stack.flags & FitFlag.NeedsChild) {
                this.patch(0, this.schema.createDefault(this.stack.tag.type))
                this.stack.flags &= ~FitFlag.NeedsChild
            } else {
                this.patch(0, Plot.End)
                this.stack = this.stack.next!
            }
        }
        if (!this.patches.length) return null
        let sections: number[] = [],
            data: SectionData[] = [],
            pos = 0
        for (let {from, to, insert} of this.patches) {
            addSection(sections, data, from - pos, -1, null)
            let slice = Slice.of(insert)
            addSection(sections, data, to - from, slice.length, slice)
            pos = to
        }
        addSection(sections, data, this.pos - pos, -1, null)
        return ChangeSet.new(sections, data)
    }
}

function localSyncPosAfter(pos: Pos) {
    let found = pos.pos
    for (let cx = pos.parent, index = pos.index; ; index = cx.index, cx = cx.parent) {
        if (!cx.parent || (!cx.node.inlineContent && index != cx.node.content.length - 1)) break
        found = cx.after
    }
    return found
}

function finishCx(cx: BuildContext, schema: Schema) {
    return cx.tag.create(
        cx.children.length || cx.tag.type.canBeEmpty ? cx.children : [schema.createDefault(cx.tag.type)],
    )
}

function closeSlice(schema: Schema, slice: Slice, context: readonly Plot.Tag[], depth: number, closeEnd = false) {
    let top: Token[] = [],
        stack: BuildContext | null = null
    for (let i = depth - 1; i >= 0; i--) stack = new BuildContext(context[i], stack)
    for (let token of slice.content) {
        if (token.tokenType == Token.Type.Close) {
            if (stack) {
                let node = finishCx(stack, schema)
                stack = stack.parent
                ;(stack ? stack.children : top).push(node)
            } else {
                top.push(token)
            }
        } else if (token.tokenType == Token.Type.Open) {
            stack = new BuildContext(token, stack)
        } else {
            ;(stack ? stack.children : top).push(token)
        }
    }
    if (closeEnd)
        while (stack) {
            let node = finishCx(stack, schema)
            stack = stack.parent
            ;(stack ? stack.children : top).push(node)
        }
    if (stack) splatContext(top, stack)
    return Slice.of(top)
}

function splatContext(top: Token[], cx: BuildContext) {
    if (cx.parent) splatContext(top, cx.parent)
    top.push(cx.tag)
    for (let ch of cx.children) top.push(ch)
}


// ---------------------------------------------------------------------------
// Fit replace/delete ranges to valid parent context (isolating / defining)
// ---------------------------------------------------------------------------
export function fitReplacement(doc: Plot.Doc, from: Pos, to: Pos, slice: Slice, context: readonly Plot.Tag[]) {
    if (!slice.length) return fitDeletion(doc, from, to)

    let preferredContext = -1
    for (let i = 0; i < context.length; i++) {
        let next = context[i]
        if (next.type.defining) preferredContext = i
        else if (!next.isTextblock) break
    }
    let firstType = null,
        closeCount = 0
    for (let i = 0, opened = 0; i < slice.content.length; i++) {
        let tok = slice.content[i]
        if (tok.tokenType == Token.Type.Close) {
            if (opened) opened--
            else closeCount++
        } else {
            if (!i) firstType = tok.type
            if (tok.tokenType == Token.Type.Open) opened++
        }
    }

    let found: {from: number; to: number; slice: Slice} | undefined,
        foundCost = 1e8
    let neutral = true,
        toEnd = true
    scan: for (
        let cxFrom = from.parent,
            cxTo = to.parent,
            fromDepth = from.depth,
            toDepth = to.depth,
            start = from.pos,
            end = to.pos;
        cxFrom.parent;
        cxFrom = cxFrom.parent, start--, fromDepth--
    ) {
        if (cxFrom.start != start || cxFrom.node.type.isolating) break
        while (toDepth > fromDepth) {
            if (cxTo.node.type.isolating) break scan
            cxTo = cxTo.parent!
            toDepth--
            end++
        }
        if (cxTo.end != end) {
            if (!closeCount) break
            toEnd = false
        }
        if (!cxFrom.node.type.neutral) neutral = false
        if (fromDepth == toDepth)
            for (let i = -1, type; i < context.length; i++) {
                if (i >= 0) type = context[i].type
                else if (!firstType) continue
                else type = firstType
                if (doc.schema.canContain(cxFrom.parent.node.type, type)) {
                    let cost =
                        (neutral ? 0 : 2) +
                        (i < preferredContext ? context.length - i : i - preferredContext) +
                        (toEnd ? 0 : 1e7)
                    if (foundCost > cost) {
                        found = {
                            from: cxFrom.before,
                            to: toEnd ? cxTo.after : to.pos,
                            slice: i >= 0 ? closeSlice(doc.schema, slice, context, i + 1, toEnd) : slice,
                        }
                        foundCost = cost
                    }
                }
            }
    }
    if (found) return found

    if (from.pos == to.pos && !from.inText) {
        let cx: Pos.Plot = from.parent,
            before = from.pos,
            after = from.pos
        for (
            ;
            cx.parent && !cx.node.type.isolating && (before == cx.start || after == cx.end);
            cx = cx.parent, before--, after++
        ) {
            for (let i = -1; i < context.length; i++) {
                let type = i >= 0 ? context[i].type : firstType
                if (!type) continue
                if (doc.schema.canContain(cx.parent.node.type, type)) {
                    let pos = before == cx.start ? cx.before : cx.after
                    return {
                        from: pos,
                        to: pos,
                        slice: i >= 0 ? closeSlice(doc.schema, slice, context, i + 1, true) : slice,
                    }
                }
            }
        }
    }

    for (let i = 0; i < context.length; i++) {
        if (doc.schema.canContain(from.parent.node.type, context[i].type)) {
            slice = closeSlice(doc.schema, slice, context, i + 1, true)
            break
        }
    }
    return {from: from.pos, to: to.pos, slice}
}

export function fitDeletion(doc: Plot.Doc, from: Pos, to: Pos) {
    let toDepth = to.depth
    let covered: {from: number; to: number; slice: Slice} | undefined
    for (
        let cx = from.parent, cxTo = to.parent, depth = from.depth, start = from.pos, end = to.pos;
        cx.parent;
        start--, cx = cx.parent, depth--
    ) {
        if (cx.start != start || cx.node.type.isolating) break
        while (toDepth > depth) {
            cxTo = cxTo.parent!
            toDepth--
            end++
        }
        let toAtEnd = toDepth == depth && cxTo.end == end
        if (cx.end < to.pos && cx.parent.end > to.pos && !toAtEnd)
            return {from: cx.before, to: to.pos, slice: Slice.empty}
        if (
            !cx.node.inlineContent &&
            toAtEnd &&
            cx.parent.start == cxTo.parent!.start &&
            !(from.parent.start == to.parent.start && from.parent.node.inlineContent)
        )
            covered = {from: cx.before, to: cxTo.after, slice: Slice.empty}
    }
    return covered || {from: from.pos, to: to.pos, slice: Slice.empty}
}

