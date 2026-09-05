# Compose Field Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close deferred compose-field polish, wire the playground to `composeField`, add lockstep package versioning/release scripts, and write a Desktop host-wiring guide (outside this repo).

**Architecture:** Stay inside existing packages. Versioning is a small root `scripts/` tool that copies the root `package.json` version onto every published `packages/*` (Yorozu lockstep, without adopting `@yorozu/build`). The Desktop guide is a consumer document and may name the host product; Arrisa repo docs still must not.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing Arrisa packages, Vite playground.

## Global Constraints

- Prefer `let` over `const` except arrow functions and true module-level constants.
- Arrisa repo docs/comments/tests/commits: **no host-product names**. The Desktop guide is allowed to name the host.
- Public API changes update that package’s `README.md` **and** `agents-for-module.md` in the same task.
- Document only `src/index.ts` re-exports.
- TDD for production logic: failing test first. Record RED/GREEN in the report.
- Do not change `messengerCompose()` defaults (still InlineDoc + spoiler; `codeBlocks` remains opt-in).
- Do not `npm publish`. Scripts prepare release only.
- Do not revert unrelated uncommitted WIP in editor tiles/observer/types.
- Layering stays acyclic.
- Tests `*.unit.ts` next to source (scripts tests live next to the script).

---

### Task 1: Deferred tests and small code polish

**Files:**
- Modify: `packages/command/src/replace-doc.ts`
- Modify: `packages/command/src/replace-doc.unit.ts`
- Modify: `packages/schema/src/bundle.unit.ts`
- Modify: `packages/schema/src/link.ts`
- Modify: `packages/schema/src/link.unit.ts`
- Modify: `packages/message/src/formatted.unit.ts`
- Modify: `packages/message/src/compose-field.unit.ts`

**Interfaces:**
- Consumes: existing `replaceDoc`, `composeSchema`, `link`, `docToFormattedText`, `formattedTextToDoc`, `Tooltip.show`, `composeField`
- Produces: same APIs; tighter tests; `replaceDoc` insert without `as any`; `closeLinkPrompt` always `focus()` so custom `cancel` focuses the editor

Skip (already match spec / YAGNI): empty-cursor stored-marks-only; range strip of block marks; `schema.has(Link)` guard; keymap copy-vs-filter; `arrisa-menubar` selector sharing.

- [ ] **Step 1: Write failing tests**

`replace-doc.unit.ts`: drop unused `EditorSelection`/`EditorState` imports if present; assert `result.state.selection.from` is a valid cursor (typically `1` for a one-character paragraph); keep history annotation asserts.

`bundle.unit.ts` composeSchema test: add `expect(state.schema.has(Color)).toBe(false)`, `Direction`, `Figure` (import those types).

`formatted.unit.ts` bullet round-trip: after import, `expect(back.firstChild!.content.length).toBe(2)` (two list items). Ordered test: round-trip `formattedTextToDoc` and assert `back.firstChild!.param === 3` (or the real OrderedList param API).

`link.unit.ts`: default prompt (no `prompt` config) + unmarked range → after `runToggle`, `editor.state.facet(Tooltip.show)` has a non-null tooltip (floating prompt open). Custom `cancel` calls `editor.focus` (spy).

`compose-field.unit.ts`: default `composeField({placeholder: false, markdown: false})` (floating true) with a non-empty selection yields a Tooltip.show entry (or `floatingMenu` config present). If Tooltip.show is empty without a range, create state with `EditorSelection.range`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/command && pnpm test src/replace-doc.unit.ts` then schema/message focused files.

Expected: FAIL on new assertions.

- [ ] **Step 3: Implement**

`replaceDoc`: `insert: Slice.of([...next.content])` (import `Slice` from `@arrisa/doc`). No `as any`.

`closeLinkPrompt`: if field is open, dispatch null; **always** `editor.focus()`.

Do not change toggle remove-first (href still omitted). Tests for cancel only need `focus` to be called.

- [ ] **Step 4: Run tests to verify they pass**

Run the four package focused files, then `cd packages/command && pnpm test` and `cd packages/schema && pnpm test` and `cd packages/message && pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add packages/command/src/replace-doc.ts packages/command/src/replace-doc.unit.ts packages/schema/src/bundle.unit.ts packages/schema/src/link.ts packages/schema/src/link.unit.ts packages/message/src/formatted.unit.ts packages/message/src/compose-field.unit.ts
git commit -m "$(cat <<'EOF'
test: tighten compose-field deferred coverage

EOF
)"
```

If link.ts focus change is included, message can be `fix(schema): focus editor on link prompt cancel` if that file is the only production change besides Slice — prefer one commit covering this task.

---

### Task 2: Docs polish (SECURITY + link prompt + composeField pointer)

**Files:**
- Modify: `SECURITY.md`
- Modify: `packages/schema/README.md`
- Modify: `packages/schema/agents-for-module.md`
- Modify: `packages/message/README.md` only if linkPrompt docs omit cancel/href behavior

**Interfaces:**
- Consumes: current `link({prompt})` behavior (remove-first; `href` unused; `cancel` focuses + closes floating field)
- Produces: accurate consumer docs

- [ ] **Step 1: Edit docs**

`SECURITY.md` line about “Dialogs, paste-as-link, and tooltip rendering”: change to **link prompt (floating tooltip or host `linkPrompt`), paste-as-link, and tooltip rendering** follow `sanitizeLinkHref`.

Schema README presets: chat field hosts should prefer `@arrisa/message` `composeField` (block lists/quote/code) or `messengerCompose` (inline/spoiler). Do not name host products.

Schema agents + README `link({prompt})`: one sentence — default toggle **removes** existing links or opens add UI; it does **not** prefill `href` (remove-first). `cancel` dismisses the built-in floating field and focuses the editor; custom prompts still own their DOM.

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md packages/schema/README.md packages/schema/agents-for-module.md packages/message/README.md packages/message/agents-for-module.md
git commit -m "$(cat <<'EOF'
docs: link prompt cancel/href and composeField pointer

EOF
)"
```

Skip files you did not need to change.

---

### Task 3: Playground uses composeField

**Files:**
- Modify: `playground/index.html`
- Modify: `playground/src/setup.ts`
- Modify: `playground/src/main.ts`

**Interfaces:**
- Consumes: `composeField`, `createChatEditor` currently `messengerCompose`
- Produces: Messenger tab mounts `composeField` (block lite compose). Keep `chatExtensions` name or rename to compose; `messengerCompose` may remain exported for inspect/comparison but the visible tab is composeField.

- [ ] **Step 1: Wire the tab**

`createChatEditor` uses `composeExtensions()` (already in setup.ts). Update `index.html` hint: `composeField()` — lists, quote, code block, clear formatting, floating toolbar; markdown `**`/`__`/`~~`/`` ` ``; send dumps FormattedText.

Keep send/clear buttons working against the chat mount. `window.arrisa.chatEditor` still set.

Optional: add a second small note that `messengerCompose` is the inline/spoiler preset (not mounted).

- [ ] **Step 2: Manual sanity** — `pnpm playground` starts; no import errors. If a browser tool is available, open the app, switch to Messenger, type, Send, confirm FormattedText JSON appears. If not, note that in the report.

- [ ] **Step 3: Commit**

```bash
git add playground/index.html playground/src/setup.ts playground/src/main.ts
git commit -m "$(cat <<'EOF'
feat(playground): mount composeField as messenger lite compose

EOF
)"
```

---

### Task 4: Lockstep versions + release scripts

**Files:**
- Create: `scripts/version.ts`
- Create: `scripts/version.unit.ts`
- Modify: `package.json` (root scripts)
- Modify: `packages/*/package.json` versions via the script (all published packages → root version `0.1.0`)
- Modify: root `README.md` with a short Release section (no host-product names)

**Interfaces:**
- Consumes: root `package.json` `version`; `packages/*/package.json`
- Produces:
  - `syncVersions(rootDir)` — write root version onto every `packages/*/package.json` that is not `"private": true`
  - `bumpVersion(rootDir, kind: "patch" | "minor" | "major")` — bump root then sync (0.x: major→minor, minor→patch, patch→patch+1 is **not** Yorozu’s 0.x rule). Match Yorozu lockstep: **all managed packages share one version**. For bump kinds, use standard semver: `0.1.0` + patch → `0.1.1`; + minor → `0.2.0`; + major → `1.0.0`. Keep it simple (not Yorozu’s 0.x feat=patch heuristic).
  - CLI: `tsx scripts/version.ts sync` | `tsx scripts/version.ts bump patch|minor|major`
  - Root scripts: `"version:sync"`, `"version:bump": "tsx scripts/version.ts bump"`, `"release:prepare": "pnpm test && pnpm typecheck && pnpm build && pnpm version:sync"`
  - Do **not** call `npm publish`

Skip `@arrisa/playground` (private). `phrases` currently `0.0.0` — sync brings it to `0.1.0`.

- [ ] **Step 1: Write failing unit tests** in `scripts/version.unit.ts`

Use a temp directory: root package.json version `0.2.0`, two fake packages (`a` version `0.0.1`, `b` private `9.9.9`). After `syncVersions`, `a` is `0.2.0`, `b` unchanged. `bumpVersion(dir, "minor")` on `0.2.0` → `0.3.0` on root and `a`.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run scripts/version.unit.ts` from repo root (root already has vitest). If vitest include is package-only, add `scripts/**/*.unit.ts` to a tiny `scripts/vitest.config.ts` or run `vitest run scripts/version.unit.ts --config` with inline include. Simplest: `vitest.config.ts` at repo root only for scripts, or put tests under `tooling/` if a config exists. Prefer `scripts/version.unit.ts` + root script `"test:scripts": "vitest run --dir scripts"` with a `scripts/vitest.config.ts`:

```ts
import {defineConfig} from "vitest/config"
export default defineConfig({test: {include: ["**/*.unit.ts"]}})
```

Run: `cd scripts && pnpm exec vitest run` may fail path. From root: `pnpm exec vitest run --config scripts/vitest.config.ts`.

Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `scripts/version.ts` with `syncVersions` / `bumpVersion` / CLI when `import.meta.url === pathToFileURL(process.argv[1]).href` or `process.argv[1]` ends with `version.ts`. Use `node:fs` / `node:path`. Preserve JSON indent (detect 2 vs 4 spaces from the file; packages use 2 or 4 — read existing file indent, default 4 to match packages).

- [ ] **Step 4: Run tests; then `pnpm version:sync` on the real repo** so all `packages/*/package.json` versions equal root `0.1.0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/version.ts scripts/version.unit.ts scripts/vitest.config.ts package.json packages/*/package.json README.md
git commit -m "$(cat <<'EOF'
chore: lockstep package versions and release:prepare

EOF
)"
```

---

### Task 5: Desktop wiring guide (outside the repo)

**Files:**
- Create: `/Users/kiwidancebad/Desktop/wsm-arrisa/README.md`
- Create: `/Users/kiwidancebad/Desktop/wsm-arrisa/compose-adapter.ts` (illustrative, not compiled)

This directory is **not** git-added to Arrisa. The guide **may** name vkws-messenger / `@wsm-sdk`.

**Interfaces:**
- Consumes: `composeField`, `docToFormattedText`, `formattedTextToDoc`, `replaceDoc`, `insertMention`, `embeddedMenu`, `linkPrompt`, vkws `TextFormatRange` / `toApiFormat` shape from memory of `@wsm-sdk/core`
- Produces: a host wiring guide: Svelte 5 action, FormattedText ↔ keyed `PartFormat` adapter, chat-switch `replaceDoc`, Enter-to-send, mention insert, custom link field

- [ ] **Step 1: Write the guide** covering:

1. Use `composeField`, not `messengerCompose` (block lists/quote/code; no spoiler).
2. UI owns the Arrisa view; SDK still owns drafts/send wire. No domain transforms in `.svelte.ts` beyond calling the adapter.
3. Svelte 5 `action` that `Arrisa.create({parent, config})` and `destroy` on unmount; never let Svelte reconcile `contentDOM`.
4. Adapter: `FormattedText.entities` → `TextFormatRange[]` (`bold`/`italic`/`underline`/`strikethrough`/`link`/`mention`; `pre`→not a range on send if vkws uses `pre` key; map `unordered_list`/`ordered_list`/`blockquote`/`code` as their format keys). Reverse on hydrate.
5. `replaceDoc` + `formattedTextToDoc` for draft restore / chat switch (`addToHistory: false` already on replaceDoc).
6. `embedded: {parent: toolbarEl, theme: false, class: "…"}` + `floating: false` for chrome inside ChatInput; host CSS.
7. `linkPrompt: (ctx) => { … ctx.apply(url) }` instead of `window.prompt`.
8. Mentions: keep the picker; `insertMention` / `insertMentionSpec` for the atom.
9. Enter-to-send: extra `KeyBinding.of({key: "Enter", run: send})` in host config; Shift-Enter stays linebreak via composeKeymap.
10. Security: `ctx.apply` only; `Arrisa.htmlSanitize` if HTML paste is enabled.

Include a short `compose-adapter.ts` sketch with `formattedTextToRanges` / `rangesToFormattedText` using `let`.

- [ ] **Step 2: Do not `git add` Desktop files.** Confirm in the report that `git status` does not list `Desktop/wsm-arrisa`.

No commit in Arrisa for this task unless you only added a one-line pointer in root README — **do not** add a pointer (would be a host-product leak). Report DONE with the Desktop path.
