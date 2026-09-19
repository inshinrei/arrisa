/**
 * Plain-text `@query` detection for compose hosts (picker, not resolve-on-space).
 */
import {Node, type Plot} from "@arrisa/doc"
import {Arrisa, type ClientBox} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {Code} from "@arrisa/types"
import {docPosAtIndex, dumpOffsetAtIndex} from "./dump-pos"
import {MentionName} from "./schema-elements"
import {collectDumpSpans} from "./to-formatted"

export type MentionQuery = {
    from: number
    to: number
    query: string
    rect: ClientBox
}

const isStopChar = (ch: string) => ch == "]" || /\s/.test(ch)

function mentionCovers(doc: Plot.Doc, pos: number) {
    let $pos = doc.resolve(pos)
    if (MentionName.isInSet($pos.marks())) return true
    let after = $pos.nodeAfter
    return !!(after && MentionName.isInSet(after.tag.marks))
}

/**
 * Collapsed caret in a word-start `@query` (dump offsets, default flatten).
 * Does not consume Space or wrap text. Null inside MentionName / code.
 */
export function detectMentionQuery(state: EditorState): Omit<MentionQuery, "rect"> | null {
    if (!state.selection.isCursor) return null
    let $head = state.sel.head
    let marks = $head.marks()
    if (MentionName.isInSet(marks) || Code.isInSet(marks)) return null
    for (let p: typeof $head.parent | null = $head.parent; p; p = p.parent) {
        if (p.node.type.hasRole(Node.Role.Code)) return null
    }
    let index = collectDumpSpans(state.doc)
    let dump = index.text
    let to = dumpOffsetAtIndex(index, $head.pos, state.doc.length)
    if (to === false) return null
    let from = -1
    for (let i = to - 1; i >= 0; i--) {
        let ch = dump[i]!
        if (ch == "@") {
            from = i
            break
        }
        if (isStopChar(ch)) return null
    }
    if (from < 0) return null
    if (from > 0 && !/\s/.test(dump[from - 1]!)) return null
    let at = docPosAtIndex(index, from, "from")
    if (at !== false && mentionCovers(state.doc, at)) return null
    let query = dump.slice(from + 1, to)
    if (/[\s\]]/.test(query)) return null
    return {from, to, query}
}

/** `Arrisa.updateListener` that emits {@link MentionQuery} (or `null`) for picker hosts. */
export function mentionQueryListener(cb: (q: MentionQuery | null) => void): EditorState.Extension {
    return Arrisa.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet && !update.focusChanged) return
        if (!update.editor.hasFocus) {
            cb(null)
            return
        }
        let found = detectMentionQuery(update.state)
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
