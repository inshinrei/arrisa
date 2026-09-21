import {test, expect} from "@playwright/test"
import {openCompose, composeBox, e2e} from "./helpers"

test("typed fence becomes a colored code block", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```")
    await page.keyboard.press("Enter")
    await page.keyboard.type("if (ok) return true")
    await page.keyboard.press("Enter")
    await page.keyboard.type("```")
    let flow = page.locator("#editor-chat .arrisa-tok-kw-flow")
    await expect(flow.filter({hasText: "if"})).toBeVisible()
    await expect(flow.filter({hasText: "return"})).toBeVisible()
    await expect(page.locator("#editor-chat .arrisa-tok-constant", {hasText: "true"})).toBeVisible()
    let dumped = await e2e(page, (api) => api.dump())
    expect(dumped.text).toContain("if (ok) return true")
    expect(dumped.text).not.toContain("```")
    expect(dumped.entities?.some((entity) => entity.type == "pre")).toBe(true)
})

test("changing a code color variable repaints without rewriting the dump", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```")
    await page.keyboard.press("Enter")
    await page.keyboard.type("return 1")
    await page.keyboard.press("Enter")
    await page.keyboard.type("```")
    let tok = page.locator("#editor-chat .arrisa-tok-kw-flow").first()
    await expect(tok).toBeVisible()
    let beforeDump = await e2e(page, (api) => api.dump())
    let before = await tok.evaluate((el) => getComputedStyle(el).color)
    await page.locator("#editor-chat").evaluate((el) => {
        el.style.setProperty("--arrisa-code-violet", "#112233")
    })
    await expect.poll(() => tok.evaluate((el) => getComputedStyle(el).color)).not.toBe(before)
    let afterDump = await e2e(page, (api) => api.dump())
    expect(afterDump).toEqual(beforeDump)
})

test("inline backticks still become a code mark", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("`hi`")
    await expect(page.locator("#editor-chat code", {hasText: "hi"})).toBeVisible()
    await expect(page.locator("#editor-chat pre")).toHaveCount(0)
})
