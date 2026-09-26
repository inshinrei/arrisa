/**
 * Arrisa playground — manual QA for document + messenger editor modes.
 */
import {Command, insertText as insertTextCommand} from "@arrisa/command"
import {serialize} from "@arrisa/doc"
import {KeyBinding, type Arrisa} from "@arrisa/editor"
import {
    detectScheduleQuery,
    docToFormattedText,
    insertMention as insertMentionCommand,
    type FormattedText,
    type MentionQuery,
    type ScheduleQuery,
    type ToFormattedOptions,
} from "@arrisa/message"
import {EditorState} from "@arrisa/state"
import {createChatEditor, createDocEditor, playgroundLinkPrompt, type ChatEditorOptions} from "./setup"

type ArrisaE2e = {
    chatEditor: Arrisa
    lastMentionQuery: MentionQuery | null
    lastScheduleAccept: Omit<ScheduleQuery, "rect"> | null
    lastScheduleAction: string | null
    dump: (opts?: ToFormattedOptions) => FormattedText
    insertMention: (p: {userId: string; label: string; from?: number; to?: number}) => boolean
    insertText: (text: string) => boolean
    remountCompose: (opts: {submit?: "Enter" | "Shift-Enter"; schedulePreset?: "two-actions"}) => void
    sendLog: string[]
    scheduleQuery: () => ReturnType<typeof detectScheduleQuery>
}

let e2eMode = new URLSearchParams(location.search).get("e2e") == "1"
let e2eApi: ArrisaE2e | undefined

let docMount = document.getElementById("editor-doc") as HTMLElement
let chatMount = document.getElementById("editor-chat") as HTMLElement
let chatToolbar = document.getElementById("chat-format-bar") as HTMLElement
let chatLinkField = document.getElementById("chat-link-field") as HTMLElement
let chatOut = document.getElementById("chat-out") as HTMLPreElement
let inspectOut = document.getElementById("inspect-out") as HTMLPreElement

let linkPrompt = playgroundLinkPrompt(chatLinkField)

function e2eMentionQuery(q: MentionQuery | null) {
    if (e2eApi) e2eApi.lastMentionQuery = q
}

let scheduleMark = document.getElementById("chat-schedule-mark") as HTMLElement
let scheduleLabel = document.getElementById("chat-schedule-label") as HTMLElement
let armed: Omit<ScheduleQuery, "rect"> | null = null

function setArmed(hit: Omit<ScheduleQuery, "rect"> | null) {
    armed = hit
    if (e2eApi) e2eApi.lastScheduleAccept = hit
    if (!scheduleMark || !scheduleLabel) return
    if (!hit) {
        scheduleMark.hidden = true
        scheduleLabel.textContent = ""
        return
    }
    scheduleLabel.textContent = `Scheduled for ${hit.label}`
    scheduleMark.hidden = false
}

function onScheduleAccept(hit: Omit<ScheduleQuery, "rect">) {
    setArmed(hit)
}

function twoScheduleActions(hit: Omit<ScheduleQuery, "rect">) {
    return [
        {id: "schedule", label: `Schedule ${hit.label}`},
        {
            id: "later",
            label: `Later ${hit.label}`,
            run: (h: Omit<ScheduleQuery, "rect">) => {
                if (e2eApi) {
                    e2eApi.lastScheduleAction = "later"
                    e2eApi.lastScheduleAccept = h
                }
            },
        },
    ]
}

function chatOptions(
    extra?: EditorState.Extension,
    submit?: "Enter" | "Shift-Enter",
    scheduleActions?: ChatEditorOptions["scheduleActions"],
): ChatEditorOptions {
    if (!e2eMode) return extra ? {extra, onScheduleAccept, scheduleActions} : {onScheduleAccept, scheduleActions}
    return {submit, onMentionQuery: e2eMentionQuery, onScheduleAccept, extra, scheduleActions}
}

let docEditor = createDocEditor(docMount)
let chatSample = `<p>Colored code</p>
<pre><code class="language-ts">if (ok) return true</code></pre>`
let chatEditor = createChatEditor(chatMount, chatToolbar, linkPrompt, chatOptions(), e2eMode ? "" : chatSample)
let activeEditor: Arrisa = docEditor

function trackFocus(editor: Arrisa) {
    editor.contentDOM.addEventListener("focusin", () => {
        activeEditor = editor
    })
}

trackFocus(docEditor)
trackFocus(chatEditor)

function describeEditor(editor: Arrisa): string {
    let {selection, doc} = editor.state
    let ranges = selection.ranges
        .map((r, i) => `  [${i}] from=${r.from} to=${r.to}${r.from == r.to ? " (cursor)" : ""}`)
        .join("\n")
    let html = serialize(doc).toHTML()
    let formatted = docToFormattedText(doc)
    return [
        `doc.length = ${doc.length}`,
        `selection = ${selection.from}…${selection.to}${selection.empty ? " (cursor)" : ""}`,
        `ranges:\n${ranges}`,
        ``,
        `HTML:`,
        html,
        ``,
        `FormattedText:`,
        JSON.stringify(formatted, null, 2),
    ].join("\n")
}

function refreshInspect() {
    inspectOut.textContent = describeEditor(activeEditor)
}

// —— Tabs ——
let tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".pg-tab"))
let panels = {
    doc: document.getElementById("panel-doc") as HTMLElement,
    chat: document.getElementById("panel-chat") as HTMLElement,
    inspect: document.getElementById("panel-inspect") as HTMLElement,
}

function setTab(name: "doc" | "chat" | "inspect") {
    for (let tab of tabs) {
        let on = tab.dataset.tab === name
        tab.classList.toggle("is-active", on)
        tab.setAttribute("aria-selected", on ? "true" : "false")
    }
    for (let [key, panel] of Object.entries(panels)) {
        let on = key === name
        panel.classList.toggle("is-active", on)
        if (on) panel.removeAttribute("hidden")
        else panel.setAttribute("hidden", "")
    }
    if (name === "inspect") refreshInspect()
    if (name === "doc") docEditor.focus()
    if (name === "chat") chatEditor.focus()
}

for (let tab of tabs) {
    tab.addEventListener("click", () => {
        let name = tab.dataset.tab as "doc" | "chat" | "inspect"
        if (name) setTab(name)
    })
}

// —— Messenger actions ——
document.getElementById("btn-send")!.addEventListener("click", () => {
    let doc = chatEditor.state.doc
    let html = serialize(doc).toHTML()
    let formatted = docToFormattedText(doc, {autoDetect: true})
    let time = new Date().toLocaleTimeString()
    let line = [
        `[${time}] HTML: ${html || "(empty)"}`,
        `FormattedText: ${JSON.stringify(formatted, null, 2)}`,
    ]
    if (armed) {
        line.push(`Scheduled for ${armed.label} (${armed.scheduledTime})`)
        setArmed(null)
    }
    chatOut.textContent = (chatOut.textContent ? chatOut.textContent + "\n\n" : "") + line.join("\n")
    console.log("chat send", {html, formatted})
})

document.getElementById("btn-schedule-clear")?.addEventListener("click", () => {
    setArmed(null)
})

function remountChat(options: ChatEditorOptions = {}) {
    chatMount.replaceChildren()
    chatToolbar.replaceChildren()
    chatLinkField.hidden = true
    setArmed(null)
    chatEditor = createChatEditor(chatMount, chatToolbar, linkPrompt, options)
    trackFocus(chatEditor)
    activeEditor = chatEditor
    ;(window as any).arrisa.chatEditor = chatEditor
    if (e2eApi) e2eApi.chatEditor = chatEditor
    chatEditor.focus()
}

document.getElementById("btn-clear-chat")!.addEventListener("click", () => {
    remountChat(chatOptions())
})

// —— Inspect ——
document.getElementById("btn-refresh-inspect")!.addEventListener("click", refreshInspect)

function e2eDump(opts?: ToFormattedOptions) {
    return docToFormattedText(chatEditor.state.doc, opts)
}

function e2eInsertText(text: string) {
    chatEditor.focus()
    let {from, to} = chatEditor.state.selection
    let ok = Command.dispatch(chatEditor, insertTextCommand, {
        from,
        to,
        insert: text,
        userEvent: "input.type",
    })
    chatEditor.selectionRect()
    return ok
}

function e2eInsertMention(p: {userId: string; label: string; from?: number; to?: number}) {
    chatEditor.focus()
    let ok = Command.dispatch(chatEditor, insertMentionCommand, p)
    chatEditor.selectionRect()
    return ok
}

function e2eScheduleQuery() {
    return detectScheduleQuery(chatEditor.state)
}

function remountCompose(opts: {submit?: "Enter" | "Shift-Enter"; schedulePreset?: "two-actions"}) {
    if (e2eApi) {
        e2eApi.sendLog.length = 0
        e2eApi.lastMentionQuery = null
        e2eApi.lastScheduleAccept = null
        e2eApi.lastScheduleAction = null
    }
    let submit = opts.submit
    let extra: EditorState.Extension | undefined
    if (submit) {
        extra = EditorState.prec.high(
            KeyBinding.of({
                key: submit,
                run: () => {
                    e2eApi?.sendLog.push("send")
                    return true
                },
            }),
        )
    }
    let scheduleActions = opts.schedulePreset == "two-actions" ? twoScheduleActions : undefined
    remountChat(chatOptions(extra, submit, scheduleActions))
}

// —— Debug surface ——
;(window as any).arrisa = {docEditor, chatEditor}

if (e2eMode) {
    document.body.dataset.e2e = "1"
    e2eApi = {
        chatEditor,
        lastMentionQuery: null,
        lastScheduleAccept: null,
        lastScheduleAction: null,
        dump: e2eDump,
        insertMention: e2eInsertMention,
        insertText: e2eInsertText,
        remountCompose,
        sendLog: [],
        scheduleQuery: e2eScheduleQuery,
    }
    ;(window as any).__arrisaE2e = e2eApi
    setTab("chat")
}

console.log("playground ready — window.arrisa = { docEditor, chatEditor }")
