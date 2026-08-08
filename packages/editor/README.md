# @arrisa/editor

Arrisa view layer — DOM rendering, input, decorations, keymaps, and UI chrome (menus, panels, tooltips, dialogs).

## Install

```bash
pnpm add @arrisa/editor
```

Depends on `@arrisa/doc`, `@arrisa/state`, `@arrisa/command`, and `@arrisa/phrases`. For undo/redo, add [`@arrisa/history`](https://www.npmjs.com/package/@arrisa/history). For a full schema + menus, use [`@arrisa/schema`](https://www.npmjs.com/package/@arrisa/schema).

## Quick start

```ts
import {Arrisa, menuBar, KeyBinding, placeholder} from "@arrisa/editor"
import {history, undo as histUndo, redo as histRedo} from "@arrisa/history"
import {Command, undo as cmdUndo, redo as cmdRedo, Menu} from "@arrisa/command"
import {basicSchema} from "@arrisa/schema"

let editor = Arrisa.create({
  parent: document.querySelector("#editor")!,
  doc: "<p>Hello</p>",
  config: [
    basicSchema(),
    history(),
    Command.handler(cmdUndo, (ed) => histUndo({state: ed.state})),
    Command.handler(cmdRedo, (ed) => histRedo({state: ed.state})),
    menuBar(),
    placeholder("Start typing…"),
    Arrisa.scrolling(320),
    Arrisa.label("Document editor"),
  ],
})

editor.focus()
editor.dispatch({
  changes: {from: 1, to: 1, insert: /* … */},
  selection: /* … */,
})
```

## Features / concepts

### View owns DOM; state stays pure

`Arrisa` mounts an outer wrapper, scroll container, and `contenteditable` surface. All logical updates go through `editor.dispatch(Transaction | Spec)`. State updates immediately; DOM flush is scheduled on the next animation frame.

### Default keymap

`KeyBinding` installs bindings. By default, the editor includes a full default keymap (Enter, delete unit/word, arrows, page, Home/End, select-all, Mod-z/y undo/redo stubs, macOS Ctrl-b/f/p/n, …). Disable with `KeyBinding.useDefaultKeymap.of(false)`.

### Chrome

| Extension | Role |
|-----------|------|
| `menuBar` | Sticky top toolbar from `Menu.Item` sources |
| `floatingMenu` | Selection toolbar (tooltip-positioned) |
| `Panel` | Top/bottom panel host (used by menu bar, dialogs) |
| `Dialog` | Modal form panels |
| `Tooltip` | Positioned tooltips + hover sources |
| `placeholder` | Empty-doc placeholder widget |
| `dropCursor` | Caret while dragging over the editor |

### Decorations

Point decorations (widgets, attrs, shapes at a position) and range decorations (wrappers/attrs over spans), plus tag-level shape/wrapper/widget/attribute overrides via `Decoration.Tag.*`.

### Input rules

`InputRule` auto-replaces after `input.type` (markdown-style shortcuts, wrapping, textblock type changes).

## Main public API

### `Arrisa` (view)

**Create & lifecycle**

| API | Description |
|-----|-------------|
| `Arrisa.create(spec)` | Create view (`parent?`, `state?` or `doc`/`selection`/`config`, `scrollTo?`) |
| `editor.dom` / `scrollDOM` / `contentDOM` | Outer, scroll, and editable elements |
| `editor.state` | Current `EditorState` |
| `editor.dispatch(tr \| spec)` | Apply transaction(s); flushes DOM next frame |
| `editor.focus()` | Focus content |
| `editor.hasFocus` / `composing` | Focus and IME state |

**Geometry**

| API | Description |
|-----|-------------|
| `moveToLineBoundary` / `moveVertically` | Used by motion/delete commands |
| `domAtPos` / `posAtDOM` / `nodeDOM` / `nodeFromDOM` | DOM ↔ document mapping |
| `posAtCoords` / `coordsAtPos` / `coordsForElement` | Screen coordinates |
| `scheduleDOMRead` / `scheduleDOMWrite` | Split layout read/write phases |
| `plugin(plugin)` | Plugin value lookup |

**Static facets & helpers** (selected)

| API | Description |
|-----|-------------|
| `Arrisa.htmlSanitize` | **XSS boundary** for clipboard HTML — app must supply sanitizer for untrusted paste |
| `Arrisa.trustedHTMLPolicy` | Trusted Types policy (Arrisa never creates an identity policy) |
| `Arrisa.clipboard*` | Input/output filters and text serializers/parsers |
| `Arrisa.pasteHandler` / `dropHandler` | Override paste/drop |
| `Arrisa.editable` | `contenteditable` on/off |
| `Arrisa.updateListener` | Post-update callbacks |
| `Arrisa.theme` / `styles` / `scrolling` | Styling helpers |
| `Arrisa.label` | `aria-label` on the editable |
| `Arrisa.editorAttributes` / `contentAttributes` | DOM attrs |
| `Arrisa.scrollIntoView` / `scrollHandler` | Scroll control |
| `Arrisa.coveredMargins` | Chrome margins (shared with `@arrisa/command`) |
| `Arrisa.colorScheme` / `cursorBlinkRate` | Appearance |
| `Arrisa.announce` | Screen-reader announcements |
| `Arrisa.exceptionSink` / `logException` | Extension error reporting |
| `Arrisa.Plugin` | View plugins (`define` / `fromClass`) |
| `Arrisa.Update` | Update object passed to plugins/listeners |
| `Arrisa.domEventHandler` / `domEventObserver` | Content DOM events |

```ts
// Theme scoped to the editor
Arrisa.theme({
  "&": {fontFamily: "system-ui"},
  "arrisa-content": {padding: "8px"},
})

// Fixed height + scroll
Arrisa.scrolling(280)
```

### `KeyBinding`

```ts
import {KeyBinding} from "@arrisa/editor"
import {Command, toggleStrong} from "@arrisa/command"

KeyBinding.of({
  key: "Mod-b",
  run: toggleStrong,
})

// Platform-specific / shift-extend
KeyBinding.of({
  key: "ArrowLeft",
  run: Command.bind(moveByUnit, {dir: "left"}),
  shift: Command.bind(moveByUnit, {dir: "left", extend: true}),
})

// Disable defaults
KeyBinding.useDefaultKeymap.of(false)

// Include defaults as extensions if rebuilding the map yourself
KeyBinding.defaultKeymap.map((b) => b.extension)
```

`Mod` is Meta on macOS and Ctrl elsewhere. Specs support `key`, `mac`, `win`, `linux`, `char`, `run`, `shift`, `scope`, `allowDefault`.

### Decorations

| Export | Description |
|--------|-------------|
| `Decoration` | `Point` / `Range` factories + `Decoration.Tag` shape/wrapper/widget/attribute |
| `Widget` | Embed non-editable DOM (`define`, `create`, `Text`, `EditableText`) |
| `PointSet` | Ordered zero-width decoration set |
| `RangeSet` | Ordered non-overlapping range set |

```ts
import {Decoration, Widget, PointSet} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"

let markType = Widget.define<{label: string}>({
  render: (v) => {
    let el = document.createElement("span")
    el.textContent = v.label
    el.className = "pg-mark"
    return el
  },
})

// Point decoration source facet
Decoration.Point.source.of((state) =>
  PointSet.create([[state.selection.head, Decoration.Point.widget(markType.of({label: "×"}))]]),
)
```

Tag-level overrides (by node type):

```ts
Decoration.Tag.shape(myNodeType, Elt.create("div", {class: "custom"}, [/* content hole */]))
Decoration.Tag.wrapper(myNodeType, wrapperElt)
Decoration.Tag.widget(myNodeType, "after", myWidget)
Decoration.Tag.attribute(myNodeType, "class", "foo")
```

### Panels & menus

```ts
import {Panel, menuBar, floatingMenu, defaultFloatingWhen} from "@arrisa/editor"
import {Menu} from "@arrisa/command"

// Sticky bar (default template: Menu.Group.top)
menuBar({
  // template: Menu.Group.top.template(),
  // theme: false, // supply your own CSS
})

// Floating selection toolbar
floatingMenu({
  template: Menu.Group.inline.template(),
  above: true,
  when: defaultFloatingWhen, // non-empty selection
  hideOnBlur: true,
})

// Custom panel
Panel.show.of((editor) => ({
  dom: document.createElement("div"),
  top: true,
  update(update) {/* … */},
}))

Panel.configure({topContainer: externalEl})
```

### Dialog

```ts
import {Dialog} from "@arrisa/editor"

let {close, result} = Dialog.show(editor, {
  label: "URL",
  submitLabel: "Insert",
  // content: (ed, close) => formElement,
})
let form = await result // HTMLFormElement | null
// close is an effect; auto-dispatched after result settles if still open
```

### Tooltip

```ts
import {Tooltip} from "@arrisa/editor"

// Facet-driven tooltips
Tooltip.show.of((state) => ({
  pos: state.selection.head,
  above: true,
  create: (editor) => ({dom: tipElement}),
}))

Tooltip.configure({position: "absolute"})

// Hover tooltips
let {extension, active} = Tooltip.hover((editor, pos, side) => {
  return {pos, create: () => ({dom: hoverEl})}
}, {hoverTime: 300, hideOnChange: true})
```

### Input rules

```ts
import {InputRule} from "@arrisa/editor"

// Replace match with string or custom apply
InputRule.define({
  expr: /--$/,
  apply: "—",
})

// Wrap block (e.g. `> ` → blockquote)
InputRule.wrapping(/^> $/, blockquoteTag)

// Change textblock type (e.g. `# ` → heading)
InputRule.textblockType(/^# $/, headingTag)
```

Rules run after `input.type`; first successful match wins. Default skips code-role ranges unless `inCode: true`.

### Placeholder & drop cursor

```ts
import {placeholder, dropCursor} from "@arrisa/editor"

placeholder("Message…")
// or placeholder(() => document.createElement("span"))

dropCursor()
```

## Layering / related packages

| Package | Role |
|---------|------|
| `@arrisa/doc` | Document model, HTML I/O |
| `@arrisa/state` | State, transactions, extensions |
| `@arrisa/command` | Commands + `Menu` model (this package renders them) |
| `@arrisa/phrases` | Labels / a11y phrase sets |
| `@arrisa/history` | Undo/redo (not a direct dependency — wire yourself) |
| `@arrisa/schema` | Ready-made schema + menu items + keymaps |
| `@arrisa/types` | Schema elements used by schema package |

**Layer:** view layer (3). Depends on command/phrases; must not be imported by doc/state/command/history.

## Security

Schema validation is **not** an XSS boundary. Untrusted HTML (paste, string docs, drag-and-drop) requires an app-supplied sanitizer:

```ts
import {Arrisa} from "@arrisa/editor"
// import DOMPurify from "dompurify"

let sanitize = (html: string) => DOMPurify.sanitize(html)

Arrisa.create({
  parent,
  doc: sanitize(userHtml),
  config: [
    Arrisa.htmlSanitize.of(sanitize),
    // Arrisa.trustedHTMLPolicy.of(myPolicy), // if CSP enforces Trusted Types
  ],
})
```

See the monorepo [`SECURITY.md`](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md) for paste filters, URL policies, and collab remote-effect defaults.

## License

MIT
