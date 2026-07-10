/**
 * Image and figure schema extensions.
 *
 * - {@link image} — inline `Image` leaf + insert UI (dialog, menu, drop)
 * - {@link figure} — block `Figure`, optionally `CaptionedFigure`
 * - {@link imageResizing} — `ImageSize` mark with drag handle and shortcuts
 *
 * Shared pieces ({@link imageUploader}, {@link activeImage}) live in
 * `image-shared.ts` so the dialog module stays acyclic. Re-exported here for
 * the package public API.
 */
import {Menu} from "@arrisa/command"
import {Arrisa, KeyBinding} from "@arrisa/editor"
import {imagePhrases} from "@arrisa/phrases"
import {EditorState} from "@arrisa/state"
import {CaptionedFigure, Figure, Image, ImageAlt, sanitizeImageSrc} from "@arrisa/types"
import {imageDialog, insertImage} from "./image-dialog"
import {activeImage, imageUploader} from "./image-shared"

export {imageResizing} from "./image-resize"
export {activeImage, imageUploader} from "./image-shared"
export {insertImage, imageDialog} from "./image-dialog"

/** Alt mark, insert button/dialog, and drop upload — shared by image and figure. */
function baseSupport(): EditorState.Extension {
    return [EditorState.schemaElement.of(ImageAlt), image.button, imageDialog, image.keyBinding, image.dropHandler]
}

/** Inline image leaf with insert chrome (dialog, shortcut, drop handler). */
export function image(): EditorState.Extension {
    return [EditorState.schemaElement.of(Image), baseSupport()]
}

/**
 * Block figure (and optionally captioned figure).
 *
 * @param conf.captioned When true, also registers {@link CaptionedFigure}.
 */
export function figure(
    conf: {
        captioned?: boolean
    } = {},
): EditorState.Extension {
    return [
        EditorState.schemaElement.of(Figure),
        conf.captioned ? [EditorState.schemaElement.of(CaptionedFigure)] : [],
        baseSupport(),
    ]
}

export namespace image {
    /** Open/close the insert image dialog (Ctrl-Alt-i / Ctrl-Cmd-i). */
    export const keyBinding = KeyBinding.of({key: "Ctrl-Alt-i", mac: "Ctrl-Cmd-i", run: insertImage})

    export const button = Menu.Button.define({
        run: insertImage,
        active: (state) => !!activeImage(state.sel),
        label: {
            icon: "M38 34a9 9 0 1 1-19 0 9 9 0 0 1 19 0M9 13A9 9 0 0 0 0 22v56A9 9 0 0 0 9 88h81a9 9 0 0 0 9-9v-56A9 9 0 0 0 91 13zm81 6a3 3 0 0 1 3 3v38l-24-12a3 3 0 0 0-4 1l-23 23-17-11a3 3 0 0 0-4 0L6 75v3L6 78v-56a3 3 0 0 1 3-3z",
        },
        description: imagePhrases.ref("insert_image"),
        parent: Menu.Group.insert,
        rank: 30,
    })

    /**
     * Drop image files when {@link imageUploader} is configured.
     * Inserts inline Image or block Figure depending on which type is in schema.
     */
    export const dropHandler: EditorState.Extension = EditorState.prec.lowest(
        Arrisa.domEventHandler("drop", (event, editor) => {
            let {state} = editor,
                upload = state.facet(imageUploader)[0]
            let type = state.schema.has(Image) ? Image : state.schema.has(Figure) ? Figure : null
            if (!type || !upload || !event.dataTransfer) return false
            let files = event.dataTransfer.files,
                uploads: Promise<string>[] = []
            for (let i = 0; i < files.length; i++) {
                let file = files[i]
                if (/^image\//.test(file.type)) uploads.push(upload(file, editor, () => {}))
            }
            if (!uploads.length) return false
            let dropPos = {x: event.clientX, y: event.clientY}
            Promise.all(uploads).then(
                (urls) => {
                    let nodes = urls.map((u) => sanitizeImageSrc(u)).filter((u): u is string => u != null).map((u) => type.of(u))
                    if (!nodes.length) return
                    editor.dispatch({
                        changes: {from: editor.posAtCoords(dropPos).pos, insert: nodes, fit: true},
                        userEvent: "drop.image",
                    })
                },
                (err) => {
                    Arrisa.logException(state, err, "Dropped image upload")
                },
            )
            return true
        }),
    )

    /** Alias for {@link insertImage}. */
    export const insert = insertImage

    /** Alias for {@link imageUploader}. */
    export const uploader = imageUploader
}
