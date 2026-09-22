import {test, expect} from "@playwright/test"
import {openCompose, composeBox, e2e} from "./helpers"

test("typed text stays inside an empty code block", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```py")
    await page.keyboard.press("Space")
    await page.keyboard.type("d")

    let code = page.locator("#editor-chat pre code")
    await expect(code).toHaveText("d")
    let parentTag = await page.locator("#editor-chat pre").evaluate((pre) => {
        let direct = [...pre.childNodes].some(
            (node) => node.nodeType == Node.TEXT_NODE && (node.textContent ?? "").includes("d"),
        )
        if (direct) return "PRE"
        let walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()
        while (text && !(text.textContent ?? "").includes("d")) text = walker.nextNode()
        return text?.parentElement?.tagName ?? ""
    })
    expect(parentTag).toBe("CODE")

    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("ArrowRight")
    let head = await e2e(page, (api) => {
        let state = api.chatEditor.state
        let block = state.doc.resolve(state.selection.head).textblockParent
        return {
            name: block ? block.node.type.name : "",
            text: block ? block.node.textContent() : "",
            atEnd: !!block && state.selection.head == block.end,
            before: !!block && state.selection.head == block.start,
        }
    })
    expect(head.name).toBe("CodeBlock")
    expect(head.text).toBe("d")
    expect(head.atEnd).toBe(true)
    expect(head.before).toBe(false)

    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve())
            }),
    )
    let cursor = page.locator("#editor-chat arrisa-cursor")
    await expect(cursor).toHaveClass(/arrisa-cursor-v/)
    await expect(cursor).not.toHaveClass(/arrisa-cursor-h/)

    await page.keyboard.type("e")
    await expect(code).toHaveText("de")
    let stillInside = await page.locator("#editor-chat pre").evaluate((pre) => {
        let direct = [...pre.childNodes].some(
            (node) => node.nodeType == Node.TEXT_NODE && (node.textContent ?? "").includes("de"),
        )
        if (direct) return false
        let walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()
        while (text && !(text.textContent ?? "").includes("de")) text = walker.nextNode()
        return text?.parentElement?.tagName == "CODE"
    })
    expect(stillInside).toBe(true)
})
