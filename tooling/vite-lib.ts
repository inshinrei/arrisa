import {UserConfig, Plugin} from "vite"
import {copyFileSync, existsSync} from "node:fs"
import {readFileSync} from "node:fs"
import {resolve} from "node:path"
import {defineConfig} from "vitest/config"
import dts from "vite-plugin-dts"

/**
 * Copy package `agents-for-module.md` → `dist/AGENTS.md` so consumer-oriented
 * agent guidance ships inside the published npm package (halua pattern).
 */
function copyModuleAgentsPlugin(pkgDir: string): Plugin {
    return {
        name: "copy-module-agents",
        closeBundle() {
            let src = resolve(pkgDir, "agents-for-module.md")
            let dest = resolve(pkgDir, "dist", "AGENTS.md")
            if (!existsSync(src)) {
                throw new Error(
                    `[copy-module-agents] missing ${src} — published packages must ship dist/AGENTS.md`,
                )
            }
            try {
                copyFileSync(src, dest)
            } catch (err) {
                throw new Error(`[copy-module-agents] copy failed: ${err}`)
            }
        },
    }
}

export function arrisaLib(pkgDir: string, entry = "src/index.ts"): UserConfig {
    let pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8"))
    let deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
    }

    return defineConfig({
        build: {
            lib: {
                entry: resolve(pkgDir, entry),
                formats: ["es"],
                fileName: "index",
            },
            sourcemap: true,
            rollupOptions: {
                external: (id: string) => id in deps || id.startsWith("@arrisa"),
            },
            target: "es2022",
            emptyOutDir: true,
        },
        plugins: [
            dts({entryRoot: "src", outDirs: ["dist"], include: ["src"], bundleTypes: true}),
            copyModuleAgentsPlugin(pkgDir),
        ],
    })
}
