import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "bun:test"

import {
  buildSessionSummary,
  ensureAgentbridgePromptInstalled,
  getAgentbridgePromptContent,
  listLocalSessions,
  loadSessionSnapshot,
} from "../src/codex/sessionSummary.js"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe("sessionSummary", () => {
  it("loads the latest session for a cwd and excludes the local command marker", () => {
    const codexHome = createCodexHome()
    writeSessionFixture(codexHome, {
      sessionId: "019db938-4bb6-77c2-9cfd-e82fd12a0569",
      updatedAt: "2026-04-23T12:00:00.000Z",
      threadName: "AgentBridge feature work",
      cwd: "/repo/agentbridge",
      visibleMessages: [
        { role: "user", message: "Need a Discord bridge" },
        { role: "assistant", message: "I will inspect the current transport path first." },
        { role: "user", message: "AGENTBRIDGE_COMMAND: export current Codex session summary to Discord." },
      ],
    })

    writeSessionFixture(codexHome, {
      sessionId: "019db9ae-65bd-7f11-babb-bc690d2dcb86",
      updatedAt: "2026-04-23T11:00:00.000Z",
      threadName: "Older session",
      cwd: "/repo/agentbridge",
      visibleMessages: [{ role: "user", message: "old prompt" }],
    })

    const snapshot = loadSessionSnapshot({
      codexHome,
      cwd: "/repo/agentbridge",
    })

    expect(snapshot.sessionId).toBe("019db938-4bb6-77c2-9cfd-e82fd12a0569")
    expect(snapshot.threadName).toBe("AgentBridge feature work")
    expect(snapshot.messages).toEqual([
      { role: "user", content: "Need a Discord bridge", timestamp: "2026-04-23T12:00:01.000Z" },
      { role: "assistant", content: "I will inspect the current transport path first.", timestamp: "2026-04-23T12:00:02.000Z" },
    ])
  })

  it("skips stale session index entries whose rollout files no longer exist", () => {
    const codexHome = createCodexHome()
    fs.appendFileSync(
      path.join(codexHome, "session_index.jsonl"),
      `${JSON.stringify({
        id: "missing-session",
        thread_name: "Missing session",
        updated_at: "2026-04-23T13:00:00.000Z",
      })}\n`,
      "utf8",
    )

    writeSessionFixture(codexHome, {
      sessionId: "019db938-4bb6-77c2-9cfd-e82fd12a0569",
      updatedAt: "2026-04-23T12:00:00.000Z",
      threadName: "Attachable session",
      cwd: "/repo/agentbridge",
      visibleMessages: [{ role: "user", message: "real prompt" }],
    })

    const snapshot = loadSessionSnapshot({
      codexHome,
      cwd: "/repo/agentbridge",
    })

    expect(snapshot.sessionId).toBe("019db938-4bb6-77c2-9cfd-e82fd12a0569")
    expect(snapshot.threadName).toBe("Attachable session")
  })

  it("lists attachable local sessions sorted by recency and can filter by cwd", () => {
    const codexHome = createCodexHome()
    writeSessionFixture(codexHome, {
      sessionId: "session-newer-0000-0000-0000-000000000001",
      updatedAt: "2026-04-23T12:00:00.000Z",
      threadName: "Newer session",
      cwd: "/repo/agentbridge",
      visibleMessages: [{ role: "user", message: "new prompt" }],
    })
    writeSessionFixture(codexHome, {
      sessionId: "session-older-0000-0000-0000-000000000002",
      updatedAt: "2026-04-23T11:00:00.000Z",
      threadName: "Older session",
      cwd: "/repo/other",
      visibleMessages: [{ role: "user", message: "old prompt" }],
    })

    const all = listLocalSessions({ codexHome })
    expect(all.map((session) => session.threadName)).toEqual(["Newer session", "Older session"])

    const filtered = listLocalSessions({ codexHome, cwd: "/repo/agentbridge" })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.threadName).toBe("Newer session")
  })

  it("builds a markdown summary from visible chat messages", () => {
    const summary = buildSessionSummary({
      sessionId: "session-1",
      threadName: "Bridge planning",
      cwd: "/repo/agentbridge",
      updatedAt: "2026-04-23T12:00:00.000Z",
      filePath: "/tmp/session.jsonl",
      messages: [
        { role: "user", content: "Add a local /agentbridge command", timestamp: null },
        { role: "assistant", content: "I will wire a one-shot Discord publisher.", timestamp: null },
      ],
    })

    expect(summary).toContain("Session: Bridge planning")
    expect(summary).toContain("- Add a local /agentbridge command")
    expect(summary).toContain("- I will wire a one-shot Discord publisher.")
  })

  it("installs a local /agentbridge prompt into ~/.codex/prompts", () => {
    const codexHome = createCodexHome()
    const repoRoot = "/Users/unknowntpo/repo/unknowntpo/agentbridge"

    const promptPath = ensureAgentbridgePromptInstalled({ codexHome, repoRoot })
    const content = fs.readFileSync(promptPath, "utf8")

    expect(promptPath).toBe(path.join(codexHome, "prompts", "agentbridge.md"))
    expect(content).toBe(getAgentbridgePromptContent(repoRoot))
    expect(content).toContain("description:")
    expect(content).toContain("agentbridge session attach")
    expect(content).toContain("session attach")
  })
})

function createCodexHome(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentbridge-codex-home-"))
  tempDirs.push(tempDir)
  fs.mkdirSync(path.join(tempDir, "sessions"), { recursive: true })
  return tempDir
}

function writeSessionFixture(
  codexHome: string,
  options: {
    sessionId: string
    updatedAt: string
    threadName: string
    cwd: string
    visibleMessages: Array<{ role: "user" | "assistant"; message: string }>
  },
): void {
  fs.appendFileSync(
    path.join(codexHome, "session_index.jsonl"),
    `${JSON.stringify({
      id: options.sessionId,
      thread_name: options.threadName,
      updated_at: options.updatedAt,
    })}\n`,
    "utf8",
  )

  const filePath = path.join(codexHome, "sessions", `rollout-${options.sessionId}.jsonl`)
  const lines = [
    JSON.stringify({
      timestamp: options.updatedAt,
      type: "session_meta",
      payload: {
        id: options.sessionId,
        cwd: options.cwd,
      },
    }),
    ...options.visibleMessages.map((message, index) =>
      JSON.stringify({
        timestamp: `2026-04-23T12:00:0${index + 1}.000Z`,
        type: "event_msg",
        payload: {
          type: message.role === "user" ? "user_message" : "agent_message",
          message: message.message,
        },
      }),
    ),
  ]
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8")
}
