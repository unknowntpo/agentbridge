import { readFileSync } from "node:fs"

import { describe, expect, it } from "bun:test"

describe("Vue design system route contract", () => {
  it("uses the shared CommitLogPanel component in dashboard and design system route", () => {
    const app = readFileSync("desktop/src/App.vue", "utf8")
    const designSystem = readFileSync("desktop/src/views/DesignSystemView.vue", "utf8")

    expect(app).toContain("import CommitLogPanel")
    expect(app).toContain("<CommitLogPanel")
    expect(designSystem).toContain("import CommitLogPanel")
    expect(designSystem).toContain("<CommitLogPanel")
  })

  it("keeps commit selection wired to the design-system deploy flow", () => {
    const panel = readFileSync("desktop/src/components/CommitLogPanel.vue", "utf8")
    const designSystem = readFileSync("desktop/src/views/DesignSystemView.vue", "utf8")

    expect(panel).toContain("\"select-row\"")
    expect(designSystem).toContain("@select-row=\"selectCommit\"")
    expect(designSystem).toContain("Selected commit")
    expect(designSystem).toContain("Deploy agent")
    expect(designSystem).toContain("Workspace write")
    expect(designSystem).toContain("Working directory")
  })

  it("keeps app navigation pointed at the Vue route, not the legacy static HTML", () => {
    const app = readFileSync("desktop/src/App.vue", "utf8")

    expect(app).toContain("href=\"/design-system\"")
    expect(app).not.toContain("href=\"/desktop/design-system.html\"")
  })
})
