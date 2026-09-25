import {expect, test, type Page} from "@playwright/test"
import {composeBox, e2e, openCompose} from "./helpers"
import {clickFormat, dump, hasFlag, MARK_BUTTONS, MARK_KEYS, selectNeedle} from "./format"

// Toolbar clicks focus the control (Playwright). Restore the editor without a
// contenteditable center-click, which would move the caret into existing text.
const focusCompose = (page: Page) => e2e(page, (api) => api.chatEditor.focus())

test("keyboard stored bold applies to the next typed word and turns off", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.press(MARK_KEYS.bold)
    await page.keyboard.type("loud")
    await page.keyboard.press(MARK_KEYS.bold)
    await page.keyboard.type(" quiet")
    let ft = await dump(page)
    expect(ft.text).toBe("loud quiet")
    expect(hasFlag(ft, "bold", 0, 4)).toBe(true)
    expect(hasFlag(ft, "bold", 0, 10)).toBe(false)
})

test("toolbar stored italic applies to the next typed word and turns off", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await clickFormat(page, MARK_BUTTONS.italic)
    await focusCompose(page)
    await page.keyboard.type("soft")
    await clickFormat(page, MARK_BUTTONS.italic)
    await focusCompose(page)
    await page.keyboard.type(" hard")
    let ft = await dump(page)
    expect(ft.text).toBe("soft hard")
    expect(hasFlag(ft, "italic", 0, 4)).toBe(true)
    expect(hasFlag(ft, "italic", 0, 9)).toBe(false)
})

test("keyboard toggle off removes bold from the selected word", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("hello")
    await selectNeedle(page, "hello")
    await page.keyboard.press(MARK_KEYS.bold)
    expect(hasFlag(await dump(page), "bold", 0, 5)).toBe(true)
    await selectNeedle(page, "hello")
    await page.keyboard.press(MARK_KEYS.bold)
    expect(hasFlag(await dump(page), "bold", 0, 5)).toBe(false)
})

test("clear formatting strips stacked marks from the selection", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("stack")
    await selectNeedle(page, "stack")
    await page.keyboard.press(MARK_KEYS.bold)
    await selectNeedle(page, "stack")
    await page.keyboard.press(MARK_KEYS.italic)
    expect(hasFlag(await dump(page), "bold", 0, 5)).toBe(true)
    expect(hasFlag(await dump(page), "italic", 0, 5)).toBe(true)
    await selectNeedle(page, "stack")
    await clickFormat(page, "Clear formatting")
    let ft = await dump(page)
    expect(ft.text).toBe("stack")
    expect(hasFlag(ft, "bold", 0, 5)).toBe(false)
    expect(hasFlag(ft, "italic", 0, 5)).toBe(false)
})

test("undo restores text after a keyboard bold", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("hello")
    await selectNeedle(page, "hello")
    await page.keyboard.press(MARK_KEYS.bold)
    expect(hasFlag(await dump(page), "bold", 0, 5)).toBe(true)
    await page.keyboard.press("ControlOrMeta+z")
    expect(hasFlag(await dump(page), "bold", 0, 5)).toBe(false)
    await page.keyboard.press("ControlOrMeta+Shift+z")
    expect(hasFlag(await dump(page), "bold", 0, 5)).toBe(true)
})
