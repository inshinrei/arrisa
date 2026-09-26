/**
 * Pure command: delete a caret-tied schedule phrase (collapse adjacent U+0020).
 */
import {type Command} from "@arrisa/command"
import {EditorSelection, Transaction} from "@arrisa/state"
import {docPosAtDumpOffset} from "./dump-pos"
import {detectScheduleQuery, scheduleQueryConfig, type ScheduleQuery} from "./schedule-query"
import {collectDumpSpans} from "./to-formatted"

export const scheduleAccepted = Transaction.Effect.define<Omit<ScheduleQuery, "rect">>()

export const acceptScheduleQuery: Command.Pure = ({state}) => {
    let hit = detectScheduleQuery(state)
    if (!hit) return false
    let cfg = state.facet(scheduleQueryConfig)
    if (cfg.enabled?.(state) === false) return false
    let dump = collectDumpSpans(state.doc).text
    let start = hit.from
    let end = hit.to
    let leftSpace = start > 0 && dump[start - 1] == " "
    let rightSpace = end < dump.length && dump[end] == " "
    if (leftSpace && rightSpace) start = hit.from - 1
    else if (leftSpace && end == dump.length) start = hit.from - 1
    else if (rightSpace && start == 0) end = hit.to + 1
    let mappedFrom = docPosAtDumpOffset(state.doc, start, "from")
    let mappedTo = docPosAtDumpOffset(state.doc, end, "to")
    if (mappedFrom === false || mappedTo === false || mappedFrom > mappedTo) return false
    return {
        changes: {from: mappedFrom, to: mappedTo},
        selection: EditorSelection.cursor(mappedFrom),
        userEvent: "delete.schedule-query",
        effects: scheduleAccepted.of({
            from: hit.from,
            to: hit.to,
            phrase: hit.phrase,
            scheduledTime: hit.scheduledTime,
            label: hit.label,
        }),
    }
}
