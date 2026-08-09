/**
 * Selection package surface: types, factories, and cursor motion.
 */
export {EditorSelection, installEditorSelectionStatics} from "./selection"
export {SelectionType} from "./type"
export {Text} from "./text"
export {Node} from "./node"
export {Resolved} from "./resolved"
export {cursorAtStart, wordAt, scanNormalFrom, skipWord} from "./motion"
