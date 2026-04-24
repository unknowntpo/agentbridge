import { defineConfig } from "vite"

export default defineConfig({
  root: ".",
  publicDir: "desktop/public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
})
