import type {Page} from "@playwright/test"
import {clickDocPos, findText, waitFrames} from "./caret"
import {e2e} from "./helpers"

export type FlagType = "bold" | "italic" | "underline" | "strike" | "code"

export type DumpEntity = {
    type: string
    offset: number
    length: number
    url?: string
    language?: string
    userId?: string
}

export type Dump = {text: string; entities?: DumpEntity[]}

export const MARK_KEYS: Record<FlagType, string> = {
    bold: "ControlOrMeta+b",
    italic: "ControlOrMeta+i",
    underline: "ControlOrMeta+u",
    strike: "ControlOrMeta+/",
    code: "ControlOrMeta+`",
}

export const MARK_BUTTONS: Record<FlagType, string> = {
    bold: "Toggle strong emphasis",
    italic: "Toggle emphasis",
    underline: "Toggle underline",
    strike: "Toggle strikethrough",
    code: "Toggle code font",
}

export async function dump(page: Page, opts?: Record<string, unknown> | null): Promise<Dump> {
    return e2e(page, ({api, opts}: {api: any; opts: Record<string, unknown> | null}) => api.dump(opts ?? undefined), {
        opts: opts ?? null,
    })
}

export function hasFlag(ft: Dump, type: FlagType, offset: number, length: number) {
    return Boolean(ft.entities?.some((e) => e.type == type && e.offset == offset && e.length == length))
}

export async function selectNeedle(page: Page, needle: string, which = 0) {
    let range = await findText(page, needle, which)
    await clickDocPos(page, range.from, 1)
    await clickDocPos(page, range.to, -1, {shift: true})
    return range
}

export async function clickFormat(page: Page, name: string) {
    let bar = page.locator("#chat-format-bar")
    let visible = bar.getByRole("button", {name, exact: true})
    if ((await visible.count()) > 0 && (await visible.isVisible())) {
        await visible.click()
        return
    }
    let more = bar.getByRole("button", {name: "More", exact: true})
    // Overflow "More" labels the submenu host; the inner trigger has no name.
    if ((await more.count()) == 0) more = bar.getByLabel("More", {exact: true}).getByRole("button")
    if ((await more.count()) > 0) {
        await more.click()
        await waitFrames(page)
        let item = bar.getByRole("menuitem", {name, exact: true})
        if ((await item.count()) > 0) {
            await item.click()
            return
        }
        let wrapped = bar.getByRole("button", {name, exact: true})
        if ((await wrapped.count()) > 0) {
            await wrapped.click()
            return
        }
    }
    throw new Error(`format control not found: ${name}`)
}
