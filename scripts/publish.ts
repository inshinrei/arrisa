import {spawnSync, type SpawnSyncReturns} from "node:child_process"
import {pathToFileURL} from "node:url"

export type SpawnFn = (
    command: string,
    args: string[],
    options: {cwd: string; stdio?: "inherit"},
) => Pick<SpawnSyncReturns<string>, "status" | "error">

export function publishArgs(extra: string[] = []): string[] {
    return ["-r", "--filter", "./packages/*", "publish", "--access", "public", "--no-git-checks", ...extra]
}

export function publishPackages(rootDir: string, extra: string[] = [], spawn: SpawnFn = spawnSync) {
    let result = spawn("pnpm", publishArgs(extra), {cwd: rootDir, stdio: "inherit"})
    if (result.error) throw result.error
    if (result.status) throw new Error(`pnpm publish exited with ${result.status}`)
}

function isCliMain() {
    let argv1 = process.argv[1]
    if (!argv1) return false
    return import.meta.url === pathToFileURL(argv1).href || argv1.endsWith("publish.ts")
}

function runCli() {
    publishPackages(process.cwd(), process.argv.slice(2))
}

if (isCliMain()) runCli()
