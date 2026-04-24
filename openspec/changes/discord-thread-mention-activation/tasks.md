## 1. Spec

- [x] 1.1 Define mention-driven continuation behavior for bound Discord threads.
- [x] 1.2 Define that Discord slash registration keeps only provider-specific `new` entrypoints.

## 2. Implementation

- [x] 2.1 Route thread mentions to the provider already bound to the thread.
- [x] 2.2 Strip bot mentions from the visible prompt before quoting/sending to the provider.
- [x] 2.3 Update slash command registration and README to remove thread `chat` from the primary UX.

## 3. Verification

- [x] 3.1 Add tests for mention-driven continuation and ignored plain thread messages.
- [x] 3.2 Run `bun run test`, `bun run check`, and `spectra validate "discord-thread-mention-activation"`.
