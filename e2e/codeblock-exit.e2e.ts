import {test, expect} from "@playwright/test"
import {openCompose, composeBox, e2e} from "./helpers"

test("arrow right at the end of a code block moves to the next line", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("```ts")
    await page.keyboard.press("Enter")
    await page.keyboard.type("return 1")
    await page.keyboard.press("Enter")
    await page.keyboard.type("```")
    await page.keyboard.press("ArrowRight")
    let name = await e2e(page, (api) => {
        let state = api.chatEditor.state
        let parent = state.doc.resolve(state.selection.head).textblockParent
        return parent ? parent.node.type.name : ""
    })
    expect(name).not.toBe("CodeBlock")
    await page.keyboard.type("out")
    let dumped = await e2e(page, (api) => api.dump())
    expect(dumped.text).toContain("return 1")
    expect(dumped.text).toContain("out")
    expect(dumped.text.indexOf("out")).toBeGreaterThan(dumped.text.indexOf("return 1"))
})
