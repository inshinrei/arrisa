import {expect, test} from "@playwright/test"
import {composeBox, e2e, openCompose} from "./helpers"

function blocks(api: any) {
    let doc = api.chatEditor.state.doc
    return doc.content.map((node: {type: {name: string}; textContent(): string}) => ({
        name: node.type.name,
        text: node.textContent(),
    }))
}

function codeClasses(api: any) {
    return [...document.querySelectorAll("#editor-chat pre code")].map((node) =>
        node instanceof HTMLElement ? node.className : "",
    )
}

test("typed text stays on the line after a code block", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```py")
    await page.keyboard.press("Space")

    await expect.poll(() => e2e(page, blocks)).toEqual([{name: "CodeBlock", text: ""}])
    await expect.poll(() => e2e(page, codeClasses)).toEqual([expect.stringContaining("language-py")])

    await page.keyboard.type("ab")
    await page.keyboard.press("ArrowRight")
    await page.keyboard.type("Z")

    await expect.poll(() => e2e(page, blocks)).toEqual([
        {name: "CodeBlock", text: "ab"},
        {name: "Paragraph", text: "Z"},
    ])

    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```py")
    await page.keyboard.press("Space")
    await page.keyboard.type("ab")
    await page.keyboard.press("ArrowRight")
    await page.keyboard.type("```ts")
    await page.keyboard.press("Space")

    await expect.poll(() => e2e(page, blocks)).toEqual([
        {name: "CodeBlock", text: "ab"},
        {name: "CodeBlock", text: ""},
    ])
    await expect.poll(() => e2e(page, codeClasses)).toEqual([
        expect.stringContaining("language-py"),
        expect.stringContaining("language-ts"),
    ])
})
