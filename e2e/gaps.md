# Compose formatting e2e gaps

Scenarios found in chat compose products that this suite does not pin, because Arrisa `composeField` does not ship the behavior (or the change is too large for a test-only pass). Each item is a later product task.

- Single-asterisk `*bold*` / `_italic_` / `~strike~` (WhatsApp, Slack mrkdwn, Teams markdown). Arrisa markdown rules use `**`, `__`, `~~`.
- Nested markdown delimiter typing as one input-rule match (`**bold __italic__ still**`). Rules are single-line, non-nested. Overlapping marks are covered via keyboard/toolbar in `format-heavy.e2e.ts`.
- Slack/Teams list and quote chords (Mod-Shift-8/7/9). Arrisa lists/quotes are `- ` / `N. ` / `> ` input rules plus toolbar toggles (`format-blocks.e2e.ts`).
- Spoiler (`||text||`, Mod-Shift-p) on the Messenger tab. `composeField` uses `composeMarks` (no spoiler). Spoiler lives on `messengerCompose`.
- Super/subscript, text color, headings, alignment in compose. Those belong to document/`fullSchema`, not `composeSchema`.
- Slack markup-on-send (hide toolbar, format after send). Arrisa compose is live WYSIWYG.
- WhatsApp triple-backtick as inline monospace. Arrisa `` ``` `` + space is a code block.
- Nested lists and expandable quotes.
- Discord/Telegram spoiler nested inside bold/italic in composeField.
