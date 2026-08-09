/**
 * Post-build smoke: class statics that must survive sideEffects:false bundling.
 * Run after `pnpm --filter @arrisa/state build` (and editor build for InputRule).
 */
import {Transaction, EditorSelection} from "../dist/index.js"

function assert(cond, msg) {
    if (!cond) {
        console.error("check-dist FAIL:", msg)
        process.exit(1)
    }
}

assert(Transaction.appender?.of, "Transaction.appender missing")
assert(Transaction.extender?.of, "Transaction.extender missing")
assert(EditorSelection.selectionType?.of, "EditorSelection.selectionType missing")
assert(typeof EditorSelection.cursor == "function", "EditorSelection.cursor missing")
assert(typeof EditorSelection.createResolved == "function", "EditorSelection.createResolved missing")
assert(EditorSelection.Text, "EditorSelection.Text missing")
assert(EditorSelection.Node, "EditorSelection.Node missing")

try {
    let {InputRule} = await import("../../editor/dist/index.js")
    assert(InputRule?.define, "editor InputRule failed to load")
} catch (err) {
    console.warn("check-dist: skip editor (build editor first):", err.message)
}

console.log("check-dist OK")
