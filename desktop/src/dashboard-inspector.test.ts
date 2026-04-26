import { readFileSync } from "node:fs"

import { describe, expect, it } from "bun:test"

describe("dashboard inspector empty state", () => {
  it("renders actionable guidance when no worktree is selected", () => {
    const app = readFileSync("desktop/src/App.vue", "utf8")

    expect(app).toContain("No worktree selected")
    expect(app).toContain("Scan project")
    expect(app).toContain("Project state")
    expect(app).toContain("Git truth")
  })

  it("does not register Tauri event listeners in browser preview mode", () => {
    const app = readFileSync("desktop/src/App.vue", "utf8")

    expect(app).toContain("if (hasTauriRuntime())")
    expect(app).toContain("function hasTauriRuntime")
    expect(app).toContain("Tauri runtime unavailable in browser preview.")
  })
})
