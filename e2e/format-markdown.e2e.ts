import {expect, test, type Page} from "@playwright/test"
import {composeBox, openCompose} from "./helpers"
import {dump, hasFlag} from "./format"

async function pastePlain(page: Page, text: string) {
    await composeBox(page).evaluate((el, value) => {
        let dt = new DataTransfer()
        dt.setData("text/plain", value)
        el.dispatchEvent(new ClipboardEvent("paste", {clipboardData: dt, bubbles: true, cancelable: true}))
    }, text)
}

test("typing **bold** applies strong and drops the delimiters", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("**bold**")
    let ft = await dump(page)
    expect(ft.text).toBe("bold")
    expect(hasFlag(ft, "bold", 0, 4)).toBe(true)
})

test("typing __italic__ applies emphasis and drops the delimiters", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("__italic__")
    let ft = await dump(page)
    expect(ft.text).toBe("italic")
    expect(hasFlag(ft, "italic", 0, 6)).toBe(true)
})

test("typing ~~strike~~ applies strikethrough and drops the delimiters", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("~~gone~~")
    let ft = await dump(page)
    expect(ft.text).toBe("gone")
    expect(hasFlag(ft, "strike", 0, 4)).toBe(true)
})

test("typing `code` applies inline code and drops the backticks", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("`code`")
    let ft = await dump(page)
    expect(ft.text).toBe("code")
    expect(hasFlag(ft, "code", 0, 4)).toBe(true)
})

test("markdown bold then typed italic delimiters sit as adjacent runs", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("**bold** and __ital__")
    let ft = await dump(page)
    expect(ft.text).toBe("bold and ital")
    expect(hasFlag(ft, "bold", 0, 4)).toBe(true)
    expect(hasFlag(ft, "italic", 9, 4)).toBe(true)
})

test("pasting markdown bold+code becomes dump entities", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await pastePlain(page, "see **docs** and `api.dump`")
    let ft = await dump(page)
    expect(ft.text).toContain("docs")
    expect(ft.text).toContain("api.dump")
    expect(ft.entities?.some((e) => e.type == "bold")).toBe(true)
    expect(ft.entities?.some((e) => e.type == "code")).toBe(true)
})

test("pasting a markdown link becomes a text_url entity", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await pastePlain(page, "see [docs](https://example.com/x)")
    let ft = await dump(page)
    expect(ft.text).toContain("docs")
    expect(
        ft.entities?.some((e) => e.type == "text_url" && e.url == "https://example.com/x"),
    ).toBe(true)
})
