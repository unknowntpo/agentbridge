import crypto from "node:crypto"
import { defineConfig } from "vite"

type HashEncoding = "hex" | "base64" | "base64url" | "latin1"

const cryptoWithHash = crypto as typeof crypto & {
  hash?: (algorithm: string, data: crypto.BinaryLike, outputEncoding: HashEncoding) => string
}
cryptoWithHash.hash ??= (algorithm, data, outputEncoding) => (
  crypto.createHash(algorithm).update(data).digest(outputEncoding)
)

const { default: vue } = await import("@vitejs/plugin-vue")

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
