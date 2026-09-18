import {test, expect} from "@playwright/test"
import {openCompose, e2e} from "./helpers"

test("submit Enter sends and Shift+Enter inserts a newline", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => api.remountCompose({submit: "Enter"}))
    await page.locator("#editor-chat [contenteditable='true']").click()
    await page.keyboard.type("hi")
    await page.keyboard.press("Shift+Enter")
    await page.keyboard.type("there")
    let dumped = await e2e(page, (api) => api.dump())
    expect(dumped.text).toMatch(/hi\nthere/)
    await page.keyboard.press("Enter")
    let log = await e2e(page, (api) => api.sendLog)
    expect(log).toContain("send")
    let after = await e2e(page, (api) => api.dump())
    expect(after.text).toMatch(/hi\nthere/)
})

test("submit Shift-Enter sends and Enter inserts a newline", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => api.remountCompose({submit: "Shift-Enter"}))
    await page.locator("#editor-chat [contenteditable='true']").click()
    await page.keyboard.type("hi")
    await page.keyboard.press("Enter")
    await page.keyboard.type("there")
    let dumped = await e2e(page, (api) => api.dump())
    expect(dumped.text).toMatch(/hi\nthere/)
    await page.keyboard.press("Shift+Enter")
    let log = await e2e(page, (api) => api.sendLog)
    expect(log).toContain("send")
})
