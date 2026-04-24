## ADDED Requirements

### Requirement: Repo-owned tests are isolated from local side projects

AgentBridge SHALL define an explicit repo-owned test boundary so contributor CI does not execute unrelated local side-project tests.

#### Scenario: Vitest includes only repository test files

- **WHEN** a contributor runs `bun run test`
- **THEN** Vitest only executes tests under the repository-owned `test/` tree
- **AND** does not discover `minishop-benchmark-swarm*` or other unrelated local directories

### Requirement: Required CI validates the public contributor loop

AgentBridge SHALL ship a GitHub Actions workflow that validates the public contributor path without requiring live Discord or provider credentials.

#### Scenario: CI runs repository checks deterministically

- **WHEN** a pull request runs CI
- **THEN** the workflow runs typecheck, repo-owned tests, and build
- **AND** runs Spectra validation for the repository artifacts
- **AND** none of the required jobs depend on real Discord bot tokens or authenticated provider CLIs

### Requirement: Required CI pins runtime tool versions

AgentBridge SHALL pin the Bun version used by CI and verify the Spectra CLI version used by validation.

#### Scenario: CI fails on unexpected tool version drift

- **WHEN** CI installs Bun and Spectra
- **THEN** Bun uses the configured pinned version
- **AND** Spectra validation first checks the expected CLI version
