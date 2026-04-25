import { describe, expect, it } from "bun:test"

import { resolveRoute } from "./route.js"

describe("desktop route switch", () => {
  it("routes /design-system to the Vue design system", () => {
    expect(resolveRoute("/design-system")).toBe("design-system")
  })

  it("keeps all other paths on the dashboard", () => {
    expect(resolveRoute("/")).toBe("dashboard")
    expect(resolveRoute("/desktop/design-system.html")).toBe("dashboard")
  })
})

