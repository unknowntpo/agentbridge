# AgentHub TUI/CLI Workflow 驗證報告

驗證日期：2026-04-27  
驗證目標：確認目前 AgentHub TUI/CLI workflow 是否支援使用者期待的完整流程，並檢查 auto-sync / `fs.watch` 是否真的覆蓋。

## 驗證命令

- `bun test test/agenthubTuiCli.test.ts`
- `bun test test/agenthubCli.e2e.test.ts`
- `bun test test/agenthubAgentDeploy.test.ts`
- `bun run check`
- `spectra validate "agenthub-tui-real-git-sync"`

## 結果摘要

- `bun test test/agenthubTuiCli.test.ts` 通過。
- `bun test test/agenthubCli.e2e.test.ts` 其中 project create / scan 通過，deploy 測試因 `loopback` 條件被 skip。
- 追加升權驗證：`bun test test/agenthubCli.e2e.test.ts` 在允許 loopback 後 deploy e2e 通過。
- `bun test test/agenthubAgentDeploy.test.ts` 通過，已驗證 agent deploy 的核心邏輯。
- `bun run check` 通過。
- `spectra validate "agenthub-tui-real-git-sync"` 通過。

## 逐項結論

1. 目前 CLI 是否能完成 project create。
- 可以。
- 直接驗證：`test/agenthubCli.e2e.test.ts` 的 `project create` 通過。
- 程式碼路徑：`[src/cli.ts](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/cli.ts:113)` 的 `project create` 會呼叫 `createProject(...)`。

2. 目前 CLI 是否能完成 worktree create。
- 可以。
- 直接驗證：`test/agenthubCli.e2e.test.ts` 的 `worktree create` 通過。
- 程式碼路徑：`[src/cli.ts](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/cli.ts:163)` 的 `worktree create` 會呼叫 `createWorktree(...)`。

3. 目前 CLI 是否能完成 agent deploy。
- 可以。
- 直接驗證：`test/agenthubAgentDeploy.test.ts` 通過，確認 deploy 核心模型與 provider adapter 串接正常。
- 直接驗證：一般 sandbox 測試中 `test/agenthubCli.e2e.test.ts` 的 deploy case 會因 `canListenOnLoopback()` 為 false 而 skip；升權允許 loopback 後，fake Codex app-server deploy e2e 通過。
- 程式碼路徑：`[src/cli.ts](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/cli.ts:132)` 的 `agent deploy` 會呼叫 `deployAgentHandler(...)`。

4. 目前 CLI/session 是否有 chat/open handoff 能力。
- 有，但分散在不同入口，不是單一命令。
- `session new` 可建立新的 managed session。
- `session open` 可開啟既有 managed session。
- `session attach` 可把既有本機 Codex session bootstrap 成 managed thread。
- Discord/bridge 端另外已有 `/codex chat` 的續聊路徑，測試也有覆蓋。
- 相關測試：`test/sessionNew.test.ts`、`test/sessionOpen.test.ts`、`test/sessionAttach.test.ts`、`test/agentBridge.test.ts`、`test/discordGatewayAdapter.test.ts`。

5. 目前 TUI 是否能直接做上述 lifecycle 操作。
- 不能。
- 目前 TUI 只做 workflow / project scan 的瀏覽與視圖切換，沒有 project create、worktree create、agent deploy、session open/attach 的互動入口。
- 相關程式碼：`[src/tui/WorkflowTui.tsx](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/tui/WorkflowTui.tsx:13)` 只有視圖、游標與模型更新，沒有 lifecycle action。

6. 目前 TUI 是否已移除 manual refresh。
- 是，已移除。
- `WORKFLOW_TUI_CONTROLS` 目前只列出 tab、1-5、q，沒有 refresh 按鍵。
- `WorkflowTui` 內也沒有 manual refresh 的輸入處理。

7. auto-sync 是否存在並合理。
- 存在，且已補直接測試。
- CLI 端：`[src/cli.ts](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/cli.ts:512)` 會在 `--project` interactive TUI 模式把 `createProjectModelSubscriber(...)` 注入 TUI。
- Auto-sync 模組：`[src/tui/projectModelSubscriber.ts](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/tui/projectModelSubscriber.ts:19)` 使用 `fs.watch(watchRoot, { recursive: true }, ...)`，並加上 polling fallback。這是必要的，因為 Bun runtime 在本環境的 `node:fs.watch` probe 沒有穩定觸發。
- TUI 端：`[src/tui/WorkflowTui.tsx](/Users/unknowntpo/repo/unknowntpo/agentbridge/main/src/tui/WorkflowTui.tsx:66)` 在 `subscribeModelUpdates` 回傳的 `onUpdate` 裡會 `setCurrentModel(nextModel)`、重置游標，並顯示 `project auto-refreshed`。
- 測試覆蓋：`test/agenthubTuiCli.test.ts` 已驗證 auto-sync 觀察到 project file change 後會 reload model，也驗證 TUI subscriber 收到新 model 後會重繪並顯示 `project auto-refreshed`。

8. 若目前沒有直接測試 `fs.watch` auto-refresh，請明確寫成缺口，建議要補哪個測試。
- 這個缺口已補。
- 新增測試覆蓋兩段：auto-sync watcher 觀察檔案變動並 reload model；TUI `subscribeModelUpdates` 收到新 model 後更新畫面。
- 仍需後續補更高層級 e2e：啟動 interactive TUI process，修改真實 Git branch/worktree，觀察 terminal UI 自動更新。這會比目前單元/整合測試更慢，適合獨立 smoke test。

9. 目前缺口與下一步實作建議。
- 需要補更高層級 interactive TUI smoke：啟動真 TUI、修改真 Git branch/worktree、觀察 terminal UI 自動更新。
- 需要再補一個穩定的非 sandbox deploy smoke，讓一般 `bun run test` 也能跑 CLI deploy e2e，而不是在 sandbox 裡 skip。
- 如果要把 TUI 真的變成 lifecycle 操作入口，還需要新增明確的 action layer，不只是 workflow preview。

## 最終判定

- project create：已支援。
- worktree create：已支援。
- agent deploy：已支援，核心測試通過；升權允許 loopback 後 CLI e2e deploy 通過。
- chat/open handoff：已支援，但分散在 `session new/open/attach` 與 Discord `/codex chat` 路徑。
- TUI lifecycle 操作：未支援，仍是 preview / scan 型態。
- manual refresh：已移除。
- auto-sync：已接上 `fs.watch` + polling fallback + TUI model update，並已有直接測試覆蓋 project file change reload 與 TUI 重繪。
