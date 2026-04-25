# Codex Daemon E2E Smoke

## Why

AgentHub and AgentBridge now depend on the Codex app-server path as the canonical Codex control plane. Unit tests cover the JSON-RPC adapter with a fake server, but they do not prove the real local `codex app-server` binary can be started and used by AgentBridge.

We need a developer-runnable smoke path that verifies the real Codex CLI integration without requiring Discord credentials in CI.

## What

- Add a gated real Codex app-server e2e test.
- Start `codex app-server` through `CodexAppServerSupervisor`.
- Send a deterministic prompt through `CodexAppServerAdapter`.
- Assert that a real thread id and expected marker output are returned.
- Keep the test skipped unless explicitly enabled by environment.
- Run the real daemon locally and verify it starts the Codex app-server path.

## Non-goals

- Do not make paid/network Codex calls mandatory in normal CI.
- Do not expose Discord tokens in tests or fixtures.
- Do not replace existing fake app-server unit tests.
