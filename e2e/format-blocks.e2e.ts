import {expect, test} from "@playwright/test"
import {composeBox, e2e, openCompose} from "./helpers"
import {clickFormat, dump, hasFlag, MARK_KEYS, selectNeedle} from "./format"

function blockNames(api: any) {
    return api.chatEditor.state.doc.content.map((node: {type: {name: string}}) => node.type.name)
}

test("typing - space creates a bullet list", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("- one")
    let names = await e2e(page, blockNames)
    expect(names).toContain("BulletList")
    let ft = await dump(page)
    expect(ft.text).toContain("one")
    expect(ft.entities?.some((e) => e.type == "unordered_list")).toBe(true)
})

test("toolbar bullet list wraps the current paragraph", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("one")
    await clickFormat(page, "Toggle bullet list")
    let names = await e2e(page, blockNames)
    expect(names).toContain("BulletList")
    expect((await dump(page)).entities?.some((e) => e.type == "unordered_list")).toBe(true)
})

test("typing 1. space creates an ordered list", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("1. one")
    let names = await e2e(page, blockNames)
    expect(names).toContain("OrderedList")
    expect((await dump(page)).entities?.some((e) => e.type == "ordered_list")).toBe(true)
})

test("toolbar ordered list wraps the current paragraph", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("one")
    await clickFormat(page, "Toggle ordered list")
    expect(await e2e(page, blockNames)).toContain("OrderedList")
})

test("typing > space creates a blockquote", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("> quoted")
    expect(await e2e(page, blockNames)).toContain("Blockquote")
    expect((await dump(page)).entities?.some((e) => e.type == "blockquote")).toBe(true)
})

test("toolbar quote wraps the current paragraph", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("quoted")
    await clickFormat(page, "Toggle blockquote")
    expect(await e2e(page, blockNames)).toContain("Blockquote")
})

test("bold inside a bullet item dumps both list and bold", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("- hello")
    await selectNeedle(page, "hello")
    await page.keyboard.press(MARK_KEYS.bold)
    let ft = await dump(page)
    expect(ft.entities?.some((e) => e.type == "unordered_list")).toBe(true)
    expect(hasFlag(ft, "bold", ft.text.indexOf("hello"), 5)).toBe(true)
})

test("italic inside a quote dumps both blockquote and italic", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("> hello")
    await selectNeedle(page, "hello")
    await page.keyboard.press(MARK_KEYS.italic)
    let ft = await dump(page)
    expect(ft.entities?.some((e) => e.type == "blockquote")).toBe(true)
    expect(hasFlag(ft, "italic", ft.text.indexOf("hello"), 5)).toBe(true)
})

test("formatted paragraph then a fenced code block keep separate entities", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("**note**")
    await page.keyboard.press("Enter")
    await page.keyboard.type("```ts")
    await page.keyboard.press("Space")
    await page.keyboard.type("let x = 1")
    let ft = await dump(page)
    expect(hasFlag(ft, "bold", 0, 4)).toBe(true)
    expect(ft.entities?.some((e) => e.type == "pre")).toBe(true)
    expect(await e2e(page, blockNames)).toEqual(expect.arrayContaining(["Paragraph", "CodeBlock"]))
})
