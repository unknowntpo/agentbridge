## 1. Spec

- [x] 1.1 Define the local `/agentbridge` prompt behavior and the one-shot Discord session summary export requirements.

## 2. Implementation

- [x] 2.1 Implement local Codex session discovery and visible-chat summary generation from session JSONL files.
- [x] 2.2 Implement one-shot Discord thread publishing for local session summaries.
- [x] 2.3 Wire a CLI subcommand for session summary export and install `~/.codex/prompts/agentbridge.md`.

## 3. Verification

- [x] 3.1 Add tests for session discovery, summary generation, and local prompt installation.
- [x] 3.2 Run `bun run test`, `bun run check`, and `spectra validate "local-agentbridge-session-summary"`.
