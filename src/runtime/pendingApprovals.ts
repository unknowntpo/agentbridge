import { randomUUID } from "node:crypto"

import type { PendingApproval, PermissionProfile, ProviderKind, ResolvedWorkspace } from "../types.js"

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function createPendingApproval(options: {
  provider: ProviderKind
  requesterUserId: string
  requesterDisplayName: string
  prompt: string
  parentChannelId: string
  workspace: ResolvedWorkspace
  permissionProfile: PermissionProfile
  now?: () => string
}): PendingApproval {
  return {
    requestId: `req-${randomUUID()}`,
    ref: createApprovalRef(),
    source: "discord",
    provider: options.provider,
    requesterUserId: options.requesterUserId,
    requesterDisplayName: options.requesterDisplayName,
    prompt: options.prompt,
    parentChannelId: options.parentChannelId,
    workspaceId: options.workspace.id,
    workspaceLabel: options.workspace.label,
    workspacePath: options.workspace.path,
    permissionProfile: options.permissionProfile,
    createdAt: (options.now ?? (() => new Date().toISOString()))(),
  }
}

export function buildPendingApprovalMessage(approval: PendingApproval): string {
  const lead = approval.permissionProfile === "full-access"
    ? "Full-access request queued for local approval."
    : "Workspace request queued for local approval."
  return [
    lead,
    `Ref: ${approval.ref}`,
    `On this machine, run: \`agentbridge approvals approve --ref ${approval.ref}\``,
  ].join("\n")
}

function createApprovalRef(): string {
  let output = ""
  for (let index = 0; index < 4; index += 1) {
    output += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]
  }
  return output
}
