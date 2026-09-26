/**
 * Pure dump-string parser for typed schedule datetime phrases.
 */

export type ScheduleInvoker =
    | {kind: "today"; words: readonly string[]}
    | {kind: "tomorrow"; words: readonly string[]}
    | {kind: "next-week"; words: readonly string[]}
    | {kind: "weekday"; words: readonly string[]; weekday: number}

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
    invokers?: readonly ScheduleInvoker[] | (() => readonly ScheduleInvoker[])
    joiners?: readonly string[] | (() => readonly string[])
}

const YEAR_SECS = 365 * 24 * 60 * 60

const defaultNow = () => new Date()

type InvokerToken = {
    token: string
    kind: ScheduleInvoker["kind"]
    weekday: number
}

const EN_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

const longestFirst = (tokens: InvokerToken[]) => tokens.sort((a, b) => b.token.length - a.token.length)

function flattenInvokers(invokers: readonly ScheduleInvoker[]): InvokerToken[] {
    let tokens: InvokerToken[] = []
    for (let inv of invokers) {
        let weekday = inv.kind == "weekday" ? inv.weekday : 0
        for (let word of inv.words) {
            let token = word.trim().toLowerCase()
            if (!token) continue
            tokens.push({token, kind: inv.kind, weekday})
        }
    }
    return longestFirst(tokens)
}

const EN_INVOKERS: ScheduleInvoker[] = [
    {kind: "today", words: ["today"]},
    {kind: "tomorrow", words: ["tomorrow"]},
    {kind: "next-week", words: ["next week"]},
    ...EN_WEEKDAYS.map((name, weekday): ScheduleInvoker => ({kind: "weekday", words: [name], weekday})),
]

const RU_INVOKERS: ScheduleInvoker[] = [
    {kind: "today", words: ["сегодня"]},
    {kind: "tomorrow", words: ["завтра"]},
    {kind: "next-week", words: ["на следующей неделе"]},
    {kind: "weekday", words: ["в понедельник"], weekday: 1},
    {kind: "weekday", words: ["во вторник", "в вторник"], weekday: 2},
    {kind: "weekday", words: ["в среду"], weekday: 3},
    {kind: "weekday", words: ["в четверг"], weekday: 4},
    {kind: "weekday", words: ["в пятницу"], weekday: 5},
    {kind: "weekday", words: ["в субботу"], weekday: 6},
    {kind: "weekday", words: ["во воскресенье", "в воскресенье"], weekday: 0},
]

const EN_JOINERS = ["at"]
const RU_JOINERS = ["во", "в"]

const weekdayDate = (now: Date, dow: number, ahead: boolean) => {
    let dt = new Date(now.getTime())
    let today = dt.getDay()
    let add = (dow - today + 7) % 7
    if (add == 0 && !ahead) add = 7
    dt.setDate(dt.getDate() + add)
    return dt
}

function isWordStart(text: string, i: number) {
    return i == 0 || /\s/.test(text[i - 1]!)
}

function localePack(locale: string): "en" | "ru" {
    return String(locale).toLowerCase().startsWith("ru") ? "ru" : "en"
}

function resolveList<T>(value: T[] | readonly T[] | (() => readonly T[]) | undefined, fallback: readonly T[]): readonly T[] {
    if (value == null) return fallback
    return typeof value == "function" ? value() : value
}

function joinerBefore(text: string, timeFrom: number, joiners: readonly string[]): {joinFrom: number; wordFrom: number} | null {
    let lower = text.toLowerCase()
    let sorted = [...joiners].sort((a, b) => b.length - a.length)
    for (let raw of sorted) {
        let j = raw.trim().toLowerCase()
        if (!j) continue
        let wrapped = ` ${j} `
        if (timeFrom >= wrapped.length && lower.slice(timeFrom - wrapped.length, timeFrom) == wrapped) {
            return {joinFrom: timeFrom - wrapped.length, wordFrom: timeFrom - wrapped.length + 1}
        }
        let atStart = `${j} `
        if (timeFrom == atStart.length && lower.slice(0, timeFrom) == atStart) {
            return {joinFrom: 0, wordFrom: 0}
        }
    }
    return null
}

function matchInvoker(text: string, end: number, tokens: InvokerToken[]): {from: number; spec: InvokerToken} | null {
    let lower = text.toLowerCase()
    for (let spec of tokens) {
        let from = end - spec.token.length
        if (from < 0) continue
        if (lower.slice(from, end) != spec.token) continue
        if (!isWordStart(text, from)) continue
        return {from, spec}
    }
    return null
}

function matchDate(text: string, end: number): {from: number; year: number; month: number; day: number} | "invalid" | null {
    if (end < 8) return null
    let from = end - 8
    if (!isWordStart(text, from)) return null
    let slice = text.slice(from, end)
    let m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(slice)
    if (!m) return null
    let day = Number(m[1])
    let month = Number(m[2])
    let year = 2000 + Number(m[3])
    let dt = new Date(year, month - 1, day)
    if (dt.getFullYear() != year || dt.getMonth() != month - 1 || dt.getDate() != day) return "invalid"
    return {from, year, month, day}
}

type TimeMatch = {timeFrom: number; timeTo: number; hours: number; minutes: number}

function findTimes(text: string): TimeMatch[] {
    let found: TimeMatch[] = []
    let re24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
    let m: RegExpExecArray | null
    while ((m = re24.exec(text))) {
        found.push({
            timeFrom: m.index,
            timeTo: m.index + m[0].length,
            hours: Number(m[1]),
            minutes: Number(m[2]),
        })
    }
    return found
}

function dayDate(now: Date, spec: InvokerToken, ahead: boolean) {
    if (spec.kind == "today") return new Date(now.getTime())
    if (spec.kind == "tomorrow") {
        let dt = new Date(now.getTime())
        dt.setDate(dt.getDate() + 1)
        return dt
    }
    if (spec.kind == "next-week") {
        let dt = new Date(now.getTime())
        dt.setDate(dt.getDate() + 7)
        return dt
    }
    return weekdayDate(now, spec.weekday, ahead)
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
    let pack = localePack(locale)
    let now = getNow()
    let nowSec = Math.floor(now.getTime() / 1000)
    let invokers = flattenInvokers(resolveList(opts?.invokers, pack == "ru" ? RU_INVOKERS : EN_INVOKERS))
    let joiners = resolveList(opts?.joiners, pack == "ru" ? RU_JOINERS : EN_JOINERS)
    let hits: ScheduleParseHit[] = []

    for (let t of findTimes(text)) {
        if (t.hours > 23) continue
        let join = joinerBefore(text, t.timeFrom, joiners)
        if (!join) continue
        let from = join.wordFrom
        let invEnd = join.joinFrom == 0 ? 0 : join.joinFrom
        let inv = matchInvoker(text, invEnd, invokers)
        let date = inv ? null : matchDate(text, invEnd)
        if (date == "invalid") continue
        if (inv) from = inv.from
        else if (date) from = date.from
        if (overlaps(from, t.timeTo, hits)) continue

        let todayAt = new Date(now.getTime())
        todayAt.setHours(t.hours, t.minutes, 0, 0)
        let ahead = Math.floor(todayAt.getTime() / 1000) > nowSec
        let dt: Date
        if (date) dt = new Date(date.year, date.month - 1, date.day)
        else if (inv) dt = dayDate(now, inv.spec, ahead)
        else {
            dt = new Date(now.getTime())
            if (!ahead) dt.setDate(dt.getDate() + 1)
        }
        dt.setHours(t.hours, t.minutes, 0, 0)
        let scheduledTime = Math.floor(dt.getTime() / 1000)
        if (!(nowSec < scheduledTime && scheduledTime <= nowSec + YEAR_SECS)) continue

        let phrase = text.slice(from, t.timeTo)
        hits.push({from, to: t.timeTo, phrase, scheduledTime, label: phrase})
    }
    return hits
}
