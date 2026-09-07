/**
 * Arrisa playground — manual QA for document + messenger editor modes.
 */
import {serialize} from "@arrisa/doc"
import type {Arrisa} from "@arrisa/editor"
import {docToFormattedText} from "@arrisa/message"
import {createChatEditor, createDocEditor, playgroundLinkPrompt} from "./setup"

let docMount = document.getElementById("editor-doc") as HTMLElement
let chatMount = document.getElementById("editor-chat") as HTMLElement
let chatToolbar = document.getElementById("chat-format-bar") as HTMLElement
let chatLinkField = document.getElementById("chat-link-field") as HTMLElement
let chatOut = document.getElementById("chat-out") as HTMLPreElement
let inspectOut = document.getElementById("inspect-out") as HTMLPreElement

let linkPrompt = playgroundLinkPrompt(chatLinkField)
let docEditor = createDocEditor(docMount)
let chatEditor = createChatEditor(chatMount, chatToolbar, linkPrompt)
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
    ].join("\n")
    chatOut.textContent = (chatOut.textContent ? chatOut.textContent + "\n\n" : "") + line
    console.log("chat send", {html, formatted})
})

document.getElementById("btn-clear-chat")!.addEventListener("click", () => {
    chatMount.replaceChildren()
    chatToolbar.replaceChildren()
    chatLinkField.hidden = true
    chatEditor = createChatEditor(chatMount, chatToolbar, linkPrompt)
    trackFocus(chatEditor)
    activeEditor = chatEditor
    ;(window as any).arrisa.chatEditor = chatEditor
    chatEditor.focus()
})

// —— Inspect ——
document.getElementById("btn-refresh-inspect")!.addEventListener("click", refreshInspect)

// —— Debug surface ——
;(window as any).arrisa = {docEditor, chatEditor}

console.log("playground ready — window.arrisa = { docEditor, chatEditor }")
