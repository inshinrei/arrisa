import {test, expect} from "@playwright/test"
import {openCompose, e2e, composeBox} from "./helpers"

test("typing @ emits a query with a real caret rect", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("@")
    // DOM type schedules rAF flush; selectionRect runs the mention listener this turn.
    let q = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return api.lastMentionQuery
    })
    expect(q).toBeTruthy()
    expect(q.query).toBe("")
    expect(q.from).toBe(0)
    expect(q.rect.height).toBeGreaterThanOrEqual(1)
    expect(q.rect.top + q.rect.left + q.rect.width + q.rect.height).not.toBe(0)
})

test("insertText @ emits query+rect on that turn", async ({page}) => {
    await openCompose(page)
    let q = await e2e(page, (api) => {
        api.insertText("@")
        return api.lastMentionQuery
    })
    expect(q).toBeTruthy()
    expect(q.query).toBe("")
    expect(q.rect.height).toBeGreaterThanOrEqual(1)
    expect(q.rect.top + q.rect.left + q.rect.width + q.rect.height).not.toBe(0)
})

test("dump-range insertMention replaces @al", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => {
        api.insertText("hi @al")
        api.insertMention({userId: "u@ex", label: "Alice", from: 3, to: 6})
    })
    let ft = await e2e(page, (api) => api.dump({mentionText: (id: string) => `@[${id}]`}))
    expect(ft.text).toBe("hi @[u@ex]")
    expect(
        ft.entities?.some(
            (e: {type: string; offset: number; length: number; userId?: string}) =>
                e.type == "mention_name" && e.offset == 3 && e.length == 7 && e.userId == "u@ex",
        ),
    ).toBeTruthy()
})

test("autoDetect does not add type mention beside mention_name", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => {
        api.insertText("@")
        api.insertMention({userId: "u@ex", label: "@[u@ex]", from: 0, to: 1})
    })
    let ft = await e2e(page, (api) => api.dump({autoDetect: true}))
    expect(ft.entities?.some((e: {type: string}) => e.type == "mention")).toBeFalsy()
    expect(ft.entities?.some((e: {type: string}) => e.type == "mention_name")).toBeTruthy()
})
