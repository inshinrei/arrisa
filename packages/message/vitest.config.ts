import {resolve} from "node:path"
import {defineConfig} from "vitest/config"

export default defineConfig({
    test: {
        include: ["src/**/*.unit.ts"],
    },
    resolve: {
        alias: {
            "@arrisa/schema": resolve(import.meta.dirname, "../schema/src/index.ts"),
        },
    },
})
