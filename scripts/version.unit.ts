import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, describe, expect, it} from "vitest"
import {bumpVersion, syncVersions} from "./version"

function writePkg(dir: string, data: object, indent = 2) {
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(data, null, indent)}\n`)
}

function readPkg(dir: string) {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {version: string; private?: boolean}
}

function readText(dir: string) {
    return readFileSync(join(dir, "package.json"), "utf8")
}

describe("lockstep versions", () => {
    let dir = ""

    afterEach(() => {
        if (dir) rmSync(dir, {recursive: true, force: true})
        dir = ""
    })

    it("syncVersions writes the root version onto public packages and skips private ones", () => {
        dir = mkdtempSync(join(tmpdir(), "arrisa-version-"))
        writePkg(dir, {name: "root", version: "0.2.0"})
        writePkg(join(dir, "packages", "a"), {name: "a", version: "0.0.1"})
        writePkg(join(dir, "packages", "b"), {name: "b", version: "9.9.9", private: true})

        syncVersions(dir)

        expect(readPkg(join(dir, "packages", "a")).version).toBe("0.2.0")
        expect(readPkg(join(dir, "packages", "b")).version).toBe("9.9.9")
    })

    it("bumpVersion minor bumps root then syncs public packages", () => {
        dir = mkdtempSync(join(tmpdir(), "arrisa-version-"))
        writePkg(dir, {name: "root", version: "0.2.0"})
        writePkg(join(dir, "packages", "a"), {name: "a", version: "0.0.1"})
        writePkg(join(dir, "packages", "b"), {name: "b", version: "9.9.9", private: true})

        bumpVersion(dir, "minor")

        expect(readPkg(dir).version).toBe("0.3.0")
        expect(readPkg(join(dir, "packages", "a")).version).toBe("0.3.0")
        expect(readPkg(join(dir, "packages", "b")).version).toBe("9.9.9")
    })

    it("bumpVersion uses standard semver for patch and major", () => {
        dir = mkdtempSync(join(tmpdir(), "arrisa-version-"))
        writePkg(dir, {name: "root", version: "0.1.0"})
        writePkg(join(dir, "packages", "a"), {name: "a", version: "0.0.1"})

        bumpVersion(dir, "patch")
        expect(readPkg(dir).version).toBe("0.1.1")
        expect(readPkg(join(dir, "packages", "a")).version).toBe("0.1.1")

        bumpVersion(dir, "major")
        expect(readPkg(dir).version).toBe("1.0.0")
        expect(readPkg(join(dir, "packages", "a")).version).toBe("1.0.0")
    })

    it("preserves existing JSON indent when writing versions", () => {
        dir = mkdtempSync(join(tmpdir(), "arrisa-version-"))
        writePkg(dir, {name: "root", version: "0.2.0"}, 2)
        writePkg(join(dir, "packages", "a"), {name: "a", version: "0.0.1"}, 4)

        syncVersions(dir)

        expect(readText(join(dir, "packages", "a"))).toMatch(/\n {4}"version": "0.2.0"/)
        expect(readText(join(dir, "packages", "a"))).not.toMatch(/\n {2}"version":/)
    })

    it("does not reformat unrelated package.json fields", () => {
        dir = mkdtempSync(join(tmpdir(), "arrisa-version-"))
        writePkg(dir, {name: "root", version: "0.2.0"})
        let pkgDir = join(dir, "packages", "a")
        mkdirSync(pkgDir, {recursive: true})
        writeFileSync(
            join(pkgDir, "package.json"),
            `{
  "name": "a",
  "version": "0.0.1",
  "files": ["dist"]
}
`,
        )

        syncVersions(dir)

        expect(readText(pkgDir)).toBe(`{
  "name": "a",
  "version": "0.2.0",
  "files": ["dist"]
}
`)
    })
})
