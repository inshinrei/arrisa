import { defineConfig } from "vite"
import { resolve } from "node:path"

let root = resolve(import.meta.dirname, "..")
let e2e = process.env.ARRISA_E2E == "1"

export default defineConfig({
  root: resolve(import.meta.dirname),
  server: {
    port: 5173,
    strictPort: true,
    open: !e2e,
  },
  resolve: {
    alias: {
      "@arrisa/doc": resolve(root, "packages/doc/src"),
      "@arrisa/types": resolve(root, "packages/types/src"),
      "@arrisa/state": resolve(root, "packages/state/src"),
      "@arrisa/phrases": resolve(root, "packages/phrases/src"),
      "@arrisa/history": resolve(root, "packages/history/src"),
      "@arrisa/command": resolve(root, "packages/command/src"),
      "@arrisa/editor": resolve(root, "packages/editor/src"),
      "@arrisa/schema": resolve(root, "packages/schema/src"),
      "@arrisa/message": resolve(root, "packages/message/src"),
      "@arrisa/table": resolve(root, "packages/table/src"),
      "@arrisa/collab": resolve(root, "packages/collab/src"),
    },
  },
})
