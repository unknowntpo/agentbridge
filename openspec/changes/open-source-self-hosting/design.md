## Summary

The first open-source-facing release should present AgentBridge as a self-hosted local daemon plus Discord bot integration, with a stable package surface and a deterministic CI pipeline. The design should harden the repo around a public contributor experience without over-claiming provider or platform parity.

## Product Model

### Self-hosting contract

AgentBridge is not a hosted bot service. The public model is:

1. each user creates their own Discord bot application
2. each user configures their own local `.env`
3. each user runs their own local AgentBridge daemon
4. each installation owns its own SQLite state and trusted workspaces

This should be explicit in docs and specs so the project does not read like one personal machine image.

### Support matrix

The public support matrix should be intentionally narrow:

| Area | Status |
|------|--------|
| Codex provider | stable |
| Gemini provider | experimental |
| macOS | stable |
| Linux | planned |
| Windows | planned later |

The repo should be structured so broader support is possible later, but the first public contract should not claim more than current implementation maturity.

### Discord channel default

The Discord runtime must be default-deny. `AGENTBRIDGE_ALLOWED_CHANNEL_IDS` is required for accepting Discord commands or mentions. An empty allowlist is valid for local-only usage, but Discord events must be rejected when no allowed channels are configured.

This prevents a newly self-hosted bot from accepting requests in every channel it can see.

## CLI Packaging Boundary

The public entrypoint should be `agentbridge`, not a repo-local shell snippet.

### Requirements

- package metadata must no longer be private
- published package contents should include only the runtime payload needed by users
- the package bin should execute the built CLI artifact when present
- local development may still fall back to the source tree when `dist/` has not been built
- the package should explicitly expose no library API until a stable programmatic contract exists

This keeps one public command while preserving local development ergonomics.

### Why not keep a TypeScript runtime shim

The previous `bin/agentbridge` shell path depended on a separate TypeScript runtime shim, which creates a second backend runtime path beside Bun. That is not appropriate for a Bun-owned CLI and daemon.

The bin should instead prefer `dist/cli.js`, falling back to `bun src/cli.ts` only inside the repo.

If neither exists, it should fail with a direct reinstall/build message.

## Test Boundary Design

The repository contains unrelated local side-project directories such as `minishop-benchmark-swarm*`. CI should never discover or execute tests from those trees.

The fix should be explicit:

- run tests through Bun's native test runner
- include only `test/**/*.test.ts`
- exclude side-project directories, `dist/`, `openspec/`, and other non-runtime paths

This turns `bun run test` into a reproducible contributor command rather than a machine-dependent crawl.

## CI Design

### Required CI jobs

The minimum blocking workflow should include:

1. `typecheck`
   - `bun run check`
2. `unit`
   - `bun run test`
3. `build`
   - `bun run build`
4. `spectra`
   - `spectra validate --all`

### Runner choices

The repo-owned Bun jobs can run on `ubuntu-latest`.

Spectra CLI is currently distributed on the maintainer machine as a macOS app-backed binary, so the MVP CI path should run Spectra validation on `macos-latest` and install the CLI there. This keeps CI reproducible without pretending a Linux install path has already been standardized.

### Why not live integration CI

Required CI should not depend on:

- real Discord bot tokens
- logged-in Codex or Gemini CLIs
- live external network interactions beyond install/setup

Those are better left to local or later non-blocking smoke workflows.

## Documentation Shape

The README should be reorganized around:

1. what AgentBridge is
2. current support matrix
3. install
4. self-hosted Discord bot setup
5. local provider setup
6. runtime configuration
7. usage examples
8. contributor workflow and CI

This is more appropriate for outside users than a repo-owner memory aid.

## Public Config Guidance

The docs and example environment file should explain:

- required Discord fields
- provider command fields
- trusted workspace syntax
- the fact that trusted workspaces are per-installation, not shared global policy

Trusted workspaces should continue to use explicit `id:path` pairs. This keeps the public UI stable even when local paths differ across machines.
