import {existsSync, readdirSync, readFileSync, writeFileSync} from "node:fs"
import {join} from "node:path"
import {pathToFileURL} from "node:url"

export type BumpKind = "patch" | "minor" | "major"

type PkgJson = {
    version?: string
    private?: boolean
    [key: string]: unknown
}

function detectIndent(text: string): string {
    let match = /\n([ \t]+)"/.exec(text)
    if (match) return match[1]
    return "    "
}

function readPkg(path: string): PkgJson {
    return JSON.parse(readFileSync(path, "utf8")) as PkgJson
}

function setVersionText(text: string, version: string): string {
    if (/"version"\s*:/.test(text)) {
        return text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
    }
    let pkg = JSON.parse(text) as PkgJson
    pkg.version = version
    return `${JSON.stringify(pkg, null, detectIndent(text))}\n`
}

function writeVersion(path: string, version: string) {
    let text = readFileSync(path, "utf8")
    writeFileSync(path, setVersionText(text, version))
}

function rootPkgPath(rootDir: string) {
    return join(rootDir, "package.json")
}

function publishedPkgPaths(rootDir: string): string[] {
    let packagesDir = join(rootDir, "packages")
    if (!existsSync(packagesDir)) return []
    let paths: string[] = []
    for (let entry of readdirSync(packagesDir, {withFileTypes: true})) {
        if (!entry.isDirectory()) continue
        let pkgPath = join(packagesDir, entry.name, "package.json")
        if (!existsSync(pkgPath)) continue
        paths.push(pkgPath)
    }
    return paths
}

function rootVersion(rootDir: string): string {
    let pkg = readPkg(rootPkgPath(rootDir))
    if (typeof pkg.version !== "string") {
        throw new Error("Workspace root package.json is missing a version")
    }
    return pkg.version
}

function nextVersion(version: string, kind: BumpKind): string {
    let match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
    if (!match) throw new Error(`Invalid version: ${version}`)
    let major = Number(match[1])
    let minor = Number(match[2])
    let patch = Number(match[3])
    if (kind === "major") return `${major + 1}.0.0`
    if (kind === "minor") return `${major}.${minor + 1}.0`
    return `${major}.${minor}.${patch + 1}`
}

export function syncVersions(rootDir: string) {
    let version = rootVersion(rootDir)
    for (let pkgPath of publishedPkgPaths(rootDir)) {
        let pkg = readPkg(pkgPath)
        if (pkg.private === true) continue
        writeVersion(pkgPath, version)
    }
}

export function bumpVersion(rootDir: string, kind: BumpKind) {
    if (kind !== "patch" && kind !== "minor" && kind !== "major") {
        throw new Error(`unknown bump kind: ${kind}`)
    }
    let path = rootPkgPath(rootDir)
    let pkg = readPkg(path)
    if (typeof pkg.version !== "string") {
        throw new Error("Workspace root package.json is missing a version")
    }
    writeVersion(path, nextVersion(pkg.version, kind))
    syncVersions(rootDir)
}

function isCliMain() {
    let argv1 = process.argv[1]
    if (!argv1) return false
    return import.meta.url === pathToFileURL(argv1).href || argv1.endsWith("version.ts")
}

function runCli() {
    let cmd = process.argv[2]
    let rootDir = process.cwd()
    if (cmd === "sync") {
        syncVersions(rootDir)
        return
    }
    if (cmd === "bump") {
        let kind = process.argv[3]
        if (kind !== "patch" && kind !== "minor" && kind !== "major") {
            throw new Error("usage: tsx scripts/version.ts bump patch|minor|major")
        }
        bumpVersion(rootDir, kind)
        return
    }
    throw new Error("usage: tsx scripts/version.ts sync | bump patch|minor|major")
}

if (isCliMain()) runCli()
