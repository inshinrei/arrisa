import {describe, expect, it} from "vitest"
import {findSchedulePhrases} from "./schedule-parse"

const NOW = new Date(2026, 8, 26, 15, 0, 0)
const now = () => new Date(NOW.getTime())
const unix = (y: number, m: number, d: number, h: number, min: number) =>
    Math.floor(new Date(y, m, d, h, min, 0, 0).getTime() / 1000)

function hit(text: string, locale = "en") {
    return findSchedulePhrases(text, {now, locale})
}

describe("findSchedulePhrases", () => {
    it("hits tomorrow at 14:00 covering only that span", () => {
        let text = "ok got tomorrow at 14:00"
        expect(hit(text)).toEqual([
            {
                from: 7,
                to: 24,
                phrase: "tomorrow at 14:00",
                label: "tomorrow at 14:00",
                scheduledTime: unix(2026, 8, 27, 14, 0),
            },
        ])
    })

    it("returns empty for an unfinished clock", () => {
        expect(hit("tomorrow at 14:")).toEqual([])
        expect(hit("tomorrow at 14:0")).toEqual([])
    })

    it("drops today at 09:00 when now is 15:00", () => {
        expect(hit("today at 09:00")).toEqual([])
    })

    it("hits today at 16:00 when now is 15:00", () => {
        expect(hit("today at 16:00")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
    })

    it("defaults a bare time to today if ahead else tomorrow", () => {
        expect(hit("16:00")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
        expect(hit("14:00")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
    })

    it("resolves weekdays and next weekdays from Saturday", () => {
        expect(hit("monday at 14:00")[0]!.scheduledTime).toBe(unix(2026, 8, 28, 14, 0))
        expect(hit("next monday at 14:00")[0]!.scheduledTime).toBe(unix(2026, 9, 5, 14, 0))
        expect(hit("saturday at 16:00")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
        expect(hit("saturday at 14:00")[0]!.scheduledTime).toBe(unix(2026, 9, 3, 14, 0))
        expect(hit("next saturday at 16:00")[0]!.scheduledTime).toBe(unix(2026, 9, 3, 16, 0))
    })

    it("parses 12h clock", () => {
        expect(hit("tomorrow at 2:00 pm")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
        expect(hit("tomorrow at 2 pm")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
        expect(hit("tomorrow at 12:00 am")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 0, 0))
        expect(hit("tomorrow at 12 pm")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 12, 0))
    })

    it("parses 24h H:mm", () => {
        expect(hit("tomorrow at 9:05")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 9, 5))
    })

    it("is case-insensitive and requires a word start", () => {
        expect(hit("Tomorrow At 14:00")).toHaveLength(1)
        expect(hit("atomorrow at 14:00")).toEqual([
            {
                from: 13,
                to: 18,
                phrase: "14:00",
                label: "14:00",
                scheduledTime: unix(2026, 8, 27, 14, 0),
            },
        ])
        expect(hit("x14:00")).toEqual([])
    })

    it("falls back to bare time when a joiner has no day", () => {
        expect(hit("meet at 14:00")).toEqual([
            {
                from: 8,
                to: 13,
                phrase: "14:00",
                label: "14:00",
                scheduledTime: unix(2026, 8, 27, 14, 0),
            },
        ])
        expect(hit("at 14:00")[0]!.phrase).toBe("14:00")
        expect(hit("foo в 14:00", "ru")[0]!.phrase).toBe("14:00")
        expect(hit("в 14:00", "ru")[0]!.phrase).toBe("14:00")
    })

    it("does not parse relative or dateless forms", () => {
        expect(hit("in 2 hours")).toEqual([])
        expect(hit("next week")).toEqual([])
        expect(hit("september 27")).toEqual([])
    })

    it("paints every complete phrase and prefers day+time over the inner time", () => {
        let text = "tomorrow at 14:00 and monday at 9:05"
        let found = hit(text)
        expect(found.map((h) => h.phrase)).toEqual(["tomorrow at 14:00", "monday at 9:05"])
    })

    it("parses Russian сегодня/завтра and weekday forms", () => {
        expect(hit("завтра в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
        expect(hit("сегодня в 16:00", "ru-RU")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
        expect(hit("в понедельник в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 28, 14, 0))
        expect(hit("во вторник в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 29, 14, 0))
        expect(hit("в следующий понедельник в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 9, 5, 14, 0))
    })
})
