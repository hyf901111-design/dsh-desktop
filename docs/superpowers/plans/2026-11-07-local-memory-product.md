# 本地记忆防误用与产品接入 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. One final independent whole-change review; no implementer subagents. User already approved continuing this design through a local test build.

**Goal:** 无答案时不把相似记忆当作证据，在验证后接入本地语义检索、独立设置和可管理界面，构建并打开真实本地客户端供用户测试。

**Architecture:** 保留现有加密 SQLite、来源/版本/删除和账户 epoch。后台本地 worker 做语义+词法候选与 query/document 相关性判定；主进程再次校验身份、范围、状态、修订再打包。设置分别控制使用、自动保存和语义检索，失败时不注入未经判定的事实。

**Tech Stack:** Electron/Node、SQLite/FTS5/sqlite-vec、ONNX Runtime、现有 TypeScript 记忆服务和 preload 设置。

**Spec:** 用户本轮明确批准；`docs/superpowers/plans/2026-11-07-local-memory-alternative.md` 与 `docs/superpowers/reviews/2026-11-07-local-memory-alternative.md`。以下是批准方案的实施细化。

## Global Constraints

- 只运行本次直接涉及的聚焦测试及类型/包检查，不运行全功能单元测试。
- 不更改版本、不公证、不上传、不推送、不触碰无关功能；中文本地提交。
- 已在隔离 worktree，基于仍为 `9035f11cf` 的本地 main；产品完成后按多 session 交接/预检创建独立 integration 批次，feature worktree 不构建共享客户端。
- 用户授权本地构建和打开供测试；最终按 `./script/build_and_run.sh --verify`，核对真实主界面并保持打开。没有用户对具体成品的验收前，不自行执行 accept/promote。
- 已有记忆与 Markdown 文件保留；不为了验证清除用户数据。合成验收使用独立数据目录。
- 相关性分数不是事实置信度。阈值在校准集选择后冻结，独立验证不改题、不靠全部拒绝过关。
- 现有明确表达方式偏好单独作为行为背景，不能被当作事实问答证据；用户当前要求优先。共享会话仍不使用私人记忆。

## Review Focus

- 在途 embedding/评分时账户、项目、开关、版本改变：旧结果必须失效，不能拖住用户的设置/删除操作。
- 近似主题但缺少所问属性、反事实前提、时间/人物错位：应无事实记忆注入；正常改写仍可召回。
- 关闭自动保存但允许使用已有记忆，以及相反组合：重启后独立保持，运行时授权一致。
- 模型缺失、损坏、超时、worker 退出、索引重建中：状态真实，聊天继续，不泄露或注入未核验旧缓存。
- 手工修改、删除、来源跳转、账户切换和 Markdown 外部编辑：界面、加密源及索引一致；没有删除复活。

### Task 1: 可用证据判定与独立验证

**Files:** `experiments/local-memory-spike/relevance-*.mjs`、`experiments/local-memory-spike/answerability-heldout.json`、相关报告；后续共用模块放 `packages/dsh-memory-runtime/local/`。

**Interfaces:** 输入 query 与已授权候选；输出被判为直接相关的 `{id,score}`，失败输出空列表/明确状态。不从低相关候选生成新事实。

- [ ] 写并冻结新的正负例：同项目缺属性、无答案、否定、混合语言、多来源与指令夹带。旧 46 题仅用于校准；原 24 新题与新增独立题用于验收。
- [ ] 先记录当前最近邻对无答案错误注入的 RED，再加入本地 cross-encoder 二阶段判定，验证模型分词/权重固定。
- [ ] 从校准集选择满足“无答案误用 0、正例完整覆盖 ≥90%”的最低阈值；无法满足则如实调整通用判定设计，不修改金标准。
- [ ] 独立集无答案误用 0、有答案完整覆盖 ≥90%、原 40 正例 ≥90%；保留完整原始候选和拒绝原因、时延。失败不接产品。
- [ ] 完成相关聚焦测试、报告与中文提交。

### Task 2: 本地运行时、缓存与服务接入

**Files:** `packages/dsh-memory-runtime/local/*`、`src/main/memory/{semantic,service,retriever,store}.ts`、`src/shared/memory.ts`、`src/main/index.ts`、依赖锁、模型准备/打包配置；对应 focused tests。

**Interfaces:** `MemorySettings` 增加 `semantic?:boolean`，`use/auto` 独立。`MemorySnapshot` 增加本地检索状态。可取消后台查询使用已捕获 ownerEpoch/scopeEpoch/revision，主进程提交前重新校验。模型文件从应用资源或受控用户数据路径加载，固定校验值。

- [ ] 先写失败测试：独立开关跨重启、无事实无答案、worker 迟到响应、删除/切换账户、故障降级和缓存修订。
- [ ] 实现后台 worker 与模型资源准备；首次建索引不阻塞 UI，缓存用现有系统安全存储保护，明文索引不落盘；空闲释放。
- [ ] 在现有服务接入，经 worker 返回后再做有效状态与版本检查；保留现有人工锁、来源、删除抑制和 runtime request-context 协议。
- [ ] 运行受影响记忆服务/搜索/runtime 测试与 typecheck，修复后中文提交。

### Task 3: 前端记忆设置和管理

**Files:** `src/preload/memory/{view,style}.ts`、共享命令类型/IPC、语言文案及相关 view tests。

**Interfaces:** settings 独立布尔值；管理命令继续按 ID/revision，新增重建索引命令；来源沿用既有 bridge。视图保存未提交编辑与账户 epoch。

- [ ] 先写失败测试：两个开关互不联动、语义状态和重建、搜索/分类/项目/状态筛选、临时会话关闭、待确认采用/忽略、来源可访问。
- [ ] 实现上述控件与真实后端操作；保留 Markdown 入口和明文说明；新增/编辑/删除可直接使用，索引模型准备状态不伪装完成。
- [ ] 运行记忆 view/source/bridge 及直接受影响测试，中文提交。

### Task 4: 复核、集成本地构建和真实验收

**Files:** 交接元数据、集成检查与本轮验证报告；不混入其他候选分支。

- [ ] 按 executing-plans 做一次独立完整改动复核，修正重要发现并聚焦验证。
- [ ] 生成精确 feature tip 交接卡，通过只读预检后创建本轮独立 integration 批次并合并；只运行记忆范围检查。
- [ ] 从集成工作区 `./script/build_and_run.sh --verify` 构建，跳过公证；最终包检查通过。
- [ ] 在合成账户/独立数据下验证设置保存重开、正例记忆应用、无答案不注入、编辑删除和重启；再打开保留用户数据的真实主界面供用户测试。
- [ ] 记录产物、证据、精确提交及尚未由用户接受状态。保持客户端打开，不擅自 promote/main、push 或正式发布。
