# Deferred Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the leftover placeholder-typing and CommonMark code-block work, and stop the custom caret from vanishing when it overflows a `contain: size` cursor layer.

**Architecture:** Three isolated clusters already sketched in the working tree (placeholder/observer/tiles; `CodeBlock` `pre > code`; cursor-layer CSS). Commit each cluster separately. No new packages. Version lockstep and playground `composeField` already shipped — do not redo them.

**Tech Stack:** TypeScript, Vitest, Arrisa `types` / `schema` / `command` / `editor`.

## Global Constraints

- Prefer `let` over `const` except arrow functions and true module-level constants.
- No host-product names in repo docs/comments/tests/commits.
- Public API changes update that package’s `README.md` **and** `agents-for-module.md` in the same task.
- Document only `src/index.ts` re-exports.
- TDD for new production logic: failing test first. Record RED/GREEN.
- If the working tree already contains the listed production+test diffs for a task: do **not** revert them to force a RED. Run the focused tests; if they pass, that is GREEN. Add any missing asserts from this plan first (those must fail if you temporarily drop the production change).
- Do not revert unrelated hunks in a file you touch. `theme.ts` is shared: Task 1 owns `arrisa-placeholder`; Task 3 owns `arrisa-cursor-layer`.
- Layering stays acyclic.
- Do not `npm publish`.
- Work in-place on `feat-core-packages` (do not create a worktree; uncommitted diffs must stay).

---

### Task 1: Placeholder typing (caret can enter empty blocks)

**Files:**
- Modify: `packages/editor/src/placeholder.ts`
- Modify: `packages/editor/src/placeholder.unit.ts`
- Modify: `packages/editor/src/theme/theme.ts` (`arrisa-placeholder` only)
- Modify: `packages/editor/src/tile/leaves.ts`
- Modify: `packages/editor/src/tile/content-update.ts`
- Modify: `packages/editor/src/dom/observer.ts`
- Modify: `packages/editor/src/input/handlers.ts`

**Interfaces:**
- Consumes: `placeholder` widget, `WidgetTile`, `ContentUpdate.addBR`, `DOMObserver` dirty ranges, `inputEventRange`
- Produces: empty textblocks remain caret-hosting; typing updates the document; placeholder cannot steal the caret

Working-tree intent (keep / complete this, do not invent a second design):

1. Placeholder widget DOM: `contentEditable = "false"`.
2. `WidgetTile` constructor: element widgets (not `Widget.EditableText`) get `contentEditable = "false"` if not already.
3. `arrisa-placeholder` CSS: `width: 0; overflow: visible; white-space: nowrap; pointer-events: none` (keep `display: inline-block; vertical-align: top; user-select: none; opacity: 0.6`).
4. `ContentUpdate.addBR`: skip trailing point decorations (placeholders) when deciding whether a textblock needs the trailing BR hack.
5. `DOMObserver` dirty range: if computed range is empty (`from >= to`), expand to the enclosing `textblockParent` (`before`/`after`) so unauthorized free text next to a zero-width widget is rebuilt from the model.
6. `inputEventRange`: if `event.getTargetRanges()[0]` is missing, fall back to `{from, to}` from `editor.state.selection`.

- [ ] **Step 1: Confirm / add tests** in `placeholder.unit.ts`

Must include:

```ts
it("renders placeholder as contentEditable=false so typing cannot enter the widget", () => {
    // deco.widget.type.render(...) → tag ARRISA-PLACEHOLDER, contentEditable "false"
})

it("forces contentEditable=false on element widgets", () => {
    // new WidgetTile(Widget.create({render: () => el}), ...)
    // el.contentEditable === "false"
})
```

If those tests are missing, add them first. If the production code is absent, they fail (RED). If both already exist, run Step 2 as GREEN-only.

- [ ] **Step 2: Run focused tests**

Run: `cd packages/editor && pnpm test src/placeholder.unit.ts src/theme/theme.unit.ts src/tile/leaves.unit.ts src/tile/content-update.unit.ts`

Expected: PASS. Then `cd packages/editor && pnpm test` (full package).

- [ ] **Step 3: Fill gaps only**

If a listed behavior is untested or unimplemented, add the test first, then the minimal production change. Do not restyle the cursor layer.

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/placeholder.ts packages/editor/src/placeholder.unit.ts packages/editor/src/theme/theme.ts packages/editor/src/tile/leaves.ts packages/editor/src/tile/content-update.ts packages/editor/src/dom/observer.ts packages/editor/src/input/handlers.ts
git commit -m "$(cat <<'EOF'
fix(editor): keep caret out of placeholder widgets

EOF
)"
```

Stage only the placeholder hunk in `theme.ts` if other theme edits exist (`git add -p` or equivalent).

---

### Task 2: CommonMark code blocks (`pre > code` + language)

**Files:**
- Modify: `packages/types/src/schema/blocks.ts`
- Create: `packages/types/src/schema/blocks.unit.ts` (untracked in working tree)
- Modify: `packages/types/README.md`
- Modify: `packages/types/agents-for-module.md`
- Modify: `packages/schema/src/block.ts`
- Modify: `packages/schema/src/block.unit.ts`
- Modify: `packages/command/src/insert.unit.ts`

**Interfaces:**
- Consumes: `Plot.define`, `Mark.Type.define`, `InputRule.textblockType`, `enter` / `splitTextblock`
- Produces:
  - `CodeBlock` HTML `pre > code`, `defining: true`, parse `pre` with `contentElement: "code"` (precedence 2) and bare `pre` (precedence 1)
  - `CodeBlockLanguage` serializes `class="language-<id>"` on inner `code` (`preferTarget: "code"`); also parses `data-language`
  - `codeBlock()` registers `CodeBlockLanguage` + `codeBlock.theme` + fence rule `/^```([\w+#.-]*) $/`
  - Enter at end of a code block creates a following paragraph (existing `splitTextblock` + `defining`); mid-block split keeps language mark

- [ ] **Step 1: Tests that must exist**

`packages/types/src/schema/blocks.unit.ts`:

- serialize `<pre><code>x = 1</code></pre>`
- language → `<pre><code class="language-ts">x</code></pre>`
- parse `pre > code.language-ts`
- parse bare `pre`
- parse `data-language` on inner `code`
- inline `<code>` in a paragraph stays `Code` mark, not `CodeBlock`
- empty language on JSON throws `ValidationError`

`packages/schema/src/block.unit.ts`:

- `codeBlock()` state `schema.has(CodeBlockLanguage)`
- typing `` ``` `` + space → `CodeBlock` with no language
- typing `` ```ts `` + space → `CodeBlockLanguage` `"ts"`

`packages/command/src/insert.unit.ts`:

- Enter at end of `CodeBlock("ab")` → following empty `Paragraph`
- Enter mid `"ab"` → two `CodeBlock`s `"a"` / `"b"`
- language mark copied on mid split
- Enter in empty code block yields a `Paragraph` somewhere in `doc.content`

- [ ] **Step 2: Run**

```
cd packages/types && pnpm test src/schema/blocks.unit.ts
cd packages/schema && pnpm test src/block.unit.ts
cd packages/command && pnpm test src/insert.unit.ts
```

Then each package `pnpm test`.

- [ ] **Step 3: Docs**

Types README table: `CodeBlock` is `pre > code`; `CodeBlockLanguage` is `class="language-<id>"` on inner `code` (parses `data-language` too).

Types `agents-for-module.md`: one bullet — CommonMark `pre > code`; language class + legacy `data-language`.

Schema README / agents already mention the space-terminated fence — do not duplicate if already accurate. Update only if they still say `` ``` `` without space.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/schema/blocks.ts packages/types/src/schema/blocks.unit.ts packages/types/README.md packages/types/agents-for-module.md packages/schema/src/block.ts packages/schema/src/block.unit.ts packages/command/src/insert.unit.ts
git commit -m "$(cat <<'EOF'
feat(types): CommonMark code blocks with language class

EOF
)"
```

Do not change `enter` unless a listed test fails. `defining: true` on `CodeBlock` is the intended split-at-end mechanism.

---

### Task 3: Cursor layer must paint overflow when scrolled

**Files:**
- Modify: `packages/editor/src/theme/theme.ts` (`arrisa-cursor-layer` only)
- Modify: `packages/editor/src/theme/theme.unit.ts`

**Interfaces:**
- Consumes: `baseStyles` `arrisa-cursor-layer` rule (`position: absolute; left/top/right/bottom: 0; pointer-events: none`)
- Produces: same box; **`contain` must not include `size`**. Use `contain: "style"` or omit `contain`. Keep `overflow` visible (default).

Live evidence: layer computes to the scroller padding box (~viewport height) with `contain: size style`. A caret with `top` larger than that box is overflow; `contain: size` may skip painting it after scroll.

- [ ] **Step 1: Failing test** in `theme.unit.ts`

Keep the existing non-zero box assert. Add:

```ts
it("does not use contain:size on arrisa-cursor-layer (overflow caret must paint)", () => {
    let rule = baseStyles.rules.find((r) => /arrisa-cursor-layer \{/.test(r) && /pointer-events:/.test(r))
    expect(rule).toBeTruthy()
    expect(rule).not.toMatch(/contain:\s*[^;]*size/)
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd packages/editor && pnpm test src/theme/theme.unit.ts`

Expected: FAIL — rule still has `contain: size style`.

- [ ] **Step 3: Implement**

In `arrisa-cursor-layer`, change `contain: "size style"` to `contain: "style"`. Do not remove `right: 0; bottom: 0`.

- [ ] **Step 4: Tests pass**

Run: `cd packages/editor && pnpm test src/theme/theme.unit.ts` then `cd packages/editor && pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/theme/theme.ts packages/editor/src/theme/theme.unit.ts
git commit -m "$(cat <<'EOF'
fix(editor): paint overflow caret without contain:size

EOF
)"
```

---

### Task 4: Root `pnpm test` also runs script tests

**Files:**
- Modify: `package.json` (root)
- Modify: `README.md` Release section only if it claims `pnpm test` covers scripts

**Interfaces:**
- Consumes: existing `"test:scripts": "vitest run --config scripts/vitest.config.ts"`
- Produces: root `"test"` runs package tests **then** `pnpm test:scripts`

- [ ] **Step 1: Change the root test script**

From:

```json
"test": "pnpm -r --filter './packages/*' run test"
```

To:

```json
"test": "pnpm -r --filter './packages/*' run test && pnpm test:scripts"
```

Leave `typecheck` / `release:prepare` unchanged (`release:prepare` already runs `pnpm test`).

- [ ] **Step 2: Run**

```
pnpm test:scripts
```

Expected: lockstep version tests PASS.

Do **not** run the full `pnpm test` suite unless it is fast; package tests were already green in this branch. If you do run it, it must exit 0.

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "$(cat <<'EOF'
chore: run script unit tests from pnpm test

EOF
)"
```

Skip `README.md` if the Release section does not need a change.
