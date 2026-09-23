import {expect, test, type Page} from "@playwright/test"
import {composeBox, openCompose} from "./helpers"
import {caretSnap, clickDocPos, findText} from "./caret"

async function typeFence(page: Page, lang: string) {
    await page.keyboard.type("```" + lang)
    await page.keyboard.press("Space")
}

async function seedHelloThere(page: Page) {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("hello there")
}

/** Same coords as clickDocPos; extra args cannot close over e2e(). */
async function pointerAt(page: Page, pos: number, assoc: -1 | 1) {
    let handle = await page.evaluateHandle(() => (window as any).__arrisaE2e)
    try {
        return await page.evaluate(
            ({api, pos, assoc}: {api: any; pos: number; assoc: -1 | 1}) => {
                let editor = api.chatEditor
                editor.focus()
                editor.selectionRect()
                let rect = editor.coordsAtPos(pos, assoc)
                return {x: assoc > 0 ? rect.left + 2 : rect.left - 2, y: (rect.top + rect.bottom) / 2}
            },
            {api: handle, pos, assoc},
        )
    } finally {
        await handle.dispose()
    }
}

test("click places the caret in a plain paragraph", async ({page}) => {
    await seedHelloThere(page)
    let hello = await findText(page, "hello")
    let there = await findText(page, "there")
    await clickDocPos(page, hello.from + 1, 1)
    let inHello = await caretSnap(page)
    expect(inHello.empty).toBe(true)
    expect(inHello.block).toBe("Paragraph")
    expect(inHello.head).toBe(hello.from + 1)
    await clickDocPos(page, there.from, 1)
    let inThere = await caretSnap(page)
    expect(inThere.head).toBe(there.from)
    await clickDocPos(page, there.to, -1)
    let atEnd = await caretSnap(page)
    expect(atEnd.head).toBe(there.to)
})

test("double-click selects the word and triple-click selects the textblock", async ({page}) => {
    await seedHelloThere(page)
    let hello = await findText(page, "hello")
    let there = await findText(page, "there")
    await clickDocPos(page, hello.from + 1, 1, {clickCount: 2})
    let word = await caretSnap(page)
    expect(word.empty).toBe(false)
    expect(word.from).toBe(hello.from)
    expect(word.to).toBe(hello.to)
    await clickDocPos(page, there.from + 1, 1, {clickCount: 3})
    let block = await caretSnap(page)
    expect(block.empty).toBe(false)
    expect(block.from).toBeLessThanOrEqual(hello.from)
    expect(block.to).toBeGreaterThanOrEqual(there.to)
    expect(block.block).toBe("Paragraph")
})

test("shift-click extends from the anchor", async ({page}) => {
    await seedHelloThere(page)
    let hello = await findText(page, "hello")
    let there = await findText(page, "there")
    await clickDocPos(page, hello.from, 1)
    await clickDocPos(page, there.to, -1, {shift: true})
    let range = await caretSnap(page)
    expect(range.empty).toBe(false)
    expect(range.anchor).toBe(hello.from)
    expect(range.head).toBe(there.to)
})

test("drag selects a range across two words", async ({page}) => {
    await seedHelloThere(page)
    let hello = await findText(page, "hello")
    let there = await findText(page, "there")
    let a = await pointerAt(page, hello.from, 1)
    let b = await pointerAt(page, there.to, -1)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, {steps: 8})
    await page.mouse.up()
    let range = await caretSnap(page)
    expect(range.empty).toBe(false)
    expect(range.from).toBeLessThanOrEqual(hello.from + 1)
    expect(range.to).toBeGreaterThanOrEqual(there.to - 1)
})

test("click inside a code block places the caret in CodeBlock", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("hello")
    await page.keyboard.press("Enter")
    await typeFence(page, "py")
    await page.keyboard.type("print")
    await page.keyboard.press("ArrowRight")
    await page.keyboard.type("bye")
    let print = await findText(page, "print")
    let hello = await findText(page, "hello")
    let bye = await findText(page, "bye")
    await clickDocPos(page, print.from + 1, 1)
    let inCode = await caretSnap(page)
    expect(inCode.empty).toBe(true)
    expect(inCode.block).toBe("CodeBlock")
    expect(inCode.head).toBe(print.from + 1)
    await clickDocPos(page, hello.from + 1, 1)
    let inHello = await caretSnap(page)
    expect(inHello.block).toBe("Paragraph")
    expect(inHello.blockText).toBe("hello")
    await clickDocPos(page, bye.from, 1)
    let inBye = await caretSnap(page)
    expect(inBye.block).toBe("Paragraph")
    expect(inBye.blockText).toBe("bye")
})

test("double-click in a code block selects the identifier", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await typeFence(page, "py")
    await page.keyboard.type("print value")
    let value = await findText(page, "value")
    await clickDocPos(page, value.from + 1, 1, {clickCount: 2})
    let word = await caretSnap(page)
    expect(word.block).toBe("CodeBlock")
    expect(word.empty).toBe(false)
    expect(word.from).toBe(value.from)
    expect(word.to).toBe(value.to)
})

test("click in an empty code block keeps typing inside code", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await typeFence(page, "py")
    let empty = await caretSnap(page)
    await clickDocPos(page, empty.head, 1)
    let clicked = await caretSnap(page)
    expect(clicked.block).toBe("CodeBlock")
    await page.keyboard.type("z")
    let typed = await caretSnap(page)
    expect(typed.block).toBe("CodeBlock")
    expect(typed.blockText).toBe("z")
})

test("click after a code block then back into it", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await typeFence(page, "py")
    await page.keyboard.type("ab")
    await page.keyboard.press("ArrowRight")
    await page.keyboard.type("Z")
    let ab = await findText(page, "ab")
    let z = await findText(page, "Z")
    await clickDocPos(page, z.from, 1)
    let para = await caretSnap(page)
    expect(para.block).toBe("Paragraph")
    expect(para.blockText).toBe("Z")
    await clickDocPos(page, ab.to, -1)
    let code = await caretSnap(page)
    expect(code.block).toBe("CodeBlock")
    expect(code.blockText).toBe("ab")
    expect(code.head).toBe(ab.to)
})
