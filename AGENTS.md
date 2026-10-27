# Sherlock 项目约定

- 当用户说“本地启动看看”“构建给我测试”“测试一下最新版本”或同义表达时，必须走 `docs/sherlock-local-test-runbook.md`：使用 `./script/build_and_run.sh --verify` 构建并启动本地测试版，明确跳过 Apple 公证，不上传 Cloudflare、不修改公开更新源、不递增版本、不推送源码或标签；完成后必须核验真实 Sherlock 主界面而非只检查进程，并让应用保持打开供用户测试。
- 只有当用户明确说“更新上传发布正式版”“发布 Sherlock 正式版”“发布大版本”或明确要求对外发布/让现有用户升级时，才使用 `sherlock-release` 技能并完整执行 `docs/sherlock-formal-release-runbook.md`。这里的“发布大版本”指正式对外发行，不是日常本地预览。
- 若用户未指定版本，默认把当前正式版本的补丁号加一，例如 `0.6.3` 升到 `0.6.4`；发布前仍须与 Cloudflare 线上版本比较，禁止复用或降低版本号。
- 该触发语授权：同步当前开发成果到正式构建、修改版本号、运行聚焦检查、打包和签名、发布到 Sherlock 的 Cloudflare R2、验证公开更新源、提交并推送发布相关源码到既有 Fork 发布分支。
- 不要强行合并 `dataelement/dsh-desktop` 的上游 `main`，不要覆盖或提交无关的用户改动。
- 每次完成一项修改并通过相关聚焦验证后，必须创建本地 Git 提交；提交信息必须用中文清楚说明内容，不得把多个 session 的未确认改动混入同一提交。
- 多 session 功能必须按 `docs/sherlock-multi-session-integration-runbook.md` 交接、预检、集成和接受；本地 `main` 是日常集成权威，禁止自动上游同步。上游差异只在独立 `codex/upstream-sync/<YYYYMMDD>` 审阅流程处理。
- 功能 worktree 不得构建或替换共享 Sherlock 客户端。Plan A 集成工具现已生效；Plan B 的共享客户端来源/构建 runner 和 Plan C 的隔离功能预览尚未生效。Plan B 落地前，本地测试请求仍按本文件既有 `docs/sherlock-local-test-runbook.md` 规则执行。
- 正式构建只能从干净的本地 `main` 提交执行；若其他本地分支仍有尚未合并到 `main` 的提交，或其他 worktree 仍有未提交的修改，必须停止构建并先完成取舍、提交或合并。
- 当版本为 `1.0.0`、`2.0.0` 等大版本时，必须在正式构建提交上创建本地注释标签 `V1.0.0`、`V2.0.0`。未经用户明确授权，不得向远端推送任何版本标签，以免触发未配置的 GitHub Actions。
- 开发完成不要运行全功能测试；只运行发布手册列出的聚焦测试以及被本次改动直接影响的测试。
- 正式发布必须同步 `awake-ai-lab/homebrew-tap`：Cloudflare 公开验证通过后，用最终签名、公证和 staple 后的 DMG 运行 `scripts/update-homebrew-cask.mjs`，核对版本和校验值，创建中文提交并推送软件源，最后验证公开 Cask 与正式版本一致。Homebrew 同步尚未成功时，不得宣称整个正式发布已完成；保留已验证的 Cloudflare 发布并修复、重试软件源步骤，不覆盖同版本安装包。只要求本地测试或源码集成时不更新软件源。具体步骤见 `docs/sherlock-homebrew.md` 和正式发布手册。

- 按用户最新要求，发布时只做差分更新校验，不再执行全量下载、旧客户端全量升级或安装重启测试。使用真实公开 blockmap、单段 Range 和旧 ZIP 合成新包，验证 SHA-512；不触发全量回退测试。签名、包完整性、更新源及缓存校验继续保留。

## 1.1.1 优化基线与实验排除（2026-10-09）

- 用户明确将 Harness 后台能力、Windows 客户端、金融工作台预览三块内容暂存，仅作为实验；准确分支、提交及保留状态见 `docs/superpowers/parked/2026-10-09-ework-1.1.1-experiments.md`。
- 后续常规优化从 `sherlock-desktop` 的本地 `main` 继续；正式 1.1.1 产品基线为 `8e4a2d85b0848d926b666d8f03e630c1a545e47d`。不得从含上述实验的分支继续常规优化，也不得自动将这些实验及其后继提交合并、cherry-pick、同步、构建或发布到正式主干。
- 三块实验已完成“暂存并排除”的取舍，不列为常规优化的待合并/待验收事项，不因这些分支尚未合并而阻塞后续正常集成或发布；其他未处理的源码改动仍遵守原有门禁。保留实验分支、worktree 和证据，只有用户明确要求恢复对应实验后才重新交接、验收和集成。
- Harness 集成批次 `20261004-01` 已取消并归档租约，不得继续 accept/promote 或复用该批次；之前停放的 Harness 融合方案继续停放。
