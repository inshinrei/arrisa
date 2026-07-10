import {defineConfig} from "vite"
import {resolve} from "node:path"
import dts from "vite-plugin-dts"

export default defineConfig({
    build: {
        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            formats: ["es"],
            fileName: "index",
        },
        sourcemap: true,
        rollupOptions: {
            external: [/^@weiss\//, /^@marijn\//, "crelt", "style-mod"],
        },
        target: "es2022",
        emptyOutDir: true,
    },
    plugins: [dts({entryRoot: "src", outDirs: ["dist"], include: ["src"], bundleTypes: true})],
})
