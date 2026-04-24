import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
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
