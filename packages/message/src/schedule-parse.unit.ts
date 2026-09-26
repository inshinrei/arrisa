import {describe, expect, it} from "vitest"
import {findSchedulePhrases, type ScheduleInvoker} from "./schedule-parse"

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

    it("treats joiner plus time as the closest 24h clock", () => {
        expect(hit("at 16:00")).toEqual([
            {
                from: 0,
                to: 8,
                phrase: "at 16:00",
                label: "at 16:00",
                scheduledTime: unix(2026, 8, 26, 16, 0),
            },
        ])
        expect(hit("meet at 14:00")).toEqual([
            {
                from: 5,
                to: 13,
                phrase: "at 14:00",
                label: "at 14:00",
                scheduledTime: unix(2026, 8, 27, 14, 0),
            },
        ])
        expect(hit("в 14:00", "ru")[0]!.phrase).toBe("в 14:00")
        expect(hit("в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
    })

    it("does not match a bare clock without a joiner", () => {
        expect(hit("16:00")).toEqual([])
        expect(hit("14:00")).toEqual([])
        expect(hit("x14:00")).toEqual([])
    })

    it("resolves weekdays as the closest occurrence in 7 days", () => {
        expect(hit("monday at 14:00")[0]!.scheduledTime).toBe(unix(2026, 8, 28, 14, 0))
        expect(hit("saturday at 16:00")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
        expect(hit("saturday at 14:00")[0]!.scheduledTime).toBe(unix(2026, 9, 3, 14, 0))
    })

    it("resolves next week as plus seven days", () => {
        expect(hit("next week at 14:00")[0]).toEqual({
            from: 0,
            to: 18,
            phrase: "next week at 14:00",
            label: "next week at 14:00",
            scheduledTime: unix(2026, 9, 3, 14, 0),
        })
    })

    it("parses dd.mm.yy at a 24h clock", () => {
        expect(hit("27.09.26 at 14:00")[0]).toEqual({
            from: 0,
            to: 17,
            phrase: "27.09.26 at 14:00",
            label: "27.09.26 at 14:00",
            scheduledTime: unix(2026, 8, 27, 14, 0),
        })
        expect(hit("26.09.26 at 16:00")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
        expect(hit("26.09.26 at 09:00")).toEqual([])
        expect(hit("31.02.26 at 14:00")).toEqual([])
        expect(hit("01.01.28 at 14:00")).toEqual([])
    })

    it("parses 24h H:mm", () => {
        expect(hit("tomorrow at 9:05")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 9, 5))
    })

    it("rejects 24h clock hours above 23", () => {
        expect(hit("at 24:00")).toEqual([])
        expect(hit("at 29:00")).toEqual([])
    })

    it("is case-insensitive and requires a word-start invoker", () => {
        expect(hit("Tomorrow At 14:00")).toHaveLength(1)
        expect(hit("atomorrow at 14:00")[0]!.phrase).toBe("at 14:00")
    })

    it("does not parse relative or dateless forms", () => {
        expect(hit("in 2 hours")).toEqual([])
        expect(hit("next week")).toEqual([])
        expect(hit("september 27")).toEqual([])
        expect(hit("tomorrow at 2:00 pm")[0]!.phrase).toBe("tomorrow at 2:00")
        expect(hit("tomorrow at 2:00 pm")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 2, 0))
    })

    it("paints every complete phrase and prefers invoker+time over joiner+time", () => {
        let text = "tomorrow at 14:00 and monday at 9:05"
        let found = hit(text)
        expect(found.map((h) => h.phrase)).toEqual(["tomorrow at 14:00", "monday at 9:05"])
    })

    it("parses Russian сегодня/завтра, weekdays, next week, and joiner+time", () => {
        expect(hit("завтра в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
        expect(hit("сегодня в 16:00", "ru-RU")[0]!.scheduledTime).toBe(unix(2026, 8, 26, 16, 0))
        expect(hit("в понедельник в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 28, 14, 0))
        expect(hit("во вторник в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 29, 14, 0))
        expect(hit("на следующей неделе в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 9, 3, 14, 0))
        expect(hit("27.09.26 в 14:00", "ru")[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
    })

    it("uses consumer invokers and joiners in place of the locale pack", () => {
        let invokers: ScheduleInvoker[] = [
            {kind: "tomorrow", words: ["tmrw"]},
            {kind: "weekday", words: ["mon"], weekday: 1},
        ]
        let found = findSchedulePhrases("tmrw um 14:00 and tomorrow at 14:00 and mon um 9:05", {
            now,
            invokers,
            joiners: ["um"],
        })
        expect(found.map((h) => h.phrase)).toEqual(["tmrw um 14:00", "mon um 9:05"])
        expect(found[0]!.scheduledTime).toBe(unix(2026, 8, 27, 14, 0))
        expect(found[1]!.scheduledTime).toBe(unix(2026, 8, 28, 9, 5))
    })

    it("calls invoker and joiner factories once", () => {
        let invokerCalls = 0
        let joinerCalls = 0
        findSchedulePhrases("tmrw at 14:00", {
            now,
            invokers: () => {
                invokerCalls++
                return [{kind: "tomorrow", words: ["tmrw"]}]
            },
            joiners: () => {
                joinerCalls++
                return ["at"]
            },
        })
        expect(invokerCalls).toBe(1)
        expect(joinerCalls).toBe(1)
    })
})
