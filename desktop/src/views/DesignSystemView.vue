<script setup lang="ts">
import { computed, ref } from "vue"

import AgentChip from "../components/AgentChip.vue"
import Badge from "../components/Badge.vue"
import CommitLogPanel from "../components/CommitLogPanel.vue"
import { buildCommitLogRows, commitGraphSvgPath } from "../commit-log"
import type { AgentDraft, AgentMode, AgentSession, GithubState, PermissionProfile, Provider, WorktreeScan } from "../store"

const selectedWorktreeId = ref("agent-drawer")
const selectedRowId = ref("commit-agent-drawer-head")
const selectedSessionId = ref<string | null>(null)
const deployDrawerOpen = ref(false)
const agentDraft = ref<AgentDraft | null>(null)

const github: GithubState = {
  provider: "GitHub",
  auth: "ok",
  pr: "#42",
  prUrl: null,
  checks: "ok",
  review: "ok",
  message: null,
  mocked: false,
}

const worktrees: WorktreeScan[] = [
  worktree("main", "main", "7a8b9c0", "clean"),
  worktree("agent-drawer", "feat/agent-drawer", "d4e5f6a", "clean"),
  worktree("docs-permissions", "docs/permissions", "e7fa89b", "clean"),
  worktree("experiment-cache", "exp/cache", "b1c2d3e", "dirty"),
]

const sessions = ref<AgentSession[]>([
  session("agent-drawer", "Codex", "write"),
  session("agent-drawer", "Gemini", "read"),
  session("docs-permissions", "Claude", "read"),
  session("docs-permissions", "Gemini", "read"),
  session("experiment-cache", "Codex", "write"),
])

const providerOptions: Provider[] = ["Codex", "Gemini", "Claude"]
const permissionOptions: Array<{ label: string; profile: PermissionProfile; mode: AgentMode; description: string }> = [
  { label: "Read-only", profile: "workspace-read", mode: "read", description: "Can inspect files and report back without writes." },
  { label: "Workspace write", profile: "workspace-write", mode: "write", description: "Can edit this worktree and run local checks." },
  { label: "Full access", profile: "full-access", mode: "write", description: "Requires approval before broader machine or network actions." },
]

const rows = computed(() => buildCommitLogRows(worktrees, sessions.value))
const graph = computed(() => commitGraphSvgPath(rows.value.length))
const selectedRow = computed(() => rows.value.find((row) => row.id === selectedRowId.value) ?? rows.value[0] ?? null)
const selectedWorktree = computed(() => worktrees.find((worktree) => worktree.id === selectedWorktreeId.value) ?? null)
const selectedWorktreeSessions = computed(() => (
  selectedWorktree.value ? sessions.value.filter((session) => session.worktreeId === selectedWorktree.value?.id) : []
))
const selectedSession = computed(() => sessions.value.find((session) => session.id === selectedSessionId.value) ?? null)

function selectCommit(row: NonNullable<typeof selectedRow.value>): void {
  selectedRowId.value = row.id
  if (row.worktreeId) selectedWorktreeId.value = row.worktreeId
}

function selectWorktree(id: string): void {
  selectedWorktreeId.value = id
}

function openDeployDrawer(): void {
  const worktree = selectedWorktree.value
  const row = selectedRow.value
  if (!worktree) return
  agentDraft.value = {
    worktreeId: worktree.id,
    provider: "Codex",
    mode: "write",
    profile: "workspace-write",
    workingDirectory: worktree.path,
    prompt: `Work on ${row?.message ?? worktree.name}`,
  }
  deployDrawerOpen.value = true
}

function closeDeployDrawer(): void {
  deployDrawerOpen.value = false
}

function updateDraft(patch: Partial<AgentDraft>): void {
  if (!agentDraft.value) return
  const next = { ...agentDraft.value, ...patch }
  if (next.mode === "read") next.profile = "workspace-read"
  if (next.mode === "write" && next.profile === "workspace-read") next.profile = "workspace-write"
  agentDraft.value = next
}

function choosePermission(option: { profile: PermissionProfile; mode: AgentMode }): void {
  updateDraft({ profile: option.profile, mode: option.mode })
}

function createAgent(): void {
  const draft = agentDraft.value
  if (!draft) return
  const next: AgentSession = {
    id: `demo-${draft.worktreeId}-${draft.provider}-${Date.now()}`,
    worktreeId: draft.worktreeId,
    provider: draft.provider,
    mode: draft.mode,
    profile: draft.profile,
    state: "running",
    prompt: draft.prompt,
    workingDirectory: draft.workingDirectory,
    mocked: true,
    messages: [
      { id: "system-1", role: "system", text: `${draft.provider} ${draft.mode} session created from the design-system flow.`, at: "now" },
      { id: "user-1", role: "user", text: draft.prompt, at: "now" },
    ],
    runs: [],
    artifacts: [],
    skills: { loaded: ["frontend-feedback-loop"], suggested: ["isolated-demo-tests"], blocked: [], events: ["Drawer preview created a mocked session."] },
  }
  sessions.value = [next, ...sessions.value]
  selectedSessionId.value = next.id
  deployDrawerOpen.value = false
}

function worktree(name: string, branch: string, head: string, status: string): WorktreeScan {
  return {
    id: name,
    name,
    path: `/Users/unknowntpo/repo/unknowntpo/agentbridge/${name}`,
    branch,
    upstream: `origin/${branch}`,
    head,
    status,
    ahead: name === "main" ? 0 : 2,
    behind: 0,
    remote: github,
  }
}

function session(worktreeId: string, provider: AgentSession["provider"], mode: AgentSession["mode"]): AgentSession {
  return {
    id: `demo-${worktreeId}-${provider}-${mode}`,
    worktreeId,
    provider,
    mode,
    profile: mode === "read" ? "workspace-read" : "workspace-write",
    state: mode === "write" ? "running" : "idle",
    prompt: `Demo ${provider} ${mode} agent`,
    workingDirectory: `/Users/unknowntpo/repo/unknowntpo/agentbridge/${worktreeId}`,
    mocked: true,
    messages: [],
    runs: [],
    artifacts: [],
    skills: { loaded: [], suggested: [], blocked: [], events: [] },
  }
}
</script>

<template>
  <main class="design-system-route">
    <header class="design-system-hero">
      <a href="/" class="back-link">Back to dashboard</a>
      <span class="eyebrow">AgentHub Design System</span>
      <h1>Vue-backed component preview</h1>
      <p>
        This page renders the same Vue components as the dashboard. Demo data changes here,
        component implementation does not.
      </p>
    </header>

    <div class="design-system-workflow-grid">
      <section class="design-system-section">
        <div class="section-heading">
          <span class="eyebrow">Organism</span>
          <h2>CommitLogPanel</h2>
          <p>Shared implementation used by dashboard and design system preview. Select a commit to drive the inspector.</p>
        </div>
        <CommitLogPanel
          :rows="rows"
          :graph="graph"
          :selected-worktree-id="selectedWorktreeId"
          :selected-row-id="selectedRowId"
          @select-row="selectCommit"
          @select-worktree="selectWorktree"
          @select-agent="selectedSessionId = $event"
        />
      </section>

      <aside class="design-system-inspector" aria-label="Selected commit inspector">
        <template v-if="selectedRow && selectedWorktree">
          <section class="inspector-hero">
            <span class="eyebrow">Selected commit</span>
            <h2>{{ selectedRow.message }}</h2>
            <p>{{ selectedRow.sha }} · {{ selectedRow.detail }}</p>
          </section>

          <section class="inspector-actions">
            <button class="primary-action" type="button" @click="openDeployDrawer">Deploy agent</button>
            <button type="button">Push</button>
            <button type="button">Open PR</button>
          </section>

          <section class="inspector-section">
            <h3>Target worktree</h3>
            <div class="design-system-target-card">
              <strong>{{ selectedWorktree.name }}</strong>
              <code>{{ selectedWorktree.path }}</code>
            </div>
            <div class="fact-grid">
              <span>Branch</span><span>{{ selectedWorktree.branch ?? "detached" }}</span>
              <span>HEAD</span><code>{{ selectedWorktree.head }}</code>
              <span>Status</span><Badge :value="selectedWorktree.status" />
            </div>
          </section>

          <section class="inspector-section">
            <h3>Agents on this worktree</h3>
            <div v-if="selectedWorktreeSessions.length" class="design-system-agent-list">
              <button
                v-for="sessionItem in selectedWorktreeSessions"
                :key="sessionItem.id"
                type="button"
                :class="{ active: sessionItem.id === selectedSessionId }"
                @click="selectedSessionId = sessionItem.id"
              >
                <AgentChip :provider="sessionItem.provider" :mode="sessionItem.mode" />
                <Badge :value="sessionItem.state" />
              </button>
            </div>
            <div v-else class="empty-note">No agents on this worktree yet.</div>
          </section>

          <section class="session-panel" v-if="selectedSession">
            <header>
              <strong>{{ selectedSession.provider }} {{ selectedSession.mode }}</strong>
              <Badge :value="selectedSession.state" />
            </header>
            <div class="chat-pane">
              <div v-for="message in selectedSession.messages" :key="message.id" class="chat-message" :class="message.role">
                <span>{{ message.role }}</span>
                <p>{{ message.text }}</p>
              </div>
              <p class="small-note">Profile: {{ selectedSession.profile }} · cwd: {{ selectedSession.workingDirectory }}</p>
            </div>
          </section>
        </template>
      </aside>
    </div>

    <aside v-if="deployDrawerOpen && agentDraft" class="agent-drawer-panel" aria-label="Create agent drawer">
      <header>
        <div>
          <span class="eyebrow">Create agent</span>
          <h2>{{ selectedWorktree?.name ?? "No worktree" }}</h2>
        </div>
        <button type="button" @click="closeDeployDrawer">Close</button>
      </header>

      <section class="drawer-section">
        <span class="section-label">Provider</span>
        <div class="segmented-row">
          <button
            v-for="provider in providerOptions"
            :key="provider"
            type="button"
            :class="{ active: agentDraft.provider === provider }"
            @click="updateDraft({ provider })"
          >
            {{ provider }}
          </button>
        </div>
      </section>

      <section class="drawer-section">
        <span class="section-label">Permission</span>
        <div class="segmented-row stacked">
          <button
            v-for="option in permissionOptions"
            :key="option.profile"
            type="button"
            :class="{ active: agentDraft.profile === option.profile }"
            @click="choosePermission(option)"
          >
            <strong>{{ option.label }}</strong>
            <span>{{ option.description }}</span>
          </button>
        </div>
      </section>

      <section class="drawer-section">
        <label>
          <span class="section-label">Working directory</span>
          <input
            :value="agentDraft.workingDirectory"
            @input="updateDraft({ workingDirectory: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <p class="small-note">Default is the selected worktree path. This preview keeps the session mocked.</p>
      </section>

      <section class="drawer-section">
        <label>
          <span class="section-label">Task prompt</span>
          <textarea
            :value="agentDraft.prompt"
            @input="updateDraft({ prompt: ($event.target as HTMLTextAreaElement).value })"
          />
        </label>
      </section>

      <footer>
        <button type="button" @click="closeDeployDrawer">Cancel</button>
        <button class="primary-action" type="button" @click="createAgent">Create agent</button>
      </footer>
    </aside>
  </main>
</template>
