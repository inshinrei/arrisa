# Agents lockstep patch-bump instruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a contributor-agent rule that bumps the lockstep **patch** by +1 on every user-facing commit (`feat` / `fix` / `perf` / `revert`), in the same commit as the change — the same policy as [yorozu](https://github.com/inshinrei/yorozu) `AGENTS.md`.

**Architecture:** Documentation only. Root `AGENTS.md` is the agent source of truth (not published to npm). Root `README.md` Release section is the human counterpart. Package `agents-for-module.md` files stay consumer-safe and must not mention monorepo versioning. Existing `pnpm version:bump patch` already writes root + public `packages/*` and skips private packages; this task does not change `scripts/version.ts`.

**Tech Stack:** Markdown. No runtime/code/test changes.

## Global Constraints

- Stay on the current git branch (`main`). Do not create a worktree or a new branch.
- Prefer `let` over `const` except arrow functions and true module-level constants (no new TypeScript in this plan).
- Do **not** edit `packages/*/agents-for-module.md`, `packages/*/README.md`, `scripts/version.ts`, `scripts/publish.ts`, or any `package.json`.
- Do **not** bump versions in this work. This change is `docs`; the new policy itself forbids a bump on `docs`.
- Do **not** publish.
- Do **not** add tests, CI hooks, or commit-lint enforcement. The instruction is the deliverable (same as yorozu: prose in root `AGENTS.md`, no hook).
- Conventional types that bump: `feat`, `fix`, `perf`, `revert` only. Types that do **not** bump: `docs`, `test`, `chore`, `ci`, `style`, `refactor`.
- `feat` is still a patch, not minor. Minor/major only when the human explicitly asks: `pnpm version:bump minor` or `pnpm version:bump major`.
- Bump in **the same commit** as the code change via `pnpm version:bump patch`. No follow-up `feat: ver bump` / `chore: ver bump`.
- Private playground is not in the lockstep (already skipped by `scripts/version.ts` when `private: true`). Arrisa has no `_standalone` packages.
- Publishing stays `pnpm release`.
- Documentation split: root `AGENTS.md` = in-repo agents; root `README.md` = humans; package `agents-for-module.md` = consumers (untouched).

---

## File map

- Modify: `AGENTS.md` (new section near the top; Commands table rows; checklist item; decision bullet)
- Modify: `README.md` (one paragraph in Release)
- Create: `docs/superpowers/plans/2026-09-19-agents-patch-bump.md` (this file; include in the same commit if untracked)

---

### Task 1: Root agents + README patch-bump policy

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md` (Release section)
- Create: `docs/superpowers/plans/2026-09-19-agents-patch-bump.md` (already written by the controller; stage it if still untracked)

**Interfaces:**
- Consumes: existing `pnpm version:bump patch|minor|major` and `pnpm version:sync` (do not change them)
- Produces: contributor-visible policy text in `AGENTS.md` and `README.md`

- [ ] **Step 1: Insert the version-bump section in `AGENTS.md`**

Place this section **after** the opening blockquote + the “not published to npm” paragraph, and **before** `## Code style`. Use this text verbatim:

```markdown
## Version bump on user-facing commits

Published `packages/*` share one lockstep version with the repo root `package.json`. Private packages (the playground) are skipped.

Every commit whose conventional type is `feat`, `fix`, `perf`, or `revert` must increment the **patch** of:

- the repo root `package.json`
- every public package under `packages/*/package.json`

by **+1**, in **the same commit** as the code change. Run `pnpm version:bump patch` (or edit the files equivalently). Do not leave a follow-up `feat: ver bump` / `chore: ver bump` for those types.

Do **not** bump on `docs`, `test`, `chore`, `ci`, `style`, or `refactor`.

Do **not** bump the private playground. Do not publish from a bump-only thought; publishing stays `pnpm release`.

`feat` is still a patch here (not minor). Use `pnpm version:bump minor` or `pnpm version:bump major` only when the human explicitly wants a minor/major cut.

Example: root and published packages at `0.1.5` + `fix(editor): …` → all of those `package.json` files become `0.1.6` in that fix commit.
```

- [ ] **Step 2: Add version commands to the Commands table**

In `AGENTS.md` `## Commands`, after the `pnpm release` row and before the blank line / “Per package” paragraph, add these two rows (keep the existing table columns Command | Purpose):

```markdown
| `pnpm version:sync` | Copy root version onto published packages |
| `pnpm version:bump patch\|minor\|major` | Standard semver on root, then sync |
```

In the markdown source the command cell is a code span: `` `pnpm version:bump patch|minor|major` `` (pipe characters inside the code span, not escaped).

- [ ] **Step 3: Checklist + decision guidance**

Append this as item **5** of `## Package work checklist` (after “Run package tests…”):

```markdown
5. If the commit type is `feat`, `fix`, `perf`, or `revert`, bump the lockstep patch in the same commit (`pnpm version:bump patch`).
```

Append this bullet at the end of `## Decision guidance`:

```markdown
- On `feat` / `fix` / `perf` / `revert`, bump the lockstep patch in that same commit. Do not save it for a later `ver bump` commit.
```

- [ ] **Step 4: Human README pointer**

In `README.md` `## Release`, immediately after the paragraph that starts `Published \`packages/*\` share one lockstep version` and **before** the fenced command list, insert:

```markdown
On `feat` / `fix` / `perf` / `revert` commits, bump that lockstep **patch** in the same commit (`pnpm version:bump patch`). Do not bump on `docs` / `test` / `chore` / `ci` / `style` / `refactor`. `feat` stays a patch; minor/major only when explicitly requested. See root [`AGENTS.md`](AGENTS.md).
```

Do not rewrite the rest of the Release section.

- [ ] **Step 5: Verify (no version bump, no consumer-agent leak)**

Run:

```bash
rg -n "Version bump on user-facing" AGENTS.md
rg -n "pnpm version:bump patch" AGENTS.md README.md
rg -n "version:bump|ver bump|lockstep patch" packages/*/agents-for-module.md
git diff -- package.json packages/*/package.json playground/package.json
```

Expected:

- `AGENTS.md` has the new section and `pnpm version:bump patch`
- `README.md` has the Release paragraph
- `packages/*/agents-for-module.md` has **no** matches
- no `package.json` diffs

- [ ] **Step 6: Commit**

Stage `AGENTS.md`, `README.md`, and this plan file if untracked. Do not stage `package.json` files.

```bash
git add AGENTS.md README.md docs/superpowers/plans/2026-09-19-agents-patch-bump.md
git commit -m "$(cat <<'EOF'
docs: bump lockstep patch on feat/fix/perf/revert

Match yorozu: same-commit +1 patch for user-facing conventional types.
EOF
)"
```

Commit type is `docs` — do **not** run `pnpm version:bump`.
