import { describe, expect, it } from "vitest"

import { resolveManagedBinding } from "../src/local/sessionBindingResolver.js"
import type { ThreadBinding } from "../src/types.js"

describe("cli managed binding resolution", () => {
  const bindings: ThreadBinding[] = [
    {
      threadId: "discord-1",
      sessionId: "codex-1",
      provider: "codex",
      backend: "app-server",
      workspaceId: "agentbridge",
      workspaceLabel: "agentbridge",
      workspacePath: "/repo/agentbridge",
      permissionProfile: "workspace-write",
      state: "bound_idle",
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:01:00.000Z",
      lastError: null,
      lastReadMessageId: null,
    },
    {
      threadId: "discord-2",
      sessionId: "codex-2",
      provider: "gemini",
      backend: "cli",
      workspaceId: "agentbridge",
      workspaceLabel: "agentbridge",
      workspacePath: "/repo/agentbridge",
      permissionProfile: "workspace-write",
      state: "bound_idle",
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:02:00.000Z",
      lastError: null,
      lastReadMessageId: null,
    },
    {
      threadId: "discord-3",
      sessionId: "codex-3",
      provider: "codex",
      backend: "app-server",
      workspaceId: "agentbridge",
      workspaceLabel: "agentbridge",
      workspacePath: "/repo/agentbridge",
      permissionProfile: "workspace-write",
      state: "bound_idle",
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:03:00.000Z",
      lastError: null,
      lastReadMessageId: null,
    },
  ]

  it("selects the latest managed binding", () => {
    expect(resolveManagedBinding(bindings, { latest: true }).sessionId).toBe("codex-3")
  })

  it("selects by discord thread id", () => {
    expect(resolveManagedBinding(bindings, { discordThreadId: "discord-1" }).sessionId).toBe("codex-1")
  })

  it("selects by managed session id", () => {
    expect(resolveManagedBinding(bindings, { sessionId: "codex-1" }).threadId).toBe("discord-1")
  })

  it("filters by provider when requested", () => {
    expect(resolveManagedBinding(bindings, { latest: true, provider: "gemini" }).threadId).toBe("discord-2")
  })
})
