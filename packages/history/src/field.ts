/**
 * EditorState field that owns {@link HistoryState} and reacts to every
 * transaction: undo/redo moves, isolation, non-history mapping, and normal
 * recording.
 */
import {ChangeSet} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {Branch} from "./branch"
import {historyConfig} from "./config"
import {eventFromTransaction, none} from "./event"
import {HistoryState} from "./history-state"
import {BranchName, fromHistory, isolate, type HistoryJSON, type EventJSON} from "./meta"

export const historyField_ = EditorState.Field.define({
    create() {
        return new HistoryState(null, null)
    },

    update(state: HistoryState, tr: Transaction): HistoryState {
        let config = tr.state.facet(historyConfig)

        // Undo/redo: move the inverted event onto the opposite branch.
        let fromHist = tr.annotation(fromHistory)
        if (fromHist) {
            let from = fromHist.side,
                event = eventFromTransaction(tr)
            let other = from == BranchName.Done ? state.undone : state.done
            if (event) other = new Branch(event.changes, event.effects, null, tr.startState.selection, other)
            return new HistoryState(
                from == BranchName.Done ? fromHist.rest : other,
                from == BranchName.Done ? other : fromHist.rest,
            )
        }

        let isolateAnn = tr.annotation(isolate)
        if (isolateAnn == "full" || isolateAnn == "before") state = state.isolate()

        // Non-history changes: map both stacks so later undo stays consistent.
        if (tr.annotation(Transaction.addToHistory) === false)
            return tr.changes.empty
                ? state
                : new HistoryState(
                      state.done && state.done.addMapping(tr.changes, tr.startState.doc),
                      state.undone && state.undone.addMapping(tr.changes, tr.startState.doc),
                      state.prevTime,
                      state.prevUserEvent,
                  )

        let event = eventFromTransaction(tr)
        let time = tr.annotation(Transaction.time)!,
            userEvent = tr.annotation(Transaction.userEvent)
        if (event) state = state.addChanges(event, time, userEvent, config, tr)

        if (isolateAnn == "full" || isolateAnn == "after") state = state.isolate()
        return state.clip(config.minDepth)
    },

    toJSON(value: HistoryState, state: EditorState): HistoryJSON {
        let mkJSON = (branch: Branch | null): EventJSON[] => {
            let events: EventJSON[] = []
            let resolved = branch && branch.resolveFully(state.config)
            for (let cur = resolved; cur; cur = cur.next)
                events.push({changes: cur.changes.toJSON(), selection: cur.startSelection.toJSON(state)})
            return events
        }
        // Resolve into locals only — do not mutate the live field value.
        return {
            done: mkJSON(value.done),
            undone: mkJSON(value.undone),
        }
    },

    fromJSON(json: HistoryJSON, state: EditorState) {
        if (!json || !Array.isArray(json.done) || !Array.isArray(json.undone))
            throw new RangeError("Invalid history JSON")
        let buildBranch = (events: EventJSON[]) => {
            let result: Branch | null = null
            for (let i = events.length - 1; i >= 0; i--)
                result = new Branch(
                    ChangeSet.fromJSON(state.schema, events[i].changes),
                    none,
                    null,
                    EditorSelection.fromJSON(state, events[i].selection),
                    result,
                )
            return result
        }
        return new HistoryState(buildBranch(json.done as EventJSON[]), buildBranch(json.undone as EventJSON[]))
    },
})
