/**
 * Messenger compose presets built on `@arrisa/schema` marks + entity I/O helpers.
 */
import {markExclusivity, Menu} from "@arrisa/command"
import {floatingMenu, type FloatingMenuConfig, placeholder} from "@arrisa/editor"
import {messengerMarks, messengerSchema, type MessengerSchemaConfig} from "@arrisa/schema"
import {EditorState} from "@arrisa/state"
import {markdownInputRules} from "./markdown"
import {mentionResolve} from "./mention-rule"
import {markdownPaste} from "./paste-markdown"
import {messengerHostElements} from "./schema-elements"

export interface MessengerComposeConfig extends MessengerSchemaConfig {
    /** Floating selection toolbar. Default: inline group above selection. */
    floating?: boolean | FloatingMenuConfig
    /** Placeholder text when empty. Default `"Message…"`. Pass `false` to omit. */
    placeholder?: string | false
    /** Install markdown delimiter input rules. Default true. */
    markdown?: boolean
    /** Parse plain-text markdown on paste. Default true. */
    markdownPaste?: boolean
    /**
     * Register mention + custom emoji schema elements. Default true.
     * Hosts insert via {@link insertMention} / {@link insertCustomEmoji}.
     */
    hostElements?: boolean
    /**
     * Sync resolve for `@username ` → mention mark.
     * Return a user id to convert; null/undefined leaves plain text.
     */
    resolveMention?: (username: string) => string | null | undefined
}

/**
 * Full messenger compose extension set:
 * - {@link messengerSchema} (inline doc + format marks)
 * - optional exclusivity (`"none"` | `"code-strike"` | custom)
 * - markdown input rules + paste parser
 * - mention / custom emoji schema elements
 * - floating selection toolbar
 * - placeholder
 *
 * Does not include history — add `@arrisa/history` in the host.
 */
export function messengerCompose(config: MessengerComposeConfig = {}): EditorState.Extension {
    let {
        exclusivity = "none",
        floating = true,
        placeholder: ph = "Message…",
        markdown = true,
        markdownPaste: mdPaste = true,
        hostElements = true,
        resolveMention,
    } = config

    let ext: EditorState.Extension[] = [messengerSchema({exclusivity})]

    if (hostElements) ext.push(messengerHostElements())
    if (markdown) ext.push(markdownInputRules())
    if (mdPaste) ext.push(markdownPaste())
    if (resolveMention) ext.push(mentionResolve(resolveMention))

    if (floating !== false) {
        let fconf: FloatingMenuConfig =
            floating === true
                ? {template: Menu.Group.inline.template(), above: true}
                : {
                      template: Menu.Group.inline.template(),
                      above: true,
                      ...floating,
                  }
        ext.push(floatingMenu(fconf))
    }

    if (ph !== false) ext.push(placeholder(ph))

    return ext
}

/**
 * Re-export of schema messenger marks for hosts that only need the mark set.
 * Prefer {@link messengerCompose} for a full chat field.
 */
export {messengerMarks, messengerSchema, markExclusivity}
