import {expect, test} from "@playwright/test"
import {composeBox, openCompose} from "./helpers"
import {clickFormat, dump, hasFlag, MARK_BUTTONS, MARK_KEYS, selectNeedle, type FlagType} from "./format"

let marks: FlagType[] = ["bold", "italic", "underline", "strike", "code"]

for (let mark of marks) {
    test(`keyboard ${mark} on a selected word dumps that entity`, async ({page}) => {
        await openCompose(page)
        await composeBox(page).click()
        await page.keyboard.type("hello world")
        await selectNeedle(page, "hello")
        await page.keyboard.press(MARK_KEYS[mark])
        let ft = await dump(page)
        expect(ft.text).toBe("hello world")
        expect(hasFlag(ft, mark, 0, 5)).toBe(true)
    })

    test(`toolbar ${mark} on a selected word dumps that entity`, async ({page}) => {
        await openCompose(page)
        await composeBox(page).click()
        await page.keyboard.type("hello world")
        await selectNeedle(page, "hello")
        await clickFormat(page, MARK_BUTTONS[mark])
        let ft = await dump(page)
        expect(ft.text).toBe("hello world")
        expect(hasFlag(ft, mark, 0, 5)).toBe(true)
    })
}

test("keyboard bold then italic on the same word stacks both entities", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("mix")
    await selectNeedle(page, "mix")
    await page.keyboard.press(MARK_KEYS.bold)
    await selectNeedle(page, "mix")
    await page.keyboard.press(MARK_KEYS.italic)
    let ft = await dump(page)
    expect(ft.text).toBe("mix")
    expect(hasFlag(ft, "bold", 0, 3)).toBe(true)
    expect(hasFlag(ft, "italic", 0, 3)).toBe(true)
})

test("toolbar bold then italic on the same word stacks both entities", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("mix")
    await selectNeedle(page, "mix")
    await clickFormat(page, MARK_BUTTONS.bold)
    await selectNeedle(page, "mix")
    await clickFormat(page, MARK_BUTTONS.italic)
    let ft = await dump(page)
    expect(ft.text).toBe("mix")
    expect(hasFlag(ft, "bold", 0, 3)).toBe(true)
    expect(hasFlag(ft, "italic", 0, 3)).toBe(true)
})

test("keyboard bold on a mid-word range covers only that slice", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("notebook")
    await selectNeedle(page, "tebo")
    await page.keyboard.press(MARK_KEYS.bold)
    let ft = await dump(page)
    expect(ft.text).toBe("notebook")
    expect(hasFlag(ft, "bold", 2, 4)).toBe(true)
    expect(hasFlag(ft, "bold", 0, 8)).toBe(false)
})
