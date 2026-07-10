/**
 * @arrisa/schema — ready-made editor schema extensions built on @arrisa/types.
 *
 * This package wires node/mark **types** from `@arrisa/types` into full editor
 * extensions: schema registration, menu buttons, key bindings, input rules, and
 * small UI surfaces (dialogs, color picker, image resize).
 *
 * **Usage**
 * - Prefer a preset: {@link basicSchema}, {@link fullSchema}, or {@link inlineSchema}.
 * - Or compose factories: `paragraph()`, `strong()`, `image()`, `bulletList()`, …
 *
 * Each factory returns an extension (or array of extensions). Merged namespaces
 * (e.g. `paragraph.button`, `link.tooltip`) expose the individual pieces when
 * you need to re-rank or omit chrome.
 *
 * Layering: `@arrisa/types` (schema elements) → this package (editor chrome) →
 * `@arrisa/editor` / `@arrisa/command` (runtime).
 */
export {
    paragraph,
    heading,
    codeBlock,
    alignment,
    direction,
    blockquote,
    horizontalRule,
    blockDoc,
    inlineDoc,
} from "./block"
export {bulletList, orderedList} from "./list"
export {
    lineBreak,
    basicMarks,
    messengerMarks,
    inlineMarks,
    basicSchema,
    inlineSchema,
    messengerSchema,
    fullSchema,
    type MessengerSchemaConfig,
} from "./bundle"
export {strong, emphasis, code, underline, strikethrough, spoiler, superscript, subscript} from "./mark"
export {color, backgroundColor, ColorPicker} from "./color"
export {link, isLinkPasteUrl} from "./link"
export {
    image,
    figure,
    imageResizing,
    imageUploader,
    activeImage,
    insertImage,
    imageDialog,
} from "./image"
