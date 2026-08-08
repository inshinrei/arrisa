import {describe, expect, it} from "vitest"
import {detectAutoEntities, mergeAutoEntities} from "./auto-entities"

describe("detectAutoEntities", () => {
    it("detects urls, emails, hashtags, cashtags, commands, mentions", () => {
        let text = "see https://ex.com and a@b.co #tag $AAPL /start @user"
        let ents = detectAutoEntities(text)
        let types = ents.map((e) => e.type)
        expect(types).toContain("url")
        expect(types).toContain("email")
        expect(types).toContain("hashtag")
        expect(types).toContain("cashtag")
        expect(types).toContain("bot_command")
        expect(types).toContain("mention")
    })

    it("skips ranges already covered", () => {
        let text = "https://ex.com"
        let ents = detectAutoEntities(text, {skip: [{offset: 0, length: text.length}]})
        expect(ents).toEqual([])
    })

    it("respects types filter", () => {
        let text = "https://ex.com #tag"
        let ents = detectAutoEntities(text, {types: ["hashtag"]})
        expect(ents.every((e) => e.type == "hashtag")).toBe(true)
        expect(ents.length).toBe(1)
    })
})

describe("mergeAutoEntities", () => {
    it("does not overlap existing bold range", () => {
        let text = "xx https://ex.com"
        let merged = mergeAutoEntities(text, [{type: "bold", offset: 0, length: text.length}])
        expect(merged.filter((e) => e.type == "url")).toEqual([])
        expect(merged.some((e) => e.type == "bold")).toBe(true)
    })
})
