/**
 * Arrisa playground — manual QA for document + messenger editor modes.
 */
import {serialize} from "@arrisa/doc"
import type {Arrisa} from "@arrisa/editor"
import {createChatEditor, createDocEditor} from "./setup"

let docMount = document.getElementById("editor-doc") as HTMLElement
let chatMount = document.getElementById("editor-chat") as HTMLElement
let chatOut = document.getElementById("chat-out") as HTMLPreElement
let inspectOut = document.getElementById("inspect-out") as HTMLPreElement

let docEditor = createDocEditor(docMount)
let chatEditor = createChatEditor(chatMount)
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
    return [
        `doc.length = ${doc.length}`,
        `selection = ${selection.from}…${selection.to}${selection.empty ? " (cursor)" : ""}`,
        `ranges:\n${ranges}`,
        ``,
        `HTML:`,
        html,
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
    let html = serialize(chatEditor.state.doc).toHTML()
    let line = `[${new Date().toLocaleTimeString()}] ${html || "(empty)"}`
    chatOut.textContent = (chatOut.textContent ? chatOut.textContent + "\n" : "") + line
    console.log("chat send", html)
})

document.getElementById("btn-clear-chat")!.addEventListener("click", () => {
    chatMount.replaceChildren()
    chatEditor = createChatEditor(chatMount)
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
