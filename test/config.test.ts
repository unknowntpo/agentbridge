import { describe, expect, it } from "bun:test"

import { loadConfig } from "../src/config/config.js"

describe("loadConfig", () => {
  it("loads local-only config without Discord credentials", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv)

    expect(config.discordToken).toBe("")
    expect(config.sqlitePath).toContain(".agentbridge/state.db")
  })

  it("defaults Discord channel handling to deny when no allowlist is configured", () => {
    const config = loadConfig({ DISCORD_TOKEN: "token" } as NodeJS.ProcessEnv)

    expect(config.allowedChannelIds).toEqual([])
  })

  it("rejects non-loopback codex app-server hosts", () => {
    expect(() => loadConfig({
      DISCORD_TOKEN: "token",
      AGENTBRIDGE_CODEX_APP_SERVER_HOST: "example.com",
    } as NodeJS.ProcessEnv)).toThrow("must be a loopback host")
  })
})
