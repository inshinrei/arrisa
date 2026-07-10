/**
 * Placeholder undo/redo commands for keymaps and menus.
 *
 * Real history lives in `@arrisa/history`. Apps should either:
 * - wire {@link Command.handler} overrides that call history undo/redo, or
 * - bind keymap entries to `@arrisa/history` exports directly.
 *
 * These stubs always return `false` so dispatch falls through cleanly when no
 * handler is registered.
 */
import {type Command} from "./command"

/** No-op undo (override via {@link Command.handler} or use `@arrisa/history`). */
export const undo: Command = () => false

/** No-op redo (override via {@link Command.handler} or use `@arrisa/history`). */
export const redo: Command = () => false
