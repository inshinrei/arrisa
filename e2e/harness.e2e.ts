import {test, expect} from "@playwright/test"

test("e2e harness exposes window.__arrisaE2e on the messenger tab", async ({page}) => {
    await page.goto("/?e2e=1")
    await page.getByRole("tab", {name: "Messenger"}).click()
    let ready = await page.evaluate(() => Boolean((window as any).__arrisaE2e?.chatEditor))
    expect(ready).toBe(true)
})
