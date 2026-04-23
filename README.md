# AgentBridge

Bridge Discord conversations into a local Codex session on macOS.

## Runtime

This project is Bun-first:

- install: `bun install`
- test: `bun test` is not used here; run `bun run test`
- typecheck: `bun run check`
- build: `bun run build`
- start: `bun run start`

Bun is the single tool for install, task running, and app startup.

## Discord Setup

1. Go to <https://discord.com/developers/applications>.
2. Create a new application.
3. Open the **Bot** tab and create a bot user.
4. Under **Privileged Gateway Intents**, enable:
   - Message Content Intent
5. Copy the bot token into `.env` as `DISCORD_TOKEN`.
6. Open **OAuth2 > URL Generator**.
7. Select scopes:
   - `bot`
8. Select bot permissions:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Create Public Threads` if you want the bot to help in thread-based workflows
   - `Send Messages in Threads`
9. Open the generated URL and invite the bot to your server.
10. Optionally set `AGENTBRIDGE_ALLOWED_CHANNEL_IDS` to a comma-separated list of allowed channel ids. For thread traffic, the adapter also accepts threads whose parent channel is in that allowlist.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Ensure `codex` is installed and logged in locally.
3. Install dependencies:

```bash
bun install
```

4. Run tests and typecheck:

```bash
bun run test
bun run check
```

5. Start the bridge:

```bash
bun run start
```

## Discord Usage

- Start a session: `discord summarize this repo`
- Or explicitly: `/codex new`
- Status: `/codex status`
- Reset: `/codex reset`
- Stop: `/codex stop`

## Notes

- State is stored in SQLite with WAL mode enabled.
- The bridge uses `codex exec --json` and `codex exec resume ... --json`.
