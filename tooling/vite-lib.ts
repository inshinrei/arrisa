import {UserConfig} from "vite"
import {readFileSync} from "node:fs"
import {resolve} from "node:path"
import {defineConfig} from "vitest/config"
import dts from "vite-plugin-dts"

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
        plugins: [dts({entryRoot: "src", outDirs: ["dist"], include: ["src"], bundleTypes: true})],
    })
}
