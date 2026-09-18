# Playground e2e

Playwright specs drive the private playground compose field (`e2e/*.e2e.ts`).

## Commands

From the repo root:

```bash
pnpm test:e2e:install            # install Playwright Chromium
pnpm test:e2e                    # all e2e/*.e2e.ts
pnpm test:e2e e2e/harness.e2e.ts
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

Helpers: `openCompose(page)` and `e2e(page, (api) => …)` in `helpers.ts`.

## Assertions

Assert **dump / mention query / caret `rect` outcomes**, not native `Selection` / `Range` geometry. `selectionRect` is flushed in the same turn as dispatch.

Do not put host-product names in specs, helpers, or this file.
