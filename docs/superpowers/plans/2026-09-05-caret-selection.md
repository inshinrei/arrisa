# Caret Draw + Selection Dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual caret tracks the logical selection, and a text range collapses on Escape and on pointerdown outside the editor (not on the format tooltip).

**Architecture:** Native caret is hidden (`caretColor: transparent`); a custom `arrisa-cursor-layer` draws the caret. Live repro: that layer computes to **0×0** because of `contain: size` without an explicit box, so overflow caret glyphs can fail to repaint when `left`/`top` change. Selection ranges never collapse on Escape (not in the keymap).

**Tech Stack:** TypeScript, Vitest, Arrisa editor/command packages.

## Global Constraints

- Prefer `let` over `const` except arrow functions and true module-level constants.
- No host-product names in repo docs/comments/tests/commits.
- TDD for commands and CSS-contract tests where possible. Record RED/GREEN.
- Do not revert unrelated uncommitted WIP except files this plan lists.
- Layering: collapse command in `@arrisa/command`; keymap in editor; cursor CSS in theme.

---

### Task 1: Size the cursor layer so the caret can move

**Files:**
- Modify: `packages/editor/src/theme/theme.ts`
- Modify: `packages/editor/src/theme/draw-cursor.ts` if origin must be scrollDOM
- Create or modify: `packages/editor/src/theme/theme.unit.ts` (assert the cursor-layer spec includes a non-zero box: `inset: 0` or `width`/`height` `100%`)

**Interfaces:**
- Consumes: existing `CursorLayer`, `baseStyles` `arrisa-cursor-layer` rule
- Produces: layer fills `arrisa-scroller` (explicit size), still `pointer-events: none`, `contain` optional

Live evidence: computed layer `width: 0px; height: 0px; contain: size style`. Caret child at `left: 314px` overflows a 0×0 box.

- [ ] **Step 1: Write a failing test** in `theme.unit.ts`

If `baseStyles` rules are inspectable, assert `arrisa-cursor-layer` has `inset: "0"` or `width: "100%"` and `height: "100%"`. If not inspectable, add a small exported helper or test the style spec object. Prefer asserting the `baseStyles` StyleModule / spec if tests already parse it. Look at existing `theme.unit.ts`.

- [ ] **Step 2: Run to verify fail**

Run: `cd packages/editor && pnpm test src/theme/theme.unit.ts`

- [ ] **Step 3: Implement**

In `baseStyles` `arrisa-cursor-layer`:
- Keep `position: absolute; left: 0; top: 0; pointer-events: none; z-index: 150`
- Add `right: 0; bottom: 0` (or `inset: 0`) so `contain: size` has a real box
- `overflow: visible` (already)

In `cursorPos`, subtract `editor.scrollDOM.getBoundingClientRect()` (the layer’s containing block), not `contentDOM`, and add `scrollTop`/`scrollLeft` if the layer does not scroll with content. If layer is a child of `scrollDOM` and `position: absolute`, origin is the padding box of scrollDOM **including scroll** — verify: for `position:absolute` inside `position:relative` overflow auto, the containing block is the padding edge; `top/left` do **not** include scroll, so add `scrollTop`/`scrollLeft`.

- [ ] **Step 4: Tests pass**

Run: `cd packages/editor && pnpm test src/theme/theme.unit.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/theme/theme.ts packages/editor/src/theme/draw-cursor.ts packages/editor/src/theme/theme.unit.ts
git commit -m "$(cat <<'EOF'
fix(editor): size cursor layer so the caret can repaint

EOF
)"
```

---

### Task 2: Collapse range on Escape and outside pointerdown

**Files:**
- Modify: `packages/command/src/motion.ts`
- Modify: `packages/command/src/motion.unit.ts`
- Modify: `packages/command/src/index.ts`
- Modify: `packages/editor/src/key-map.ts`
- Modify: `packages/editor/src/compose-keymap.ts`
- Modify: `packages/editor/src/compose-keymap.unit.ts`
- Modify: `packages/editor/src/input/handlers.ts` (or `input-state.ts`)
- Modify: `packages/command/README.md` + `agents-for-module.md` if `collapseSelection` is exported
- Modify: `packages/editor/README.md` / agents only if documenting Escape

**Interfaces:**
- Consumes: `EditorSelection.cursor`, `setSelection` helper
- Produces:
  - `collapseSelection: Command.Pure` — if selection empty, `false`; else `{selection: EditorSelection.cursor(state.selection.head, state.selection.headSide), userEvent: "select"}`
  - Bound to `Escape` in `KeyBinding.defaultKeymap` **and** `composeKeymap`
  - Document `pointerdown` (capture) on `ownerDocument`: if event target is outside `editor.dom` **and** outside any `arrisa-tooltip` / `.arrisa-floating-menu` / `arrisa-link-prompt`, dispatch `collapseSelection`. Do not preventDefault. Ignore if selection already empty.

- [ ] **Step 1: Failing tests**

`motion.unit.ts`: range `1..3` → `collapseSelection` yields cursor at `3` (or head); empty cursor → `false`.

`compose-keymap.unit.ts`: keymap specs include `Escape`.

For document listener: if hard to test without Arrisa.create, a focused unit on a extracted `shouldCollapseOnOutsidePointer(editorDom, target, selectionEmpty)` helper is enough. Put the helper next to the listener.

- [ ] **Step 2: Run to verify fail**

Run: `cd packages/command && pnpm test src/motion.unit.ts`

- [ ] **Step 3: Implement**

Export `collapseSelection`. Add Escape bindings. Add the outside-pointer helper + listener in `InputState` (register in constructor against `editor.dom.ownerDocument`, remove on a `disconnect` if InputState has one; otherwise register once in `ensureHandlers` with a flag).

- [ ] **Step 4: Tests pass**

Run command + editor focused tests, then each package `pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add packages/command/src/motion.ts packages/command/src/motion.unit.ts packages/command/src/index.ts packages/command/README.md packages/command/agents-for-module.md packages/editor/src/key-map.ts packages/editor/src/compose-keymap.ts packages/editor/src/compose-keymap.unit.ts packages/editor/src/input/handlers.ts packages/editor/src/input/input-state.ts
git commit -m "$(cat <<'EOF'
fix(editor): collapse selection on Escape and outside click

EOF
)"
```
