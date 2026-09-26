/**
 * Schedule phrase paint, caret action list, and accept keymap.
 */
import {Command} from "@arrisa/command"
import {Arrisa, Decoration, KeyBinding, RangeSet, Tooltip} from "@arrisa/editor"
import {phrases} from "@arrisa/phrases"
import {EditorState, type Transaction} from "@arrisa/state"
import {docPosAtDumpOffset} from "./dump-pos"
import {acceptScheduleQuery, scheduleAccepted} from "./schedule-accept"
import {
    detectSchedulePhrases,
    detectScheduleQuery,
    scheduleActionId,
    scheduleChipField,
    scheduleQueryConfig,
    scheduleQueryListener,
    setScheduleChip,
    type ScheduleAction,
    type ScheduleActionHit,
    type ScheduleChip,
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

function defaultLabel(state: EditorState, hit: ScheduleActionHit) {
    return phrases.get(state, "schedule_suggestion").split("{phrase}").join(hit.label)
}

function scheduleActions(state: EditorState, hit: ScheduleActionHit): ScheduleAction[] {
    let cfg = state.facet(scheduleQueryConfig)
    if (cfg.actions) return [...cfg.actions(hit, state)]
    return [{id: "schedule", label: defaultLabel(state, hit)}]
}

function mergeEffects(spec: Transaction.Spec, extra: Transaction.Effect<string>): Transaction.Spec {
    let effects = spec.effects
    let list = effects == null ? [] : Array.isArray(effects) ? [...effects] : [effects]
    list.push(extra)
    return {...spec, effects: list}
}

function dispatchAccept(editor: Arrisa, actionId: string) {
    let spec = acceptScheduleQuery({state: editor.state}, null)
    if (!spec) return false
    editor.dispatch(mergeEffects(spec, scheduleActionId.of(actionId)))
    return true
}

const createScheduleChip = (editor: Arrisa): Tooltip.View => {
    let dom = document.createElement("div")
    dom.className = "arrisa-schedule-actions"
    const sync = () => {
        let hit = detectScheduleQuery(editor.state)
        let chip = editor.state.field(scheduleChipField, false)
        dom.replaceChildren()
        if (!hit || !chip || chip.mode == "hidden") return
        let actions = scheduleActions(editor.state, hit)
        for (let i = 0; i < actions.length; i++) {
            let action = actions[i]!
            let btn = document.createElement("button")
            btn.type = "button"
            btn.className = "arrisa-schedule-chip"
            if (chip.mode == "focused" && chip.index == i) btn.classList.add("arrisa-schedule-chip-focused")
            btn.textContent = action.label
            btn.setAttribute("aria-label", action.label)
            btn.title = action.label
            let id = action.id
            btn.addEventListener("mousedown", (e) => e.preventDefault())
            btn.addEventListener("click", () => dispatchAccept(editor, id))
            dom.append(btn)
        }
    }
    sync()
    return {
        dom,
        overlap: true,
        update() {
            sync()
        },
    }
}

const scheduleChipTooltip = Tooltip.show.compute((state) => {
    let chip = state.field(scheduleChipField, false)
    if (!chip || chip.mode == "hidden") return null
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

function focusChip(editor: Arrisa, dir: -1 | 1) {
    let chip = editor.state.field(scheduleChipField, false)
    if (!chip) return false
    let hit = detectScheduleQuery(editor.state)
    if (!hit) return false
    let n = scheduleActions(editor.state, hit).length
    if (!n) return false
    let index = dir < 0 ? n - 1 : 0
    if (chip.mode == "focused") {
        index = Math.max(0, Math.min(n - 1, chip.index + dir))
    }
    let next: ScheduleChip = {mode: "focused", index}
    if (chip.mode == next.mode && chip.index == next.index) return true
    editor.dispatch({effects: setScheduleChip.of(next)})
    return true
}

const focusScheduleChipUp: Command = (target) => focusChip(target as unknown as Arrisa, -1)

const focusScheduleChipDown: Command = (target) => focusChip(target as unknown as Arrisa, 1)

const acceptFocusedScheduleChip: Command = (target) => {
    let editor = target as unknown as Arrisa
    let chip = editor.state.field(scheduleChipField, false)
    if (!chip || chip.mode != "focused") return false
    let hit = detectScheduleQuery(editor.state)
    if (!hit) return false
    let actions = scheduleActions(editor.state, hit)
    let id = actions[chip.index]?.id ?? "schedule"
    return dispatchAccept(editor, id)
}

const escapeScheduleChip: Command = (target) => {
    let editor = target as unknown as Arrisa
    let chip = editor.state.field(scheduleChipField, false)
    if (!chip || chip.mode == "hidden") return false
    if (chip.mode == "focused") {
        editor.dispatch({effects: setScheduleChip.of({mode: "visible", index: chip.index})})
        return true
    }
    editor.dispatch({effects: setScheduleChip.of({mode: "hidden", index: chip.index})})
    return true
}

const scheduleChipKeymap = EditorState.prec.highest([
    KeyBinding.of({key: "ArrowUp", run: focusScheduleChipUp}),
    KeyBinding.of({key: "ArrowDown", run: focusScheduleChipDown}),
    KeyBinding.of({key: "Enter", run: acceptFocusedScheduleChip}),
    KeyBinding.of({key: "Escape", run: escapeScheduleChip}),
])

const scheduleChipTheme = Arrisa.theme({
    ".arrisa-tooltip:has(.arrisa-schedule-actions)": {
        boxShadow: "none",
        backgroundColor: "transparent",
        padding: "0",
    },
    ".arrisa-schedule-actions": {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        alignItems: "stretch",
    },
    ".arrisa-schedule-chip": {
        display: "block",
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
        textAlign: "left",
    },
    ".arrisa-schedule-chip-focused": {
        outline: "2px solid var(--arrisa-highlight-color)",
    },
})

/** Paint schedule phrases and offer a caret action list (unless the host sets `onQuery`). */
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
            for (let tr of update.transactions) {
                let hit: ScheduleActionHit | undefined
                let actionId = "schedule"
                for (let e of tr.effects) {
                    if (e.is(scheduleAccepted)) hit = e.value
                    if (e.is(scheduleActionId)) actionId = e.value
                }
                if (!hit) continue
                let actions = scheduleActions(update.startState, hit)
                let action = actions.find((a) => a.id == actionId)
                if (action?.run) action.run(hit)
                else cfg.onAccept?.(hit)
            }
        }),
    ]
    if (cfg.onQuery) ext.push(scheduleQueryListener(cfg.onQuery))
    else ext.push(scheduleChipTooltip)
    return ext
}
