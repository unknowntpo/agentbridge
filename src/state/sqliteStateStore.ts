import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

import type { StateStore, ThreadBinding, ThreadBindingState } from "../types.js"

const RECOVERABLE_STATES = new Set<ThreadBindingState>(["starting", "executing", "delivering"])

export class SQLiteStateStore implements StateStore {
  private readonly db: Database.Database

  constructor(private readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
  }

  initialize(): void {
    this.db.pragma("journal_mode = WAL")
    this.db.pragma("synchronous = NORMAL")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thread_bindings (
        thread_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT,
        last_read_message_id TEXT
      )
    `)
    this.ensureColumn("thread_bindings", "last_read_message_id", "TEXT")
  }

  getJournalMode(): string {
    const row = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }
    return row.journal_mode
  }

  close(): void {
    this.db.close()
  }

  getBinding(threadId: string): ThreadBinding | null {
    const row = this.db
      .prepare(
        `SELECT thread_id, session_id, state, created_at, updated_at, last_error, last_read_message_id
         FROM thread_bindings WHERE thread_id = ?`,
      )
      .get(threadId) as BindingRow | undefined

    return row ? mapRow(row) : null
  }

  listBindings(): ThreadBinding[] {
    const rows = this.db
      .prepare(
        `SELECT thread_id, session_id, state, created_at, updated_at, last_error, last_read_message_id
         FROM thread_bindings ORDER BY thread_id ASC`,
      )
      .all() as BindingRow[]

    return rows.map(mapRow)
  }

  saveBinding(binding: ThreadBinding): void {
    this.db
      .prepare(
        `INSERT INTO thread_bindings (
          thread_id,
          session_id,
          state,
          created_at,
          updated_at,
          last_error,
          last_read_message_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          session_id = excluded.session_id,
          state = excluded.state,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          last_error = excluded.last_error,
          last_read_message_id = excluded.last_read_message_id`,
      )
      .run(
        binding.threadId,
        binding.sessionId,
        binding.state,
        binding.createdAt,
        binding.updatedAt,
        binding.lastError,
        binding.lastReadMessageId,
      )
  }

  deleteBinding(threadId: string): void {
    this.db.prepare("DELETE FROM thread_bindings WHERE thread_id = ?").run(threadId)
  }

  recoverBindings(): ThreadBinding[] {
    const bindings = this.listBindings()

    for (const binding of bindings) {
      if (!RECOVERABLE_STATES.has(binding.state)) {
        continue
      }

      this.saveBinding({
        ...binding,
        state: "failed",
        updatedAt: new Date().toISOString(),
        lastError: binding.lastError ?? "Recovered after interrupted bridge execution.",
      })
    }

    return this.listBindings().filter((binding) => binding.state !== "stopped")
  }

  private ensureColumn(tableName: string, columnName: string, columnType: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
    if (columns.some((column) => column.name === columnName)) {
      return
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
  }
}

interface BindingRow {
  thread_id: string
  session_id: string
  state: ThreadBindingState
  created_at: string
  updated_at: string
  last_error: string | null
  last_read_message_id: string | null
}

function mapRow(row: BindingRow): ThreadBinding {
  return {
    threadId: row.thread_id,
    sessionId: row.session_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    lastReadMessageId: row.last_read_message_id,
  }
}
