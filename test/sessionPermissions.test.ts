import { describe, expect, it } from "vitest"

import { buildPendingApprovalMessage, createPendingApproval } from "../src/runtime/pendingApprovals.js"
import {
  evaluateSessionPermissionRequest,
  PERMISSION_DECISION_TABLE,
  PROVIDER_CAPABILITY_TABLE,
  resolveWorkspace,
} from "../src/runtime/sessionPermissions.js"

describe("sessionPermissions", () => {
  it("keeps the explicit permission decision table stable", () => {
    expect(PERMISSION_DECISION_TABLE).toEqual([
      { workspaceTrusted: true, profile: "workspace-read", risk: "low", action: "allow" },
      { workspaceTrusted: true, profile: "workspace-write", risk: "low", action: "allow" },
      { workspaceTrusted: true, profile: "full-access", risk: "high", action: "require_local_approval" },
      { workspaceTrusted: false, profile: "workspace-read", risk: "high", action: "require_local_approval" },
      { workspaceTrusted: false, profile: "workspace-write", risk: "high", action: "require_local_approval" },
      { workspaceTrusted: false, profile: "full-access", risk: "high", action: "require_local_approval" },
    ])
  })

  it("keeps the provider capability table explicit", () => {
    expect(PROVIDER_CAPABILITY_TABLE.find((row) => row.provider === "codex" && row.profile === "full-access")?.mappedMode).toBe("danger-full-access")
    expect(PROVIDER_CAPABILITY_TABLE.find((row) => row.provider === "gemini" && row.profile === "full-access")?.supported).toBe(false)
  })

  it("allows trusted workspace-write requests", () => {
    const evaluation = evaluateSessionPermissionRequest({
      provider: "codex",
      workspaceInput: "agentbridge",
      profile: "workspace-write",
      trustedWorkspaces: [{ id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" }],
    })

    expect(evaluation.action).toBe("allow")
    expect(evaluation.workspace.path).toBe("/repo/agentbridge")
  })

  it("queues untrusted workspace requests for local approval", () => {
    const evaluation = evaluateSessionPermissionRequest({
      provider: "codex",
      workspaceInput: "/",
      profile: "workspace-write",
      trustedWorkspaces: [{ id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" }],
    })

    expect(evaluation.action).toBe("require_local_approval")
    expect(evaluation.workspace.trusted).toBe(false)
  })

  it("rejects unsupported gemini full-access requests", () => {
    const evaluation = evaluateSessionPermissionRequest({
      provider: "gemini",
      workspaceInput: "agentbridge",
      profile: "full-access",
      trustedWorkspaces: [{ id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" }],
    })

    expect(evaluation.action).toBe("reject")
    expect(evaluation.reason).toContain("Gemini does not support")
  })

  it("resolves absolute paths inside trusted roots as trusted", () => {
    const workspace = resolveWorkspace("/repo/agentbridge/src", [
      { id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" },
    ])

    expect(workspace.trusted).toBe(true)
    expect(workspace.id).toBe("agentbridge")
  })

  it("expands ~/ paths before trust evaluation", () => {
    const workspace = resolveWorkspace("~/repo/agentbridge", [
      { id: "agentbridge", label: "agentbridge", path: `${process.env.HOME}/repo/agentbridge` },
    ])

    expect(workspace.path).toBe(`${process.env.HOME}/repo/agentbridge`)
    expect(workspace.trusted).toBe(true)
  })
})

describe("pendingApprovals", () => {
  it("builds a short ref message for Discord and preserves full details locally", () => {
    const approval = createPendingApproval({
      provider: "codex",
      requesterUserId: "user-1",
      requesterDisplayName: "Eric Chang",
      prompt: "refactor deployment scripts",
      parentChannelId: "channel-1",
      workspace: {
        id: "infra",
        label: "infra-repo",
        path: "/repo/infra",
        trusted: true,
      },
      permissionProfile: "full-access",
      now: () => "2026-04-24T00:00:00.000Z",
    })

    expect(approval.requestId.startsWith("req-")).toBe(true)
    expect(approval.ref).toHaveLength(4)
    expect(buildPendingApprovalMessage(approval)).toContain(`Ref: ${approval.ref}`)
  })
})
