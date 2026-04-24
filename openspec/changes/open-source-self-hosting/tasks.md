## 1. Spec

- [x] 1.1 Define the public self-hosting contract and support matrix.
- [x] 1.2 Define the repository CI policy and repo-owned test boundary.

## 2. Implementation

- [x] 2.1 Update package metadata and the public bin boundary for package distribution.
- [x] 2.2 Add a repo-owned Vitest config that excludes unrelated local side-project directories.
- [x] 2.3 Rewrite the README and example environment guidance around self-hosting and public install flow.
- [x] 2.4 Add a GitHub Actions workflow for typecheck, unit tests, build, and Spectra validation.
- [x] 2.5 Add an open-source license file.

## 3. Verification

- [x] 3.1 Run `bun run check`.
- [x] 3.2 Run `bun run test`.
- [x] 3.3 Run `bun run build`.
- [x] 3.4 Run `spectra validate "open-source-self-hosting"`.
