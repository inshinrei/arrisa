import type {Page} from "@playwright/test"

export async function openCompose(page: Page) {
    await page.goto("/?e2e=1")
    await page.getByRole("tab", {name: "Messenger"}).click()
    await page.waitForFunction(() => Boolean((window as any).__arrisaE2e?.chatEditor))
}

export function composeBox(page: Page) {
    return page.locator("#editor-chat [contenteditable='true']")
}

export async function e2e<T>(page: Page, fn: (api: any) => T | Promise<T>): Promise<T>
export async function e2e<T, A extends Record<string, unknown>>(
    page: Page,
    fn: (payload: {api: any} & A) => T | Promise<T>,
    arg: A,
): Promise<T>
export async function e2e(page: Page, fn: (payload: any) => any, arg?: Record<string, unknown>) {
    let handle = await page.evaluateHandle(() => (window as any).__arrisaE2e)
    try {
        if (arguments.length < 3) return await page.evaluate(fn, handle)
        return await page.evaluate(fn, Object.assign({api: handle}, arg))
    } finally {
        await handle.dispose()
    }
}
