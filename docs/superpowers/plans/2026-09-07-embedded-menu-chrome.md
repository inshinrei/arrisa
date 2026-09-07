# Embedded menu chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A range in a compose editor survives `pointerdown` on an embedded menubar (including overflow More and Create link), so bar clicks apply marks / open the link prompt instead of collapsing to a cursor.

**Architecture:** Document-capture `pointerdown` already collapses a non-empty selection unless the composed path is `editor.dom` or existing chrome (tooltip, floating menu, link prompt). Extend that chrome set with the bar root Arrisa actually creates (`arrisa-menubar` / `.arrisa-menubar`) and with a per-editor set of `MenuHost.dom` roots so custom `createDOM` still counts. Overflow More stays a click contract (`mousedown` → `setSelection` → open `arrisa-menu-list`); do not encode closed-submenu children as `F.Hidden` (see Task 3). Keep `link.button.enable` as `!selection.empty`.

**Tech Stack:** TypeScript, Vitest, `@arrisa/editor` (`input-state.ts`, `menu-dom.ts`), `@arrisa/schema` (`link.ts` test lock only), `@arrisa/command` Menu model (unchanged).

## Global Constraints

- Prefer `let` over `const` except arrow functions and true module-level constants.
- `const` for arrow functions and true module-top-level constants only.
- No host-product names in repo docs/comments/tests/commits.
- TDD: write the failing test, watch RED, then implement, watch GREEN. Record RED/GREEN in the report.
- Do **not** add `.arrisa-floating-menu` (or host toolbar class names) as the menubar workaround.
- Do **not** enable Create link on an empty selection; keep `enable: (state) => !state.selection.empty`.
- Do **not** rely on `MenuHost` `mousedown` `preventDefault` to keep the range — capture `pointerdown` runs first.
- Layering: `@arrisa/editor` must not import `@arrisa/schema`. Editor tests must not import `@arrisa/schema` or `@arrisa/types` (not package deps). Schema tests may import editor public API.
- Do not export `addOutsidePointerChrome` / `outsidePointerChromeRoots` from `packages/editor/src/index.ts`. Tests import them from `./input-state` (already the pattern for `shouldCollapseOnOutsidePointer`).
- Do not bump package versions.
- Do not add happy-dom / jsdom; extend the existing mock-`document` pattern (`embedded-menu.unit.ts`, `placeholder.unit.ts`).
- Overflow visibility is **list `display` + `aria-hidden` driven by `F.Open`**, not `F.Hidden` on children. `setSelection` paints with `update=false` and would leave a stale Hidden bit if closed-submenu children used `F.Hidden`.

---

### Task 1: Menubar + MenuHost.dom are outside-pointer chrome

**Files:**
- Modify: `packages/editor/src/input/input-state.ts`
- Modify: `packages/editor/src/input/input-state.unit.ts`
- Modify: `packages/editor/src/menu-dom.ts` (`MenuHost` constructor)
- Modify: `packages/editor/README.md`
- Modify: `packages/editor/agents-for-module.md`

**Interfaces:**
- Consumes: existing `shouldCollapseOnOutsidePointer(editorDom, path, selectionEmpty)`; `MenuHost.dom`; `InputState.onOutsidePointer`
- Produces:
  - `outsidePointerChromeSelector` includes `arrisa-menubar, .arrisa-menubar` (tag + class; **not** host class names)
  - `export function addOutsidePointerChrome(editor: object, root: {contains(node: any): boolean}): void`
  - `export function outsidePointerChromeRoots(editor: object): Iterable<{contains(node: any): boolean}>`
  - `shouldCollapseOnOutsidePointer(editorDom, path, selectionEmpty, chromeRoots?: Iterable<{contains(node: any): boolean}>)`
  - `InputState.onOutsidePointer` passes `outsidePointerChromeRoots(this.editor)`
  - `MenuHost` constructor calls `addOutsidePointerChrome(this.editor, this.dom)` after `this.dom` exists

Selector (verbatim):

```ts
export const outsidePointerChromeSelector =
    "arrisa-tooltip, .arrisa-tooltip, arrisa-floating-menu, .arrisa-floating-menu, arrisa-link-prompt, .arrisa-link-prompt, arrisa-menubar, .arrisa-menubar"
```

Chrome-root registry and collapse predicate (verbatim shape; keep `isDomNode` / `closest` behavior):

```ts
let chromeByEditor = new WeakMap<object, Set<{contains(node: any): boolean}>>()

export function addOutsidePointerChrome(editor: object, root: {contains(node: any): boolean}) {
    let set = chromeByEditor.get(editor)
    if (!set) chromeByEditor.set(editor, (set = new Set()))
    set.add(root)
}

export function outsidePointerChromeRoots(editor: object): Iterable<{contains(node: any): boolean}> {
    return chromeByEditor.get(editor) ?? emptyChrome
}

const emptyChrome: Iterable<{contains(node: any): boolean}> = []

export function shouldCollapseOnOutsidePointer(
    editorDom: {contains(node: any): boolean},
    path: readonly unknown[] | null | undefined,
    selectionEmpty: boolean,
    chromeRoots?: Iterable<{contains(node: any): boolean}>,
): boolean {
    if (selectionEmpty || !path || !path.length) return false
    for (let entry of path) {
        if (entry == editorDom) return false
        if (isDomNode(entry) && editorDom.contains(entry)) return false
        if (chromeRoots) {
            for (let root of chromeRoots) {
                if (entry == root) return false
                if (isDomNode(entry) && typeof root.contains == "function" && root.contains(entry)) return false
            }
        }
        let node = entry as OutsidePointerTarget
        let el = typeof node.closest == "function" ? node : node.parentElement
        if (el && typeof el.closest == "function" && el.closest(outsidePointerChromeSelector)) return false
    }
    return true
}
```

`onOutsidePointer` (add the 4th argument only):

```ts
!shouldCollapseOnOutsidePointer(
    this.editor.dom,
    event.composedPath(),
    this.editor.state.selection.empty,
    outsidePointerChromeRoots(this.editor),
)
```

`MenuHost` constructor: after `this.dom` is assigned/classed, `addOutsidePointerChrome(this.editor, this.dom)`. Import from `./input/input-state` (menu-dom already imports Arrisa; input-state must **not** import menu-dom).

Docs: README sentence that lists collapse exceptions must include the menubar. agents-for-module: pitfall that embedded `arrisa-menubar` / `MenuHost.dom` is chrome — do not add `arrisa-floating-menu` on the host parent.

- [ ] **Step 1: Write the failing tests** in `packages/editor/src/input/input-state.unit.ts`

Keep existing tests. Extend the chrome-token test and add roots tests:

```ts
it("ignores tooltips, floating menu, link prompt, and menubar in the path", () => {
    let editorDom = {contains: () => false}
    expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget("arrisa-tooltip")], false)).toBe(false)
    expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget(".arrisa-tooltip")], false)).toBe(false)
    expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget(".arrisa-floating-menu")], false)).toBe(false)
    expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget("arrisa-link-prompt")], false)).toBe(false)
    expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget("arrisa-menubar")], false)).toBe(false)
    expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget(".arrisa-menubar")], false)).toBe(false)
})

it("collapses when the path is document.body only", () => {
    let target = {closest: () => null}
    expect(shouldCollapseOnOutsidePointer({contains: () => false}, [target], false)).toBe(true)
    expect(shouldCollapseOnOutsidePointer({contains: () => false}, [target], false, [])).toBe(true)
})

it("does not collapse an already empty selection", () => {
    expect(shouldCollapseOnOutsidePointer({contains: () => false}, [chromeTarget("x")], true)).toBe(false)
})

it("does not collapse when a registered chrome root is on the path", () => {
    let inner = {closest: () => null, nodeType: 1}
    let root = {
        contains(node: any) {
            return node === inner
        },
    }
    expect(shouldCollapseOnOutsidePointer({contains: () => false}, [inner, root], false, [root])).toBe(false)
})

it("addOutsidePointerChrome is read by outsidePointerChromeRoots", () => {
    let editor = {}
    let inner = {closest: () => null, nodeType: 1}
    let root = {
        contains(node: any) {
            return node === inner
        },
    }
    addOutsidePointerChrome(editor, root)
    expect(
        shouldCollapseOnOutsidePointer(
            {contains: () => false},
            [inner],
            false,
            outsidePointerChromeRoots(editor),
        ),
    ).toBe(false)
})
```

Rename is OK if you merge with the existing `"ignores tooltips..."` test rather than duplicating it. Empty-selection case already exists — keep it (do not delete). Body-only collapse already exists as `"collapses when the path is outside..."` — keep it; the new body test may be the same assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arrisa/editor test src/input/input-state.unit.ts`

Expected: FAIL — menubar tokens still collapse (`true` not `false`); 4th-arg / registry tests fail or do not compile.

- [ ] **Step 3: Implement selector, registry, 4th arg, InputState wiring, MenuHost register**

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arrisa/editor test src/input/input-state.unit.ts`

Expected: PASS. Then `pnpm --filter @arrisa/editor test` — existing suite still green.

- [ ] **Step 5: Update README + agents-for-module**

README (the collapse sentence under Default keymap) must mention menubar / `MenuHost` roots alongside tooltip, floating menu, and link prompt.

agents-for-module Invariants / pitfalls: add that `pointerdown` outside `editor.dom` does **not** collapse when the path is `arrisa-menubar` / `.arrisa-menubar` or that editor’s `MenuHost.dom`. Do not add `arrisa-floating-menu` on a host parent to fake chrome.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/input/input-state.ts packages/editor/src/input/input-state.unit.ts packages/editor/src/menu-dom.ts packages/editor/README.md packages/editor/agents-for-module.md
git commit -m "fix(editor): treat menubar and MenuHost.dom as outside-pointer chrome"
```

---

### Task 2: Embedded bar click keeps the range and runs enabled items

**Files:**
- Modify: `packages/editor/src/menu-dom.unit.ts`
- Modify: `packages/schema/src/link.unit.ts`

**Interfaces:**
- Consumes: Task 1 `addOutsidePointerChrome` / `outsidePointerChromeRoots` / `shouldCollapseOnOutsidePointer` 4th arg; `MenuHost`; `InputState.onOutsidePointer`; `link.button.enable`
- Produces: integration coverage that capturing `pointerdown` through `arrisa-menubar` does not collapse, then `mousedown` on a toggle-mark button wraps the range; `link.button.enable` is false iff `selection.empty`

Do **not** change `link.button.enable`. The schema test is a lock.

Build a mock document good enough for `MenuHost` + `InputState` (extend the `mockEl` / `withMockDocument` style from `embedded-menu.unit.ts`). Required mock surface:

- `document.createElement(tag)` / `createElementNS`
- `classList` add/remove/contains
- `setAttribute` / `getAttribute` / `removeAttribute`
- `appendChild` / `removeChild` / `parentNode` / `childNodes`
- `addEventListener` (store handlers) — `MenuHost` registers `mousedown` on `this.dom`
- `style` with `display` and `setProperty`
- `closest(sel)` that honors tag names and `.class` tokens in a comma list (so `outsidePointerChromeSelector` works on real-ish nodes)
- `contains(node)` via ancestor walk
- `textContent` setter clearing children (MenuHost `fill`)
- `ownerDocument` pointing at the mock document

Harness (put helpers in `menu-dom.unit.ts`; do not export from package index):

```ts
function makeDoc(text = "hello world") {
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold])
    return {
        bold,
        schema,
        doc: schema.doc([paragraph.create([Leaf.text(text)])]),
        elements: schema.elements,
    }
}

function makeEditor(extensions: EditorState.Extension, selection = EditorSelection.range(1, 6)) {
    let {doc, elements, bold} = makeDoc()
    let state = EditorState.create({
        doc,
        selection,
        config: [EditorState.schemaElement.of(elements), extensions],
    })
    let editor: any = {
        get state() {
            return state
        },
        connected: true,
        themeClasses: "",
        contentDOM: {id: "content", addEventListener() {}},
        dispatch(...specs: any[]) {
            for (let spec of specs) state = state.update(spec).state
            if (editor.host) editor.host.update({
                state,
                startState: state,
                docChanged: true,
                selectionSet: true,
                transactions: [],
            })
        },
        focus() {},
        win: globalThis,
    }
    return {editor, bold, getState: () => state}
}
```

`host.update` needs a real `Arrisa.Update`-shaped object only if you call it; for the pointer test, `InputState.onOutsidePointer` uses `Command.dispatch` → `editor.dispatch`. If collapse runs, selection becomes a cursor. Then `MenuHost.click` runs `toggleMark` on that cursor. Assert **after both events**.

Template facet for MenuHost:

```ts
let hostTemplate = EditorState.Facet.define<readonly Menu.Template[], readonly Menu.Template[]>({
    combine: (inputs) => (inputs.length ? inputs[0] : [Menu.Group.top.template()]),
})
```

- [ ] **Step 1: Write the failing tests**

In `packages/editor/src/menu-dom.unit.ts`:

```ts
it("embedded menubar pointerdown + mousedown applies the mark and keeps the range", () => {
    withMockDocument(() => {
        let {bold} = makeDoc()
        let button = Menu.Button.toggleMark({
            mark: bold,
            parent: Menu.Group.inline,
            rank: 10,
            description: "Toggle strong emphasis",
            label: {icon: "M0 0"},
        })
        let {editor, getState} = makeEditor([button, hostTemplate.of([Menu.Group.top.template()])])
        let host = new MenuHost(editor, {variant: "bar", template: hostTemplate})
        editor.dom = {contains: () => false, ownerDocument: document}
        editor.host = host
        let input = new InputState(editor)
        let markBtn = host.elts.find((e) => e.dom.getAttribute("aria-label") == "Toggle strong emphasis")
        expect(markBtn).toBeTruthy()
        let menubar = host.dom
        let parent = {closest: () => null}
        input.onOutsidePointer({
            composedPath: () => [markBtn!.dom, menubar, parent, document],
        } as PointerEvent)
        host.click({
            target: markBtn!.dom,
            defaultPrevented: false,
            preventDefault() {},
        } as MouseEvent)
        let state = getState()
        expect(state.selection.empty).toBe(false)
        expect(state.selection.from).toBe(1)
        expect(state.selection.to).toBe(6)
        expect(bold.isInSet(state.doc.resolve(1).nodeAfter!.tag.marks)).toBe(true)
    })
})

it("enable-gated button does not run after collapse, and does run when chrome keeps the range", () => {
    withMockDocument(() => {
        let ran = 0
        let gated = Menu.Button.define({
            run: () => {
                ran++
                return true
            },
            enable: (s) => !s.selection.empty,
            parent: Menu.Group.inline,
            rank: 50,
            description: "Create link",
            label: {icon: "M0 0"},
        })
        let {editor, getState} = makeEditor([gated, hostTemplate.of([Menu.Group.top.template()])])
        let host = new MenuHost(editor, {variant: "bar", template: hostTemplate})
        editor.dom = {contains: () => false, ownerDocument: document}
        editor.host = host
        let input = new InputState(editor)
        let btn = host.elts.find((e) => e.dom.getAttribute("aria-label") == "Create link")!
        // Without menubar on the path, capture pointerdown collapses; click must not run.
        input.onOutsidePointer({
            composedPath: () => [{closest: () => null}],
        } as PointerEvent)
        expect(getState().selection.empty).toBe(true)
        host.click({
            target: btn.dom,
            defaultPrevented: false,
            preventDefault() {},
        } as MouseEvent)
        expect(ran).toBe(0)

        // Restore a range and go through menubar chrome.
        editor.dispatch({selection: EditorSelection.range(1, 6)})
        host.update({
            state: getState(),
            startState: getState(),
            docChanged: false,
            selectionSet: true,
            transactions: [],
        } as any)
        input.onOutsidePointer({
            composedPath: () => [btn.dom, host.dom, document],
        } as PointerEvent)
        expect(getState().selection.empty).toBe(false)
        host.click({
            target: btn.dom,
            defaultPrevented: false,
            preventDefault() {},
        } as MouseEvent)
        expect(ran).toBe(1)
    })
})
```

`MenuHost.click` is currently a class method — tests may call it directly (it is not private). If the mock `addEventListener` stores handlers, dispatching a `mousedown` on `host.dom` is also valid; direct `host.click` is enough.

`InputState` constructor reads `browser.safari` and may call `contentDOM.addEventListener` — the harness `contentDOM` must have `addEventListener`.

In `packages/schema/src/link.unit.ts` (lock, no production change):

```ts
describe("link.button.enable", () => {
    it("is false iff selection.empty", () => {
        let empty = makeState([blockDoc(), paragraph(), link()], {selection: 1})
        expect(empty.selection.empty).toBe(true)
        expect(link.button.enable!(empty)).toBe(false)
        let ranged = rangedState()
        expect(ranged.selection.empty).toBe(false)
        expect(link.button.enable!(ranged)).toBe(true)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arrisa/editor test src/menu-dom.unit.ts`

Expected: FAIL — `pointerdown` through menubar still collapses (if Task 1 missed InputState/MenuHost wiring) and/or mark is not on the slice.

Run: `pnpm --filter @arrisa/schema test src/link.unit.ts`

Expected: the new enable test **passes** on current code (lock). If it fails, `enable` was changed — do not “fix” by enabling on a cursor.

If the editor integration test **passes on RED** without further code, that means Task 1 already made the click path correct. Keep the test; do not add product code. Report that in TDD evidence (RED: lock test added; GREEN: already green after Task 1). Only add MenuHost/`click` code if the test fails for a real reason (event target walk, Disabled flags not refreshed after collapse, etc.).

- [ ] **Step 3: Implement only if the editor test is RED for a code gap**

Likely gap if collapse still happens: `MenuHost` did not register, or `InputState` does not pass roots, or `click` returns early because `enable` Disabled was not updated. Fix that, not `link.enable`.

After collapse, `host.update` must run so `enable` becomes Disabled — the harness `editor.dispatch` should call `host.update`. If collapse happens, `click` seeing Disabled and skipping `run` is **correct**.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arrisa/editor test src/menu-dom.unit.ts`

Run: `pnpm --filter @arrisa/schema test src/link.unit.ts`

Expected: PASS. Then `pnpm --filter @arrisa/editor test` and `pnpm --filter @arrisa/schema test`.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/menu-dom.unit.ts packages/schema/src/link.unit.ts
git commit -m "test(editor): embedded menubar click keeps the range and runs enabled items"
```

If production files besides tests changed, include them and use `fix(editor): ...` instead.

---

### Task 3: Overflow More click shows wrapped items; child click runs

**Files:**
- Modify: `packages/editor/src/menu-dom.ts` (only if tests are RED)
- Modify: `packages/editor/src/menu-dom.unit.ts`

**Interfaces:**
- Consumes: Task 1 chrome; `MenuHost.click` / `setSelection` / `F.Open`; `Menu.Group` `overflow.at`; `MenuSubmenu.list` (`arrisa-menu-list`, `role="menu"`); child `focusDOM.role = "menuitem"`
- Produces: after `mousedown` on the overflow wrap (description `"More"`), `arrisa-menu-list` is not `display:none`, child named `"Toggle underline"` is a visible `role="menuitem"` with `aria-hidden` not `"true"`; a second `mousedown` on that child runs it; capturing `pointerdown` through the menubar does not collapse before the child run

**Do not** set `F.Hidden` on closed-submenu children. `setSelection` calls `updateMenuDOM(..., false, selection)` and would keep Hidden after open. Visibility:

- `MenuSubmenu.update`: `list.style.display = flags & F.Open ? "" : "none"` (already)
- Also set `list.setAttribute("aria-hidden", flags & F.Open ? "false" : "true")` (and on construct, `aria-hidden="true"` while `display:none`)
- Children already get `role="menuitem"` on `focusDOM` and `aria-label` from `description`

**Same-event dismiss:** `setSelection` currently adds `document` `mousedown` → `globalClick` while the opening `mousedown` is still bubbling. If the mock (or a real document) delivers that same event to `globalClick` with a target `contains` cannot see, the submenu closes immediately. Fix: ignore the opening event — either skip `globalClick` when `this.dom.contains(event.target)` (already) **and** attach the listener on the next turn:

```ts
if (selection.length > 1 && this.selection.length <= 1) {
    let doc = this.dom.ownerDocument
    let add = () => doc.addEventListener("mousedown", this.globalClick)
    if (typeof queueMicrotask == "function") queueMicrotask(add)
    else add()
}
```

If tests show `contains` already saves us, still defer the listener so a bubbling mock document cannot close on the opening click. Clear the deferred add on `up()` / close if you store a handle; simplest is defer-only.

Overflow fixture: a group with `overflow: {at: 2}` (one row item + More wrapping the rest). Default `Menu.Group.inline` is `at: 5` — do **not** depend on viewport width; wrap is by item count.

```ts
let overflowGroup = Menu.Group.define({parent: Menu.Group.top, rank: 50, overflow: {at: 2}})
```

Row button description `"Keep"`; wrapped button description `"Toggle underline"` (string, not a phrase ref). More uses `phrases.ref("overflow_more")` → `"More"` once `description` is resolved in `MenuSubmenu` constructor.

- [ ] **Step 1: Write the failing tests** in `packages/editor/src/menu-dom.unit.ts`

```ts
it("mousedown on More opens a visible Toggle underline menuitem", () => {
    withMockDocument(() => {
        let ran = 0
        let overflowGroup = Menu.Group.define({parent: Menu.Group.top, rank: 50, overflow: {at: 2}})
        let keep = Menu.Button.define({
            run: () => true,
            parent: overflowGroup,
            rank: 1,
            description: "Keep",
            label: {icon: "M1"},
        })
        let under = Menu.Button.define({
            run: () => {
                ran++
                return true
            },
            parent: overflowGroup,
            rank: 2,
            description: "Toggle underline",
            label: {icon: "M2"},
        })
        let {editor, getState} = makeEditor([
            overflowGroup,
            keep,
            under,
            hostTemplate.of([Menu.Group.top.template()]),
        ])
        let host = new MenuHost(editor, {variant: "bar", template: hostTemplate})
        editor.dom = {contains: () => false, ownerDocument: document}
        editor.host = host
        let input = new InputState(editor)

        let more = host.elts.find((e) => e.children && e.dom.getAttribute("aria-label") == "More")
        expect(more).toBeTruthy()
        let underEl = host.elts.find((e) => e.dom.getAttribute("aria-label") == "Toggle underline")
        expect(underEl).toBeTruthy()
        expect(underEl!.focusDOM.role == "menuitem" || underEl!.dom.role == "menuitem").toBe(true)
        // Closed: list not visible
        expect((more as any).list.style.display).toBe("none")

        input.onOutsidePointer({
            composedPath: () => [more!.dom, host.dom, document],
        } as PointerEvent)
        host.click({
            target: more!.focusDOM,
            defaultPrevented: false,
            preventDefault() {},
        } as MouseEvent)

        expect(getState().selection.empty).toBe(false)
        expect(host.selection.length).toBeGreaterThan(1)
        expect((more as any).list.style.display).not.toBe("none")
        expect((more as any).list.getAttribute("aria-hidden")).toBe("false")
        expect(underEl!.dom.style.display).not.toBe("none")
        expect(underEl!.focusDOM.getAttribute("aria-hidden")).not.toBe("true")

        input.onOutsidePointer({
            composedPath: () => [underEl!.dom, (more as any).list, more!.dom, host.dom, document],
        } as PointerEvent)
        host.click({
            target: underEl!.focusDOM,
            defaultPrevented: false,
            preventDefault() {},
        } as MouseEvent)
        expect(getState().selection.empty).toBe(false)
        expect(ran).toBe(1)
    })
})
```

If `MenuSubmenu` puts `aria-label` on `this.dom` (the `arrisa-submenu`) not the button, find More via `e.dom.getAttribute("aria-label") == "More"` as above. `click` walks from `event.target` to `e.dom`; using `focusDOM` (the inner button) is the real click target.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arrisa/editor test src/menu-dom.unit.ts`

Expected: FAIL on `aria-hidden` `"false"` after open (not set today) and/or More not opening / child not running.

- [ ] **Step 3: Minimal implementation**

1. `MenuSubmenu` constructor: `this.list.setAttribute("aria-hidden", "true")`
2. `MenuSubmenu.update` Open branch: also `this.list.setAttribute("aria-hidden", flags & F.Open ? "false" : "true")`
3. Defer `globalClick` listener as specified if the open is lost on the same `mousedown`
4. Do not require `display:none` overflow items to be force-clicked — the only legal path is More → visible child → click

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arrisa/editor test src/menu-dom.unit.ts`

Expected: PASS. Then `pnpm --filter @arrisa/editor test`.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/menu-dom.ts packages/editor/src/menu-dom.unit.ts
git commit -m "fix(editor): open overflow More on mousedown with visible menuitems"
```

If only tests + `aria-hidden` (no click/defer change):

```bash
git commit -m "fix(editor): expose overflow submenu list to assistive names"
```
