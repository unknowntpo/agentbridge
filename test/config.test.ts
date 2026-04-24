import { describe, expect, it, vi } from "vitest"

import { loadConfig } from "../src/config/config.js"

describe("loadConfig", () => {
  it("warns and defaults Discord channel handling to deny when no allowlist is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const config = loadConfig({ DISCORD_TOKEN: "token" } as NodeJS.ProcessEnv)

    expect(config.allowedChannelIds).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("AGENTBRIDGE_ALLOWED_CHANNEL_IDS is empty"))
    warn.mockRestore()
  })

  it("rejects non-loopback codex app-server hosts", () => {
    expect(() => loadConfig({
      DISCORD_TOKEN: "token",
      AGENTBRIDGE_CODEX_APP_SERVER_HOST: "example.com",
    } as NodeJS.ProcessEnv)).toThrow("must be a loopback host")
  })
})
