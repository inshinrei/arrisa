/**
 * Pure dump-string parser for typed schedule datetime phrases.
 */

export type ScheduleParseHit = {
    from: number
    to: number
    phrase: string
    scheduledTime: number
    label: string
}

export type ScheduleParseOpts = {
    now?: () => Date
    locale?: string | (() => string)
}

const YEAR_SECS = 365 * 24 * 60 * 60

const defaultNow = () => new Date()

type DaySpec = {
    token: string
    kind: "today" | "tomorrow" | "weekday"
    dow: number
    next: boolean
}

const EN_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

const longestFirst = (specs: DaySpec[]) => specs.sort((a, b) => b.token.length - a.token.length)

const EN_DAYS = longestFirst([
    {token: "today", kind: "today", dow: 0, next: false},
    {token: "tomorrow", kind: "tomorrow", dow: 0, next: false},
    ...EN_WEEKDAYS.flatMap((name, dow): DaySpec[] => [
        {token: `next ${name}`, kind: "weekday", dow, next: true},
        {token: name, kind: "weekday", dow, next: false},
    ]),
])

const RU_DAYS = longestFirst([
    {token: "сегодня", kind: "today", dow: 0, next: false},
    {token: "завтра", kind: "tomorrow", dow: 0, next: false},
    {token: "в следующий понедельник", kind: "weekday", dow: 1, next: true},
    {token: "в следующий вторник", kind: "weekday", dow: 2, next: true},
    {token: "в следующую среду", kind: "weekday", dow: 3, next: true},
    {token: "в следующий четверг", kind: "weekday", dow: 4, next: true},
    {token: "в следующую пятницу", kind: "weekday", dow: 5, next: true},
    {token: "в следующую субботу", kind: "weekday", dow: 6, next: true},
    {token: "в следующее воскресенье", kind: "weekday", dow: 0, next: true},
    {token: "в понедельник", kind: "weekday", dow: 1, next: false},
    {token: "во вторник", kind: "weekday", dow: 2, next: false},
    {token: "в вторник", kind: "weekday", dow: 2, next: false},
    {token: "в среду", kind: "weekday", dow: 3, next: false},
    {token: "в четверг", kind: "weekday", dow: 4, next: false},
    {token: "в пятницу", kind: "weekday", dow: 5, next: false},
    {token: "в субботу", kind: "weekday", dow: 6, next: false},
    {token: "во воскресенье", kind: "weekday", dow: 0, next: false},
    {token: "в воскресенье", kind: "weekday", dow: 0, next: false},
])

const weekdayDate = (now: Date, dow: number, next: boolean, ahead: boolean) => {
    let dt = new Date(now.getTime())
    let today = dt.getDay()
    let add = (dow - today + 7) % 7
    if (add == 0 && !ahead) add = 7
    if (next) add += 7
    dt.setDate(dt.getDate() + add)
    return dt
}

function isWordStart(text: string, i: number) {
    return i == 0 || /\s/.test(text[i - 1]!)
}

function joinerStart(text: string, timeFrom: number, pack: "en" | "ru") {
    if (pack == "en") {
        if (timeFrom >= 4 && / at /i.test(text.slice(timeFrom - 4, timeFrom))) return timeFrom - 4
        return -1
    }
    if (timeFrom >= 4 && / во /i.test(text.slice(timeFrom - 4, timeFrom))) return timeFrom - 4
    if (timeFrom >= 3 && / в /i.test(text.slice(timeFrom - 3, timeFrom))) return timeFrom - 3
    return -1
}

function matchDay(text: string, end: number, specs: DaySpec[]): {from: number; spec: DaySpec} | null {
    for (let spec of specs) {
        let from = end - spec.token.length
        if (from < 0) continue
        if (text.slice(from, end).toLowerCase() != spec.token) continue
        if (!isWordStart(text, from)) continue
        return {from, spec}
    }
    return null
}

type TimeMatch = {timeFrom: number; timeTo: number; hours: number; minutes: number}

function findTimes(text: string): TimeMatch[] {
    let twelve: TimeMatch[] = []
    let re12 = /\b(1[0-2]|[1-9])(?::([0-5]\d))?[ \t]+(am|pm)\b/gi
    let m: RegExpExecArray | null
    while ((m = re12.exec(text))) {
        let hour12 = Number(m[1])
        let minutes = m[2] != null ? Number(m[2]) : 0
        let hours = hour12 % 12
        if (m[3]!.toLowerCase() == "pm") hours += 12
        twelve.push({timeFrom: m.index, timeTo: m.index + m[0].length, hours, minutes})
    }
    let twenty: TimeMatch[] = []
    let re24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
    while ((m = re24.exec(text))) {
        twenty.push({
            timeFrom: m.index,
            timeTo: m.index + m[0].length,
            hours: Number(m[1]),
            minutes: Number(m[2]),
        })
    }
    let byStart = new Map<number, TimeMatch>()
    for (let t of twenty) byStart.set(t.timeFrom, t)
    for (let t of twelve) byStart.set(t.timeFrom, t)
    return [...byStart.values()].sort((a, b) => a.timeFrom - b.timeFrom)
}

function dayDate(now: Date, spec: DaySpec, ahead: boolean) {
    if (spec.kind == "today") return new Date(now.getTime())
    if (spec.kind == "tomorrow") {
        let dt = new Date(now.getTime())
        dt.setDate(dt.getDate() + 1)
        return dt
    }
    return weekdayDate(now, spec.dow, spec.next, ahead)
}

function overlaps(from: number, to: number, hits: ScheduleParseHit[]) {
    for (let h of hits) {
        if (from < h.to && to > h.from) return true
    }
    return false
}

export function findSchedulePhrases(text: string, opts?: ScheduleParseOpts): ScheduleParseHit[] {
    if (!text) return []
    let getNow = opts?.now ?? defaultNow
    let localeOpt = opts?.locale ?? "en"
    let locale = typeof localeOpt == "function" ? localeOpt() : localeOpt
    let pack: "en" | "ru" = String(locale).toLowerCase().startsWith("ru") ? "ru" : "en"
    let now = getNow()
    let nowSec = Math.floor(now.getTime() / 1000)
    let days = pack == "ru" ? RU_DAYS : EN_DAYS
    let hits: ScheduleParseHit[] = []

    for (let t of findTimes(text)) {
        let from = t.timeFrom
        let spec: DaySpec | null = null
        let joinAt = joinerStart(text, t.timeFrom, pack)
        if (joinAt >= 0) {
            let day = matchDay(text, joinAt, days)
            if (!day) continue
            from = day.from
            spec = day.spec
        } else if (!isWordStart(text, t.timeFrom)) {
            continue
        }
        if (overlaps(from, t.timeTo, hits)) continue

        let todayAt = new Date(now.getTime())
        todayAt.setHours(t.hours, t.minutes, 0, 0)
        let ahead = Math.floor(todayAt.getTime() / 1000) > nowSec
        let dt = spec ? dayDate(now, spec, ahead) : new Date(now.getTime())
        if (!spec && !ahead) dt.setDate(dt.getDate() + 1)
        dt.setHours(t.hours, t.minutes, 0, 0)
        let scheduledTime = Math.floor(dt.getTime() / 1000)
        if (!(nowSec < scheduledTime && scheduledTime <= nowSec + YEAR_SECS)) continue

        let phrase = text.slice(from, t.timeTo)
        hits.push({from, to: t.timeTo, phrase, scheduledTime, label: phrase})
    }
    return hits
}
