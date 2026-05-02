import fs from "node:fs/promises"
import path from "node:path"

import { parse } from "yaml"

import type { PermissionProfile, ProviderKind } from "../types.js"

export interface GitHubProjectWorkflowConfig {
  github: {
    owner: string
    repo: string
    project: {
      owner: string
      number: number
      statusField: string
      deployStatus: string
      reviewStatus: string
      doneStatus: string
    }
    labels: {
      deploy: string
    }
  }
  agent: {
    defaultProvider: ProviderKind
    defaultPermission: PermissionProfile
  }
  sync: {
    pollIntervalSeconds: number
  }
}

export async function loadGitHubProjectWorkflowConfig(projectRoot: string, configPath?: string): Promise<GitHubProjectWorkflowConfig> {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.join(projectRoot, ".agentbridge", "project.yml")
  const source = await fs.readFile(resolvedPath, "utf8")
  return parseGitHubProjectWorkflowConfig(parse(source), resolvedPath)
}

export function parseGitHubProjectWorkflowConfig(value: unknown, context = "GitHub Project workflow config"): GitHubProjectWorkflowConfig {
  const record = requireRecord(value, context)
  const github = requireRecord(record.github, `${context}.github`)
  const project = requireRecord(github.project, `${context}.github.project`)
  const labels = requireRecord(github.labels, `${context}.github.labels`)
  const agent = optionalRecord(record.agent, `${context}.agent`)
  const sync = optionalRecord(record.sync, `${context}.sync`)

  return {
    github: {
      owner: requireString(github.owner, `${context}.github.owner`),
      repo: requireString(github.repo, `${context}.github.repo`),
      project: {
        owner: requireString(project.owner, `${context}.github.project.owner`),
        number: requirePositiveInteger(project.number, `${context}.github.project.number`),
        statusField: optionalString(project.statusField, "Status"),
        deployStatus: optionalString(project.deployStatus, "In Progress"),
        reviewStatus: optionalString(project.reviewStatus, "Review"),
        doneStatus: optionalString(project.doneStatus, "Done"),
      },
      labels: {
        deploy: optionalString(labels.deploy, "agentbridge"),
      },
    },
    agent: {
      defaultProvider: parseProvider(agent?.defaultProvider),
      defaultPermission: parsePermission(agent?.defaultPermission),
    },
    sync: {
      pollIntervalSeconds: requirePositiveInteger(sync?.pollIntervalSeconds ?? 30, `${context}.sync.pollIntervalSeconds`),
    },
  }
}

function parseProvider(value: unknown): ProviderKind {
  return value === "gemini" ? "gemini" : "codex"
}

function parsePermission(value: unknown): PermissionProfile {
  if (value === "workspace-read" || value === "workspace-write" || value === "full-access") {
    return value
  }
  return "workspace-write"
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`)
  }
  return value as Record<string, unknown>
}

function optionalRecord(value: unknown, context: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  return requireRecord(value, context)
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string`)
  }
  return value.trim()
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function requirePositiveInteger(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer`)
  }
  return value
}

