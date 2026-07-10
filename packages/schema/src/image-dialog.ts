/**
 * Image insert/update dialog panel and command.
 *
 * When the dialog field is active, a top {@link Panel} shows a form for src,
 * alt, optional width, figure style (inline / start / center / end), and
 * caption. Submit inserts or replaces the image node at the stored selection.
 *
 * - {@link insertImage} — open/close the panel (also used by menu/keybinding)
 * - {@link imageDialog} — state field holding the selection while the panel is open
 *
 * Optional upload via {@link imageUploader}: shows a file input and progress UI.
 * Depends on {@link activeImage} / {@link imageUploader} from `image-shared`
 * only — never imports `image.ts`.
 */
import {type Command} from "@arrisa/command"
import {ChangeSet, Mark, type Node, Plot} from "@arrisa/doc"
import {Arrisa, Dialog, Panel} from "@arrisa/editor"
import {imagePhrases, type PhraseSet} from "@arrisa/phrases"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {Alignment, CaptionedFigure, Figure, Image, ImageAlt, ImageSize, sanitizeImageSrc} from "@arrisa/types"
import {cr} from "./dom"
import {activeImage, imageUploader} from "./image-shared"

let svg = "http://www.w3.org/2000/svg"

function rect(x: number, y: number, w: number, h: number, cls: string) {
    let elt = document.createElementNS(svg, "rect")
    elt.setAttribute("x", String(x))
    elt.setAttribute("y", String(y))
    elt.setAttribute("width", String(w))
    elt.setAttribute("height", String(h))
    elt.setAttribute("class", cls)
    return elt
}

function imageTypeButtons(state: EditorState, active: Node.Tag | null) {
    let hasImg = state.schema.has(Image),
        hasFig = state.schema.has(Figure),
        hasCap = state.schema.has(CaptionedFigure)
    let align = (hasFig || hasCap) && state.schema.markAllowed(Alignment, hasFig ? Figure : CaptionedFigure)
    if (!align && !(hasImg && (hasFig || hasCap))) return null
    let buttons: HTMLElement[] = []
    function button(
        type: "inline" | "start" | "center" | "end",
        label: PhraseSet.Tag<typeof imagePhrases>,
        isActive: boolean | null,
    ) {
        let labelText = imagePhrases.get(state, label)
        let icon = document.createElementNS(svg, "svg")
        icon.setAttribute("viewBox", "0 0 24 22")
        icon.setAttribute("width", "24")
        icon.setAttribute("height", "22")
        icon.appendChild(rect(1, 1, 22, 3, "arrisa-img-icon-text"))
        let flip = !state.textLTR
        icon.appendChild(
            rect(
                type == "start" ? (flip ? 12 : 2) : type == "end" ? (flip ? 2 : 12) : 7,
                6,
                10,
                10,
                "arrisa-img-icon-image",
            ),
        )
        if (type == "inline") {
            icon.appendChild(rect(1, 12, 5, 3, "arrisa-img-icon-text"))
            icon.appendChild(rect(18, 12, 5, 3, "arrisa-img-icon-text"))
        }
        icon.appendChild(rect(1, 18, 22, 3, "arrisa-img-icon-text"))
        return cr(
            "label",
            {class: "arrisa-img-radio", title: labelText},
            cr("input", {
                type: "radio",
                "aria-label": labelText,
                name: "type",
                value: type,
                checked: isActive ? "checked" : null,
            }),
            icon,
        )
    }
    let aligned = !active || active.type == Image ? null : active.mark(Alignment) || ("start" as const)
    if (hasImg) buttons.push(button("inline", "inline", aligned == null))
    buttons.push(button("start", "figure", aligned == "start"))
    if (align) {
        buttons.push(button("center", "figure_center", aligned == "center"))
        buttons.push(button("end", "figure_end", aligned == "end"))
    }
    if (hasFig && hasCap) {
        let caption = cr(
            "label",
            " ",
            cr("input", {
                type: "checkbox",
                name: "caption",
                checked: active && active.type == CaptionedFigure ? "checked" : null,
            }),
            " ",
            imagePhrases.get(state, "captioned"),
        )
        if (hasImg) {
            let imageRadio = buttons[0].querySelector("input") as HTMLInputElement
            for (let b of buttons)
                b.querySelector("input")!.addEventListener("change", () => {
                    caption.style.display = imageRadio.checked ? "none" : ""
                })
            if (!aligned) caption.style.display = "none"
        }
        buttons.push(caption)
    }
    return [cr("span", {class: "arrisa-label"}, imagePhrases.get(state, "image_style"), ":"), cr("span", buttons)]
}

let setImageDialog = Transaction.Effect.define<boolean>()

let createImagePanel: Panel.Constructor = (editor) => {
    let dom = buildImagePanel(editor),
        mustFocus = true
    return {
        top: true,
        dom,
        connect() {
            if (mustFocus) {
                mustFocus = false
                let target = dom.querySelector("input[name=src]") as HTMLElement | null
                if (target) target.focus()
            }
        },
    }
}

function startUpload(editor: Arrisa, file: HTMLInputElement, set: (url: string) => void) {
    let imageFile = file.files?.[0],
        handler = editor.state.facet(imageUploader)[0]
    if (!imageFile || !handler) return
    let promise = handler(imageFile, editor, (percent) => {
        progress.lastChild!.textContent = Math.round(percent) + "%"
    })
    let progress = cr(
        "span",
        {class: "arrisa-img-upload", style: `width: ${file!.offsetWidth}px`},
        imagePhrases.get(editor.state, "uploading"),
        " ",
        cr("span"),
    )
    file.parentNode!.replaceChild(progress, file)
    function reset() {
        if (progress.parentNode) progress.parentNode.replaceChild(file, progress)
    }
    promise.then(
        (url) => {
            reset()
            let safe = sanitizeImageSrc(url)
            if (safe) set(safe)
            else Dialog.show(editor, {label: imagePhrases.get(editor.state, "upload_failed") + ": invalid image URL"})
        },
        (err) => {
            reset()
            Dialog.show(editor, {label: imagePhrases.get(editor.state, "upload_failed") + ": " + err})
        },
    )
}

function buildImagePanel(editor: Arrisa) {
    let {state} = editor
    let sel = (state.field(imageDialog) || state.selection).resolve(state.doc)
    let active = activeImage(sel)
    let size = !editor.state.schema.has(ImageSize)
        ? null
        : [
              cr("label", {for: "arrisa-img-size"}, imagePhrases.get(state, "width"), ":"),
              cr("input", {
                  type: "number",
                  id: "arrisa-img-size",
                  name: "size",
                  value: (active && active.mark(ImageSize)) || "",
                  placeholder: imagePhrases.get(state, "auto"),
              }),
          ]
    let src = cr("input", {
        type: "text",
        id: "arrisa-img-src",
        name: "src",
        required: "required",
        value: active ? active.param : "",
        placeholder: "https://",
    })
    let file: HTMLInputElement | null = null
    if (editor.state.facet(imageUploader).length) {
        file = cr("input", {
            type: "file",
            id: "arrisa-img-file",
            name: "file",
            "aria-label": imagePhrases.get(state, "upload_image"),
            onchange: (e: Event) => startUpload(editor, e.target as HTMLInputElement, (url) => (src.value = url)),
        })
    }

    let form = cr(
        "form",
        {class: "arrisa-img-form", onkeydown},
        cr("div", {class: "arrisa-dialog-title"}, imagePhrases.get(state, active ? "update_image" : "insert_image")),
        cr("label", {for: "arrisa-img-src"}, imagePhrases.get(state, "image_source"), ":"),
        cr("span", {class: "arrisa-img-src-line"}, src, file),
        cr("label", {for: "arrisa-img-alt"}, imagePhrases.get(state, "alt_text"), ":"),
        cr("input", {
            type: "text",
            id: "arrisa-img-alt",
            name: "alt",
            value: (active && active.mark(ImageAlt)) || "",
            placeholder: imagePhrases.get(state, "describe_image"),
        }),
        imageTypeButtons(state, active),
        size,
        cr(
            "div",
            {class: "arrisa-img-buttons"},
            cr(
                "button",
                {type: "submit", class: "arrisa-dialog-button"},
                imagePhrases.get(state, active ? "update" : "insert"),
            ),
            " ",
            cr(
                "button",
                {type: "button", class: "arrisa-dialog-button", onclick: close},
                imagePhrases.get(state, "cancel"),
            ),
        ),
    )

    function onsubmit(e: Event) {
        e.preventDefault()
        let {state} = editor,
            sel = (state.field(imageDialog) || state.selection).resolve(state.doc)

        let data = new FormData(form)
        let srcRaw = data.get("src") as string
        let srcVal = srcRaw ? sanitizeImageSrc(srcRaw) : null
        if (!srcVal) return
        let type = (data.get("type") as string | null) ?? (state.schema.has(Image) ? "inline" : "start")
        let cap = !!data.get("caption") || !state.schema.has(Figure)
        let marks: Mark.Set = []
        if (type == "center" || type == "end") marks = Alignment.of(type).addToSet(marks)
        if (data.get("alt")) marks = ImageAlt.of(data.get("alt") as string).addToSet(marks)
        if (data.get("size")) marks = ImageSize.of(Number(data.get("size") as string)).addToSet(marks)
        let tag =
            type == "inline" ? Image.of(srcVal, marks) : cap ? CaptionedFigure.of(srcVal, marks) : Figure.of(srcVal, marks)

        let change: ChangeSet.Spec
        if (sel.from.parent.node.type == CaptionedFigure && sel.to.parent.start == sel.from.parent.start) {
            let from = sel.from.parent.before

            if (tag instanceof Plot.Tag) change = {from, to: from + 1, insert: [tag]}
            else change = {from, to: sel.from.parent.after, insert: [tag], fit: true}
        } else {
            change = {
                from: sel.from.pos,
                to: sel.to.pos,
                insert: [tag instanceof Plot.Tag ? tag.create() : tag],
                fit: true,
            }
        }

        editor.focus()
        let changes = ChangeSet.create(state.doc, change),
            pos = changes.findInserted((t) => t == tag) ?? change.from
        editor.dispatch({
            changes: change,
            effects: setImageDialog.of(false),
            userEvent: "insert.image",
            selection: tag instanceof Plot.Tag ? {anchor: pos + 1} : EditorSelection.node(pos, tag),
        })
    }

    function close() {
        editor.focus()
        editor.dispatch({effects: setImageDialog.of(false)})
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.key == "Escape") {
            e.preventDefault()
            close()
        }
    }

    return cr("arrisa-dialog", {class: "arrisa-img-dialog", onsubmit}, form)
}

/**
 * Toggle the image dialog panel.
 * Appends {@link imageDialog} to config on first open when not already present.
 */
export let insertImage: Command = (editor) => {
    let val = editor.state.field(imageDialog, false)
    if (val) {
        editor.dispatch({effects: setImageDialog.of(false)})
    } else {
        let effects: Transaction.Effect<any>[] = [setImageDialog.of(true)]
        if (val === undefined) effects.push(EditorState.appendConfig.of(imageDialog))
        editor.dispatch({effects})
    }
    return true
}

let imageDialogTheme = Arrisa.styles({
    ".arrisa-img-dialog": {
        borderBottom: "1px solid var(--arrisa-border-color)",
    },
    ".arrisa-img-form": {
        padding: "5px 3px",
        display: "grid",
        gap: "8px",
        alignItems: "center",
        gridTemplateColumns: "max-content auto",
        "& label, & .arrisa-label": {
            textAlign: "right",
        },
    },
    ".arrisa-dialog-title": {
        gridColumn: "span 2",
        fontSize: "90%",
        fontWeight: "bold",
        textAlign: "center",
    },
    ".arrisa-img-buttons": {
        gridColumn: "2",
    },
    ".arrisa-img-src-line": {
        display: "flex",
        gap: "7px",
        "& [type=text]": {
            flex: "1",
        },
    },
    ".arrisa-img-radio": {
        display: "inline-block",
        verticalAlign: "middle",
        "& input[type=radio]": {
            opacity: "0",
            position: "absolute",
            pointerEvents: "none",
        },
        "& svg": {
            marginRight: "6px",
            width: "24px",
            "& .arrisa-img-icon-text": {fill: "#bbb"},
            "& .arrisa-img-icon-image": {fill: "#888"},
        },
        "& input:checked + svg .arrisa-img-icon-image": {
            fill: "var(--arrisa-highlight-color)",
        },
        "& input:focus + svg": {
            borderRadius: "2px",
            outline: "2px solid var(--arrisa-highlight-color)",
        },
    },
    ".arrisa-img-upload": {
        boxSizing: "border-box",
        padding: "4px",
        fontSize: "80%",
    },
})

/**
 * Holds the selection snapshot while the insert/update panel is open (`null` when closed).
 * Provides a top panel constructor and dialog styles.
 */
export let imageDialog = EditorState.Field.define<null | EditorSelection>({
    create: () => null,
    update(value, tr) {
        for (let e of tr.effects) if (e.is(setImageDialog)) return e.value ? tr.state.selection : null
        return value && value.map(tr.changes, tr.state)
    },
    provide: (f) => [EditorState.prec.lowest(Panel.show.from(f, (val) => val && createImagePanel)), imageDialogTheme],
})

