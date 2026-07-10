import {EditorState, Transaction} from "@arrisa/state"
import {ChangeSet, Node, Leaf, Plot, Pos} from "@arrisa/doc"
import {findWrappable, wrapBlockRange, autoJoinBlocks} from "@arrisa/command"

/**
 * Auto-replace rules that run after user typing (`input.type`).
 *
 * Rules register via {@link InputRule.define} as a facet + a shared transaction
 * appender. After each typed update, the text before the cursor is matched
 * against each rule's end-anchored regex; the first successful apply wins.
 *
 * - `lookahead` — optional match against text *after* the cursor (e.g. require
 *   end-of-block with `/^$/`).
 * - `inCode` — when false (default), rules skip code-role textblocks and
 *   in-code ranges.
 *
 * Isolation annotations use a local stub until `@arrisa/history` is wired as a
 * dependency. Real history uses `history.isolate` with `"before" | "after" |
 * "full"`; boolean `true` here only marks the annotation slot.
 */

const inputRule = EditorState.Facet.define<InputRule>()

/** Stand-in for `@arrisa/history`'s isolate annotation (not yet a dep of editor). */
const history = {
    isolate: Transaction.Annotation.define<boolean>(),
}

const appender = Transaction.appender.of((trs, state) => applyInputRules(trs, state))

export class InputRule {
    extension: EditorState.Extension

    lookahead: RegExp | undefined

    inCode: boolean

    private constructor(
        readonly expr: RegExp,

        readonly apply: (state: EditorState, match: InputRule.MatchArray) => Transaction.Spec | null,
        spec: InputRule.Spec,
    ) {
        this.lookahead = spec.lookahead
        this.inCode = !!spec.inCode
        this.extension = [inputRule.of(this), appender]
    }

    static define(spec: InputRule.Spec) {
        return new InputRule(
            ensureAnchor(spec.expr),
            typeof spec.apply == "string" ? applyString(spec.apply) : spec.apply,
            spec,
        )
    }

    static wrapping(expr: RegExp, tag: Plot.Tag | ((match: InputRule.MatchArray) => Plot.Tag), empty = false) {
        return InputRule.define({
            expr,
            apply: (state, match) => {
                let wrapper = typeof tag == "function" ? tag(match) : tag
                let {from, to} = match[0]
                let changes: ChangeSet.Spec[] = [{from: from.pos, to: to.pos}]
                let range = findWrappable(from, from, wrapper)
                if (!range) return null
                changes.push(wrapBlockRange(range, wrapper))
                return autoJoinBlocks(state, {
                    changes,
                    annotations: history.isolate.of(true),
                })
            },
            lookahead: empty ? /^$/ : undefined,
        })
    }

    static textblockType(expr: RegExp, tag: Plot.Tag | ((match: InputRule.MatchArray) => Plot.Tag), empty = false) {
        return InputRule.define({
            expr,
            apply: (state, match) => {
                let {from, to} = match[0]
                let block = typeof tag == "function" ? tag(match) : tag
                let outer = from.parent.parent
                if (!outer || !state.schema.canContain(outer.node.type, block.type)) return null
                return {
                    changes: [{from: from.pos - 1, to: to.pos, insert: [block]}],
                    annotations: history.isolate.of(true),
                }
            },
            lookahead: empty ? /^$/ : undefined,
        })
    }
}

export namespace InputRule {
    export interface Spec {
        expr: RegExp

        apply: ((state: EditorState, match: InputRule.MatchArray) => Transaction.Spec | null) | string

        lookahead?: RegExp

        inCode?: boolean
    }

    export type Match = {from: Pos; to: Pos; text: string}

    export type MatchArray = readonly (InputRule.Match | null)[] & {0: InputRule.Match}

    export const emDash = InputRule.define({expr: /--$/, apply: "—"})

    export const ellipsis = InputRule.define({expr: /\.\.\.$/, apply: "…"})

    export const openDoubleQuote = InputRule.define({expr: /(?:^|[\s\{\[\(\<'"\u2018\u201C])(")$/, apply: "“"})

    export const closeDoubleQuote = InputRule.define({expr: /"$/, apply: "”"})

    export const openSingleQuote = InputRule.define({expr: /(?:^|[\s\{\[\(\<'"\u2018\u201C])(')$/, apply: "‘"})

    export const closeSingleQuote = InputRule.define({expr: /'$/, apply: "’"})

    export const smartQuotes: readonly InputRule[] = [
        openDoubleQuote,
        closeDoubleQuote,
        openSingleQuote,
        closeSingleQuote,
    ]
}

/** Ensure `expr` is end-anchored and has the `d` (indices) flag when possible. */
export function ensureAnchor(regexp: RegExp) {
    let needsIndex = (regexp as any).hasIndices === false,
        needsAnchor = !/\$$/.test(regexp.source)
    if (!needsIndex && !needsAnchor) return regexp
    return new RegExp(
        needsAnchor ? "(?:" + regexp.source + ")$" : regexp.source,
        regexp.flags + (needsIndex ? "d" : ""),
    )
}

function applyString(text: string) {
    return (_state: EditorState, match: InputRule.MatchArray) => ({
        changes: {from: match[0].from.pos, to: match[0].to.pos, insert: [Leaf.text(text)]},
        annotations: history.isolate.of(true),
    })
}

/**
 * Match-group offsets relative to `match[0]`. Prefers native `indices` when
 * the `d` flag is set; otherwise scans for group substrings.
 */
export function getGroupIndices(match: RegExpMatchArray): ([number, number] | undefined)[] {
    if ((match as any).indices) return (match as any).indices
    let result: ([number, number] | undefined)[] = [[0, match[0].length]]
    for (let i = 1, pos = 0; i < match.length; i++) {
        let found = match[i] ? match[0].indexOf(match[i], pos) : -1
        result.push(found < 0 ? undefined : [found, (pos = found + match[i].length)])
    }
    return result
}

function applyInputRules(trs: readonly Transaction[], state: EditorState): Transaction.Spec | null {
    let typed = -1
    for (let i = trs.length - 1; i >= 0; i--) {
        if (trs[i].isUserEvent("input.type")) {
            for (let j = i + 1; j < trs.length; j++) if (trs[j].selection) return null
            typed = i
            break
        }
    }
    if (typed < 0) return null
    let cursor = state.sel.head,
        block = cursor.textblockParent
    if (!block) return null
    let map = state.textblockMap(block)
    let curIndex = map.toIndex(cursor.pos),
        textBefore = map.text.slice(0, curIndex),
        textAfter: string | undefined
    rules: for (let rule of state.facet(inputRule)) {
        if (!rule.inCode && block.node.type.hasRole(Node.Role.Code)) continue
        let match = rule.expr.exec(textBefore)
        if (!match || (rule.lookahead && !rule.lookahead.test(textAfter ?? (textAfter = map.text.slice(curIndex)))))
            continue
        let indices = getGroupIndices(match)
        let docMatch: (InputRule.Match | null)[] = [],
            parent = -1
        for (let i = 0; i < match.length; i++) {
            let text = match[i]
            if (text == null) {
                docMatch.push(null)
            } else {
                let is = indices[i]!
                let from = state.doc.resolve(map.fromIndex(is[0]))
                let to = state.doc.resolve(map.fromIndex(is[1]))

                if (parent < 0) parent = from.parent.before
                if (parent != from.parent.before || parent != to.parent.before) continue rules
                if (!rule.inCode && from.parent.node.type.hasRole(Node.Role.Code)) continue rules
                docMatch.push({from, to, text})
            }
        }
        let spec = rule.apply(state, docMatch as any as InputRule.MatchArray)
        if (spec) return spec
    }
    return null
}
