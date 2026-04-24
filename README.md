# AgentBridge

AgentBridge is a self-hosted Discord bridge for local Codex and Gemini CLI workflows. You run your own local daemon, bring your own Discord bot, and keep execution and state on your machine.

## Support Matrix

- Codex provider: stable
- Gemini provider: experimental
- macOS: stable
- Linux: planned
- Windows: planned later

## Install

AgentBridge is Bun-first. The supported public entrypoint is the `agentbridge` CLI.

- Runtime prerequisite: Bun
- Install dependencies in a clone: `bun install`
- Local package-style entry: `agentbridge ...`
- Repo-local fallback during development: `./bin/agentbridge ...`

Core repo commands:

- test: `bun test` is not used here; run `bun run test`
- typecheck: `bun run check`
- build: `bun run build`
- start: `bun run start`

## Self-Hosted Model

Each installation owns its own:

- Discord bot application and token
- local `.env`
- local SQLite state
- trusted workspace catalog
- local provider login state

AgentBridge does not provide a hosted shared bot service.

## Discord Setup

1. Go to <https://discord.com/developers/applications>.
2. Create a new application.
3. Open the **Bot** tab and create a bot user.
4. Under **Privileged Gateway Intents**, enable:
   - Message Content Intent
5. From **OAuth2 > General**, copy:
   - `Client ID` into `DISCORD_CLIENT_ID`
   - your server id into `DISCORD_GUILD_ID` if you want slash commands to register immediately for that server
6. From the **Bot** tab, copy the bot token into `.env` as `DISCORD_TOKEN`.
7. Open **OAuth2 > URL Generator**.
8. Select scopes:
   - `bot`
9. Select bot permissions:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Create Public Threads` if you want the bot to help in thread-based workflows
   - `Send Messages in Threads`
10. Open the generated URL and invite the bot to your server.
11. Set `AGENTBRIDGE_ALLOWED_CHANNEL_IDS` to a comma-separated list of channel ids where AgentBridge may respond. Empty means default-deny. For thread traffic, the adapter also accepts threads whose parent channel is in that allowlist.
12. Set `AGENTBRIDGE_DISCORD_SUMMARY_CHANNEL_ID` to the parent channel that should receive local attach threads.
13. Optionally set `AGENTBRIDGE_DISCORD_SUMMARY_MENTION_USER_ID` if local attach threads should begin by mentioning your Discord user.

## Local Provider Setup

1. Copy `.env.example` to `.env`.
2. Ensure `codex` is installed and logged in locally for the stable provider path.
3. Optionally install `gemini` if you want to use the experimental Gemini path.
4. Fill `.env` with your Discord credentials. Slash command registration uses `DISCORD_CLIENT_ID` and works fastest when `DISCORD_GUILD_ID` is set.
5. Keep the app-server settings in `.env` aligned across daemon and local attach commands:
   - `AGENTBRIDGE_CODEX_APP_SERVER_HOST`
   - `AGENTBRIDGE_CODEX_APP_SERVER_PORT`
   - `AGENTBRIDGE_CODEX_APP_SERVER_APPROVAL_POLICY`
6. Configure trusted workspaces for Discord session creation:
   - `AGENTBRIDGE_TRUSTED_WORKSPACES=id:/absolute/path,id2:/absolute/path`
   - Example:
     - `AGENTBRIDGE_TRUSTED_WORKSPACES=repo:~/repo,myproject:~/src/myproject`
   - The `id:path` format keeps Discord-facing workspace selection stable even when local machine paths differ.
7. Install dependencies:
```bash
bun install
```

8. Run tests and typecheck:

```bash
bun run test
bun run check
```

9. Start the bridge:

```bash
bun run start
```

## Runtime Configuration

Required environment fields:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `AGENTBRIDGE_ALLOWED_CHANNEL_IDS`

Strongly recommended:

- `DISCORD_GUILD_ID`
- `AGENTBRIDGE_TRUSTED_WORKSPACES`

Provider-related configuration:

- `AGENTBRIDGE_DEFAULT_PROVIDER`
- `AGENTBRIDGE_CODEX_COMMAND`
- `AGENTBRIDGE_GEMINI_COMMAND`

`AGENTBRIDGE_CODEX_APP_SERVER_HOST` must remain loopback (`127.0.0.1`, `localhost`, or `::1`) because AgentBridge currently uses plain `ws://` app-server traffic.

## Discord Usage

- Start a fresh thread-bound session from a parent channel: `/codex new prompt:<your prompt> workspace:<trusted-id-or-absolute-path> profile:<workspace-read|workspace-write|full-access>`
- Continue inside that bound thread by mentioning the bot: `@agentbridge <your prompt>`
- Gemini follows the same shape: `/gemini new prompt:<your prompt> workspace:<trusted-id-or-absolute-path> profile:<workspace-read|workspace-write>` to create the thread, then `@agentbridge <your prompt>` inside that thread to continue it.
- `full-access` maps to Codex `danger-full-access` and is high risk. It can grant broad local filesystem access, so Discord requests using it are queued for local approval.

## Local CLI Usage

- Start the daemon first with `bun run start`. The daemon supervises a self-hosted `codex app-server`.
- Stable local entries:
  - `agentbridge session list`
  - `agentbridge session new --prompt "<text>" --provider codex|gemini --workspace <id-or-path> --profile <workspace-read|workspace-write|full-access>`
  - `agentbridge session open --latest --provider codex|gemini`
  - `agentbridge session attach --cwd "$PWD"`
  - `agentbridge approvals list`
  - `agentbridge approvals approve <requestId>`
- Optional sugar: startup installs `~/.codex/prompts/agentbridge.md`; if Codex CLI exposes that prompt, it delegates to the same `session attach` command.
- `session new` starts a fresh AgentBridge-managed provider session directly from local CLI, creates a Discord thread, persists the binding, and then opens a local interactive CLI against that managed session. Use `--provider gemini` for Gemini or omit it to use the configured default provider. Use `--no-open` to skip launching the local CLI.
- `session open` reopens an existing AgentBridge-managed session in local interactive CLI. Use `--latest`, `--session-id <id>`, or `--discord-thread-id <id>`. Add `--provider gemini` to restrict selection to Gemini bindings.
- `session attach` discovers the most recent unmanaged local Codex session for the current working directory, summarizes its visible user/assistant chat, creates an AgentBridge-managed app-server thread, creates a Discord thread under `AGENTBRIDGE_DISCORD_SUMMARY_CHANNEL_ID`, and binds that Discord thread to the managed Codex thread.
- `session list` prints attachable local Codex sessions as tab-separated rows: `sessionId`, `updatedAt`, `cwd`, `threadName`.
- `approvals list` prints pending high-risk Discord requests with their full local `requestId` and short Discord-visible `ref`.
- `approvals approve <requestId>` materializes a queued high-risk Discord request into a managed session and thread. Approving a `full-access` request grants the provider the elevated profile shown in the approval details.

## Contributor Workflow

Repository-owned checks:

```bash
bun run check
bun run test
bun run build
```

CI validates:

- typecheck
- repo-owned Vitest tests
- build
- Spectra validation

The test boundary is intentionally limited to the repository `test/` tree so local side-project directories do not leak into CI.

## Notes

- State is stored in SQLite with WAL mode enabled.
- The daemon supervises its own `codex app-server` on `ws://AGENTBRIDGE_CODEX_APP_SERVER_HOST:AGENTBRIDGE_CODEX_APP_SERVER_PORT`.
- Existing Discord bindings from the old `codex exec` backend are treated as legacy; start a fresh `/codex new` thread to migrate them.
- Local `/agentbridge` prompt installation uses `~/.codex/prompts/agentbridge.md`, but the stable entry is `agentbridge session attach`.
