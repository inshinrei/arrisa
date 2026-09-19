import {test, expect} from "@playwright/test"
import {openCompose} from "./helpers"

test("e2e harness exposes window.__arrisaE2e on the messenger tab", async ({page}) => {
    await openCompose(page)
    let ready = await page.evaluate(() => Boolean((window as any).__arrisaE2e?.chatEditor))
    expect(ready).toBe(true)
})
