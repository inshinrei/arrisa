# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/editor` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Use `@arrisa/editor` when you need a live, editable DOM view for Arrisa state:

- Mount an editor in a page or shadow root
- Keymaps, decorations, panels, menus, tooltips, dialogs
- Clipboard / drop / IME handling

Prefer pure `@arrisa/state` + `@arrisa/command` tests when the view is not required.

## Public API & common patterns

### Create and dispatch

```ts
import {Arrisa} from "@arrisa/editor"

let editor = Arrisa.create({
  parent,
  doc: "<p></p>", // string HTML path — sanitize if untrusted
  config: [/* extensions */],
})

// Prefer transactions over mutating contentDOM
editor.dispatch({
  changes: {from, to, insert},
  selection,
  userEvent: "input.type",
})
```

`state` updates synchronously; DOM flush is deferred. Do not dispatch during flush.

### Wire history (not bundled)

```ts
import {Command, undo as cmdUndo, redo as cmdRedo} from "@arrisa/command"
import {history, undo, redo} from "@arrisa/history"

history(),
Command.handler(cmdUndo, (ed) => undo({state: ed.state})),
Command.handler(cmdRedo, (ed) => redo({state: ed.state})),
```

Default keymap binds Mod-z/y to command stubs until handlers exist.

### Menus

```ts
import {menuBar, floatingMenu} from "@arrisa/editor"
import {Menu} from "@arrisa/command"

// Items come from Menu.Item extensions (schema packages register many)
menuBar()
floatingMenu({template: Menu.Group.inline.template(), above: true})
```

### Key bindings

```ts
import {KeyBinding} from "@arrisa/editor"
import {Command, toggleStrong} from "@arrisa/command"

KeyBinding.of({key: "Mod-b", run: toggleStrong})
// KeyBinding.useDefaultKeymap.of(false) to drop defaults
```

### Decorations

```ts
import {Decoration, Widget, PointSet, RangeSet} from "@arrisa/editor"

// PointSet / RangeSet sources via Decoration.Point.source / Range.source
// Tag overrides: Decoration.Tag.shape | wrapper | widget | attribute
```

### Plugins

```ts
Arrisa.Plugin.fromClass(class {
  constructor(readonly editor: Arrisa) {}
  update(update: Arrisa.Update) {/* write DOM if needed; scheduleDOMRead for layout */}
})
```

### Security hooks (required for untrusted HTML)

```ts
Arrisa.htmlSanitize.of((html) => DOMPurify.sanitize(html))
// Arrisa.trustedHTMLPolicy.of(policy) when CSP requires Trusted Types
```

## Invariants / pitfalls

1. **Do not mutate `contentDOM` as the source of truth** — dispatch transactions.
2. **No dispatch during flush** — throws; use `updateListener` carefully (nested updates are separate).
3. **Geometry APIs need a connected editor** — `moveToLineBoundary`, `coordsAtPos`, etc. call `ensureFlushed`.
4. **`@arrisa/command`’s `Arrisa` is an interface** — the editor class implements it; import the class only from `@arrisa/editor`.
5. **Default undo is a stub** — install `@arrisa/history` + handlers or rebind keys.
6. **Paste/HTML is unsafe by default** — without `htmlSanitize`, untrusted HTML is not safe.
7. **Attribute maps** go through safe-attr filtering for known dangerous names; values still need care.
8. **Range decorations must not overlap** and must be added in order when building `RangeSet`.
9. **Layering** — editor may import command; command/history/doc/state must not import editor.

## What not to do

- Do not invent exports beyond the package entry (`Arrisa`, `KeyBinding`, decoration types, `Panel`, `menuBar`, `floatingMenu`, `Dialog`, `Tooltip`, `InputRule`, `placeholder`, `dropCursor`).
- Do not treat schema `ignoreTags` as XSS protection.
- Do not create an identity Trusted Types policy inside Arrisa apps for convenience — sanitize first.
- Do not read layout in plugin `update` without `scheduleDOMRead`.
- Do not forget `menuBar`/`floatingMenu` need registered `Menu.Item` extensions to show buttons.
- Do not ship untrusted collab remote effects without an allowlist (see collab package + SECURITY.md).

## Related packages

| Package | Relationship |
|---------|----------------|
| `@arrisa/state` | State config, transactions |
| `@arrisa/doc` | Document + HTML parse/serialize |
| `@arrisa/command` | Commands + Menu model |
| `@arrisa/phrases` | Phrase catalogs / aria labels |
| `@arrisa/history` | Undo/redo extension |
| `@arrisa/schema` | Full chrome presets on types |
| `@arrisa/types` | Schema elements |
| `@arrisa/collab` | OT collab (remote effects default-dropped) |

## When in doubt

1. Creating a view? `Arrisa.create({parent, doc|state, config})`.
2. Editing? `editor.dispatch(spec)` with pure command results when possible.
3. Toolbar empty? Ensure schema/menu item extensions are in `config` and `menuBar()`/`floatingMenu()` is installed.
4. Undo dead? `history()` + `Command.handler` for command undo/redo.
5. Untrusted HTML? `Arrisa.htmlSanitize` + sanitize string docs before load.
6. Need geometry? Editor must be connected (`parent` or mount `editor.dom`).
7. Custom UI chrome? `Panel.show` or `Tooltip.show` rather than ad-hoc absolute DOM outside the plugin lifecycle.

## Keep in sync with README

When changing public API or recommended patterns, update this file and `README.md` together.
