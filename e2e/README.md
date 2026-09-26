# Playground e2e

Playwright specs drive the private playground compose field (`e2e/*.e2e.ts`).

## Commands

From the repo root:

```bash
pnpm test:e2e:install            # install Playwright Chromium
pnpm test:e2e                    # all e2e/*.e2e.ts
pnpm test:e2e e2e/harness.e2e.ts
pnpm test:e2e e2e/compose-submit.e2e.ts
pnpm test:e2e e2e/compose-mention.e2e.ts
pnpm test:e2e e2e/compose-schedule.e2e.ts
```

The runner starts a dedicated `pnpm playground` on `http://127.0.0.1:5173` with `ARRISA_E2E=1` so Vite does not open a browser (`server.open: false`, `strictPort: true`). Locally it reuses a server already bound to that port unless `CI` is set.

`pnpm release:prepare` runs this suite. Do not skip it for a release.

## Required when

When production files in a row change, run the specs in that row (or the full suite) before commit.

| Production paths | Specs |
|------------------|-------|
| `packages/editor/src/input/**`, `packages/editor/src/key-map.ts`, `packages/editor/src/compose-keymap.ts` | `caret-*.e2e.ts`, `format-*.e2e.ts`, `compose-submit.e2e.ts` |
| `packages/command/src/mark.ts`, `packages/command/src/mark-exclusivity.ts`, `packages/schema/src/mark.ts`, `packages/schema/src/clear-formatting.ts` | `format-marks.e2e.ts`, `format-type.e2e.ts`, `format-heavy.e2e.ts` |
| `packages/schema/src/list.ts`, `packages/schema/src/block.ts` (blockquote / codeBlock) | `format-blocks.e2e.ts`, `codeblock-*.e2e.ts` |
| `packages/schema/src/link.ts`, `packages/command/src/mark.ts` (applyLink / removeLinks) | `format-link.e2e.ts` |
| `packages/editor/src/menu-dom.ts`, `packages/command/src/menu.ts` | `format-marks.e2e.ts`, `format-type.e2e.ts`, `format-blocks.e2e.ts`, `format-link.e2e.ts` |
| `packages/message/src/markdown*.ts`, `packages/message/src/paste-markdown.ts`, `packages/message/src/parse-markdown.ts` | `format-markdown.e2e.ts` |
| `packages/message/src/to-formatted.ts`, `packages/message/src/from-formatted.ts`, `packages/message/src/entities.ts` | `format-heavy.e2e.ts`, `compose-mention.e2e.ts` |
| `packages/message/src/compose-field.ts`, `packages/message/src/mention-query.ts`, `packages/message/src/insert.ts` | `compose-submit.e2e.ts`, `compose-mention.e2e.ts`, `format-*.e2e.ts` |
| `packages/message/src/schedule-*.ts`, `packages/message/src/compose-field.ts` (`scheduleQuery`), `packages/phrases/src/catalogs/ui.ts` (`schedule_suggestion`) | `compose-schedule.e2e.ts` |
| `packages/editor/src/dom/coords.ts`, `packages/command/src/motion.ts` | `caret-*.e2e.ts`, `codeblock-*.e2e.ts` |
| `packages/schema/src/code-indent.ts`, `packages/schema/src/highlight-code.ts`, `packages/schema/src/code-block-paint.ts` | `codeblock-*.e2e.ts` |

## `?e2e=1`

`window.__arrisaE2e` is assigned **only** when `location.search` contains `e2e=1` (for example `/?e2e=1`, then the Messenger tab).

| Field | Role |
|-------|------|
| `chatEditor` | Mounted compose `Arrisa` |
| `lastMentionQuery` | Last `onMentionQuery` payload, or `null` |
| `lastScheduleAccept` | Last `onScheduleAccept` payload, or `null` |
| `lastScheduleAction` | Last custom schedule action id, or `null` |
| `scheduleQuery()` | `detectScheduleQuery` of the compose state (no rect) |
| `dump(opts?)` | `docToFormattedText` of the compose document |
| `insertMention({userId, label, from?, to?})` | Dump-range or selection insert |
| `insertText(text)` | `Command.dispatch` with `userEvent: "input.type"` |
| `remountCompose({submit?, schedulePreset?})` | Remount compose; optional submit chord logs `"send"`; `schedulePreset: "two-actions"` installs Schedule + Later |
| `sendLog` | Host submit log (`"send"` entries) |

Helpers: `openCompose(page)`, `composeBox(page)`, and `e2e(page, fn, arg?)` in `helpers.ts`. Two-arg form passes the harness as `fn`'s first argument. A third `arg` object is merged as `{api, …arg}` so Playwright can serialize extra values. Keyboard specs click `composeBox` (`#editor-chat [contenteditable='true']`) so they do not hit the hidden document editor.

## Specs

| File | Covers |
|------|--------|
| `harness.e2e.ts` | `/?e2e=1` installs `__arrisaE2e` on the messenger tab |
| `compose-submit.e2e.ts` | `submit: "Enter"` / `"Shift-Enter"` — send vs newline, dump stays after send |
| `compose-mention.e2e.ts` | typed `@` query+rect, same-turn `insertText("@")`, dump-range `insertMention` with `mentionText`, `autoDetect` skip type `mention` |
| `compose-schedule.e2e.ts` | typed datetime offer, `at HH:mm` closest 24h, chip, accept, Enter fall-through, ArrowUp/ArrowDown+Enter, custom Later action, type-past clears paint, Escape hides chip, skip code, mention wins |
| `caret.ts` | Shared `caretSnap` / `findText` / `clickDocPos` / `docPosCoords` / `typeFence` / word and select-all chords |
| `format.ts` | Shared dump / `hasFlag` / `selectNeedle` (adjacent leaves, including mark splits) / `focusCompose` / `clickFormat` (overflow **More**) and mark chords |
| `format-marks.e2e.ts` | Keyboard and toolbar mark toggles on a selected word; stacked bold+italic; mid-word slice |
| `format-type.e2e.ts` | Keyboard stored bold and toolbar stored italic on the next typed word; keyboard toggle off; clear stacked marks; undo/redo after keyboard bold |
| `format-markdown.e2e.ts` | Typing `**bold**` / `__italic__` / `~~strike~~` / `` `code` `` drops delimiters; adjacent markdown runs; paste markdown bold+code and markdown links |
| `format-blocks.e2e.ts` | Typing `- ` / `1. ` / `> ` and toolbar Toggle bullet list / Toggle ordered list / Toggle blockquote; bold in a list item; italic in a quote; formatted paragraph then fenced code |
| `format-link.e2e.ts` | Mod-k and toolbar Create link with the host prompt; paste URL onto a selection wraps without inserting the URL text; stacked bold+link |
| `format-heavy.e2e.ts` | Overlapping bold+italic slices, emoji UTF-16 bold length, two-paragraph select-all bold, mixed list+quote+code+mention+auto URL dump, send with autoDetect |
| `codeblock-type.e2e.ts` | Typed text stays inside an empty code block |
| `codeblock-after.e2e.ts` | Typed text stays on the line after a code block |
| `codeblock-exit.e2e.ts` | Arrow right at the end of a code block moves to the next line |
| `codeblock-tab.e2e.ts` | Tab indent / Shift-Tab outdent; Shift-Enter caret; vertical caret after a code block |
| `codeblock-color.e2e.ts` | Fenced block coloring, CSS variable repaint, inline backticks still a code mark |
| `caret-plain.e2e.ts` | Plain-text unit, word, line, paragraph, doc-side, select-all, Escape |
| `caret-code.e2e.ts` | Keyboard motion inside code, exit/enter, adjacent blocks, Shift-Enter lines, paragraph↔code arrows including ArrowDown off a code line |
| `caret-click.e2e.ts` | Click, double-click, triple-click, Shift-click, drag — plain text and mixed paragraph/code |

## Assertions

Assert **dump / mention query / schedule query / chip DOM / `onAccept` / caret `rect` outcomes**, not native `Selection` / `Range` geometry. `selectionRect` is flushed in the same turn as dispatch.

Do not put host-product names in specs, helpers, or this file.
