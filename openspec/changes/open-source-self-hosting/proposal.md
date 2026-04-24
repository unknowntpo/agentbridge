## Summary

AgentBridge should be productized as a self-hostable open-source tool rather than a single-user local repo workflow. Each user should run their own local daemon, bring their own Discord bot credentials, and consume the project through a stable `agentbridge` CLI package surface.

## Motivation

The current repo still exposes several private-worktree assumptions:

- package metadata marks the project private
- the documented entrypoints are repo-local and Bun-dev oriented
- CI does not exist
- `bun run test` is vulnerable to unrelated local side-project discovery
- support boundaries are implied from conversation history rather than documented

This makes it harder for outside users to install the package, understand what is stable, and contribute safely.

## Proposed Solution

Define one explicit public product contract for:

- self-hosted Discord bot ownership
- stable CLI packaging and install expectations
- provider and platform support boundaries
- CI validation scope
- repo-owned test boundaries

Then implement the minimum repo changes needed to make the package publishable and the repository contributor-friendly.

## Non-Goals

- Shipping a hosted multi-tenant AgentBridge service
- Claiming full cross-platform runtime parity in the first public release
- Adding live Discord or provider end-to-end checks to required CI
- Re-architecting provider runtimes beyond what is needed for packaging and documentation

## Capabilities

### New Capabilities

- `public-self-hosting-contract`: AgentBridge documents and enforces a self-hosted public product contract.
- `repo-ci-policy`: AgentBridge defines a reproducible CI policy for typecheck, repo-owned tests, build, and Spectra validation.

### Modified Capabilities

- `stable-local-cli-entry`: The public CLI packaging and install story becomes the supported entrypoint rather than a repo-local development script.

## Impact

- Affected specs:
  - New: `public-self-hosting-contract`
  - New: `repo-ci-policy`
  - Modified: `stable-local-cli-entry`
- Affected code:
  - New:
    - `.github/workflows/ci.yml`
    - `vitest.config.ts`
    - `LICENSE`
    - `openspec/changes/open-source-self-hosting/design.md`
    - `openspec/changes/open-source-self-hosting/specs/public-self-hosting-contract/spec.md`
    - `openspec/changes/open-source-self-hosting/specs/repo-ci-policy/spec.md`
    - `openspec/changes/open-source-self-hosting/tasks.md`
  - Modified:
    - `README.md`
    - `package.json`
    - `bin/agentbridge`
    - `.env.example`
