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
```

The runner starts a dedicated `pnpm playground` on `http://127.0.0.1:5173` with `ARRISA_E2E=1` so Vite does not open a browser (`server.open: false`, `strictPort: true`). Locally it reuses a server already bound to that port unless `CI` is set.

## `?e2e=1`

`window.__arrisaE2e` is assigned **only** when `location.search` contains `e2e=1` (for example `/?e2e=1`, then the Messenger tab).

| Field | Role |
|-------|------|
| `chatEditor` | Mounted compose `Arrisa` |
| `lastMentionQuery` | Last `onMentionQuery` payload, or `null` |
| `dump(opts?)` | `docToFormattedText` of the compose document |
| `insertMention({userId, label, from?, to?})` | Dump-range or selection insert |
| `insertText(text)` | `Command.dispatch` with `userEvent: "input.type"` |
| `remountCompose({submit?})` | Remount compose; optional submit chord logs `"send"` |
| `sendLog` | Host submit log (`"send"` entries) |

Helpers: `openCompose(page)`, `composeBox(page)`, and `e2e(page, (api) => …)` in `helpers.ts`. Keyboard specs click `composeBox` (`#editor-chat [contenteditable='true']`) so they do not hit the hidden document editor.

## Specs

| File | Covers |
|------|--------|
| `harness.e2e.ts` | `/?e2e=1` installs `__arrisaE2e` on the messenger tab |
| `compose-submit.e2e.ts` | `submit: "Enter"` / `"Shift-Enter"` — send vs newline, dump stays after send |
| `compose-mention.e2e.ts` | typed `@` query+rect, same-turn `insertText("@")`, dump-range `insertMention` with `mentionText`, `autoDetect` skip type `mention` |
| `caret.ts` | Shared `caretSnap` / `findText` / `clickDocPos` / word and select-all chords |
| `caret-plain.e2e.ts` | Plain-text unit, word, line, paragraph, doc-side, select-all, Escape |
| `caret-code.e2e.ts` | Keyboard motion inside code, exit/enter, adjacent blocks, Shift-Enter lines, paragraph↔code arrows |

## Assertions

Assert **dump / mention query / caret `rect` outcomes**, not native `Selection` / `Range` geometry. `selectionRect` is flushed in the same turn as dispatch.

Do not put host-product names in specs, helpers, or this file.
