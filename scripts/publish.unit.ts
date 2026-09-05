import {describe, expect, it} from "vitest"
import {publishArgs, publishPackages, type SpawnFn} from "./publish"

describe("publishPackages", () => {
    it("builds a recursive pnpm publish of packages/* with public access", () => {
        expect(publishArgs()).toEqual([
            "-r",
            "--filter",
            "./packages/*",
            "publish",
            "--access",
            "public",
            "--no-git-checks",
        ])
    })

    it("appends extra pnpm publish flags", () => {
        expect(publishArgs(["--dry-run", "--tag", "next"])).toEqual([
            "-r",
            "--filter",
            "./packages/*",
            "publish",
            "--access",
            "public",
            "--no-git-checks",
            "--dry-run",
            "--tag",
            "next",
        ])
    })

    it("runs pnpm from the workspace root and fails on a non-zero status", () => {
        let calls: {cmd: string; args: string[]; cwd: string}[] = []
        let spawn: SpawnFn = (cmd, args, opts) => {
            calls.push({cmd, args, cwd: opts.cwd})
            return {status: 0, error: undefined}
        }

        publishPackages("/repo", ["--dry-run"], spawn)

        expect(calls).toEqual([
            {
                cmd: "pnpm",
                args: publishArgs(["--dry-run"]),
                cwd: "/repo",
            },
        ])

        let failing: SpawnFn = () => ({status: 1, error: undefined})
        expect(() => publishPackages("/repo", [], failing)).toThrow(/pnpm publish exited with 1/)
    })
})
