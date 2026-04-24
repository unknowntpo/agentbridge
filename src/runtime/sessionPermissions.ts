import os from "node:os"
import path from "node:path"

import type { PermissionProfile, ProviderKind, ResolvedWorkspace, TrustedWorkspace } from "../types.js"

export interface PermissionDecisionRow {
  workspaceTrusted: boolean
  profile: PermissionProfile
  risk: "low" | "high"
  action: "allow" | "require_local_approval" | "reject"
}

export interface ProviderCapabilityRow {
  provider: ProviderKind
  profile: PermissionProfile
  supported: boolean
  mappedMode: string | null
}

export interface SessionPermissionEvaluation {
  workspace: ResolvedWorkspace
  profile: PermissionProfile
  decision: PermissionDecisionRow
  capability: ProviderCapabilityRow
  action: "allow" | "require_local_approval" | "reject"
  reason: string | null
}

export const PERMISSION_PROFILES: PermissionProfile[] = [
  "workspace-read",
  "workspace-write",
  "full-access",
]

export const PERMISSION_DECISION_TABLE: PermissionDecisionRow[] = [
  { workspaceTrusted: true, profile: "workspace-read", risk: "low", action: "allow" },
  { workspaceTrusted: true, profile: "workspace-write", risk: "low", action: "allow" },
  { workspaceTrusted: true, profile: "full-access", risk: "high", action: "require_local_approval" },
  { workspaceTrusted: false, profile: "workspace-read", risk: "high", action: "require_local_approval" },
  { workspaceTrusted: false, profile: "workspace-write", risk: "high", action: "require_local_approval" },
  { workspaceTrusted: false, profile: "full-access", risk: "high", action: "require_local_approval" },
]

export const PROVIDER_CAPABILITY_TABLE: ProviderCapabilityRow[] = [
  { provider: "codex", profile: "workspace-read", supported: true, mappedMode: "read-only" },
  { provider: "codex", profile: "workspace-write", supported: true, mappedMode: "workspace-write" },
  { provider: "codex", profile: "full-access", supported: true, mappedMode: "danger-full-access" },
  { provider: "gemini", profile: "workspace-read", supported: true, mappedMode: "provider-defined" },
  { provider: "gemini", profile: "workspace-write", supported: true, mappedMode: "provider-defined" },
  { provider: "gemini", profile: "full-access", supported: false, mappedMode: null },
]

export function parsePermissionProfile(value: string | undefined): PermissionProfile {
  return PERMISSION_PROFILES.find((candidate) => candidate === value) ?? "workspace-write"
}

export function evaluateSessionPermissionRequest(options: {
  provider: ProviderKind
  workspaceInput: string
  profile: PermissionProfile
  trustedWorkspaces: TrustedWorkspace[]
}): SessionPermissionEvaluation {
  const workspace = resolveWorkspace(options.workspaceInput, options.trustedWorkspaces)
  const decision = resolvePermissionDecision(workspace.trusted, options.profile)
  const capability = resolveProviderCapability(options.provider, options.profile)

  if (!capability.supported) {
    return {
      workspace,
      profile: options.profile,
      decision,
      capability,
      action: "reject",
      reason: `${displayProvider(options.provider)} does not support the ${options.profile} profile in AgentBridge yet.`,
    }
  }

  return {
    workspace,
    profile: options.profile,
    decision,
    capability,
    action: decision.action,
    reason: null,
  }
}

export function resolvePermissionDecision(
  workspaceTrusted: boolean,
  profile: PermissionProfile,
): PermissionDecisionRow {
  const row = PERMISSION_DECISION_TABLE.find((candidate) => (
    candidate.workspaceTrusted === workspaceTrusted &&
    candidate.profile === profile
  ))
  if (!row) {
    throw new Error(`No permission decision row for trusted=${workspaceTrusted} profile=${profile}`)
  }
  return row
}

export function resolveProviderCapability(
  provider: ProviderKind,
  profile: PermissionProfile,
): ProviderCapabilityRow {
  const row = PROVIDER_CAPABILITY_TABLE.find((candidate) => (
    candidate.provider === provider &&
    candidate.profile === profile
  ))
  if (!row) {
    throw new Error(`No provider capability row for provider=${provider} profile=${profile}`)
  }
  return row
}

export function resolveWorkspace(
  workspaceInput: string,
  trustedWorkspaces: TrustedWorkspace[],
): ResolvedWorkspace {
  const trimmed = workspaceInput.trim()
  if (!trimmed) {
    throw new Error("Workspace selection is required.")
  }

  const byId = trustedWorkspaces.find((workspace) => workspace.id === trimmed)
  if (byId) {
    return {
      id: byId.id,
      label: byId.label,
      path: normalizeAbsolutePath(byId.path),
      trusted: true,
    }
  }

  const resolvedPath = normalizeAbsolutePath(trimmed)
  const matchingRoot = trustedWorkspaces.find((workspace) => (
    isWithinWorkspace(resolvedPath, normalizeAbsolutePath(workspace.path))
  ))

  if (!matchingRoot) {
    return {
      id: null,
      label: trimmed,
      path: resolvedPath,
      trusted: false,
    }
  }

  return {
    id: matchingRoot.id,
    label: trimmed,
    path: resolvedPath,
    trusted: true,
  }
}

export function normalizeAbsolutePath(value: string): string {
  const expanded = expandHomePath(value)
  if (!path.isAbsolute(expanded)) {
    throw new Error(`Workspace must be a trusted workspace id or an absolute path. Received: ${value}`)
  }
  return path.resolve(expanded)
}

function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir()
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2))
  }

  return value
}

function isWithinWorkspace(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function displayProvider(provider: ProviderKind): string {
  return provider === "gemini" ? "Gemini" : "Codex"
}
