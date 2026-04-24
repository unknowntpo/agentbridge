import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

import type { PendingApproval, PermissionProfile, StateStore, ThreadBinding, ThreadBindingState } from "../types.js"

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
        provider TEXT NOT NULL DEFAULT 'codex',
        backend TEXT NOT NULL DEFAULT 'exec',
        workspace_id TEXT,
        workspace_label TEXT NOT NULL DEFAULT '',
        workspace_path TEXT NOT NULL DEFAULT '',
        permission_profile TEXT NOT NULL DEFAULT 'workspace-write',
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT,
        last_read_message_id TEXT
      );

      CREATE TABLE IF NOT EXISTS pending_approvals (
        request_id TEXT PRIMARY KEY,
        ref TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        provider TEXT NOT NULL,
        requester_user_id TEXT NOT NULL,
        requester_display_name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        parent_channel_id TEXT NOT NULL,
        workspace_id TEXT,
        workspace_label TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        permission_profile TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    this.ensureColumn("thread_bindings", "provider", "TEXT NOT NULL DEFAULT 'codex'")
    this.ensureColumn("thread_bindings", "backend", "TEXT NOT NULL DEFAULT 'exec'")
    this.ensureColumn("thread_bindings", "workspace_id", "TEXT")
    this.ensureColumn("thread_bindings", "workspace_label", "TEXT NOT NULL DEFAULT ''")
    this.ensureColumn("thread_bindings", "workspace_path", "TEXT NOT NULL DEFAULT ''")
    this.ensureColumn("thread_bindings", "permission_profile", "TEXT NOT NULL DEFAULT 'workspace-write'")
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
        `SELECT thread_id, session_id, provider, backend, state, created_at, updated_at, last_error, last_read_message_id
                , workspace_id, workspace_label, workspace_path, permission_profile
         FROM thread_bindings WHERE thread_id = ?`,
      )
      .get(threadId) as BindingRow | undefined

    return row ? mapRow(row) : null
  }

  listBindings(): ThreadBinding[] {
    const rows = this.db
      .prepare(
        `SELECT thread_id, session_id, provider, backend, state, created_at, updated_at, last_error, last_read_message_id
                , workspace_id, workspace_label, workspace_path, permission_profile
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
          provider,
          backend,
          workspace_id,
          workspace_label,
          workspace_path,
          permission_profile,
          state,
          created_at,
          updated_at,
          last_error,
          last_read_message_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          session_id = excluded.session_id,
          provider = excluded.provider,
          backend = excluded.backend,
          workspace_id = excluded.workspace_id,
          workspace_label = excluded.workspace_label,
          workspace_path = excluded.workspace_path,
          permission_profile = excluded.permission_profile,
          state = excluded.state,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          last_error = excluded.last_error,
          last_read_message_id = excluded.last_read_message_id`,
      )
      .run(
        binding.threadId,
        binding.sessionId,
        binding.provider,
        binding.backend,
        binding.workspaceId,
        binding.workspaceLabel,
        binding.workspacePath,
        binding.permissionProfile,
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

  getPendingApproval(requestId: string): PendingApproval | null {
    const row = this.db
      .prepare(
        `SELECT request_id, ref, source, provider, requester_user_id, requester_display_name, prompt,
                parent_channel_id, workspace_id, workspace_label, workspace_path, permission_profile, created_at
         FROM pending_approvals WHERE request_id = ?`,
      )
      .get(requestId) as PendingApprovalRow | undefined

    return row ? mapPendingApprovalRow(row) : null
  }

  listPendingApprovals(): PendingApproval[] {
    const rows = this.db
      .prepare(
        `SELECT request_id, ref, source, provider, requester_user_id, requester_display_name, prompt,
                parent_channel_id, workspace_id, workspace_label, workspace_path, permission_profile, created_at
         FROM pending_approvals ORDER BY created_at ASC`,
      )
      .all() as PendingApprovalRow[]

    return rows.map(mapPendingApprovalRow)
  }

  savePendingApproval(approval: PendingApproval): void {
    this.db
      .prepare(
        `INSERT INTO pending_approvals (
          request_id,
          ref,
          source,
          provider,
          requester_user_id,
          requester_display_name,
          prompt,
          parent_channel_id,
          workspace_id,
          workspace_label,
          workspace_path,
          permission_profile,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO UPDATE SET
          ref = excluded.ref,
          source = excluded.source,
          provider = excluded.provider,
          requester_user_id = excluded.requester_user_id,
          requester_display_name = excluded.requester_display_name,
          prompt = excluded.prompt,
          parent_channel_id = excluded.parent_channel_id,
          workspace_id = excluded.workspace_id,
          workspace_label = excluded.workspace_label,
          workspace_path = excluded.workspace_path,
          permission_profile = excluded.permission_profile,
          created_at = excluded.created_at`,
      )
      .run(
        approval.requestId,
        approval.ref,
        approval.source,
        approval.provider,
        approval.requesterUserId,
        approval.requesterDisplayName,
        approval.prompt,
        approval.parentChannelId,
        approval.workspaceId,
        approval.workspaceLabel,
        approval.workspacePath,
        approval.permissionProfile,
        approval.createdAt,
      )
  }

  deletePendingApproval(requestId: string): void {
    this.db.prepare("DELETE FROM pending_approvals WHERE request_id = ?").run(requestId)
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
  provider?: "codex" | "gemini" | null
  backend?: "exec" | "app-server" | "cli" | null
  workspace_id: string | null
  workspace_label: string | null
  workspace_path: string | null
  permission_profile: PermissionProfile | null
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
    provider: row.provider === "gemini" ? "gemini" : "codex",
    backend: row.backend === "app-server" || row.backend === "cli" ? row.backend : "exec",
    workspaceId: row.workspace_id,
    workspaceLabel: row.workspace_label ?? "",
    workspacePath: row.workspace_path ?? "",
    permissionProfile: row.permission_profile === "workspace-read" || row.permission_profile === "full-access"
      ? row.permission_profile
      : "workspace-write",
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    lastReadMessageId: row.last_read_message_id,
  }
}

interface PendingApprovalRow {
  request_id: string
  ref: string
  source: "discord"
  provider: "codex" | "gemini"
  requester_user_id: string
  requester_display_name: string
  prompt: string
  parent_channel_id: string
  workspace_id: string | null
  workspace_label: string
  workspace_path: string
  permission_profile: PermissionProfile
  created_at: string
}

function mapPendingApprovalRow(row: PendingApprovalRow): PendingApproval {
  return {
    requestId: row.request_id,
    ref: row.ref,
    source: row.source,
    provider: row.provider === "gemini" ? "gemini" : "codex",
    requesterUserId: row.requester_user_id,
    requesterDisplayName: row.requester_display_name,
    prompt: row.prompt,
    parentChannelId: row.parent_channel_id,
    workspaceId: row.workspace_id,
    workspaceLabel: row.workspace_label,
    workspacePath: row.workspace_path,
    permissionProfile: row.permission_profile === "workspace-read" || row.permission_profile === "full-access"
      ? row.permission_profile
      : "workspace-write",
    createdAt: row.created_at,
  }
}
