import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

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
    reopened.close()
  })

  it("marks interrupted bindings as failed during recovery", () => {
    const store = createStore()
    store.saveBinding({
      threadId: "thread-999",
      sessionId: "session-22",
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
})

function createStore(): SQLiteStateStore {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentbridge-"))
  tempDirs.push(tempDir)
  const dbPath = path.join(tempDir, "state.db")
  const store = new SQLiteStateStore(dbPath)
  store.initialize()
  return store
}
