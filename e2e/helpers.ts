import type {Page} from "@playwright/test"

export async function openCompose(page: Page) {
    await page.goto("/?e2e=1")
    await page.getByRole("tab", {name: "Messenger"}).click()
    await page.waitForFunction(() => Boolean((window as any).__arrisaE2e?.chatEditor))
}

export function composeBox(page: Page) {
    return page.locator("#editor-chat [contenteditable='true']")
}

export async function e2e<T>(page: Page, fn: (api: any) => T | Promise<T>) {
    let handle = await page.evaluateHandle(() => (window as any).__arrisaE2e)
    try {
        return await page.evaluate(fn, handle)
    } finally {
        await handle.dispose()
    }
}
