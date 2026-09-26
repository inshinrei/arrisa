/**
 * Caret-tied schedule phrase detection for compose hosts (chip, not accept).
 */
import {Node, type Plot} from "@arrisa/doc"
import {Arrisa, type ClientBox} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {Code} from "@arrisa/types"
import {docPosAtIndex, dumpOffsetAtIndex} from "./dump-pos"
import type {MessageEntity} from "./entities"
import {detectMentionQuery} from "./mention-query"
import {MentionName} from "./schema-elements"
import {findSchedulePhrases} from "./schedule-parse"
import {collectDumpSpans, docToFormattedText, type DumpIndex} from "./to-formatted"

export type ScheduleQuery = {
    from: number
    to: number
    phrase: string
    scheduledTime: number
    label: string
    rect: ClientBox
}

export type ScheduleQueryConfig = {
    enabled?: (state: EditorState) => boolean
    now?: () => Date
    locale?: string | (() => string)
    onQuery?: (q: ScheduleQuery | null) => void
    onAccept?: (hit: Omit<ScheduleQuery, "rect">) => void
}

export const scheduleQueryConfig = EditorState.Facet.define<ScheduleQueryConfig, ScheduleQueryConfig>({
    combine: (values) => values[0] ?? {},
})

const skipEntityType = (type: string) =>
    type == "pre" || type == "code" || type == "text_url" || type == "custom_emoji" || type == "mention_name"

function resolved(state: EditorState, opts?: Pick<ScheduleQueryConfig, "now" | "locale" | "enabled">) {
    return opts ?? state.facet(scheduleQueryConfig)
}

function blockedAt(doc: Plot.Doc, pos: number) {
    let $pos = doc.resolve(pos)
    if (MentionName.isInSet($pos.marks()) || Code.isInSet($pos.marks())) return true
    let after = $pos.nodeAfter
    if (after && (MentionName.isInSet(after.tag.marks) || Code.isInSet(after.tag.marks))) return true
    for (let p: typeof $pos.parent | null = $pos.parent; p; p = p.parent) {
        if (p.node.type.hasRole(Node.Role.Code)) return true
    }
    return false
}

function phraseSkipped(doc: Plot.Doc, index: DumpIndex, from: number, to: number, entities: readonly MessageEntity[]) {
    for (let e of entities) {
        if (!skipEntityType(e.type)) continue
        if (e.offset < to && e.offset + e.length > from) return true
    }
    for (let d = from; d < to; d++) {
        let pos = docPosAtIndex(index, d, "from")
        if (pos === false) continue
        if (blockedAt(doc, pos)) return true
    }
    return false
}

/**
 * Every in-window complete phrase that is not skipped (paint). Dump offsets.
 */
export function detectSchedulePhrases(
    state: EditorState,
    opts?: Pick<ScheduleQueryConfig, "now" | "locale" | "enabled">,
): Omit<ScheduleQuery, "rect">[] {
    let cfg = resolved(state, opts)
    if (cfg.enabled?.(state) === false) return []
    let index = collectDumpSpans(state.doc)
    let parsed = findSchedulePhrases(index.text, {now: cfg.now, locale: cfg.locale})
    if (!parsed.length) return []
    let entities = docToFormattedText(state.doc).entities ?? []
    let hits: Omit<ScheduleQuery, "rect">[] = []
    for (let hit of parsed) {
        if (phraseSkipped(state.doc, index, hit.from, hit.to, entities)) continue
        hits.push(hit)
    }
    return hits
}

/**
 * Collapsed caret inside a complete schedule phrase (dump offsets, no rect).
 * Null when not a cursor, mention query is open, or caret/phrase is in code.
 */
export function detectScheduleQuery(
    state: EditorState,
    opts?: Pick<ScheduleQueryConfig, "now" | "locale" | "enabled">,
): Omit<ScheduleQuery, "rect"> | null {
    let cfg = resolved(state, opts)
    if (cfg.enabled?.(state) === false) return null
    if (!state.selection.isCursor) return null
    let $head = state.sel.head
    let marks = $head.marks()
    if (MentionName.isInSet(marks) || Code.isInSet(marks)) return null
    for (let p: typeof $head.parent | null = $head.parent; p; p = p.parent) {
        if (p.node.type.hasRole(Node.Role.Code)) return null
    }
    if (detectMentionQuery(state) != null) return null
    let hits = detectSchedulePhrases(state, opts)
    if (!hits.length) return null
    let index = collectDumpSpans(state.doc)
    let caretDump = dumpOffsetAtIndex(index, $head.pos, state.doc.length)
    if (caretDump === false) return null
    let best: Omit<ScheduleQuery, "rect"> | null = null
    for (let hit of hits) {
        if (hit.from > caretDump || caretDump > hit.to) continue
        if (!best) {
            best = hit
            continue
        }
        let dist = Math.abs(hit.to - caretDump)
        let bestDist = Math.abs(best.to - caretDump)
        if (dist < bestDist || (dist == bestDist && hit.to - hit.from > best.to - best.from)) best = hit
    }
    return best
}

/** `Arrisa.updateListener` that emits {@link ScheduleQuery} (or `null`) for chip hosts. */
export function scheduleQueryListener(
    cb: (q: ScheduleQuery | null) => void,
    opts?: ScheduleQueryConfig,
): EditorState.Extension {
    return Arrisa.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet && !update.focusChanged) return
        if (!update.editor.hasFocus) {
            cb(null)
            return
        }
        let found = detectScheduleQuery(update.state, opts)
        if (!found) {
            cb(null)
            return
        }
        let rect = update.editor.selectionRect()
        if (!rect) {
            cb(null)
            return
        }
        cb({...found, rect})
    })
}
