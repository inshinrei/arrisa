# toggleMark Type-param Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a range and toggling Strong / Emphasis / etc. actually wraps the text when the command is given a `Mark.Type` (or a Type-like value from a duplicate `@arrisa/doc` copy), instead of dispatching a no-op `mark.remove`.

**Architecture:** Duck-type `Mark` vs `Mark.Type` (no `instanceof Mark.Type`). Resolve the param to a mark instance first (`asMark`), then take `instance.type` for `schema.markAllowed`. Use that instance for `isInSet` / `addToSet` / `removeFromSet` and for change `add` / `remove`. Share one helper pair used by `canAddMarkInRange`, `toggleMark`, and `toggleMarkExclusive`. Do not change schema menu bindings (`Strong` is already the default instance from `Mark.define`).

**Tech Stack:** TypeScript, Vitest, `@arrisa/command` (uses `@arrisa/doc`, `@arrisa/state`, `@arrisa/types`).

## Global Constraints

- Prefer `let` over `const` except arrow functions and true module-level constants.
- `const` for arrow functions and true module-top-level constants only.
- No host-product names in repo docs/comments/tests/commits (no vkws, messenger, ChatInput).
- TDD: write the failing test, watch RED, then implement, watch GREEN. Record RED/GREEN in the report.
- Do not use `instanceof Mark.Type` (or `instanceof Mark`) to distinguish Type vs instance.
- Do not export `asType` / `asMark` from `packages/command/src/index.ts`.
- Do not change `@arrisa/schema` button/key bindings (optional in the bug note; skip).
- Do not add Vite `dedupe` / host workarounds.
- Layering: stay inside `@arrisa/command` (plus its existing `@arrisa/types` test import).
- Public API: `toggleMark` / `toggleMarkExclusive` / `Menu.Button.toggleMark` accept `Mark | Mark.Type`. Document that in README + agents-for-module.

---

### Task 1: Duck-type mark params in `canAddMarkInRange`

**Files:**
- Modify: `packages/command/src/util/selection.ts`
- Modify: `packages/command/src/util/selection.unit.ts`
- Modify: `packages/command/src/mark-exclusivity.ts` (delete local `asType` / `asMark`; import the shared ones)

**Interfaces:**
- Consumes: existing `canAddMarkInRange(doc, from, to, mark: Mark | Mark.Type)`; `Mark` / `Mark.Type` from `@arrisa/doc`
- Produces:
  - `export function asType(mark: Mark | Mark.Type): Mark.Type`
  - `export function asMark(mark: Mark | Mark.Type): Mark`
  - `canAddMarkInRange` uses `asMark(mark)` then `instance.type` (not `asType(mark)` on the raw param — a Type-like `{default}` has no `.type` of its own; `schema.markAllowed` is identity-keyed)

Duck-typing (verbatim):

```ts
/** Distinguish Mark vs Mark.Type without instanceof (duplicate @arrisa/doc copies). */
export function asType(mark: Mark | Mark.Type): Mark.Type {
    return "type" in mark && mark.type ? mark.type : (mark as Mark.Type)
}

export function asMark(mark: Mark | Mark.Type): Mark {
    return "type" in mark && mark.type ? (mark as Mark) : (mark as Mark.Type).default!
}
```

`canAddMarkInRange` body (replace the `instanceof Mark.Type` line and the iterate callback):

```ts
export function canAddMarkInRange(doc: Plot.Doc, from: number, to: number, mark: Mark | Mark.Type) {
    let found = false
    let instance = asMark(mark)
    let type = instance.type
    doc.iterate(from, to, (node) => {
        if (found || instance.isInSet(node.tag.marks)) return false
        if (doc.schema.markAllowed(type, node.type)) found = true
        return true
    })
    return found
}
```

In `mark-exclusivity.ts`, remove the local `asType` / `asMark` functions and import them from `./util/selection`. Keep call sites (`asType(mark)`, `asMark(mark)`) unchanged.

- [ ] **Step 1: Write the failing tests** in `packages/command/src/util/selection.unit.ts`

Keep the existing two `canAddMarkInRange` tests. Add:

```ts
it("is true for a Type on a range that includes the paragraph plot (from 0)", () => {
    let s = testSchema()
    let doc = s.schema.doc([para(s, "hello world")])
    expect(canAddMarkInRange(doc, 0, 6, s.bold.type)).toBe(true)
})

it("is true for a Type-like value that is not instanceof Mark.Type", () => {
    let s = testSchema()
    let doc = s.schema.doc([para(s, "hello world")])
    let typeLike = {default: s.bold} as Mark.Type
    expect(canAddMarkInRange(doc, 0, 6, typeLike)).toBe(true)
    expect(canAddMarkInRange(doc, 1, 6, typeLike)).toBe(true)
})
```

Add `Mark` to the `@arrisa/doc` import in the unit file (`import {Leaf, Mark} from "@arrisa/doc"`).

The Type-like test is the one that must be RED on current code: `mark instanceof Mark.Type` is false, `mark.type` is undefined, `schema.markAllowed(undefined, …)` never succeeds.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arrisa/command test src/util/selection.unit.ts`

Expected: the new Type-like test FAIL (`expected true to be true` failing as `false`); existing tests still pass. If the `from: 0` Type test already passes, that is OK — it is a regression guard, not the RED proof. Do not implement until the Type-like test fails for the reason above.

- [ ] **Step 3: Implement helpers + `canAddMarkInRange`; switch exclusivity imports**

As specified under Interfaces. Do not change `toggleMark` in this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arrisa/command test src/util/selection.unit.ts src/mark-exclusivity.unit.ts`

Expected: PASS, output pristine.

- [ ] **Step 5: Commit**

```bash
git add packages/command/src/util/selection.ts packages/command/src/util/selection.unit.ts packages/command/src/mark-exclusivity.ts
git commit -m "$(cat <<'EOF'
fix(command): duck-type Mark vs Type in canAddMarkInRange

EOF
)"
```

---

### Task 2: Resolve instance in `toggleMark` / `toggleMarkExclusive` and document it

**Files:**
- Modify: `packages/command/src/mark.ts`
- Modify: `packages/command/src/mark.unit.ts`
- Modify: `packages/command/src/mark-exclusivity.ts`
- Modify: `packages/command/src/mark-exclusivity.unit.ts`
- Modify: `packages/command/src/menu.ts` (`Menu.Button.toggleMark` config `mark: Mark | Mark.Type`)
- Modify: `packages/command/README.md`
- Modify: `packages/command/agents-for-module.md`

**Interfaces:**
- Consumes: `asMark` / `asType` / `canAddMarkInRange` from Task 1
- Produces: `toggleMark: Command.Pure<Mark | Mark.Type>` and `toggleMarkExclusive: Command.Pure<Mark | Mark.Type>` always operate on `asMark(param)` before stored-mark updates, `canAddMarkInRange`, and `{add}` / `{remove}`

`toggleMark` (replace the body; keep the file comment):

```ts
export const toggleMark: Command.Pure<Mark | Mark.Type> = ({state}, mark) => {
    let instance = asMark(mark)
    let {selection, doc} = state
    if (selection instanceof EditorSelection.Text && selection.empty) {
        let selMarks = selection.marks || state.sel.head.marks(),
            add = !instance.isInSet(selMarks)
        let newMarks = add ? instance.addToSet(selMarks) : instance.removeFromSet(selMarks)
        return {
            selection: EditorSelection.Text.create({
                anchor: selection.anchor,
                headSide: selection.headSide,
                goalColumn: selection.goalColumn,
                marks: newMarks,
            }),
            userEvent: add ? "mark.add" : "mark.remove",
        }
    } else if (selection.ranges.some((r) => canAddMarkInRange(doc, r.from, r.to, instance))) {
        return {
            changes: selection.ranges.map((r) => ({from: r.from, to: r.to, add: instance})),
            userEvent: "mark.add",
        }
    } else {
        return {
            changes: selection.ranges.map((r) => ({from: r.from, to: r.to, remove: instance})),
            userEvent: "mark.remove",
        }
    }
}
```

Import `asMark` from `./util/selection` (already imports `canAddMarkInRange` from there).

`toggleMarkExclusive` — after the empty-policy fallthrough, resolve once and use the instance everywhere `mark` was used as a Mark (`.type`, `.isInSet`, `.addToSet`, `{add: mark}`):

```ts
export const toggleMarkExclusive: Command.Pure<Mark | Mark.Type> = (target, mark) => {
    let {state} = target
    let policy = markExclusivityPolicy(state)
    if (!policy.isolating.length) return toggleMark(target, mark)

    let instance = asMark(mark)
    let type = instance.type
    let {selection, doc} = state
    let adding =
        selection instanceof EditorSelection.Text && selection.empty
            ? !instance.isInSet(selection.marks || state.sel.activeMarks)
            : selection.ranges.some((r) => canAddMarkInRange(doc, r.from, r.to, instance))

    if (!adding) return toggleMark(target, instance)

    let stripTypes = new Set<Mark.Type>()
    if (isIsolating(policy, type)) {
        for (let t of activeMarkTypes(state)) if (t != type) stripTypes.add(t)
    } else {
        for (let t of policy.isolating) stripTypes.add(t)
    }

    if (selection instanceof EditorSelection.Text && selection.empty) {
        let selMarks = selection.marks || state.sel.head.marks()
        let next = selMarks
        for (let t of stripTypes) next = t.removeFromSet(next)
        next = instance.addToSet(next)
        return {
            selection: EditorSelection.Text.create({
                anchor: selection.anchor,
                headSide: selection.headSide,
                goalColumn: selection.goalColumn,
                marks: next,
            }),
            userEvent: "mark.add",
        }
    }

    let changes: {from: number; to: number; remove?: Mark; add?: Mark}[] = []
    for (let {from, to} of selection.ranges) {
        let seen = new Set<string>()
        doc.iterate(from, to, (node) => {
            for (let m of node.marks) {
                if (!stripTypes.has(m.type)) continue
                let key = m.name + ":" + JSON.stringify(m.value)
                if (seen.has(key)) continue
                seen.add(key)
                changes.push({from, to, remove: m})
            }
        })
        changes.push({from, to, add: instance})
    }
    return {changes, userEvent: "mark.add"}
}
```

`Menu.Button.toggleMark` config: change `mark: Mark` to `mark: Mark | Mark.Type`. Import `Mark` stays a type import; no runtime change required (Task 1 already makes `canAddMarkInRange` / `isInSet` safe). Keep `Command.bind(toggleMarkCommand, mark)` as-is.

Do **not** touch `packages/schema/src/mark.ts`.

- [ ] **Step 1: Write the failing tests**

In `packages/command/src/mark.unit.ts`, add to the existing `describe("toggleMark")` (imports: add `Schema` from `@arrisa/doc` if needed, add `Doc, Paragraph, Strong` from `@arrisa/types`):

```ts
it("adds Strong on a range when given the Type, not mark.remove", () => {
    let schema = Schema.define([Doc, Paragraph, Strong])
    let doc = schema.doc([Paragraph.create([Leaf.text("hello world")])])
    let state = EditorState.create({
        doc,
        selection: EditorSelection.range(1, 6),
        config: [EditorState.schemaElement.of(schema.elements)],
    })
    let result = runPure(state, toggleMark, Strong.type)
    expect(result.applied).toBe(true)
    expect((result.spec as {userEvent?: string}).userEvent).toBe("mark.add")
    let text = result.state.doc.resolve(1).nodeAfter!
    expect(Strong.isInSet(text.tag.marks)).toBeTruthy()
})

it("adds the mark on a range when given a Type-like value", () => {
    let {state, bold} = stateFromBlocks((s) => [para(s, "hello world")], EditorSelection.range(1, 6))
    let typeLike = {default: bold} as Mark.Type
    let result = runPure(state, toggleMark, typeLike)
    expect(result.applied).toBe(true)
    expect((result.spec as {userEvent?: string}).userEvent).toBe("mark.add")
    let text = result.state.doc.resolve(1).nodeAfter!
    expect(bold.isInSet(text.tag.marks)).toBeTruthy()
})
```

`runPure` is `Command.Pure<Param>` — passing `Strong.type` requires the command type to accept `Mark.Type`. If TypeScript errors in the test before runtime, that is still RED for this task; implement the signature + body together in Step 3 after watching the Vitest failure (or a typecheck failure if the test cannot compile). Prefer a runtime fail: if `runPure(state, toggleMark, Strong.type as any)` is needed to compile the RED test, use `as any` in the test only until the signature is widened, then remove `as any`.

In `packages/command/src/mark-exclusivity.unit.ts`, add:

```ts
it("applies an isolating mark when given the Type", () => {
    let s = exclusiveSchema()
    let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.bold])])])
    let state = EditorState.create({
        doc,
        selection: EditorSelection.range(1, 3),
        config: [
            EditorState.schemaElement.of(s.schema.elements),
            markExclusivity({isolating: [s.code.type]}),
        ],
    })
    let result = runPure(state, toggleMarkExclusive, s.code.type)
    expect(result.applied).toBe(true)
    let text = result.state.doc.resolve(1).nodeAfter!
    expect(s.code.isInSet(text.tag.marks)).toBeTruthy()
    expect(s.bold.isInSet(text.tag.marks)).toBeFalsy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arrisa/command test src/mark.unit.ts src/mark-exclusivity.unit.ts`

Expected: new tests FAIL (throw on `add.type` / `addToSet` when the param is a Type, or `userEvent` is `"mark.remove"` / mark missing). Existing tests still pass.

- [ ] **Step 3: Implement `toggleMark`, `toggleMarkExclusive`, menu config type, docs**

Implementation as specified.

README (`packages/command/README.md`) — change the `toggleMark` table row to:

`| `toggleMark` | Toggle a mark on selection or stored marks. Param is `Mark` or `Mark.Type` (Type is resolved to `.default`) |`

In the menu example comment or a one-line note near `Command.dispatch(editor, toggleMark, Strong)`, do not claim Strong is a Type (`Strong` from `@arrisa/types` is the default instance). Say callers may pass `Strong` or `Strong.type`.

`agents-for-module.md` — under Dispatch, after `Command.dispatch(editor, toggleMark, Strong)`, add:

```ts
// Mark.Type is also accepted (resolved to Type.default)
Command.dispatch(editor, toggleMark, Strong.type)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arrisa/command test`

Expected: all package tests PASS, output pristine.

- [ ] **Step 5: Commit**

```bash
git add packages/command/src/mark.ts packages/command/src/mark.unit.ts packages/command/src/mark-exclusivity.ts packages/command/src/mark-exclusivity.unit.ts packages/command/src/menu.ts packages/command/README.md packages/command/agents-for-module.md
git commit -m "$(cat <<'EOF'
fix(command): resolve Mark.Type before toggleMark add/remove

EOF
)"
```
