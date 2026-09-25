import {expect, test, type Page} from "@playwright/test"
import {composeBox, openCompose} from "./helpers"
import {clickFormat, dump, hasFlag, MARK_KEYS, selectNeedle} from "./format"

async function applyLink(page: Page, href: string) {
    let input = page.locator("#chat-link-input")
    await expect(input).toBeVisible()
    await input.fill(href)
    await page.locator("#btn-link-apply").click()
}

async function pastePlain(page: Page, text: string) {
    await composeBox(page).evaluate((el, value) => {
        let dt = new DataTransfer()
        dt.setData("text/plain", value)
        el.dispatchEvent(new ClipboardEvent("paste", {clipboardData: dt, bubbles: true, cancelable: true}))
    }, text)
}

test("Mod-k plus host prompt links the selected word", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("docs here")
    await selectNeedle(page, "docs")
    await page.keyboard.press("ControlOrMeta+k")
    await applyLink(page, "https://example.com/docs")
    let ft = await dump(page)
    expect(ft.text).toBe("docs here")
    expect(
        ft.entities?.some(
            (e) => e.type == "text_url" && e.offset == 0 && e.length == 4 && e.url == "https://example.com/docs",
        ),
    ).toBe(true)
})

test("toolbar Create link plus host prompt links the selected word", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("docs here")
    await selectNeedle(page, "docs")
    await clickFormat(page, "Create link")
    await applyLink(page, "https://example.com/docs")
    let ft = await dump(page)
    expect(
        ft.entities?.some((e) => e.type == "text_url" && e.url == "https://example.com/docs"),
    ).toBe(true)
})

test("pasting a URL onto a selection wraps the word without inserting the URL text", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("docs here")
    await selectNeedle(page, "docs")
    await pastePlain(page, "https://example.com/x")
    let ft = await dump(page)
    expect(ft.text).toBe("docs here")
    expect(
        ft.entities?.some((e) => e.type == "text_url" && e.offset == 0 && e.length == 4 && e.url == "https://example.com/x"),
    ).toBe(true)
})

test("bold plus link stack on the same word", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("docs")
    await selectNeedle(page, "docs")
    await page.keyboard.press(MARK_KEYS.bold)
    await selectNeedle(page, "docs")
    await page.keyboard.press("ControlOrMeta+k")
    await applyLink(page, "https://example.com")
    let ft = await dump(page)
    expect(hasFlag(ft, "bold", 0, 4)).toBe(true)
    expect(ft.entities?.some((e) => e.type == "text_url" && e.url == "https://example.com")).toBe(true)
})
