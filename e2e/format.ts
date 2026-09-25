import type {Page} from "@playwright/test"
import {clickDocPos, waitFrames} from "./caret"
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

/** Restore compose after a toolbar click without a contenteditable center-click. */
export const focusCompose = (page: Page) => e2e(page, (api) => api.chatEditor.focus())

/** Select `needle` across adjacent text leaves (mark splits). Block gaps are separate runs. */
export async function selectNeedle(page: Page, needle: string, which = 0) {
    let range = await e2e(
        page,
        ({api, needle, which}: {api: any; needle: string; which: number}) => {
            let doc = api.chatEditor.state.doc
            let runs: {text: string; map: number[]}[] = []
            doc.iterate((node: {isText: boolean; param: unknown; length: number}, pos: number) => {
                if (!node.isText || typeof node.param != "string") return
                let last = runs[runs.length - 1]
                let adjacent = last && last.map.length > 0 && last.map[last.map.length - 1]! + 1 == pos
                let run = adjacent ? last! : {text: "", map: [] as number[]}
                if (!adjacent) runs.push(run)
                for (let i = 0; i < node.param.length; i++) {
                    run.map.push(pos + i)
                    run.text += node.param[i]
                }
            })
            let hits: {from: number; to: number}[] = []
            for (let run of runs) {
                let from = 0
                for (;;) {
                    let i = run.text.indexOf(needle, from)
                    if (i < 0) break
                    hits.push({from: run.map[i]!, to: run.map[i + needle.length - 1]! + 1})
                    from = i + needle.length
                }
            }
            return hits[which] ?? null
        },
        {needle, which},
    )
    if (!range) throw new Error(`selectNeedle: ${JSON.stringify(needle)} #${which} missing`)
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
