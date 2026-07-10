/**
 * Custom element host for the editor wrapper (connect / disconnect lifecycle).
 */
import type {Arrisa} from "./arrisa"

let _wrapElement: {new (editor: Arrisa): HTMLElement} | null = null

function wrapElementConstructor() {
    let ctor = class extends HTMLElement {
        constructor(readonly editor: Arrisa) {
            super()
        }
        connectedCallback() {
            this.editor && this.editor.setConnected(true)
        }
        disconnectedCallback() {
            this.editor && this.editor.setConnected(false)
        }
    }
    // Need to register a name before browsers let you instantiate a
    // custom element. Try multiple names in case multiple versions of
    // the library are loaded.
    for (let i = 0; ; i++) {
        let name = "arrisa-editor" + (i ? "-" + i : "")
        if (!customElements.get(name)) {
            customElements.define(name, ctor)
            break
        }
    }
    return ctor
}

export function createWrapElement(editor: Arrisa) {
    if (!_wrapElement) _wrapElement = wrapElementConstructor()
    return new _wrapElement(editor)
}
