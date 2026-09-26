import {test, expect, type Page} from "@playwright/test"
import {openCompose, e2e, composeBox} from "./helpers"

const CHIP_NAME = "Schedule tomorrow at 14:00"

const scheduleChip = (page: Page) => page.getByRole("button", {name: CHIP_NAME})

const phrasePaint = (page: Page) => page.locator(".arrisa-schedule-phrase")

function tomorrowAt14Unix() {
    let d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(14, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
}

test("typed complete phrase offers query, chip, and paint", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    let q = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return api.scheduleQuery()
    })
    expect(q).toBeTruthy()
    expect(q.phrase).toBe("tomorrow at 14:00")
    expect(q.from).toBe(7)
    expect(q.to).toBe(24)
    expect(q.scheduledTime).toBe(tomorrowAt14Unix())
    await expect(scheduleChip(page)).toBeVisible()
    await expect(phrasePaint(page)).toHaveText("tomorrow at 14:00")
})

test("joiner plus time offers the closest 24h clock", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("at 14:00")
    let q = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return api.scheduleQuery()
    })
    expect(q).toBeTruthy()
    expect(q.phrase).toBe("at 14:00")
    let expected = new Date()
    expected.setHours(14, 0, 0, 0)
    if (Math.floor(expected.getTime() / 1000) <= Math.floor(Date.now() / 1000)) {
        expected.setDate(expected.getDate() + 1)
    }
    expect(q.scheduledTime).toBe(Math.floor(expected.getTime() / 1000))
    await expect(page.getByRole("button", {name: "Schedule at 14:00"})).toBeVisible()
})

test("incomplete clock is not a query", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("tomorrow at 14:")
    let q = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return api.scheduleQuery()
    })
    expect(q).toBeNull()
    await expect(page.locator(".arrisa-schedule-chip")).toHaveCount(0)
})

test("clicking the chip accepts and deletes the phrase", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    await expect(scheduleChip(page)).toBeVisible()
    await scheduleChip(page).click()
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {dump: api.dump(), accept: api.lastScheduleAccept}
    })
    expect(after.dump.text).toBe("ok got")
    expect(after.accept?.phrase).toBe("tomorrow at 14:00")
    await expect(scheduleChip(page)).toHaveCount(0)
    expect(
        after.dump.entities?.some((e: {type: string}) => e.type == "datetime" || e.type == "schedule"),
    ).toBeFalsy()
})

test("Enter without ArrowUp sends", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => api.remountCompose({submit: "Enter"}))
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    await expect(scheduleChip(page)).toBeVisible()
    await page.keyboard.press("Enter")
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {dump: api.dump(), accept: api.lastScheduleAccept, sendLog: api.sendLog}
    })
    expect(after.sendLog).toContain("send")
    expect(after.dump.text).toContain("tomorrow at 14:00")
    expect(after.accept).toBeNull()
})

test("ArrowDown then Enter accepts and consumes Enter", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => api.remountCompose({submit: "Enter"}))
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    await expect(scheduleChip(page)).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await expect(scheduleChip(page)).toHaveClass(/arrisa-schedule-chip-focused/)
    await page.keyboard.press("Enter")
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {dump: api.dump(), accept: api.lastScheduleAccept, sendLog: api.sendLog}
    })
    expect(after.dump.text).toBe("ok got")
    expect(after.accept?.phrase).toBe("tomorrow at 14:00")
    expect(after.sendLog).not.toContain("send")
})

test("ArrowUp then Enter accepts and consumes Enter", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => api.remountCompose({submit: "Enter"}))
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    await expect(scheduleChip(page)).toBeVisible()
    await page.keyboard.press("ArrowUp")
    await expect(scheduleChip(page)).toHaveClass(/arrisa-schedule-chip-focused/)
    await page.keyboard.press("Enter")
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {dump: api.dump(), accept: api.lastScheduleAccept, sendLog: api.sendLog}
    })
    expect(after.dump.text).toBe("ok got")
    expect(after.accept?.phrase).toBe("tomorrow at 14:00")
    expect(after.sendLog).not.toContain("send")
})

test("custom action list is invoked from ArrowDown", async ({page}) => {
    await openCompose(page)
    await e2e(page, (api) => api.remountCompose({submit: "Enter", schedulePreset: "two-actions"}))
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    await expect(page.getByRole("button", {name: "Schedule tomorrow at 14:00"})).toBeVisible()
    await expect(page.getByRole("button", {name: "Later tomorrow at 14:00"})).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("button", {name: "Later tomorrow at 14:00"})).toHaveClass(
        /arrisa-schedule-chip-focused/,
    )
    await page.keyboard.press("Enter")
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {dump: api.dump(), accept: api.lastScheduleAccept, action: api.lastScheduleAction, sendLog: api.sendLog}
    })
    expect(after.dump.text).toBe("ok got")
    expect(after.action).toBe("later")
    expect(after.accept?.phrase).toBe("tomorrow at 14:00")
    expect(after.sendLog).not.toContain("send")
})

test("Escape hides the chip and keeps paint", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("ok got tomorrow at 14:00")
    await expect(scheduleChip(page)).toBeVisible()
    let before = await e2e(page, (api) => api.dump())
    await page.keyboard.press("Escape")
    await expect(scheduleChip(page)).toHaveCount(0)
    await expect(phrasePaint(page)).toHaveText("tomorrow at 14:00")
    let after = await e2e(page, (api) => api.dump())
    expect(after.text).toBe(before.text)
})

test("inline code skips schedule query", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("`tomorrow at 14:00`")
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {dump: api.dump(), q: api.scheduleQuery()}
    })
    expect(after.q).toBeNull()
    expect(after.dump.text).toBe("tomorrow at 14:00")
    expect(
        after.dump.entities?.some(
            (e: {type: string; offset: number; length: number}) =>
                e.type == "code" && e.offset == 0 && e.length == 17,
        ),
    ).toBeTruthy()
})

test("mention query wins over schedule", async ({page}) => {
    await openCompose(page)
    await composeBox(page).click()
    await page.keyboard.type("tomorrow at 14:00 ")
    await page.keyboard.type("@")
    let after = await e2e(page, (api) => {
        api.chatEditor.selectionRect()
        return {mention: api.lastMentionQuery, q: api.scheduleQuery()}
    })
    expect(after.mention).toBeTruthy()
    expect(after.q).toBeNull()
})
