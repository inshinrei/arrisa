import {expect, test, type Page} from "@playwright/test"
import {composeBox, e2e, openCompose} from "./helpers"

async function preCodeText(page: Page) {
    return page.locator("#editor-chat pre code").evaluate((node) => node.textContent ?? "")
}

test("tab indents a code block and moves focus from a paragraph", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```py")
    await page.keyboard.press("Space")
    await page.keyboard.type("ab")
    await page.keyboard.press("Tab")
    await expect.poll(() => preCodeText(page)).toBe("ab    ")

    // Some engines follow Tab with a paragraph or line break. Indent must stay put.
    await page.evaluate(() => {
        let editor = (window as any).__arrisaE2e.chatEditor
        for (let inputType of ["insertParagraph", "insertLineBreak"]) {
            editor.contentDOM.dispatchEvent(
                new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType}),
            )
        }
        editor.contentDOM.dispatchEvent(
            new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "\t"}),
        )
    })
    let afterTabBreak = await e2e(page, (api) => {
        let editor = api.chatEditor
        let doc = editor.state.doc
        return {
            text: doc.textContent(),
            names: doc.content.map((node: {type: {name: string}}) => node.type.name),
        }
    })
    expect(afterTabBreak).toEqual({text: "ab    ", names: ["CodeBlock"]})

    await page.keyboard.press("Shift+Tab")
    await expect.poll(() => preCodeText(page)).toBe("ab")

    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("Tab")
    await expect.poll(() => preCodeText(page)).toBe("    ab")

    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("hi")
    await page.keyboard.press("Tab")
    await expect.poll(() => e2e(page, (api) => api.chatEditor.state.doc.textContent())).toBe("hi")
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? "")).toBe("btn-send")
})

test("shift enter in a code block keeps a one-line caret", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```py")
    await page.keyboard.press("Space")
    await page.keyboard.type("ab")
    await page.keyboard.press("Shift+Enter")
    await page.keyboard.type("cd")
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            }),
    )
    let box = await page.evaluate(() => {
        let cursor = document.querySelector("#editor-chat arrisa-cursor") as HTMLElement
        let pre = document.querySelector("#editor-chat pre") as HTMLElement
        let text = pre.querySelector("code")?.firstChild
        let line = 0
        if (text && text.nodeType == Node.TEXT_NODE && text.nodeValue) {
            let range = document.createRange()
            range.setStart(text, 0)
            range.setEnd(text, 1)
            line = range.getBoundingClientRect().height
        }
        return {
            caret: cursor.getBoundingClientRect().height,
            block: pre.getBoundingClientRect().height,
            line,
            cls: cursor.className,
        }
    })
    expect(box.cls).toContain("arrisa-cursor-v")
    expect(box.line).toBeGreaterThan(8)
    expect(box.caret).toBeLessThan(box.block * 0.6)
    expect(Math.abs(box.caret - box.line)).toBeLessThan(4)
})

test("arrow right after a code block uses a vertical caret", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```py")
    await page.keyboard.press("Space")
    await page.keyboard.type("ab")
    await page.keyboard.press("ArrowRight")
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            }),
    )
    let afterKey = await caretBox(page)
    expect(afterKey.cls).toContain("arrisa-cursor-v")
    expect(afterKey.w).toBeLessThan(8)
    expect(afterKey.h).toBeGreaterThan(8)
    expect(afterKey.h).toBeLessThan(afterKey.block * 0.75)

    await e2e(page, (api) => {
        let editor = api.chatEditor
        let gap = editor.state.doc.content[0].length
        editor.dispatch({selection: {anchor: gap, head: gap, headSide: 1}})
    })
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            }),
    )
    let gap = await caretBox(page)
    expect(gap.cls).toContain("arrisa-cursor-v")
    expect(gap.w).toBeLessThan(8)
    expect(gap.h).toBeGreaterThan(8)
    expect(gap.h).toBeLessThan(gap.block * 0.75)
})

async function caretBox(page: Page) {
    return page.evaluate(() => {
        let cursor = document.querySelector("#editor-chat arrisa-cursor") as HTMLElement
        let pre = document.querySelector("#editor-chat pre") as HTMLElement
        let rect = cursor.getBoundingClientRect()
        return {
            cls: cursor.className,
            h: rect.height,
            w: rect.width,
            block: pre.getBoundingClientRect().height,
        }
    })
}
