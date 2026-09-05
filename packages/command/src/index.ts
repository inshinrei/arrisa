/**
 * @arrisa/command — editing commands, menu model, and structure helpers.
 *
 * High-level commands return a {@link Transaction.Spec} (or `false` when
 * inapplicable). View-backed commands may also return a boolean. Dispatch via
 * {@link Command.dispatch}, or apply pure results with {@link EditorState.update}.
 */
export {Command, Arrisa} from "./command"

export {Menu} from "./menu"

export {insertText, insertLineBreak, enter, transposeChars} from "./insert"

export {deleteUnit, deleteWord, deleteToLineEnd, deleteLine} from "./delete"

export {
    setTextblockType,
    unwrapBlock,
    wrapBlock,
    toggleBlock,
    toggleList,
    listIsActive,
} from "./structure"

export {
    toggleMark,
    toggleEmphasis,
    toggleStrong,
    toggleUnderline,
    setAlignment,
    setDirection,
    clearFormatting,
    applyLink,
    removeLinks,
} from "./mark"

export {
    markExclusivity,
    markExclusivityPolicy,
    markAllowedByExclusivity,
    toggleMarkExclusive,
    type MarkExclusivityPolicy,
} from "./mark-exclusivity"

export {
    moveByUnit,
    moveByWord,
    moveByLine,
    moveByPage,
    moveToLineSide,
    moveToTextblockSide,
    moveToDocSide,
    selectAll,
} from "./motion"

export {undo, redo} from "./history"

export {
    deleteSelection,
    deleteEmptyTextblock,
    deleteBackward,
    deleteForward,
} from "./util/delete"
export {joinBackward, joinForward, joinListItems} from "./util/join"
export {liftEmptyBlock, splitTextblock} from "./util/split"
export {joinBlocks, clearNonFitting, autoJoinBlocks, textblockChild} from "./util/blocks"
export {findWrappable, wrapBlockRange, findUnwrappable, doUnwrapBlock} from "./util/wrap"
export {selectedTextblocks, canAddMarkInRange} from "./util/selection"
