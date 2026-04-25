# AgentHub Real Agent Deploy

## Why

The desktop dashboard can model agent sessions, but the create-agent drawer still falls back to mock state. AgentHub needs one concrete provider path so the frontend, Tauri command layer, and AgentBridge CLI share the same contract.

## What Changes

- Add an `agentbridge agent deploy` command that returns the same session shape used by AgentHub.
- Add a Tauri `deploy_agent` command that invokes the CLI contract from the desktop app.
- Wire the create-agent drawer to use real Codex app-server deployment, with mock fallback only when the backend command fails.
- Keep non-Codex providers visible as future options, but fail fast for real deploy until implemented.

## Out Of Scope

- Streaming live chat turns after session creation.
- Gemini and Claude real provider launch.
- Durable session persistence in the AgentHub frontend.
