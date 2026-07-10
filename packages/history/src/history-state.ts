/**
 * In-memory undo/redo stacks and the rules for recording, isolating, and
 * popping events.
 */
import type {ChangeSet} from "@arrisa/doc"
import {type EditorState, Transaction} from "@arrisa/state"
import {Branch, depth} from "./branch"
import type {HistoryConfig} from "./config"
import {isAdjacent, joinableUserEvent} from "./event"
import {BranchName, fromHistory} from "./meta"

export class HistoryState {
    constructor(
        public done: Branch | null,
        public undone: Branch | null,
        readonly prevTime: number = 0,
        readonly prevUserEvent: string | undefined = undefined,
    ) {}

    /** Forget join context so the next edit cannot merge with the previous. */
    isolate() {
        return this.prevTime ? new HistoryState(this.done, this.undone) : this
    }

    /**
     * Record an inverted event. May join into the top of `done` when:
     * - the prior event has document changes
     * - the user event is joinable (`input.type*` / `delete*`), appended, or
     *   absent
     * - either the time gap is within `newGroupDelay` and `joinToEvent` agrees,
     *   or the event is `input.type.compose`
     *
     * Recording a new change always clears the redo stack.
     */
    addChanges(
        event: {changes: ChangeSet; effects: readonly Transaction.Effect<any>[]},
        time: number,
        userEvent: string | undefined,
        config: Required<HistoryConfig>,
        tr: Transaction,
    ): HistoryState {
        let done = this.done && this.done.resolve(tr.startState.config)
        if (
            done &&
            !done.changes.empty &&
            (!userEvent || joinableUserEvent.test(userEvent) || tr.annotation(Transaction.appended)) &&
            ((time - this.prevTime < config.newGroupDelay &&
                config.joinToEvent(tr, isAdjacent(done.changes, event.changes))) ||
                userEvent == "input.type.compose")
        ) {
            done = done.addChanges(event.changes, event.effects)
        } else {
            done = new Branch(event.changes, event.effects, null, tr.startState.selection, done)
        }
        return new HistoryState(done, null, time, userEvent)
    }

    /**
     * Build an undo or redo transaction spec from the top of the given side.
     * Returns false when the branch is empty or maps away.
     */
    pop(side: BranchName, state: EditorState): Transaction.Spec | false {
        let branch = side == BranchName.Done ? this.done : this.undone
        if (!branch || !(branch = branch.resolve(state.config))) return false
        return {
            changes: branch.changes,
            selection: branch.startSelection,
            effects: branch.effects,
            annotations: fromHistory.of({side, rest: branch.next}),
            userEvent: side == BranchName.Done ? "undo" : "redo",
            scrollIntoView: true,
        }
    }

    /**
     * Trim stacks when they grow past `minDepth * 1.3` (hysteresis so clip
     * does not run on every single step over the limit).
     */
    clip(minDepth: number) {
        let max = minDepth * 1.3
        let done = depth(this.done) > max ? this.done!.clip(minDepth) : this.done
        let undone = depth(this.undone) > max ? this.undone!.clip(minDepth) : this.undone
        if (done != this.done || undone != this.undone)
            return new HistoryState(done, undone, this.prevTime, this.prevUserEvent)
        return this
    }
}
