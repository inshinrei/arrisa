import type {Page} from "@playwright/test"
import {e2e} from "./helpers"

export type CaretSnap = {
    empty: boolean
    from: number
    to: number
    head: number
    anchor: number
    headSide: number
    block: string
    blockText: string
    names: string[]
    text: string
    cursorClass: string
}

export async function waitFrames(page: Page, n = 2) {
    await page.evaluate((count) => {
        return new Promise<void>((resolve) => {
            let left = count
            let tick = () => {
                if (--left <= 0) resolve()
                else requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
        })
    }, n)
}

export async function caretSnap(page: Page): Promise<CaretSnap> {
    await waitFrames(page)
    let logical = await e2e(page, (api) => {
        let editor = api.chatEditor
        let state = editor.state
        let sel = state.selection
        let block = state.doc.resolve(sel.head).textblockParent
        return {
            empty: sel.empty,
            from: sel.from,
            to: sel.to,
            head: sel.head,
            anchor: sel.anchor,
            headSide: sel.headSide,
            block: block ? block.node.type.name : "",
            blockText: block ? block.node.textContent() : "",
            names: state.doc.content.map((node: {type: {name: string}}) => node.type.name),
            text: state.doc.textContent(),
        }
    })
    // Range selections remove `arrisa-cursor`; locator.evaluate would wait out the test.
    let cursorClass = await page.evaluate(() => {
        let el = document.querySelector("#editor-chat arrisa-cursor")
        return el instanceof HTMLElement ? el.className : ""
    })
    return {...logical, cursorClass}
}

export async function findText(page: Page, needle: string, which = 0) {
    let handle = await page.evaluateHandle(() => (window as any).__arrisaE2e)
    try {
        // Playwright serializes the evaluate callback; pass needle/which instead of closing over them.
        let found = await page.evaluate(
            ({api, needle, which}: {api: any; needle: string; which: number}) => {
                let doc = api.chatEditor.state.doc
                let hits: {from: number; to: number}[] = []
                doc.iterate((node: {isText: boolean; param: unknown; length: number}, pos: number) => {
                    if (!node.isText || typeof node.param != "string") return
                    let from = 0
                    for (;;) {
                        let i = node.param.indexOf(needle, from)
                        if (i < 0) break
                        hits.push({from: pos + i, to: pos + i + needle.length})
                        from = i + needle.length
                    }
                })
                return hits[which] ?? null
            },
            {api: handle, needle, which},
        )
        if (!found) throw new Error(`findText: ${JSON.stringify(needle)} #${which} missing`)
        return found
    } finally {
        await handle.dispose()
    }
}

export async function clickDocPos(
    page: Page,
    pos: number,
    assoc: -1 | 1 = 1,
    opts: {shift?: boolean; clickCount?: number} = {},
) {
    let handle = await page.evaluateHandle(() => (window as any).__arrisaE2e)
    let box: {x: number; y: number; width: number; height: number}
    try {
        box = await page.evaluate(
            ({api, pos, assoc}: {api: any; pos: number; assoc: -1 | 1}) => {
                let editor = api.chatEditor
                editor.focus()
                editor.selectionRect()
                let rect = editor.coordsAtPos(pos, assoc)
                return {x: rect.left, y: (rect.top + rect.bottom) / 2, width: rect.width, height: rect.height}
            },
            {api: handle, pos, assoc},
        )
    } finally {
        await handle.dispose()
    }
    let x = assoc > 0 ? box.x + 2 : box.x - 2
    let y = box.y
    if (opts.shift) await page.keyboard.down("Shift")
    await page.mouse.click(x, y, {clickCount: opts.clickCount ?? 1})
    if (opts.shift) await page.keyboard.up("Shift")
}

export function wordKey(dir: "left" | "right", extend = false) {
    let arrow = dir == "left" ? "ArrowLeft" : "ArrowRight"
    let base = process.platform == "darwin" ? `Alt+${arrow}` : `Control+${arrow}`
    return extend ? `Shift+${base}` : base
}

export function selectAllKey() {
    return "ControlOrMeta+a"
}
