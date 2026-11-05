# Sherlock 多会话集成运行手册

本手册从功能 worktree 到本地 `main` 的接受与保留，所有 Git 操作仅限本地。Plan A 的交接、预检、批次、租约和集成工具现在生效；Plan B 的共享客户端源码/来源构建器尚未生效，Plan C 的隔离功能预览尚未生效。在 Plan B 落地前，当前 `AGENTS.md` 的本地测试运行手册继续有效；功能 worktree 绝不能构建或替换共享 Sherlock 客户端。

不会在本流程中执行 `pull`、`push`、`rebase`、`reset`、强制删除分支或 worktree。`main` 是本地集成权威；上游同步另见 Git 规范。

## 1. 功能分支与交接

从当前本地 `main` 创建一个独立 worktree，并在功能完成、源码干净且已完成直接相关验证后作中文提交：

```bash
git worktree add -b codex/feat/<slug>-<YYYYMMDD> ../sherlock-<slug> main
git -C ../sherlock-<slug> commit -m "功能：完成 <功能说明>"
```

交接卡绑定完整 base SHA、当前 feature tip 和检查证据：

```bash
npm run git:handoff -- --repo ../sherlock-<slug> --base <full-main-sha> --metadata ./handoff-metadata.json --output ./handoff-<slug>.json --format json
```

交接卡不是提交的替代品。分支或 tip 变化、worktree 变脏、提交范围不再精确时，重新运行交接，不能修改旧卡片以伪造新状态。

## 2. 建立或接管集成批次

集成分支固定为 `codex/integration/<YYYYMMDD>-<NN>`。新建批次由 canonical `main` 创建 worktree；`--dry-run` 只输出计划，不创建 worktree、分支、清单或租约。

```bash
npm run git:integration -- create --repo /absolute/path/to/canonical-main --worktree /absolute/path/to/integration-20260831-01 --batch 20260831-01 --handoff /absolute/path/to/handoff-a.json --checks /absolute/path/to/integration-checks.json --dry-run --json
npm run git:integration:preflight -- --repo /absolute/path/to/canonical-main --phase prepare
npm run git:integration -- create --repo /absolute/path/to/canonical-main --worktree /absolute/path/to/integration-20260831-01 --batch 20260831-01 --handoff /absolute/path/to/handoff-a.json --checks /absolute/path/to/integration-checks.json
```

仅当 Git 已登记的同名 integration worktree 精确位于当前本地 `main` tip、没有清单且没有冲突租约时才可接管：

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase prepare
npm run git:integration -- adopt --repo /absolute/path/to/integration-20260831-01 --batch 20260831-01 --handoff /absolute/path/to/handoff-a.json --checks /absolute/path/to/integration-checks.json
```

## 3. 预检、合并与继续

每次变更前先运行只读预检。预检的 `--json` 只写 stdout；错误诊断只写 stderr。

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase merge --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --feature codex/feat/<slug>-<YYYYMMDD> --json
npm run git:integration -- merge --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --feature codex/feat/<slug>-<YYYYMMDD>
```

若合并冲突，执行器保留冲突和租约，并以 `INTEGRATION CONFLICT` 输出两侧提交上下文。解决冲突后先预检、再继续；不要 abort、reset 或删除现场：

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase continue --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --feature codex/feat/<slug>-<YYYYMMDD>
npm run git:integration -- continue --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --feature codex/feat/<slug>-<YYYYMMDD>
```

## 4. 所有权恢复与 main 同步

中断的 owner 只能在确认同一批次和精确集成 tip 后恢复；不要手改 common-dir lease 或 owner token。

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase recover-owner --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --commit <exact-integration-sha>
npm run git:integration -- recover-owner --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --confirm-batch 20260831-01 --confirm-tip <exact-integration-sha>
```

若 `main` 已前进，必须先把其变更由执行器记录到批次，随后重新验证合并结果：

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase sync-main --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --main-worktree /absolute/path/to/canonical-main
npm run git:integration -- sync-main --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json
```

若 `sync-main` 保留了 main 冲突，先在集成 worktree 中解决并提交合并，保留 `MERGE_HEAD` 指定的 main 父提交。然后调用执行器 API `continueIntegrationMain`，提供原批次 ID、该完整 main SHA、持久 owner token 并先 `dryRun: true`。该入口只接受干净的双父提交边界（第一个父提交必须是活动租约 tip，第二个必须是明确确认的规范 main 历史），要求原 manifest 字节未变，并重新执行声明检查；之后由执行器记录同步与 CAS 推进租约。不要手改 manifest 或 lease。恢复已记录边界后，再正常 `sync-main` 到 canonical main 的最新提交。

### 恢复已合入的历史登记

若当前规范 `main` 已随某个功能分支合入，或多个预览合并之后才补完整批次验证，先用以下命令核对历史边界：

```bash
npm run git:integration -- reconcile-records --repo <integration-worktree> --manifest <manifest> --confirm-batch <batch> --confirm-tip <current-integration-sha> --confirm-main <current-main-sha> --dry-run --json
```

执行器验证持久 owner、精确提交、干净工作树及原合并边界。待登记功能必须是历史双父合并的精确第二父提交，且交接卡仍与该功能分支匹配。确认 dry-run 后去掉该参数，执行器在当前集成提交上统一执行一次完整的声明检查。全部通过后提交历史登记，分别记录原合并提交和实际验证提交，再更新租约。后续仍须通过接受预检并取得用户对精确集成 tip 的验收。

历史补登记会收集本轮所有失败的检查组；任何一组失败都不会写入清单或租约。

## 5. 接受、晋升与取消

用户先在批准的共享客户端中接受精确 integration tip；Plan B 到位前不在 feature worktree 构建共享客户端。接受只记录元数据，不推进 `main`：

接受和晋升预检中，已登记合并的功能分支可以继续开发。只有原交接 tip 仍是该分支的祖先、原双父合并在集成第一父提交历史中且第二父提交精确匹配交接 tip、验证提交位于该合并之后并包含于当前集成时，才按原交接范围核对提交、文件和检查证据。报告明确列出留待另行交接的后继 tip；不会自动合入后继、移动引用或改写交接卡。分支回退、改写、脏工作树及不匹配的历史证据仍阻止验收。新功能的 merge/continue 预检继续要求 live tip 精确匹配。

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase accept --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --commit <accepted-integration-sha>
npm run git:integration -- accept --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --commit <accepted-integration-sha> --confirm-batch 20260831-01
```

只有已接受、clean 且可 fast-forward 的 canonical `main` 才可晋升。先使用 dry run，确认后执行真实晋升：

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase promote --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --commit <accepted-integration-sha> --main-worktree /absolute/path/to/canonical-main
npm run git:integration -- promote --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --main-worktree /absolute/path/to/canonical-main --confirm-batch 20260831-01 --confirm-tip <accepted-integration-sha> --dry-run
npm run git:integration -- promote --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --main-worktree /absolute/path/to/canonical-main --confirm-batch 20260831-01 --confirm-tip <accepted-integration-sha>
```

若用户明确放弃该批次，保留 worktree、分支与记录，仅以显式取消归档租约：

```bash
npm run git:integration:preflight -- --repo /absolute/path/to/integration-20260831-01 --phase cancel --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json
npm run git:integration -- cancel --repo /absolute/path/to/integration-20260831-01 --manifest /absolute/path/to/integration-20260831-01/config/sherlock-integration-batches/20260831-01.json --confirm-batch 20260831-01 --explicit-cancellation
```

## 恢复和保留策略

- 保留的冲突：保留 `MERGE_HEAD`、分支和 worktree；修复后执行 `continue`，或由用户明确取消。
- 部分清单记录或 CAS：不要手改 JSON、lease 或 ref；用同一 manifest 和精确 tip 运行相应 `continue`，必要时 `recover-owner`。`INTEGRATION RECOVERY_REQUIRED` 表示现场仍可检查。
- 中断所有权：仅使用 `recover-owner` 的 batch/tip 双重确认。token 丢失或状态不精确时保留现场并进行人工审阅。
- 陈旧的未来构建锁：Plan B 的共享构建锁尚未生效；届时只能由其 runner 诊断并释放确认过的陈旧锁，不能从功能 worktree 绕过来源门禁。
- 已取消批次：保持取消归档、分支和 worktree 可检查；新需求新建新批次，不复用取消批次。
- 旧治理前 worktree：不得启动共享客户端。保留以检查或完成独立提交；需要继续开发时，从当前本地 `main` 新建合规 feature worktree 并重新交接。

## 稳定退出码与输出

| 退出码 | 含义 | stdout / stderr 约定 |
| --- | --- | --- |
| 0 | 成功、帮助或已计划的 dry run | `--json` 为单一 JSON stdout；非 JSON 的成功使用稳定 `INTEGRATION ...` / `PREFLIGHT PASSED` token |
| 1 | 只读预检阻止操作，或 lifecycle 的策略/状态拒绝 | preflight 在 stdout 写 `PREFLIGHT BLOCKED` 和 findings；lifecycle 拒绝的诊断写 stderr，stdout 为空 |
| 2 | 无效 CLI 参数、输入或 schema/执行错误 | 诊断仅写 stderr，stdout 为空 |
| 3 | 保留的合并冲突结果 | 非 JSON lifecycle stdout 以 `INTEGRATION CONFLICT` 开始，并提供冲突提交上下文 |
| 4 | 必须显式恢复的结果 | 非 JSON lifecycle stdout 以 `INTEGRATION RECOVERY_REQUIRED` 开始，现场不会被删除 |

使用 `--help` 获取可执行参数面：

```bash
npm run git:handoff -- --help
npm run git:integration:preflight -- --help
npm run git:integration -- --help
```

## 已合并功能的后续修复

### 仅供本地测试的聚焦预览

当用户只要求本地测试且不允许重跑历史功能检查时，执行器 API `mergeIntegrationFeature` 可显式传入 `previewOnly: true`，先 `dryRun: true` 再执行。它仍执行正常合并预检、所有权检查和功能交接卡中的全部检查，创建并保留合并提交，但不会写入 `merged` 完整批次验证记录；`accept` 和 `promote` 继续阻止未完整验证的批次。

如果已有解决冲突后提交的未记录合并，使用 `continueIntegrationPreview`，提供同一持久 owner token、精确 `confirmBatchId` 和 `confirmTip`，先 dry run。它只接受父提交精确匹配租约和原交接 tip 的干净合并边界，运行原功能聚焦检查后推进预览租约，不更改清单或伪造完整批次验证。原功能分支可以已有严格后继，以便随后通过正常 `refreshIntegrationHandoff` 更新交接卡。

预览完成后仍按本地测试构建手册启动；不得把 `preview-ready` 当作正式验收。未来正式集成仍须使用原有 `continue` 完整验证当前声明检查。此入口不替代 Plan B 的共享构建器或 Plan C 的隔离预览。

验收前功能分支继续修复时，先重新生成交接卡，再使用受所有权和精确 tip 保护的更新入口。旧卡和证据保留在 Git 历史；新卡必须是同一分支、以原交接 tip 为基线的严格后继，更新后必须重新执行 merge、accept、promote。已接受批次不能刷新。

```bash
node scripts/refresh-sherlock-integration-handoff.mjs --repo <integration-worktree> --manifest <manifest> --handoff <new-card> --confirm-batch <batch> --confirm-tip <current-integration-sha> --dry-run
```

确认 dry-run 后去掉该参数执行。此入口不接受脏工作区，不改变功能引用，也不复用旧 tip 的检查结论。

## 向未验收批次追加独立功能

执行器 API `appendIntegrationHandoff` 可追加另一张有效交接卡。调用前仍需检查工作区干净；使用已有持久 owner token，并精确提供 `confirmBatchId` 与 `confirmTip`，先 `dryRun: true` 再执行。该入口拒绝已验收批次、重复功能、失效交接卡及错误所有者；保留原功能与合并证据，把新功能的检查加入批次。追加只登记交接卡，后续仍须执行 `merge` 预检与合并，并由用户验收；不得手改清单或释放租约来代替此流程。
