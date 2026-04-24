import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  root: ".",
  plugins: [vue()],
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
