import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "bun:test"

import { SQLiteStateStore } from "../src/state/sqliteStateStore.js"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { force: true, recursive: true })
  }
})

describe("SQLiteStateStore", () => {
  it("enables WAL mode during initialization", () => {
    const store = createStore()
    expect(store.getJournalMode().toLowerCase()).toBe("wal")
    store.close()
  })

  it("persists bindings across reopen", () => {
    const store = createStore()
    store.saveBinding({
      threadId: "thread-123",
      sessionId: "session-7",
      provider: "codex",
      backend: "app-server",
      workspaceId: "agentbridge",
      workspaceLabel: "agentbridge",
      workspacePath: "/repo/agentbridge",
      permissionProfile: "workspace-write",
      state: "bound_idle",
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      lastError: null,
      lastReadMessageId: "message-9",
    })
    const dbPath = (store as unknown as { dbPath: string }).dbPath
    store.close()

    const reopened = new SQLiteStateStore(dbPath)
    reopened.initialize()
    expect(reopened.getBinding("thread-123")?.sessionId).toBe("session-7")
    expect(reopened.getBinding("thread-123")?.lastReadMessageId).toBe("message-9")
    expect(reopened.getBinding("thread-123")?.workspacePath).toBe("/repo/agentbridge")
    reopened.close()
  })

  it("marks interrupted bindings as failed during recovery", () => {
    const store = createStore()
    store.saveBinding({
      threadId: "thread-999",
      sessionId: "session-22",
      provider: "codex",
      backend: "app-server",
      workspaceId: "agentbridge",
      workspaceLabel: "agentbridge",
      workspacePath: "/repo/agentbridge",
      permissionProfile: "workspace-write",
      state: "executing",
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      lastError: null,
      lastReadMessageId: null,
    })

    const recovered = store.recoverBindings()
    expect(recovered[0]?.state).toBe("failed")
    expect(recovered[0]?.lastError).toContain("Recovered")
    store.close()
  })

  it("persists pending approvals", () => {
    const store = createStore()
    store.savePendingApproval({
      requestId: "req-1",
      ref: "A7K2",
      source: "discord",
      provider: "codex",
      requesterUserId: "user-1",
      requesterDisplayName: "Eric Chang",
      prompt: "refactor deployment scripts",
      parentChannelId: "channel-1",
      workspaceId: "infra",
      workspaceLabel: "infra-repo",
      workspacePath: "/repo/infra",
      permissionProfile: "full-access",
      createdAt: "2026-04-24T00:00:00.000Z",
    })

    expect(store.listPendingApprovals()).toHaveLength(1)
    expect(store.getPendingApproval("req-1")?.ref).toBe("A7K2")
    expect(store.getPendingApproval("req-1")?.permissionProfile).toBe("full-access")
    store.close()
  })
})

function createStore(): SQLiteStateStore {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentbridge-"))
  tempDirs.push(tempDir)
  const dbPath = path.join(tempDir, "state.db")
  const store = new SQLiteStateStore(dbPath)
  store.initialize()
  return store
}
