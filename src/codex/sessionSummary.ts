import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const AGENTBRIDGE_COMMAND_MARKER = "AGENTBRIDGE_COMMAND:"

export interface SessionChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: string | null
}

export interface CodexSessionSnapshot {
  sessionId: string
  threadName: string
  cwd: string
  updatedAt: string
  filePath: string
  messages: SessionChatMessage[]
}

export interface LocalCodexSessionRef {
  sessionId: string
  threadName: string
  cwd: string
  updatedAt: string
  filePath: string
}

interface SessionIndexEntry {
  id: string
  thread_name?: string
  updated_at?: string
}

interface SessionMetaPayload {
  id?: string
  cwd?: string
}

export function loadSessionSnapshot(options: {
  codexHome?: string
  cwd: string
  sessionId?: string
}): CodexSessionSnapshot {
  const codexHome = resolveCodexHome(options.codexHome)
  const indexEntries = readSessionIndex(path.join(codexHome, "session_index.jsonl"))
  const filePath = options.sessionId
    ? findSessionFileById(path.join(codexHome, "sessions"), options.sessionId)
    : findLatestSessionFileForCwd(path.join(codexHome, "sessions"), indexEntries, options.cwd)

  const sessionId = options.sessionId ?? extractSessionIdFromPath(filePath)
  const matchingIndexEntry = indexEntries.find((entry) => entry.id === sessionId)
  return loadSnapshotFromFile(filePath, matchingIndexEntry?.thread_name ?? "Codex session", matchingIndexEntry?.updated_at ?? "")
}

export function listLocalSessions(options?: {
  codexHome?: string
  cwd?: string
}): LocalCodexSessionRef[] {
  const codexHome = resolveCodexHome(options?.codexHome)
  const sessionsRoot = path.join(codexHome, "sessions")
  const entries = readSessionIndex(path.join(codexHome, "session_index.jsonl"))
    .sort((left, right) => compareIsoTimestamps(right.updated_at, left.updated_at))

  const seen = new Set<string>()
  const sessions: LocalCodexSessionRef[] = []

  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) {
      continue
    }

    let filePath: string
    try {
      filePath = findSessionFileById(sessionsRoot, entry.id)
    } catch {
      continue
    }

    const cwd = readSessionMetaCwd(filePath)
    if (!cwd) {
      continue
    }

    if (options?.cwd && cwd !== options.cwd) {
      continue
    }

    seen.add(entry.id)
    sessions.push({
      sessionId: entry.id,
      threadName: entry.thread_name ?? "Codex session",
      cwd,
      updatedAt: entry.updated_at ?? "",
      filePath,
    })
  }

  return sessions
}

export function buildSessionSummary(snapshot: CodexSessionSnapshot): string {
  const userMessages = snapshot.messages.filter((message) => message.role === "user")
  const assistantMessages = snapshot.messages.filter((message) => message.role === "assistant")

  const sections = [
    `Session: ${snapshot.threadName}`,
    `Updated: ${snapshot.updatedAt || "unknown"}`,
    "",
    "User requests:",
    ...toBullets(userMessages),
    "",
    "Assistant replies:",
    ...toBullets(assistantMessages),
  ]

  return sections.join("\n").trim()
}

export function getAgentbridgePromptContent(_repoRoot: string): string {
  return `---
description: Attach the current local Codex workstream to AgentBridge using the stable CLI command.
---

${AGENTBRIDGE_COMMAND_MARKER} attach current local Codex workstream to AgentBridge.

Run this exact command and stop after it finishes:

\`agentbridge session attach --cwd "$PWD"\`

Rules:
- Do not modify files.
- Do not reimplement the attach flow yourself.
- Report the created Discord thread returned by the command.
`
}

export function ensureAgentbridgePromptInstalled(options: {
  codexHome?: string
  repoRoot: string
}): string {
  const codexHome = resolveCodexHome(options.codexHome)
  const promptsDir = path.join(codexHome, "prompts")
  const promptPath = path.join(promptsDir, "agentbridge.md")
  fs.mkdirSync(promptsDir, { recursive: true })
  fs.writeFileSync(promptPath, getAgentbridgePromptContent(options.repoRoot), "utf8")
  return promptPath
}

function loadSnapshotFromFile(filePath: string, fallbackThreadName: string, fallbackUpdatedAt: string): CodexSessionSnapshot {
  const raw = fs.readFileSync(filePath, "utf8")
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let sessionId = extractSessionIdFromPath(filePath)
  let cwd = ""
  const messages: SessionChatMessage[] = []

  for (const line of lines) {
    const parsed = JSON.parse(line) as SessionEvent

    if (parsed.type === "session_meta") {
      const payload = parsed.payload as SessionMetaPayload | undefined
      if (payload?.id) {
        sessionId = payload.id
      }
      if (payload?.cwd) {
        cwd = payload.cwd
      }
      continue
    }

    if (parsed.type !== "event_msg") {
      continue
    }

    const payload = parsed.payload as EventPayload | undefined
    if (!payload) {
      continue
    }

    if (payload.type === "user_message" && typeof payload.message === "string") {
      if (payload.message.includes(AGENTBRIDGE_COMMAND_MARKER)) {
        continue
      }

      messages.push({
        role: "user",
        content: normalizeMessage(payload.message),
        timestamp: parsed.timestamp ?? null,
      })
      continue
    }

    if (payload.type === "agent_message" && typeof payload.message === "string") {
      messages.push({
        role: "assistant",
        content: normalizeMessage(payload.message),
        timestamp: parsed.timestamp ?? null,
      })
    }
  }

  if (!cwd) {
    throw new Error(`Session file ${filePath} did not contain a cwd`)
  }

  return {
    sessionId,
    threadName: fallbackThreadName || "Codex session",
    cwd,
    updatedAt: fallbackUpdatedAt,
    filePath,
    messages,
  }
}

function findLatestSessionFileForCwd(sessionsRoot: string, indexEntries: SessionIndexEntry[], cwd: string): string {
  const entries = [...indexEntries].sort((left, right) => compareIsoTimestamps(right.updated_at, left.updated_at))

  for (const entry of entries) {
    if (!entry.id) {
      continue
    }

    let filePath: string
    try {
      filePath = findSessionFileById(sessionsRoot, entry.id)
    } catch {
      continue
    }

    const sessionCwd = readSessionMetaCwd(filePath)
    if (sessionCwd === cwd) {
      return filePath
    }
  }

  throw new Error(`No Codex session found for cwd ${cwd}. Run \`agentbridge session list\` to inspect available local sessions, retry with \`--session-id <id>\`, or create a fresh managed thread with \`agentbridge session new --prompt "<text>"\`.`)
}

function findSessionFileById(sessionsRoot: string, sessionId: string): string {
  const stack = [sessionsRoot]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(resolved)
        continue
      }

      if (entry.isFile() && entry.name.endsWith(`${sessionId}.jsonl`)) {
        return resolved
      }
    }
  }

  throw new Error(`No Codex session file found for session ${sessionId}`)
}

function readSessionMetaCwd(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const parsed = JSON.parse(trimmed) as SessionEvent
    if (parsed.type !== "session_meta") {
      continue
    }

    const payload = parsed.payload as SessionMetaPayload | undefined
    if (payload?.cwd) {
      return payload.cwd
    }
  }

  return ""
}

function readSessionIndex(filePath: string): SessionIndexEntry[] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionIndexEntry)
}

function resolveCodexHome(codexHome?: string): string {
  if (codexHome) {
    return codexHome
  }

  return path.join(os.homedir(), ".codex")
}

function extractSessionIdFromPath(filePath: string): string {
  const match = filePath.match(/([0-9a-f]{8,}-[0-9a-f-]+)\.jsonl$/i)
  if (!match) {
    throw new Error(`Unable to extract session id from ${filePath}`)
  }

  return match[1]
}

function compareIsoTimestamps(left?: string, right?: string): number {
  const leftTime = left ? Date.parse(left) : 0
  const rightTime = right ? Date.parse(right) : 0
  return leftTime - rightTime
}

function normalizeMessage(message: string): string {
  return message
    .replace(/\r\n/g, "\n")
    .trim()
}

function toBullets(messages: SessionChatMessage[]): string[] {
  if (messages.length === 0) {
    return ["- (none)"]
  }

  return messages.map((message) => `- ${truncateInline(message.content, 240)}`)
}

function truncateInline(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit - 3)}...`
}

interface SessionEvent {
  timestamp?: string
  type?: string
  payload?: unknown
}

interface EventPayload {
  type?: string
  message?: string
}
