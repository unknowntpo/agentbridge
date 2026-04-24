import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ["test/**/*.test.ts", "desktop/src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/openspec/**",
      "**/.git/**",
      "**/.tmp/**",
      "**/minishop-benchmark-swarm/**",
      "**/minishop-benchmark-swarm.backup-20260424-anchor-migration/**",
    ],
  },
});
