/**
 * Modal dialogs hosted as top panels.
 *
 * {@link Dialog.show} appends a panel constructor to the dialog field and
 * returns `{close, result}`: `result` resolves to the submitted form (or
 * `null` on cancel), then auto-dispatches `close` if the dialog is still open.
 * Custom `content` may supply its own form(s); otherwise a simple labeled
 * input + submit button is built.
 */
import {phrases} from "@arrisa/phrases"
import {EditorState, Transaction} from "@arrisa/state"
import type {Arrisa} from "./editor"
import {Panel} from "./panel"
import {setSafeAttributes} from "./safe-dom-attrs"

export interface Dialog {
    /** Custom dialog body; receives a `close` callback that cancels without submit. */
    content?: (editor: Arrisa, close: () => void) => Element

    label?: string

    /** Attributes for the default text input (when not using `content`). */
    input?: {[attr: string]: string}

    submitLabel?: string

    class?: string

    /** Autofocus: CSS selector, or `true` for first input/button. */
    focus?: string | boolean

    /** Prefer top panel stack (default true). */
    top?: boolean
}

export namespace Dialog {
    export function show(
        editor: Arrisa,
        config: Dialog,
    ): {
        close: Transaction.Effect<unknown>
        result: Promise<HTMLFormElement | null>
    } {
        let resolve: (form: HTMLFormElement | null) => void
        let promise = new Promise<HTMLFormElement | null>((r) => (resolve = r))
        let panelCtor = (editor: Arrisa) => createDialog(editor, config, resolve)
        if (editor.state.field(dialogField, false)) {
            editor.dispatch({effects: openDialogEffect.of(panelCtor)})
        } else {
            editor.dispatch({effects: EditorState.appendConfig.of(dialogField.init(() => [panelCtor]))})
        }
        let close = closeDialogEffect.of(panelCtor)
        return {
            close,
            result: promise.then((form) => {
                let queue = editor.win.queueMicrotask || ((f: () => void) => editor.win.setTimeout(f, 10))
                queue(() => {
                    if (editor.state.field(dialogField).indexOf(panelCtor) > -1) editor.dispatch({effects: close})
                })
                return form
            }),
        }
    }

    export function get(editor: Arrisa, className: string) {
        let dialogs = editor.state.field(dialogField, false) || []
        for (let open of dialogs) {
            let panel = Panel.get(editor, open)
            if (panel && panel.dom.classList.contains(className)) return panel
        }
        return null
    }

    export function close(editor: Arrisa, className: string) {
        let dialogs = editor.state.field(dialogField, false) || []
        for (let open of dialogs) {
            let panel = Panel.get(editor, open)
            if (panel && panel.dom.classList.contains(className)) {
                editor.dispatch({effects: closeDialogEffect.of(open)})
                return true
            }
        }
        return false
    }
}

const dialogField = EditorState.Field.define<readonly Panel.Constructor[]>({
    create() {
        return []
    },
    update(dialogs, tr) {
        for (let e of tr.effects) {
            if (e.is(openDialogEffect)) dialogs = [e.value].concat(dialogs)
            else if (e.is(closeDialogEffect)) dialogs = dialogs.filter((d) => d != e.value)
        }
        return dialogs
    },
    provide: (f) => Panel.show.computeN((state) => state.field(f)),
})

const openDialogEffect = Transaction.Effect.define<Panel.Constructor>()
const closeDialogEffect = Transaction.Effect.define<Panel.Constructor>()

function createDialog(editor: Arrisa, config: Dialog, result: (form: HTMLFormElement | null) => void): Panel {
    let content = config.content ? config.content(editor, () => done(null)) : null
    if (!content) {
        content = document.createElement("form")
        content.className = "arrisa-form"
        if (config.input) {
            let input = document.createElement("input")
            setSafeAttributes(input, config.input, {styleAsCssText: true})
            if (/^(text|password|number|email|tel|url)$/.test(input.type)) input.classList.add("arrisa-textfield")
            if (!input.name) input.name = "input"
            let label = content.appendChild(document.createElement("label"))
            if (config.label) label.append(config.label + ": ")
            label.append(input)
        } else if (config.label) {
            content.append(document.createTextNode(config.label))
        }
        let button = document.createElement("button")
        button.className = "arrisa-dialog-button"
        button.type = "submit"
        content.append(" ", button)
        button.append(config.submitLabel ?? "OK")
    }
    let forms = content.nodeName == "FORM" ? [content] : content.querySelectorAll("form")
    for (let i = 0; i < forms.length; i++) {
        let form = forms[i] as HTMLFormElement
        form.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key == "Escape") {
                event.preventDefault()
                done(null)
            } else if (event.key == "Enter") {
                event.preventDefault()
                done(form)
            }
        })
        form.addEventListener("submit", (event: Event) => {
            event.preventDefault()
            done(form)
        })
    }
    let close = document.createElement("button")
    close.onclick = () => done(null)
    close.setAttribute("aria-label", phrases.get(editor.state, "dialog_close"))
    close.className = "arrisa-dialog-close"
    close.type = "button"
    close.append("×")
    let panel = document.createElement("arrisa-dialog")
    panel.append(content, close)
    if (config.class) panel.className = config.class

    function done(form: HTMLFormElement | null) {
        if (panel.contains(panel.ownerDocument.activeElement)) editor.focus()
        result(form)
    }
    let mustFocus = config.focus
    return {
        dom: panel,
        top: config.top !== false,
        connect: () => {
            if (mustFocus) {
                mustFocus = false
                let focus: HTMLInputElement | HTMLButtonElement | undefined | null
                if (typeof config.focus == "string") focus = content!.querySelector(config.focus) as any
                else focus = content!.querySelector("input") || content!.querySelector("button")
                if (focus && "select" in focus) focus.select()
                else if (focus && "focus" in focus) focus.focus()
            }
        },
    }
}
