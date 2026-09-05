/**
 * Block chat compose preset: {@link composeSchema} + {@link composeKeymap}
 * plus optional markdown, menus, placeholder, and host atoms.
 */
import {Menu} from "@arrisa/command"
import {type Mark} from "@arrisa/doc"
import {
    composeKeymap,
    embeddedMenu,
    floatingMenu,
    placeholder,
    type EmbeddedMenuConfig,
    type FloatingMenuConfig,
} from "@arrisa/editor"
import {composeSchema, type LinkConfig} from "@arrisa/schema"
import {EditorState} from "@arrisa/state"
import {markdownInputRules} from "./markdown"
import {mentionResolve} from "./mention-rule"
import {markdownPaste} from "./paste-markdown"
import {messengerHostElements} from "./schema-elements"

export interface ComposeFieldConfig {
    exclusivity?: "none" | "code-strike" | {isolating: readonly Mark.Type[]}
    /** Floating selection toolbar. Default: top group above selection. */
    floating?: boolean | FloatingMenuConfig
    /** Toolbar mounted into a host parent. Default false (omit). */
    embedded?: false | EmbeddedMenuConfig
    /** Placeholder text when empty. Default `"Message…"`. Pass `false` to omit. */
    placeholder?: string | false
    /** Install markdown delimiter input rules. Default true. */
    markdown?: boolean
    /** Parse plain-text markdown on paste. Default true. */
    markdownPaste?: boolean
    /**
     * Register mention + custom emoji schema elements. Default false.
     * Hosts insert via {@link insertMention} / {@link insertCustomEmoji}.
     */
    hostElements?: boolean
    /**
     * Sync resolve for `@username ` → mention mark.
     * Return a user id to convert; null/undefined leaves plain text.
     */
    resolveMention?: (username: string) => string | null | undefined
    /** Forwarded to {@link composeSchema} as `link.prompt`. */
    linkPrompt?: LinkConfig["prompt"]
}

/**
 * Block chat compose extension set:
 * - {@link composeSchema} (Doc + lists/quote/code + compose marks, no spoiler)
 * - {@link composeKeymap} (default keymap off)
 * - optional exclusivity (`"none"` | `"code-strike"` | custom)
 * - optional host elements (`hostElements` default false)
 * - markdown input rules + paste parser
 * - floating and/or embedded toolbar (`Menu.Group.top`)
 * - placeholder
 *
 * Does not include history — add `@arrisa/history` in the host.
 */
export function composeField(config: ComposeFieldConfig = {}): EditorState.Extension {
    let {
        exclusivity = "none",
        floating = true,
        embedded = false,
        placeholder: ph = "Message…",
        markdown = true,
        markdownPaste: mdPaste = true,
        hostElements = false,
        resolveMention,
        linkPrompt,
    } = config

    let ext: EditorState.Extension[] = [
        composeSchema({exclusivity, link: {prompt: linkPrompt}}),
        composeKeymap(),
    ]

    if (hostElements) ext.push(messengerHostElements())
    if (markdown) ext.push(markdownInputRules())
    if (mdPaste) ext.push(markdownPaste())
    if (resolveMention) ext.push(mentionResolve(resolveMention))

    if (floating !== false) {
        let fconf: FloatingMenuConfig =
            floating === true
                ? {template: Menu.Group.top.template(), above: true}
                : {
                      template: Menu.Group.top.template(),
                      above: true,
                      ...floating,
                  }
        ext.push(floatingMenu(fconf))
    }

    if (embedded) {
        let econf: EmbeddedMenuConfig = {
            template: Menu.Group.top.template(),
            ...embedded,
        }
        ext.push(embeddedMenu(econf))
    }

    if (ph !== false) ext.push(placeholder(ph))

    return ext
}
