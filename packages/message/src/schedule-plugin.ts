/**
 * Schedule phrase paint, caret chip, and accept keymap.
 */
import {Command} from "@arrisa/command"
import {Arrisa, Decoration, KeyBinding, RangeSet, Tooltip} from "@arrisa/editor"
import {phrases} from "@arrisa/phrases"
import {EditorState} from "@arrisa/state"
import {docPosAtDumpOffset} from "./dump-pos"
import {acceptScheduleQuery, scheduleAccepted} from "./schedule-accept"
import {
    detectSchedulePhrases,
    detectScheduleQuery,
    scheduleChipField,
    scheduleQueryConfig,
    scheduleQueryListener,
    setScheduleChip,
    type ScheduleQueryConfig,
} from "./schedule-query"

const schedulePhraseDeco = Decoration.Range.wrapper("span", {
    attributes: {class: "arrisa-schedule-phrase"},
    inclusive: "start",
})

function paintSchedulePhrases(state: EditorState) {
    let hits = detectSchedulePhrases(state)
    let mapped: [number, number][] = []
    for (let hit of hits) {
        let from = docPosAtDumpOffset(state.doc, hit.from, "from")
        let to = docPosAtDumpOffset(state.doc, hit.to, "to")
        if (from === false || to === false || from >= to) continue
        mapped.push([from, to])
    }
    mapped.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let ranges: [number, number, Decoration.Range][] = []
    let lastTo = -1
    for (let [from, to] of mapped) {
        if (from < lastTo) continue
        ranges.push([from, to, schedulePhraseDeco])
        lastTo = to
    }
    return ranges.length ? RangeSet.create(ranges) : RangeSet.empty
}

const createScheduleChip = (editor: Arrisa): Tooltip.View => {
    let dom = document.createElement("button")
    dom.type = "button"
    dom.className = "arrisa-schedule-chip"
    const sync = () => {
        let hit = detectScheduleQuery(editor.state)
        let label = hit
            ? phrases.get(editor.state, "schedule_suggestion").split("{phrase}").join(hit.label)
            : ""
        dom.textContent = label
        dom.setAttribute("aria-label", label)
        dom.title = label
        dom.classList.toggle("arrisa-schedule-chip-focused", editor.state.field(scheduleChipField) == "focused")
    }
    sync()
    dom.addEventListener("mousedown", (e) => e.preventDefault())
    dom.addEventListener("click", () => Command.dispatch(editor, acceptScheduleQuery))
    return {
        dom,
        overlap: true,
        update() {
            sync()
        },
    }
}

const scheduleChipTooltip = Tooltip.show.compute((state) => {
    let mode = state.field(scheduleChipField, false)
    if (!mode || mode == "hidden") return null
    let hit = detectScheduleQuery(state)
    if (!hit) return null
    let pos = docPosAtDumpOffset(state.doc, hit.to, "to")
    if (pos === false) return null
    return {
        pos,
        above: true,
        strictSide: true,
        arrow: false,
        create: createScheduleChip,
    }
})

const focusScheduleChip: Command = (target) => {
    let editor = target as unknown as Arrisa
    let mode = editor.state.field(scheduleChipField, false)
    if (!mode) return false
    if (mode != "focused") editor.dispatch({effects: setScheduleChip.of("focused")})
    return true
}

const acceptFocusedScheduleChip: Command = (target) => {
    let editor = target as unknown as Arrisa
    if (editor.state.field(scheduleChipField, false) != "focused") return false
    return Command.dispatch(editor, acceptScheduleQuery)
}

const blurScheduleChip: Command = (target) => {
    let editor = target as unknown as Arrisa
    if (editor.state.field(scheduleChipField, false) != "focused") return false
    editor.dispatch({effects: setScheduleChip.of("visible")})
    return true
}

const escapeScheduleChip: Command = (target) => {
    let editor = target as unknown as Arrisa
    let mode = editor.state.field(scheduleChipField, false)
    if (!mode || mode == "hidden") return false
    if (mode == "focused") {
        editor.dispatch({effects: setScheduleChip.of("visible")})
        return true
    }
    editor.dispatch({effects: setScheduleChip.of("hidden")})
    return true
}

const scheduleChipKeymap = EditorState.prec.highest([
    KeyBinding.of({key: "ArrowUp", run: focusScheduleChip}),
    KeyBinding.of({key: "Enter", run: acceptFocusedScheduleChip}),
    KeyBinding.of({key: "ArrowDown", run: blurScheduleChip}),
    KeyBinding.of({key: "Escape", run: escapeScheduleChip}),
])

const scheduleChipTheme = Arrisa.theme({
    ".arrisa-tooltip:has(.arrisa-schedule-chip)": {
        boxShadow: "none",
        backgroundColor: "transparent",
        padding: "0",
    },
    ".arrisa-schedule-chip": {
        display: "inline-block",
        font: "inherit",
        fontSize: "90%",
        lineHeight: "1.2",
        padding: "2px 8px",
        margin: "0",
        border: "1px solid var(--arrisa-border-color)",
        borderRadius: "3px",
        backgroundColor: "var(--arrisa-panel-color)",
        color: "inherit",
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: "none",
    },
    ".arrisa-schedule-chip-focused": {
        outline: "2px solid var(--arrisa-highlight-color)",
    },
})

/** Paint schedule phrases and offer a caret chip (unless the host sets `onQuery`). */
export function scheduleQuery(config?: ScheduleQueryConfig): EditorState.Extension {
    let cfg = config ?? {}
    let ext: EditorState.Extension[] = [
        scheduleQueryConfig.of(cfg),
        Tooltip.configure({position: "fixed"}),
        Decoration.Range.source.of(paintSchedulePhrases),
        scheduleChipField,
        scheduleChipTheme,
        scheduleChipKeymap,
        Arrisa.updateListener.of((update) => {
            if (!cfg.onAccept) return
            for (let tr of update.transactions) {
                for (let e of tr.effects) {
                    if (e.is(scheduleAccepted)) cfg.onAccept(e.value)
                }
            }
        }),
    ]
    if (cfg.onQuery) ext.push(scheduleQueryListener(cfg.onQuery))
    else ext.push(scheduleChipTooltip)
    return ext
}
