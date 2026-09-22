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
