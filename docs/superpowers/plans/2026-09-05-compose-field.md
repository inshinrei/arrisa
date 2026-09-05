# Compose Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a block compose-field profile (exact mark/block set, floating toolbar default, embeddable menu, floating/custom link prompt, clear-formatting, list FormattedText I/O, reduced keymap) without a new package and without renaming host products in docs.

**Architecture:** Compose is a preset assembled in existing packages: command (pure mark/doc helpers), schema (`composeSchema` + `link({prompt})`), editor (`composeKeymap`, `embeddedMenu`), message (`composeField` + list entities). `messengerCompose` is unchanged.

**Tech Stack:** TypeScript, Vitest (`*.unit.ts`), Arrisa monorepo packages (`doc` / `state` / `types` / `command` / `editor` / `schema` / `message` / `phrases`).

## Global Constraints

- Prefer `let` over `const` except arrow functions and true module-level constants.
- No host-product names in docs, comments, tests, identifiers, or commit messages.
- Public API changes update that package’s `README.md` **and** `agents-for-module.md` in the same task that adds the export.
- Document only `src/index.ts` re-exports.
- TDD: failing test first, watch it fail, then implement. Record RED/GREEN in the task report.
- Do not change `messengerCompose` / `messengerSchema` defaults.
- `applyLink` and paste-as-link must use `sanitizeLinkHref`; custom prompts call `ctx.apply`, never raw `Link.of`.
- Layering stays acyclic (command must not import editor).
- Tests are `*.unit.ts` next to source. Run the focused file, then the package `pnpm test` before commit.
- Commit per task with a focused message (`feat(command): …`, `feat(schema): …`, etc.).

---

### Task 1: Clear formatting, applyLink, removeLinks

**Files:**
- Modify: `packages/phrases/src/catalogs/ui.ts`
- Modify: `packages/command/src/mark.ts`
- Modify: `packages/command/src/mark.unit.ts`
- Modify: `packages/command/src/index.ts`
- Modify: `packages/command/README.md`
- Modify: `packages/command/agents-for-module.md`
- Modify: `packages/phrases/README.md` only if the public phrase catalog is documented there with a key list; otherwise skip phrases README.

**Interfaces:**
- Consumes: existing `toggleMark` / `runPure` / `stateFromBlocks` / `testSchema`; `Link` + `sanitizeLinkHref` from `@arrisa/types`; `Mark.none` from `@arrisa/doc`
- Produces:
  - phrase `clear_formatting: "Clear formatting"`
  - `clearFormatting: Command.Pure`
  - `applyLink: Command.Pure<string>`
  - `removeLinks: Command.Pure`

- [ ] **Step 1: Write the failing tests** in `packages/command/src/mark.unit.ts`

Extend `testSchema` usage: command `testSchema()` has `bold` but not Link. For link tests, define a local schema with Paragraph + Doc + Link + Strong (same pattern as `schemaWithAlignDir` in this file).

```ts
import {Mark} from "@arrisa/doc"
import {Link, Strong, sanitizeLinkHref} from "@arrisa/types"
import {applyLink, clearFormatting, removeLinks, toggleMark} from "./mark"

describe("clearFormatting", () => {
    it("clears stored marks on an empty cursor", () => {
        let {state, bold} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let marked = runPure(state, toggleMark, bold)
        expect(bold.isInSet((marked.state.selection as EditorSelection.Text).marks || [])).toBeTruthy()
        let cleared = runPure(marked.state, clearFormatting)
        expect(cleared.applied).toBe(true)
        let marks = (cleared.state.selection as EditorSelection.Text).marks
        expect(!marks || marks.length == 0 || marks === Mark.none).toBe(true)
    })

    it("removes marks across a range and does not unwrap blocks", () => {
        let s = testSchema()
        let doc = s.schema.doc([para(s, "hi", [s.bold])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(s.schema.elements)],
        })
        let result = runPure(state, clearFormatting)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter
        expect(s.bold.isInSet(text!.tag.marks)).toBeFalsy()
        expect(result.state.doc.firstChild!.type).toBe(s.paragraph.type)
    })

    it("returns false when there is nothing to clear", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], EditorSelection.range(1, 3))
        expect(clearFormatting({state})).toBe(false)
    })
})

function schemaWithLink() {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
        defaultBlock: true,
    })
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, Link, Strong])
    return {schema, paragraph}
}

describe("applyLink / removeLinks", () => {
    it("adds a sanitized link on a range", () => {
        let {schema, paragraph} = schemaWithLink()
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, applyLink, "https://example.com")
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter
        expect(Link.isInSet(text!.tag.marks)?.value).toBe("https://example.com")
    })

    it("rejects javascript hrefs and empty selections", () => {
        let {schema, paragraph} = schemaWithLink()
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        let ranged = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(applyLink({state: ranged}, "javascript:alert(1)")).toBe(false)
        let cursor = EditorState.create({
            doc,
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(applyLink({state: cursor}, "https://example.com")).toBe(false)
        expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull()
    })

    it("removeLinks strips Link marks and returns false when none", () => {
        let {schema, paragraph} = schemaWithLink()
        let doc = schema.doc([paragraph.create([Leaf.text("hi", [Link.of("https://example.com")])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, removeLinks)
        expect(result.applied).toBe(true)
        expect(Link.isInSet(result.state.doc.resolve(1).nodeAfter!.tag.marks)).toBeFalsy()
        expect(removeLinks({state: result.state})).toBe(false)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/command && pnpm test src/mark.unit.ts`

Expected: FAIL — `clearFormatting` / `applyLink` / `removeLinks` are not exported.

- [ ] **Step 3: Implement**

Add `clear_formatting: "Clear formatting"` to `packages/phrases/src/catalogs/ui.ts`.

In `packages/command/src/mark.ts`:

- `clearFormatting`: empty `EditorSelection.Text` → if stored/active marks length, return selection with `marks: Mark.none` and `userEvent: "mark.remove"`; else false. Non-empty: iterate ranges, for every mark on each node push `{from: pos, to: pos + node.length, remove: mark}`; if none, false.
- `applyLink`: `sanitizeLinkHref(href)`; empty selection or null safe → false; else add `Link.of(safe)` on each range.
- `removeLinks`: copy the iterate-and-remove loop currently in `packages/schema/src/link.ts` (Link marks only).

Re-export from `packages/command/src/index.ts`. Document the three commands in command README + agents-for-module.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/command && pnpm test src/mark.unit.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/phrases/src/catalogs/ui.ts packages/command/src/mark.ts packages/command/src/mark.unit.ts packages/command/src/index.ts packages/command/README.md packages/command/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(command): clear formatting and link apply/remove

EOF
)"
```

---

### Task 2: replaceDoc without history

**Files:**
- Create: `packages/command/src/replace-doc.ts`
- Create: `packages/command/src/replace-doc.unit.ts`
- Modify: `packages/command/src/index.ts`
- Modify: `packages/command/README.md`
- Modify: `packages/command/agents-for-module.md`

**Interfaces:**
- Consumes: `EditorState`, `Transaction.addToHistory`, `EditorSelection`, `Slice` (if insert needs a slice), `Plot.Doc`
- Produces: `replaceDoc: Command.Pure<Plot.Doc>` — replaces `0..doc.length` with `next.content`, cursor near start, `userEvent: "set.doc"`, `annotations: Transaction.addToHistory.of(false)`

- [ ] **Step 1: Write the failing test** in `packages/command/src/replace-doc.unit.ts`

```ts
import {describe, expect, it} from "vitest"
import {Leaf} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {para, runPure, stateFromBlocks} from "./test-helpers"
import {replaceDoc} from "./replace-doc"

describe("replaceDoc", () => {
    it("replaces the document and opts out of history", () => {
        let {state, schema, paragraph} = stateFromBlocks((s) => [para(s, "old")], 1)
        let next = schema.doc([paragraph.create([Leaf.text("new")])])
        let result = runPure(state, replaceDoc, next)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("new")
        let tr = state.update(result.spec as Transaction.Spec)
        expect(tr.annotation(Transaction.addToHistory)).toBe(false)
        expect(tr.annotation(Transaction.userEvent)).toBe("set.doc")
    })
})
```

If `runPure` typing disagrees with `Command.Pure<Plot.Doc>`, call `replaceDoc({state}, next)` directly and `apply`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command && pnpm test src/replace-doc.unit.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export const replaceDoc: Command.Pure<Plot.Doc> = ({state}, next) => {
    return {
        changes: {from: 0, to: state.doc.length, insert: next.content as any, fit: true},
        selection: EditorSelection.cursor(Math.min(1, Math.max(0, next.length))),
        userEvent: "set.doc",
        annotations: Transaction.addToHistory.of(false),
    }
}
```

Use the insert form that actually replaces block children in this codebase (`Slice.of([...next.content])` if `insert: next.content` fails the test). Cursor must be a valid position in the new doc (empty paragraph → pos 1).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/command && pnpm test src/replace-doc.unit.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/command/src/replace-doc.ts packages/command/src/replace-doc.unit.ts packages/command/src/index.ts packages/command/README.md packages/command/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(command): replaceDoc without recording history

EOF
)"
```

---

### Task 3: composeMarks + composeSchema + clear-formatting button

**Files:**
- Modify: `packages/schema/src/bundle.ts`
- Modify: `packages/schema/src/bundle.unit.ts`
- Create: `packages/schema/src/clear-formatting.ts` (button only)
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/README.md`
- Modify: `packages/schema/agents-for-module.md`

**Interfaces:**
- Consumes: existing factories (`blockDoc`, `paragraph`, `lineBreak`, `strong`, `emphasis`, `underline`, `strikethrough`, `code`, `link`, `bulletList`, `orderedList`, `blockquote`, `codeBlock`); `clearFormatting` from command; `phrases.ref("clear_formatting")`
- Produces:
  - `composeMarks(config?: {link?: import("./link").LinkConfig}): Extension`
  - `composeSchema(config?: ComposeSchemaConfig): Extension`
  - `ComposeSchemaConfig` = `{exclusivity?: MessengerSchemaConfig["exclusivity"], link?: LinkConfig}`
  - `clearFormattingButton` (Menu.Button, parent `Menu.Group.inline`, rank `90`)

Until Task 4, `LinkConfig` may be `{}` or omitted — do **not** change `link()` signature yet. `composeMarks` just calls `link()`.

- [ ] **Step 1: Write the failing tests** in `packages/schema/src/bundle.unit.ts`

```ts
import {composeMarks, composeSchema} from "./bundle"
import {clearFormattingButton} from "./clear-formatting"

describe("composeSchema", () => {
    it("registers the compose type set and omits document-only types", () => {
        let state = makeState(composeSchema())
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Paragraph)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Emphasis)).toBe(true)
        expect(state.schema.has(Underline)).toBe(true)
        expect(state.schema.has(Strikethrough)).toBe(true)
        expect(state.schema.has(Code)).toBe(true)
        expect(state.schema.has(Link)).toBe(true)
        expect(state.schema.has(BulletList)).toBe(true)
        expect(state.schema.has(OrderedList)).toBe(true)
        expect(state.schema.has(Blockquote)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(LineBreak)).toBe(true)
        expect(state.schema.has(InlineDoc)).toBe(false)
        expect(state.schema.has(Spoiler)).toBe(false)
        expect(state.schema.has(Heading)).toBe(false)
        expect(state.schema.has(Image)).toBe(false)
        expect(state.schema.has(HorizontalRule)).toBe(false)
        expect(state.schema.has(Alignment)).toBe(false)
    })
})

describe("composeMarks", () => {
    it("does not register spoiler", () => {
        let state = makeState([blockDoc(), paragraph(), composeMarks()])
        expect(state.schema.has(Spoiler)).toBe(false)
        expect(state.schema.has(Code)).toBe(true)
    })
})
```

Also assert `clearFormattingButton.parent === Menu.Group.inline` and `clearFormattingButton.rank === 90` if those fields are public (they are on `Menu.Item.Base`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/schema && pnpm test src/bundle.unit.ts`

Expected: FAIL — `composeSchema` not exported.

- [ ] **Step 3: Implement**

`clearFormattingButton = Menu.Button.define({ run: clearFormatting, label: {icon: "<path d for an eraser / T with slash — a 100x100 path>"}, description: phrases.ref("clear_formatting"), parent: Menu.Group.inline, rank: 90 })`.

Icon path (eraser-ish):

`M22 70 70 22a8 8 0 0 1 12 0l8 8a8 8 0 0 1 0 12L42 90H22zM40 80l40-40`

`composeMarks`: `[strong(), emphasis(), underline(), strikethrough(), code(), link(), clearFormattingButton]` (button is already an extension via `Menu.Button`).

`composeSchema`: same exclusivity wiring as `messengerSchema`, root `[blockDoc(), paragraph(), composeMarks({link: config?.link}), lineBreak(), bulletList(), orderedList(), blockquote(), codeBlock()]`. If `link` config is not typed yet, ignore the field.

Export from `index.ts`. Document presets table: add `composeSchema` row. Note `messengerSchema` remains the inline/spoiler path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/schema && pnpm test src/bundle.unit.ts`

Expected: PASS. Also run `pnpm test src/mark.unit.ts src/list.unit.ts` if those could be affected (should be unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/bundle.ts packages/schema/src/bundle.unit.ts packages/schema/src/clear-formatting.ts packages/schema/src/index.ts packages/schema/README.md packages/schema/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(schema): composeSchema preset for block chat fields

EOF
)"
```

---

### Task 4: Floating link prompt + host override

**Files:**
- Modify: `packages/schema/src/link.ts`
- Modify: `packages/schema/src/link.unit.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/README.md`
- Modify: `packages/schema/agents-for-module.md`

**Interfaces:**
- Consumes: `applyLink`, `removeLinks` from `@arrisa/command`; `Tooltip` from `@arrisa/editor`; `sanitizeLinkHref`
- Produces:
  - `LinkConfig`, `LinkPrompt`, `LinkPromptRequest` exported from schema
  - `link(config?: LinkConfig)`
  - Default prompt `"floating"` (tooltip form, **not** `Dialog`)
  - `prompt: false` → remove-only
  - `prompt: (req) => void` → host UI; `req.apply` dispatches `applyLink`

Keep the read-only cursor link tooltip. Remove the `Dialog.show` path from toggle.

- [ ] **Step 1: Write the failing tests** in `packages/schema/src/link.unit.ts`

Reuse `makeState` from `./test-helpers` with `[blockDoc(), paragraph(), link(config)]`. Build a tiny editor mock:

```ts
function mockEditor(state: EditorState) {
    let current = state
    let dispatched: Transaction.Spec[] = []
    let editor = {
        get state() {
            return current
        },
        dispatched,
        dispatch(...specs: Transaction.Spec[]) {
            for (let s of specs) {
                dispatched.push(s)
                current = current.update(s).state
            }
        },
        focus() {},
        contentDOM: {ownerDocument: {activeElement: null}},
        win: globalThis,
    }
    return editor as any
}
```

Tests:

1. `link.button.run` on a linked range removes the link (no prompt).
2. Unmarked range + custom `prompt` is invoked with `{from, to, apply, cancel}`; `apply("https://ok.example")` adds a Link; `apply("javascript:alert(1)")` does not add.
3. `prompt: false` + unmarked range: command returns `false` (or true with no add dispatch — pick **false**).
4. Empty selection: returns `false`.

Use `link.button.run` (it is a Command). Import `Link` from types.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/schema && pnpm test src/link.unit.ts`

Expected: FAIL — `link()` still opens Dialog / does not accept `prompt`.

- [ ] **Step 3: Implement**

- Export types from `link.ts`.
- Facet `linkPrompt` combining last/first config (`prompt` default `"floating"`).
- Field for open floating prompt `{from, to, href?} | null` + `Tooltip.show` that renders `<form class="arrisa-link-prompt">` with `input[name=url]` and submit. Submit → `applyLink`. Escape / `cancel` clears the field.
- Toggle: close if open; empty → false; `removeLinks` if any Link in selection; `prompt === false` → false; else if function, call it with `apply` wrapping `Command.dispatch(editor, Command.bind(applyLink, href))` plus close; else dispatch open-field for the default tooltip.
- Do **not** import Dialog for this path anymore.
- `link({prompt})` must not double-register the mark if `composeMarks` also calls `link(config)` — one `link()` call per schema.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/schema && pnpm test src/link.unit.ts src/bundle.unit.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/link.ts packages/schema/src/link.unit.ts packages/schema/src/index.ts packages/schema/README.md packages/schema/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(schema): floating link prompt with host override

EOF
)"
```

---

### Task 5: FormattedText list entities

**Files:**
- Modify: `packages/message/src/entities.ts`
- Modify: `packages/message/src/to-formatted.ts`
- Modify: `packages/message/src/from-formatted.ts`
- Modify: `packages/message/src/formatted.unit.ts`
- Modify: `packages/message/src/index.ts`
- Modify: `packages/message/README.md`
- Modify: `packages/message/agents-for-module.md`

**Interfaces:**
- Consumes: `BulletList`, `OrderedList`, `ListItem` from `@arrisa/types`; existing flattener / blockChildren
- Produces:
  - `UnorderedListEntity` `{type: "unordered_list"; offset: number; length: number}`
  - `OrderedListEntity` `{type: "ordered_list"; offset: number; length: number; startIndex?: number}` (`startIndex` omitted when 1)
  - `unorderedListEntity`, `orderedListEntity` constructors
  - `MessageEntity` union includes both
  - `isStructuralEntity` true for both
  - export/import round-trip

- [ ] **Step 1: Write the failing tests** in `packages/message/src/formatted.unit.ts`

Extend `blockSchema()` with `BulletList`, `OrderedList`, `ListItem`.

```ts
it("round-trips a bullet list", () => {
    let schema = blockSchema()
    let doc = schema.doc([
        BulletList.create([
            ListItem.create([Paragraph.create([Leaf.text("a")])]),
            ListItem.create([Paragraph.create([Leaf.text("b")])]),
        ]),
    ])
    let ft = docToFormattedText(doc)
    expect(ft.text).toBe("a\nb")
    expect(ft.entities?.some((e) => e.type == "unordered_list" && e.offset == 0 && e.length == ft.text.length)).toBe(
        true,
    )
    let back = formattedTextToDoc(ft, schema)
    expect(docToFormattedText(back).entities?.some((e) => e.type == "unordered_list")).toBe(true)
    expect(back.firstChild!.type.name).toBe("BulletList")
})

it("exports ordered list startIndex when not 1", () => {
    let schema = blockSchema()
    let doc = schema.doc([
        OrderedList.of(3).create([ListItem.create([Paragraph.create([Leaf.text("x")])])]),
    ])
    let ft = docToFormattedText(doc)
    expect(ft.entities).toEqual(
        expect.arrayContaining([{type: "ordered_list", offset: 0, length: 1, startIndex: 3}]),
    )
})

it("wraps a list inside a blockquote", () => {
    let schema = blockSchema()
    let list = BulletList.create([ListItem.create([Paragraph.create([Leaf.text("q")])])])
    let doc = schema.doc([Blockquote.create([list])])
    let ft = docToFormattedText(doc)
    let back = formattedTextToDoc(ft, schema)
    expect(back.firstChild!.type.name).toBe("Blockquote")
    expect(back.firstChild!.content[0]!.type.name).toBe("BulletList")
})
```

Use the real `OrderedList.of` / `create` API from `@arrisa/types` (if `.of(3).create` is wrong, use `OrderedList.create` with param the same way existing tests set `CodeBlockLanguage`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/message && pnpm test src/formatted.unit.ts`

Expected: FAIL — unknown entity type / no list wrapper.

- [ ] **Step 3: Implement**

- Add types + constructors; include in `MessageEntity`.
- `isStructuralEntity`: `pre | blockquote | unordered_list | ordered_list`.
- Export walker: on `BulletList` / `OrderedList` enter/leave structure frames (same pin-on-first-content as quote). Ordered `startIndex` only if param != 1.
- Import: add list ranges to the cut-set. Tag each segment with the covering list range (exact or containing). **Wrap lists before quotes**: consecutive segments sharing the same list range become one list of `ListItem`s (paragraph or code block per segment). Then existing quote grouping wraps list nodes when every child segment is quoted.

One-level lists are required. Nested lists: implement inner-contained ranges inside a list item only if it falls out of the same walker; do not invent a second pass that mis-nests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/message && pnpm test src/formatted.unit.ts`

Expected: PASS. Run `pnpm test` in the package if other entity tests need `isStructuralEntity` updates.

- [ ] **Step 5: Commit**

```bash
git add packages/message/src/entities.ts packages/message/src/to-formatted.ts packages/message/src/from-formatted.ts packages/message/src/formatted.unit.ts packages/message/src/index.ts packages/message/README.md packages/message/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(message): FormattedText unordered and ordered list entities

EOF
)"
```

---

### Task 6: composeKeymap

**Files:**
- Create: `packages/editor/src/compose-keymap.ts`
- Create: `packages/editor/src/compose-keymap.unit.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/editor/README.md`
- Modify: `packages/editor/agents-for-module.md`

**Interfaces:**
- Consumes: `KeyBinding` from `./key-map`; the same commands as the default keymap subset
- Produces: `composeKeymap(): EditorState.Extension` = `[KeyBinding.useDefaultKeymap.of(false), ...bindings]`

Kept keys: Enter, Shift-Enter, Backspace, Delete, Ctrl/Alt word-delete, arrows + shift, Mod-arrows word, Home/End, Mod-a, Mod-z, Mod-y, mac Mod-Shift-z, linux Ctrl-Shift-z.

Omitted: PageUp/PageDown, transpose, mac emacs Ctrl-b/f/p/n/a/e/d/h/k/t/o/v and Ctrl-Alt-h.

- [ ] **Step 1: Write the failing test** in `packages/editor/src/compose-keymap.unit.ts`

Build a tiny EditorState with a paragraph doc + `composeKeymap()` (copy `makeDoc` from `floating-menu.unit.ts`).

```ts
it("disables the default keymap and omits page motion", () => {
    let state = makeState(composeKeymap())
    expect(state.facet(KeyBinding.useDefaultKeymap)).toBe(false)
    let keys = state.facet(KeyBinding.source).map((b) => b.spec.key)
    expect(keys).toContain("Enter")
    expect(keys).toContain("Backspace")
    expect(keys).not.toContain("PageDown")
    expect(keys).not.toContain("PageUp")
})
```

`KeyBinding` instances store `spec` as a public readonly field (see `key-map.ts`). If `spec` is private, read whatever is public or compare via a small helper exported from `compose-keymap.ts` for tests only — **do not** export test-only helpers. Use the public `spec` field; it is already `readonly spec` on the class.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/editor && pnpm test src/compose-keymap.unit.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement** by copying the kept `KeyBinding.Spec`s from `KeyBinding.defaultKeymap` (not the emacs/page/transpose ones) and wrapping with `KeyBinding.of`. Return `[KeyBinding.useDefaultKeymap.of(false), kept.map(KeyBinding.of)]` (or spread).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/editor && pnpm test src/compose-keymap.unit.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/compose-keymap.ts packages/editor/src/compose-keymap.unit.ts packages/editor/src/index.ts packages/editor/README.md packages/editor/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(editor): composeKeymap without page or emacs bindings

EOF
)"
```

---

### Task 7: embeddedMenu

**Files:**
- Create: `packages/editor/src/embedded-menu.ts`
- Create: `packages/editor/src/embedded-menu.unit.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/editor/README.md`
- Modify: `packages/editor/agents-for-module.md`

**Interfaces:**
- Consumes: `MenuHost` / `sharedMenuTheme` from `./menu-dom`; `Arrisa.Plugin.fromClass`; `Menu.Group.top.template()`; theme pattern from `menu-bar.ts` (but **no** `borderBottom`)
- Produces:

```ts
interface EmbeddedMenuConfig {
    parent: HTMLElement | (() => HTMLElement)
    template?: Menu.Template | readonly Menu.Template[]
    class?: string
    createDOM?: () => HTMLElement
    theme?: boolean | EditorState.Extension
}
function embeddedMenu(config: EmbeddedMenuConfig): EditorState.Extension
```

Plugin: construct `MenuHost` with `variant: "bar"`; `connect` appends `host.dom` to `parent`; `update` → `host.update`; `disconnect`/`remove` removes the node if still attached.

Default template: `[Menu.Group.top.template()]`. Default theme: flex row, gap/padding CSS variables, **no** bottom border. `theme: false` omits it.

- [ ] **Step 1: Write the failing tests** in `packages/editor/src/embedded-menu.unit.ts`

Use a mock `document` like `placeholder.unit.ts` if `MenuHost` touches DOM during `EditorState.create` — prefer testing facets/plugins without constructing Arrisa if `embeddedMenu` only registers facets + `editorPlugin`.

```ts
it("registers a plugin and default top template", () => {
    let parent = {appendChild() {}, children: []} as any
    let state = makeState(embeddedMenu({parent}))
    expect(state.facet(editorPlugin).length).toBeGreaterThan(0)
})

it("omits default theme when theme is false", () => {
    let parent = {} as HTMLElement
    let withTheme = makeState(embeddedMenu({parent, theme: true}))
    let noTheme = makeState(embeddedMenu({parent, theme: false}))
    expect(noTheme.facet(Arrisa.styleModule).length).toBeLessThan(withTheme.facet(Arrisa.styleModule).length)
})
```

If `Arrisa.styleModule` is not populated until view mount, assert the extension array length from a small exported helper **do not add helpers**. Instead: `theme: false` path does not include `sharedMenuTheme` — compare `state.facet(Arrisa.styleModule)` or skip the theme test if the facet is empty at state-only time. Minimum required: plugin is registered (`editorPlugin` facet non-empty).

`makeState` as in `floating-menu.unit.ts`. Import `editorPlugin` from `./editor/plugin-api`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/editor && pnpm test src/embedded-menu.unit.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement** mirroring `menuBar` (config facet, template facet, plugin class, theme switch) without using `Panel`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/editor && pnpm test src/embedded-menu.unit.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/embedded-menu.ts packages/editor/src/embedded-menu.unit.ts packages/editor/src/index.ts packages/editor/README.md packages/editor/agents-for-module.md
git commit -m "$(cat <<'EOF'
feat(editor): embeddedMenu mounts toolbar into a host parent

EOF
)"
```

---

### Task 8: composeField preset

**Files:**
- Create: `packages/message/src/compose-field.ts`
- Create: `packages/message/src/compose-field.unit.ts`
- Modify: `packages/message/src/index.ts`
- Modify: `packages/message/README.md`
- Modify: `packages/message/agents-for-module.md`
- Modify: `packages/schema/src/bundle.ts` to thread `link` config from `composeSchema` into `link({prompt})` if Task 3 left a stub
- Modify: `playground/src/setup.ts` to add a compose-field config **or** switch chat mode to `composeField()` while keeping `messengerCompose` import unused only if chat mode should demonstrate lists — **add** `composeExtensions()` using `composeField()`, keep `chatExtensions()` as `messengerCompose`

**Interfaces:**
- Consumes: `composeSchema`, `composeKeymap`, `floatingMenu`, `embeddedMenu`, `placeholder`, markdown helpers, `messengerHostElements`, `mentionResolve`
- Produces:

```ts
interface ComposeFieldConfig {
    exclusivity?: "none" | "code-strike" | {isolating: readonly Mark.Type[]}
    floating?: boolean | FloatingMenuConfig  // default true
    embedded?: false | EmbeddedMenuConfig    // default false
    placeholder?: string | false             // default "Message…"
    markdown?: boolean                       // default true
    markdownPaste?: boolean                  // default true
    hostElements?: boolean                   // default false
    resolveMention?: (username: string) => string | null | undefined
    linkPrompt?: LinkConfig["prompt"]
}
function composeField(config?: ComposeFieldConfig): EditorState.Extension
```

Default floating template: `Menu.Group.top.template()` (inline + block + textblock style). Default embedded template: same. `hostElements` default **false**.

- [ ] **Step 1: Write the failing tests** in `packages/message/src/compose-field.unit.ts`

```ts
import {EditorState} from "@arrisa/state"
import {KeyBinding} from "@arrisa/editor"
import {
    Blockquote,
    BulletList,
    CodeBlock,
    Doc,
    InlineDoc,
    OrderedList,
    Spoiler,
    Strong,
} from "@arrisa/types"
import {composeField} from "./compose-field"

describe("composeField", () => {
    it("installs composeSchema and composeKeymap", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(BulletList)).toBe(true)
        expect(state.schema.has(OrderedList)).toBe(true)
        expect(state.schema.has(Blockquote)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(InlineDoc)).toBe(false)
        expect(state.schema.has(Spoiler)).toBe(false)
        expect(state.facet(KeyBinding.useDefaultKeymap)).toBe(false)
    })

    it("does not install host elements by default", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.getNode("CustomEmoji")).toBeFalsy()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/message && pnpm test src/compose-field.unit.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `composeField` assembling extensions in the order: schema, keymap, host elements, markdown, mention resolve, floating, embedded, placeholder. Pass `linkPrompt` into `composeSchema({link: {prompt: linkPrompt}})`.

Thread `ComposeSchemaConfig.link` if Task 3 did not. Do not alter `messengerCompose`.

Playground: new `composeExtensions()` using `composeField({floating: {above: true, class: "pg-chat-formatter"}})`. Wire it only if the playground already has a mode switch you can add without a large UI redesign; otherwise leave playground on `messengerCompose` and mention composeField in message README examples.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/message && pnpm test src/compose-field.unit.ts src/compose.unit.ts`

Expected: PASS (messenger tests still green).

- [ ] **Step 5: Commit**

```bash
git add packages/message/src/compose-field.ts packages/message/src/compose-field.unit.ts packages/message/src/index.ts packages/message/README.md packages/message/agents-for-module.md packages/schema/src/bundle.ts playground/src/setup.ts
git commit -m "$(cat <<'EOF'
feat(message): composeField block chat preset

EOF
)"
```

---

### Task 9: Docs consistency pass

**Files:**
- Modify as needed: `packages/schema/README.md`, `packages/schema/agents-for-module.md`, `packages/message/README.md`, `packages/message/agents-for-module.md`, `packages/editor/README.md`, `packages/editor/agents-for-module.md`, `packages/command/README.md`, `packages/command/agents-for-module.md`
- Modify: `packages/schema/src/index.ts` file-level comment (preset list)
- Modify: `packages/message/src/index.ts` file-level comment if it only mentions messengerCompose

**Interfaces:**
- Consumes: all exports landed in Tasks 1–8
- Produces: docs that list `composeSchema` / `composeField` / `composeKeymap` / `embeddedMenu` / `clearFormatting` / `applyLink` / `link({prompt})` / list entities; no host-product names; messenger path still documented as the inline/spoiler preset

- [ ] **Step 1: Grep docs for gaps**

Run: `git grep -n "messengerCompose\|composeField\|composeSchema\|embeddedMenu" packages/*/README.md packages/*/agents-for-module.md`

Every new export from `src/index.ts` of command/schema/editor/message must appear in that package’s README and agents-for-module.

- [ ] **Step 2: Fill gaps** with the same examples as this spec (composeField quick start, embedded + custom linkPrompt). Do not invent extra APIs.

- [ ] **Step 3: Commit**

```bash
git add packages/schema/README.md packages/schema/agents-for-module.md packages/message/README.md packages/message/agents-for-module.md packages/editor/README.md packages/editor/agents-for-module.md packages/command/README.md packages/command/agents-for-module.md packages/schema/src/index.ts packages/message/src/index.ts
git commit -m "$(cat <<'EOF'
docs: compose field public API

EOF
)"
```

If Step 1 shows no gaps, skip the commit and mark the task complete with “docs already landed in Tasks 1–8”.
