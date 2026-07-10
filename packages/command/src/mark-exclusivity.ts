/**
 * Configurable mark exclusivity for toolbar / toggleMark.
 *
 * Default: free stacking (no rules). Messenger presets may install isolating
 * marks (e.g. monospace and strikethrough do not combine with others).
 */
import {type Mark} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Command} from "./command"
import {toggleMark} from "./mark"
import {canAddMarkInRange} from "./util/selection"

/** Resolved exclusivity policy from the editor state. */
export interface MarkExclusivityPolicy {
    /**
     * Marks that cannot share a range with any other mark.
     * When one of these is applied, all other marks are stripped; when any
     * other mark is present, applying an isolating mark strips those first.
     */
    isolating: readonly Mark.Type[]
}

const policyFacet = EditorState.Facet.define<MarkExclusivityPolicy, MarkExclusivityPolicy>({
    combine(inputs) {
        if (!inputs.length) return {isolating: []}
        let isolating: Mark.Type[] = []
        let seen = new Set<Mark.Type>()
        for (let p of inputs) {
            for (let t of p.isolating) {
                if (!seen.has(t)) {
                    seen.add(t)
                    isolating.push(t)
                }
            }
        }
        return {isolating}
    },
})

function asType(mark: Mark | Mark.Type): Mark.Type {
    return "type" in mark && (mark as Mark).type ? (mark as Mark).type : (mark as Mark.Type)
}

function asMark(mark: Mark | Mark.Type): Mark {
    return "type" in mark && (mark as Mark).type ? (mark as Mark) : (mark as Mark.Type).default!
}

function isIsolating(policy: MarkExclusivityPolicy, type: Mark.Type): boolean {
    return policy.isolating.includes(type)
}

/** Read the active exclusivity policy (`isolating` empty when unset). */
export function markExclusivityPolicy(state: EditorState): MarkExclusivityPolicy {
    return state.facet(policyFacet)
}

/**
 * Whether `mark` may be applied under the current exclusivity policy.
 * Always true when no isolating marks are configured.
 * When the mark is already fully active on the selection, returns true so the
 * user can toggle it off.
 */
export function markAllowedByExclusivity(state: EditorState, mark: Mark | Mark.Type): boolean {
    let policy = markExclusivityPolicy(state)
    if (!policy.isolating.length) return true

    let type = asType(mark)
    let instance = asMark(mark)
    let {selection, doc} = state

    let markFullyActive =
        selection.isCursor
            ? !!instance.isInSet(state.sel.activeMarks)
            : !selection.ranges.some((r) => canAddMarkInRange(doc, r.from, r.to, instance))
    if (markFullyActive) return true

    let activeTypes = activeMarkTypes(state)
    let hasIsolating = policy.isolating.some((t) => activeTypes.has(t))
    let hasOther = [...activeTypes].some((t) => !isIsolating(policy, t))

    if (isIsolating(policy, type)) {
        // Isolating marks are disabled while any non-isolating format is active
        return !hasOther
    }
    // Non-isolating marks are disabled while an isolating mark is active
    return !hasIsolating
}

function activeMarkTypes(state: EditorState): Set<Mark.Type> {
    let {selection, doc} = state
    let types = new Set<Mark.Type>()
    if (selection.isCursor) {
        for (let m of state.sel.activeMarks) types.add(m.type)
        return types
    }
    for (let {from, to} of selection.ranges) {
        doc.iterate(from, to, (node) => {
            for (let m of node.marks) types.add(m.type)
        })
    }
    return types
}

/**
 * Toggle `mark`, stripping conflicting marks when exclusivity rules apply.
 * Falls through to plain {@link toggleMark} when no policy is installed.
 */
export const toggleMarkExclusive: Command.Pure<Mark> = (target, mark) => {
    let {state} = target
    let policy = markExclusivityPolicy(state)
    if (!policy.isolating.length) return toggleMark(target, mark)

    let type = mark.type
    let {selection, doc} = state
    let adding =
        selection instanceof EditorSelection.Text && selection.empty
            ? !mark.isInSet(selection.marks || state.sel.activeMarks)
            : selection.ranges.some((r) => canAddMarkInRange(doc, r.from, r.to, mark))

    if (!adding) return toggleMark(target, mark)

    let stripTypes = new Set<Mark.Type>()
    if (isIsolating(policy, type)) {
        // Isolating mark: strip every other mark type present
        for (let t of activeMarkTypes(state)) if (t != type) stripTypes.add(t)
    } else {
        // Non-isolating: strip isolating marks first
        for (let t of policy.isolating) stripTypes.add(t)
    }

    if (selection instanceof EditorSelection.Text && selection.empty) {
        let selMarks = selection.marks || state.sel.head.marks()
        let next = selMarks
        for (let t of stripTypes) next = t.removeFromSet(next)
        next = mark.addToSet(next)
        return {
            selection: EditorSelection.Text.create({
                anchor: selection.anchor,
                headSide: selection.headSide,
                goalColumn: selection.goalColumn,
                marks: next,
            }),
            userEvent: "mark.add",
        }
    }

    let changes: {from: number; to: number; remove?: Mark; add?: Mark}[] = []
    for (let {from, to} of selection.ranges) {
        let seen = new Set<string>()
        doc.iterate(from, to, (node) => {
            for (let m of node.marks) {
                if (!stripTypes.has(m.type)) continue
                let key = m.name + ":" + JSON.stringify(m.value)
                if (seen.has(key)) continue
                seen.add(key)
                changes.push({from, to, remove: m})
            }
        })
        changes.push({from, to, add: mark})
    }
    return {changes, userEvent: "mark.add"}
}

/**
 * Install mark exclusivity. Pass `{isolating: [Code, Strikethrough]}` for a
 * code/strike isolation profile, or omit / pass empty for free stacking.
 *
 * Overrides {@link toggleMark} via {@link Command.handler} so existing
 * keybindings and menu buttons pick up the policy automatically.
 */
export function markExclusivity(config: {isolating?: readonly (Mark | Mark.Type)[]} = {}): EditorState.Extension {
    let isolating = (config.isolating ?? []).map(asType)
    return [
        policyFacet.of({isolating}),
        Command.handler(toggleMark as Command<Mark>, (target, mark) => {
            let result = toggleMarkExclusive(target, mark)
            return result === false ? false : result
        }),
    ]
}
