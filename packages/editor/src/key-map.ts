/**
 * Key bindings and the default editor keymap.
 *
 * Each {@link KeyBinding} contributes a {@link KeyBinding.Spec}:
 * - `key` — platform-independent base; overridden by `mac` / `win` / `linux`
 * - `Mod` — Meta on macOS, Ctrl elsewhere
 * - `char` — match a character without modifiers (mutually exclusive with `key`)
 * - `shift` — extra command when Shift is held with a `key` binding
 * - `scope` — space-separated handler scopes (default `"editor"`)
 * - `allowDefault` — match but do not call `preventDefault` unless another
 *   binding handles the event
 *
 * Bindings are normalized and cached per facet value + default-keymap flag.
 * Install rules with `KeyBinding.of(spec)` (as an extension) or use
 * {@link KeyBinding.defaultKeymap} / {@link KeyBinding.useDefaultKeymap}.
 */
import {EditorState} from "@arrisa/state"
import {
    Command,
    collapseSelection,
    deleteToLineEnd,
    deleteUnit,
    deleteWord,
    enter,
    insertLineBreak,
    moveByLine,
    moveByPage,
    moveByUnit,
    moveByWord,
    moveToDocSide,
    moveToLineSide,
    moveToTextblockSide,
    redo,
    selectAll,
    transposeChars,
    undo,
} from "@arrisa/command"
import type {Arrisa} from "./editor"
import browser from "./browser"

export class KeyBinding {
    extension: EditorState.Extension

    private constructor(readonly spec: KeyBinding.Spec) {
        this.extension = KeyBinding.source.of(this)
    }

    static of(spec: KeyBinding.Spec) {
        return new KeyBinding(spec)
    }
}

export namespace KeyBinding {
    export interface Spec {
        char?: string

        key?: string

        mac?: string

        win?: string

        linux?: string

        run: Command.Bound | Command

        shift?: Command.Bound | Command

        any?: (editor: Arrisa, event: KeyboardEvent) => boolean

        scope?: string

        allowDefault?: boolean
    }

    export function runScopeHandlers(editor: Arrisa, event: KeyboardEvent, scope: string) {
        let map = getKeymap(editor.state.facet(KeyBinding.source), editor.state.facet(useDefaultKeymap))
        return runHandlers(map, event, editor, scope)
    }

    export const source = EditorState.Facet.define<KeyBinding>()

    export const useDefaultKeymap = EditorState.Facet.define<boolean, boolean>({
        combine: (input) => (input.length ? input[0] : true),
    })

    export const defaultKeymap: readonly KeyBinding[] = (
        [
            {key: "Enter", run: enter},
            {key: "Shift-Enter", run: insertLineBreak},
            {key: "Backspace", run: Command.bind(deleteUnit, "backward")},
            {key: "Delete", run: Command.bind(deleteUnit, "forward")},
            {key: "Ctrl-Backspace", mac: "Alt-Backspace", run: Command.bind(deleteWord, "backward")},
            {key: "Ctrl-Delete", mac: "Alt-Delete", run: Command.bind(deleteWord, "forward")},
            {mac: "Cmd-Backspace", run: Command.bind(deleteToLineEnd, "backward")},
            {mac: "Cmd-Delete", run: Command.bind(deleteToLineEnd, "forward")},
            {
                key: "ArrowLeft",
                run: Command.bind(moveByUnit, {dir: "left"}),
                shift: Command.bind(moveByUnit, {dir: "left", extend: true}),
            },
            {
                key: "ArrowRight",
                run: Command.bind(moveByUnit, {dir: "right"}),
                shift: Command.bind(moveByUnit, {dir: "right", extend: true}),
            },
            {
                key: "ArrowDown",
                run: Command.bind(moveByLine, {dir: "down"}),
                shift: Command.bind(moveByLine, {dir: "down", extend: true}),
            },
            {
                key: "ArrowUp",
                run: Command.bind(moveByLine, {dir: "up"}),
                shift: Command.bind(moveByLine, {dir: "up", extend: true}),
            },
            {
                key: "Mod-ArrowLeft",
                mac: "Alt-ArrowLeft",
                run: Command.bind(moveByWord, {dir: "left"}),
                shift: Command.bind(moveByWord, {dir: "left", extend: true}),
            },
            {
                key: "Mod-ArrowRight",
                mac: "Alt-ArrowRight",
                run: Command.bind(moveByWord, {dir: "right"}),
                shift: Command.bind(moveByWord, {dir: "right", extend: true}),
            },
            {
                mac: "Cmd-ArrowLeft",
                run: Command.bind(moveToLineSide, {dir: "left"}),
                shift: Command.bind(moveToLineSide, {dir: "left", extend: true}),
            },
            {
                mac: "Cmd-ArrowRight",
                run: Command.bind(moveToLineSide, {dir: "right"}),
                shift: Command.bind(moveToLineSide, {dir: "right", extend: true}),
            },
            {
                mac: "Cmd-ArrowUp",
                run: Command.bind(moveToDocSide, {side: "start"}),
                shift: Command.bind(moveToDocSide, {side: "start", extend: true}),
            },
            {
                mac: "Cmd-ArrowDown",
                run: Command.bind(moveToDocSide, {side: "end"}),
                shift: Command.bind(moveToDocSide, {side: "end", extend: true}),
            },
            {
                mac: "Ctrl-ArrowUp",
                run: Command.bind(moveByPage, {dir: "up"}),
                shift: Command.bind(moveByPage, {dir: "up", extend: true}),
            },
            {
                mac: "Ctrl-ArrowDown",
                run: Command.bind(moveByPage, {dir: "down"}),
                shift: Command.bind(moveByPage, {dir: "down", extend: true}),
            },
            {
                key: "PageUp",
                run: Command.bind(moveByPage, {dir: "up"}),
                shift: Command.bind(moveByPage, {dir: "up", extend: true}),
            },
            {
                key: "PageDown",
                run: Command.bind(moveByPage, {dir: "down"}),
                shift: Command.bind(moveByPage, {dir: "down", extend: true}),
            },
            {
                key: "Home",
                run: Command.bind(moveToLineSide, {dir: "backward"}),
                shift: Command.bind(moveToLineSide, {dir: "backward", extend: true}),
            },
            {
                key: "End",
                run: Command.bind(moveToLineSide, {dir: "forward"}),
                shift: Command.bind(moveToLineSide, {dir: "forward", extend: true}),
            },
            {
                key: "Mod-Home",
                run: Command.bind(moveToDocSide, {side: "start"}),
                shift: Command.bind(moveToDocSide, {side: "start", extend: true}),
            },
            {
                key: "Mod-End",
                run: Command.bind(moveToDocSide, {side: "end"}),
                shift: Command.bind(moveToDocSide, {side: "end", extend: true}),
            },
            {key: "Mod-a", run: selectAll},
            {key: "Escape", run: collapseSelection, allowDefault: true},
            {key: "Mod-z", run: undo},
            {key: "Mod-y", mac: "Mod-Shift-z", run: redo},
            {linux: "Ctrl-Shift-z", run: redo},

            {
                mac: "Ctrl-b",
                run: Command.bind(moveByUnit, {dir: "backward"}),
                shift: Command.bind(moveByUnit, {dir: "backward", extend: true}),
            },
            {
                mac: "Ctrl-f",
                run: Command.bind(moveByUnit, {dir: "forward"}),
                shift: Command.bind(moveByUnit, {dir: "forward", extend: true}),
            },
            {
                mac: "Ctrl-p",
                run: Command.bind(moveByLine, {dir: "up"}),
                shift: Command.bind(moveByLine, {dir: "up", extend: true}),
            },
            {
                mac: "Ctrl-n",
                run: Command.bind(moveByLine, {dir: "down"}),
                shift: Command.bind(moveByLine, {dir: "down", extend: true}),
            },
            {
                mac: "Ctrl-a",
                run: Command.bind(moveToTextblockSide, {dir: "backward"}),
                shift: Command.bind(moveToTextblockSide, {dir: "backward", extend: true}),
            },
            {
                mac: "Ctrl-e",
                run: Command.bind(moveToTextblockSide, {dir: "forward"}),
                shift: Command.bind(moveToTextblockSide, {dir: "forward", extend: true}),
            },
            {mac: "Ctrl-d", run: Command.bind(deleteUnit, "forward")},
            {mac: "Ctrl-h", run: Command.bind(deleteUnit, "backward")},
            {mac: "Ctrl-k", run: Command.bind(deleteToLineEnd, "forward")},
            {mac: "Ctrl-Alt-h", run: Command.bind(deleteWord, "backward")},
            {mac: "Ctrl-o", run: insertLineBreak},
            {mac: "Ctrl-t", run: transposeChars},
            {mac: "Ctrl-v", run: Command.bind(moveByPage, {dir: "down"})},
        ] as KeyBinding.Spec[]
    ).map(KeyBinding.of)
}

export type PlatformName = "mac" | "win" | "linux" | "key"

const currentPlatform: PlatformName = browser.mac ? "mac" : browser.windows ? "win" : browser.linux ? "linux" : "key"

/**
 * Canonicalize a key name for the given platform (`Mod` → Meta/Ctrl).
 * Modifiers are applied so the final string is `Shift-Meta-Ctrl-Alt-key`
 * when all are present (each prefix is prepended in Alt → Ctrl → Meta → Shift).
 */
export function normalizeKeyName(name: string, platform: PlatformName): string {
    let parts = name.split(/-(?!$)/)
    let result = parts[parts.length - 1]
    if (result == "Space") result = " "
    else if (/^[A-Z]$/.test(result)) result = result.toLowerCase()
    let alt, ctrl, shift, meta
    for (let i = 0; i < parts.length - 1; ++i) {
        let mod = parts[i]
        if (/^(cmd|meta|m)$/i.test(mod)) meta = true
        else if (/^a(lt)?$/i.test(mod)) alt = true
        else if (/^(c|ctrl|control)$/i.test(mod)) ctrl = true
        else if (/^s(hift)?$/i.test(mod)) shift = true
        else if (/^mod$/i.test(mod)) {
            if (platform == "mac") meta = true
            else ctrl = true
        } else throw new Error("Unrecognized modifier name: " + mod)
    }
    if (alt) result = "Alt-" + result
    if (ctrl) result = "Ctrl-" + result
    if (meta) result = "Meta-" + result
    if (shift) result = "Shift-" + result
    return result
}

/** Prefix `name` with modifiers present on `event` (same order as normalize). */
export function modifiers(name: string, event: KeyboardEvent) {
    if (event.altKey) name = "Alt-" + name
    if (event.ctrlKey) name = "Ctrl-" + name
    if (event.metaKey) name = "Meta-" + name
    if (event.shiftKey) name = "Shift-" + name
    return name
}

const enum BindingFlag {
    Char = 1,
    Key = 2,
    Any = 4,
    AllowDefault = 8,
}

class NormalizedBinding {
    constructor(
        readonly flags: BindingFlag,
        readonly name: string,
        readonly command: (editor: Arrisa, event: KeyboardEvent) => boolean,
    ) {}
}

type Keymap = Record<string, NormalizedBinding[]>

const keymapCache = new WeakMap<readonly KeyBinding[], {map: Keymap; deflt: boolean}>()

function getKeymap(bindings: readonly KeyBinding[], addDefault: boolean) {
    let found = keymapCache.get(bindings)
    if (!found || found.deflt != addDefault) {
        found = {
            map: buildKeymap(addDefault ? bindings.concat(KeyBinding.defaultKeymap) : bindings, currentPlatform),
            deflt: addDefault,
        }
        keymapCache.set(bindings, found)
    }
    return found.map
}

function bind(run: Command.Bound | Command): (editor: Arrisa) => boolean {
    return (editor: Arrisa) => Command.dispatch(editor, run)
}

function buildKeymap(bindings: readonly KeyBinding[], platform: PlatformName) {
    let scopes: Keymap = Object.create(null)

    for (let {spec: b} of bindings) {
        let baseFlags = b.allowDefault ? BindingFlag.AllowDefault : 0
        for (let scope of b.scope ? b.scope.split(" ") : ["editor"]) {
            let array = scopes[scope] || (scopes[scope] = [])
            let key = b[platform] || b.key
            if (b.char) {
                if (key) throw new Error("A key binding may not provide both a char and a key field")
                if (b.shift) throw new Error("Shift-modified bindings are not supported for char bindings")
                array.push(new NormalizedBinding(baseFlags | BindingFlag.Char, b.char, bind(b.run)))
            }
            if (key)
                array.push(
                    new NormalizedBinding(baseFlags | BindingFlag.Key, normalizeKeyName(key, platform), bind(b.run)),
                )
            if (key && b.shift)
                array.push(
                    new NormalizedBinding(
                        baseFlags | BindingFlag.Key,
                        normalizeKeyName("Shift-" + key, platform),
                        bind(b.shift),
                    ),
                )
            if (b.any) array.push(new NormalizedBinding(BindingFlag.Any, "", b.any))
        }
    }
    return scopes
}

function runHandlers(map: Keymap, event: KeyboardEvent, editor: Arrisa, scope: string): boolean {
    let handlers = map[scope]
    if (!handlers) return false

    let key = event.key,
        charCode = key.codePointAt(0)!
    let altGr = event.getModifierState("AltGraph"),
        fromCode = charKeyCodes[event.keyCode]
    let isChar = codePointSize(charCode) == key.length
    let char = isChar ? String.fromCodePoint(charCode) : null
    let base = modifiers(key, event)

    let fallback = isChar && !altGr && fromCode && fromCode != base ? modifiers(fromCode, event) : null

    let handled = false,
        didMatch = false,
        allowDefault = false
    for (let binding of handlers) {
        let matched =
            (binding.flags & BindingFlag.Char &&
                (altGr || (!event.ctrlKey && !event.metaKey)) &&
                binding.name == char) ||
            (binding.flags & BindingFlag.Key && (binding.name == base || binding.name == fallback)) ||
            binding.flags & BindingFlag.Any
        if (matched) {
            didMatch = true
            if (!handled && binding.command(editor, event)) {
                handled = true
            } else if (binding.flags & BindingFlag.AllowDefault) {
                allowDefault = true
            }
        }
    }
    if (didMatch && !allowDefault) event.preventDefault()
    return handled
}

function codePointSize(code: number): 1 | 2 {
    return code < 0x10000 ? 1 : 2
}

function buildCharKeyCodes() {
    let result: Record<number, string> = {
        32: " ",
        59: ";",
        61: "=",
        106: "*",
        107: "+",
        108: ",",
        109: "-",
        110: ".",
        111: "/",
        173: "-",
        186: ";",
        187: "=",
        188: ",",
        189: "-",
        190: ".",
        191: "/",
        192: "`",
        219: "[",
        220: "\\",
        221: "]",
        222: "'",
    }
    for (var i = 0; i < 10; i++) result[48 + i] = String(i)
    for (var i = 1; i <= 24; i++) result[i + 111] = "F" + i
    for (var i = 65; i <= 90; i++) result[i] = String.fromCharCode(i + 32)
    return result
}

const charKeyCodes = buildCharKeyCodes()
