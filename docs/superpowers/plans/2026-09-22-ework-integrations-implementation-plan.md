# EWork Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

本项目默认由当前 agent 按 executing-plans 顺序实施；上方通用技能提示不自动授权启动其他 agent。

**Goal:** 让 Figma 中插件、应用、MCP、技能及四类市场在 EWork 右侧工作区实际可用，并接通真实对话、研究子会话与定时任务。

**Architecture:** Electron 主进程统一持有状态、凭据、网络连接与 MCP 进程，preload 只通过受信任的 typed IPC 管理。新增 Harness 插件注册工具代理和技能 provider，在能力展示与执行两处校验权限；目录与需要 confidential client 的 OAuth 由独立 Worker 承担。

**Tech Stack:** 现有 Electron 43.4.0、Node 24.9.0、TypeScript 5.9.3、Vitest、TypeScript DOM view、Cordis/Harness 0.1.0-rc.7；锁定并直接声明 MCP SDK；Cloudflare Worker/D1 用于目录及 OAuth Broker。

**Spec:** [客户端接入技术方案](../specs/2026-09-22-ework-integrations-technical-design.md)。实施前阅读本文与该方案；本文中的新增签名是约定，不代表仓库已存在这些接口。

## Global Constraints

- 开发目标为 `/Users/heyafeng/Documents/ChatGPT/sherlock-desktop`。本次核验基线 main `76f6350aec1a37bb284d681c3d971197360d96fc` / 1.0.6；执行前重新核验并从当时干净 main 创建 `codex/ework-integrations` worktree，不在旧 dsh 工作目录实现新版功能。
- 按目标仓库 `AGENTS.md` 与 `docs/sherlock-multi-session-integration-runbook.md` 集成；功能 worktree 不得替换共享客户端。只提交自己拥有的改动，不自动同步上游、不推送。
- 插件页在右侧工作区打开；保留左侧导航、返回、右侧屏展开/收起。列表行高 76px，上下内边距 12px，标题/说明间距 4px；移除业务装饰图标，保留操作图标。
- 四个 tab 为插件、应用、MCP、技能；入口分别为插件市场、应用市场、工具市场、技能市场。技能页面不出现创建插件。
- 更多先展开菜单；只有选择卸载才出现影响确认。技能导入先预览再提交。
- 主进程持有明文凭据；渲染层只接收掩码。API 默认 HTTPS、30 秒超时、8 MiB 响应、每连接并发 4；技能导入上限 2 MiB/文件、50 MiB/包、1000 个文件。
- 主进程单写者、原子文件与版本迁移；所有写操作带 requestId 和 expectedRevision。权限撤回对后续调用立即生效，不能仅靠列表刷新。
- 只运行本次直接相关测试及类型检查，不执行全功能单元测试。本轮交付仅为方案，不执行下面的开发、打包或部署命令。

## Review Focus

- 保存、测试、启停和断开交错发生：迟到成功不能复活已撤销连接，也不能覆盖新配置。由任务 1、2、6 验证。
- 第三方已接受写请求后网络中断：不能自动重试造成重复业务效果，也不能报告确定失败。由任务 5、7、9 验证。
- 恶意或损坏的导入文件、重定向和远程描述：不能逃逸目录、读取本地文件、携带认证跨域或绕过工具授权。由任务 3、4、5、8 验证。
- 切换 EWork 账号、工作区或研究子会话：不得沿用上一身份的连接，也不得从模型参数扩大权限。由任务 2、7、9 验证。
- 安装/迁移中断、机器休眠、Harness 重启：保留旧可用版本，恢复后不重复工具调用或补跑所有错过任务。由任务 4、8、9、10 验证。

---

## 交付拆分与依赖

这些子系统共享同一权限与运行时合同，按下列切片交付，禁止先交付一组无真实后端的静态页面。

| 切片 | 任务 | 独立验收结果 |
| --- | --- | --- |
| A 本地真实能力 | 1 → 2 → 3 → 5 → 4 → 6 | 从 UI 接入自有 API、MCP、技能，对话实际调用；启停与重启保持正确 |
| B 应用与分发 | 7、8，均依赖 A | Google/Notion 真实连接；四类市场使用真实目录，安装、更新、回退可用 |
| C 调度与兼容交付 | 9 → 10，依赖 A/B | 定时任务与研究调用同一能力；迁移和真实客户端验收完成 |

任务 3/4/5 可分别提交，先做任务 5 的共享网络政策，再做任务 4 的 MCP HTTP；每项先使指定失败用例成立，再实现、执行聚焦检查、以中文提交。下列所有实现路径相对 **sherlock-desktop**，当前 dsh 只保存方案。

## 共用接口与职责边界

在任务 1 定义元数据合同，在任务 2 定义调用合同。类型不能在 UI、主进程和 Harness 中各复制一套。

```ts
// src/shared/integrations.ts — 核心公共合同
type EntityKind = 'plugin' | 'connection' | 'skill';
type CatalogKind = 'plugin' | 'app' | 'tool' | 'skill';
type Effect = 'read' | 'write' | 'destructive' | 'unknown';
type WorkspaceGrant = { mode: 'selected'; workspaceIds: string[] }
  | { mode: 'all-owned'; ownerAccountId: string };
type MutationMeta = { requestId: string; expectedRevision: number };
type OperationReceipt = { operationId: string; entityId: string; revision: number };
type IntegrationErrorCode = 'VERSION_CONFLICT' | 'AUTH_REQUIRED' | 'ACCESS_DENIED'
  | 'INVALID_CONFIG' | 'NETWORK_BLOCKED' | 'TIMEOUT' | 'RESPONSE_TOO_LARGE'
  | 'RESULT_UNKNOWN' | 'RUNTIME_UNAVAILABLE' | 'CANCELLED' | 'STORAGE_UNAVAILABLE';
type ToolResult = { content: Array<{ type: 'text'; text: string }>;
  isError?: boolean; errorCode?: IntegrationErrorCode; callId: string };
type AdapterResult = Omit<ToolResult, 'callId'>;
type CapabilityContext = { sessionId: string; rootSessionId: string;
  workspaceId: string; ownerAccountId: string; taskId?: string;
  unattended: boolean; runtimeEpoch: string };
type ToolCall = { callId: string; toolId: string; connectionRevision: number;
  arguments: Record<string, unknown>; context: CapabilityContext };
```

其他实体严格使用技术方案第 4 节的字段；`IntegrationState` 为带 schemaVersion、revision 的 PluginInstall/Connection/ToolBinding/SkillInstall/Operation 字典与依赖表。`ConnectionSummary` 是移除密钥和内部配置后的 UI 投影，包含 revision、enabled、authState、health、accountLabel、工具数量与运行时应用状态。

`IntegrationService` 公共接口集中在 `service.ts`：`list()` 返回 UI snapshot；`saveConnection(input, meta)`、`setEnabled(kind, id, enabled, meta)`、`disconnect(id, meta)`、`install(input, meta)`、`uninstall(id, meta)` 返回 `Promise<OperationReceipt>`；`probe(id, configDigest, signal)` 返回测试结果；`getOperation(id)` 返回脱敏 Operation；`cancelOperation(id)` 只取消尚可取消的阶段。`input` 用按连接/安装类型区分的联合类型，校验失败返回字段路径，禁止 `any` 或任意方法名派发。

`CapabilityExecutor.execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult>` 是唯一托管工具执行入口。`CapabilityContext` 由任务 2 的真实 session 注册表产生，模型工具 schema 不包含这些字段。

适配器只返回 `AdapterResult`，执行器补入自己的 callId，避免第三方伪造调用证据。`ProbeResult` 包含 configDigest、status（verified/config-valid/unverified/failed）、testedOperationId、checkedAt 和脱敏 error；未验证不等于健康。`SkillImportPreview`/`LegacyImportPreview` 的 previewId 在主进程绑定源 digest 和过期时间。状态 snapshot revision 与连接配置/授权 revision 分开，普通健康更新和等权 token 刷新不使任务绑定失效。

### Task 1：可恢复状态、凭据与操作事务

**Files:**
- Create: `src/shared/integrations.ts`。
- Create: `src/main/integrations/{store,vault,operations,service,ipc}.ts`。
- Modify: `src/main/index.ts`，使用已有 `src/main/ipc-trust.ts`。
- Test: `test/integration-store.test.ts`、`test/integration-vault.test.ts`、`test/integration-ipc.test.ts`。

**Interfaces:**
- `IntegrationStore.open(root: string): Promise<IntegrationStore>`；`snapshot(): IntegrationState`；`commit(expectedRevision: number, next: IntegrationState): Promise<number>`，只在内存/磁盘均提交后发布新 revision。
- `CredentialVault.put(id: string, secret: string): Promise<void>`、`read(id: string): Promise<string>`、`remove(id: string): Promise<void>`；构造时注入 safeStorage 兼容加解密对象，测试不依赖系统钥匙串。
- 产出上文 `IntegrationService`，IPC 明确枚举 `integrations:list/save/probe/set-enabled/disconnect/operation/cancel`，安装路由由任务 8 扩充。

- [ ] **1.1 编写竞争与崩溃用例。** 临时目录用真实文件系统；两个同版本提交只能有一个成功，损坏 JSON 不得被自动空表覆盖，密钥不可用不得落盘明文。最小竞争用例：

```ts
const root = await mkdtemp(join(tmpdir(), 'ework-integrations-'));
const store = await IntegrationStore.open(root);
const initial = store.snapshot();
const results = await Promise.allSettled([
  store.commit(initial.revision, structuredClone(initial)),
  store.commit(initial.revision, structuredClone(initial)),
]);
expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
expect((await IntegrationStore.open(root)).snapshot().revision).toBe(initial.revision + 1);
// 测试文件从 node:fs/promises、node:path、node:os、vitest 导入上述标准符号。
```

- [ ] **1.2 验证失败。** `npx vitest run test/integration-store.test.ts test/integration-vault.test.ts test/integration-ipc.test.ts`；新接口不存在时应失败，不能用跳过测试消除失败。
- [ ] **1.3 实现持久化与恢复。** 写临时文件、flush、原子 rename；写入前校验 schemaVersion，保留上次完整备份。操作日志保存 requestId 和提交阶段；重启后只恢复已提交配置，不重新触发未知结果的外部动作。Vault 文件 0600，与 metadata 分开；新凭据先加密暂存再提交引用，失败清理孤儿。

```text
锁住提交队列 → 检查 expectedRevision → 校验 next
→ 写 metadata 临时文件并 flush → rename → 更新内存 → 发布 revision
失败：保持旧 revision；对返回结果进行密钥脱敏；保留可恢复的原文件
```

- [ ] **1.4 接入可信 IPC。** 按现有 trusted main-window handler 校验 sender/frame，限制字符串/数组大小；从 UI 返回的 snapshot 不含明文或完整认证 Header。使用错误 sender、过大表单、重复 requestId 验证拒绝/幂等结果。
- [ ] **1.5 跑 1.2 命令并执行 `npm run typecheck`。** 检查临时落盘和日志不含测试凭据；本地提交 `功能：增加集成状态与加密凭据管理`，只暂存本任务文件。

### Task 2：真实运行时桥接与权限生效

**Files:**
- Create: `src/main/integrations/{runtime-bridge,policy}.ts`。
- Create: `packages/dsh-integration-runtime/{package.json,index,tool-proxy,context}.js`。
- Modify: `src/main/runtime/harness-runtime.ts`、`build/dsh-desktop.patch.yml`、`build/sherlock-bundled-plugins.json`、`package.json`、`package-lock.json`。
- Test: `test/integration-runtime.test.js`、`test/integration-policy.test.ts`。

**Interfaces:**
- 消费 `IntegrationService` snapshot/revision 和 `CapabilityExecutor.execute`。
- `resolveCapabilityContext(exec, registries): CapabilityContext` 从 `exec.agent.session.id`、session/workspace 注册表与研究子会话父链解析；未知 session 拒绝。
- `assertCapabilityAccess(call: ToolCall, state: IntegrationState): void` 检查 owner、workspace、工具授权、连接/插件启用、revision、runtimeEpoch、无人值守许可。
- `reconcileTools(snapshot): Promise<void>` 返回前完成新增代理、移除旧注册；`ctx.tools.register()` 返回的 disposer 由该 runtime 独占管理。

- [ ] **2.1 创建真实 tools registry 的聚焦夹具。** 注册一个计数型只读 adapter，经过 bridge→runtime→execute 调用一次；随后撤权，再通过旧工具名调用。断言计数仍为 1，错误为 ACCESS_DENIED。另测伪造 workspace 参数、研究子会话扩权、旧 epoch、无 bridge token；不能只 mock 出“成功”。

```text
revision 7：连接 enabled，工作区 A 获权 → 工具调用到达计数 adapter
revision 8：setEnabled(false) 完成 → 再调用 revision 7 的工具
期望：调用被拒绝；计数 adapter 未执行；工具发现下一轮也不包含该工具
```

- [ ] **2.2 运行 `npx vitest run test/integration-runtime.test.js test/integration-policy.test.ts`，确认缺失的守卫导致用例失败。**
- [ ] **2.3 实现随机 loopback 鉴权桥与代理。** 桥提供 snapshot/revision、execute、skill-read、dependency-report 的固定路由；每次启动独立 token 与 epoch，比较 token 时使用常数时间校验。令牌只传给受信任 Harness；退出先关入口、取消可取消请求，再清理进程。

```text
工具发现：snapshot → 按可信会话上下文过滤 → 注册稳定 toolId
执行：resolveCapabilityContext → bridge.execute → assertCapabilityAccess
→ 使用主进程最新配置调用 adapter → 限量结果/调用证据 → 返回 ToolResult
```

- [ ] **2.4 用现有 tools scope/middleware 验证模型看到的工具集合。** 执行守卫是最终边界；若当前 API 无法按 session 动态过滤，在锁定包对应的 `patches/@deepseek-ai+dsh-tools+0.1.0-rc.7.patch` 增加窄的 schemas/get policy seam 并配套测试，不用“全局注册 + 只在页面隐藏”冒充范围隔离。读写性质接入现有工具审批机制；连接授权不自动批准每次危险操作，无人值守调用仅使用显式预授权。旧任意 Node 插件不承诺进程级隔离。
- [ ] **2.5 重复 2.2 与类型检查。** bridge 断开时拒绝新调用、不退回直连；本地提交 `功能：接通集成工具运行时与执行权限`。

### Task 3：技能导入、启停与同名隔离

**Files:**
- Create: `src/main/integrations/skill-import.ts`。
- Create: `packages/dsh-integration-runtime/{skill-provider,skill-policy}.js`。
- Create when required by locked API: `patches/@deepseek-ai+dsh-skill+0.1.0-rc.7.patch`。
- Modify: `packages/dsh-integration-runtime/index.js`、`src/main/integrations/{service,ipc}.ts`。
- Test: `test/integration-skills.test.ts`、`test/integration-skill-policy.test.js`。

**Interfaces:**
- `previewSkillImport(sourcePath: string): Promise<SkillImportPreview>`，返回 validated files、名称、正文预览、依赖、冲突、总大小，不执行内容。
- `commitSkillImport(previewId: string, mode: 'replace' | 'copy', meta: MutationMeta): Promise<OperationReceipt>`，确认时再次核验源 digest。
- `isSkillAllowed(skillId: string, context: CapabilityContext): boolean` 用于 registry 的 list、get、slash 三个入口；provider 发出失效事件而不是重启整个应用。

- [ ] **3.1 写导入与授权失败用例。** 包含 `../escape`、绝对路径、symlink 逃逸、超限、相同名称不同来源、预览后文件改变。构建个人技能与插件技能同名的夹具：停用插件只能屏蔽它的版本；直接 get 与 slash 也必须拒绝已禁用项。

```text
个人技能 id=user/report；插件技能 id=plugin/research/report；显示名均为“研究报告”
停用 plugin/research/report → list 保留 user/report
get(plugin/research/report) 与 slash 指向该 ID → ACCESS_DENIED
卸载 research 插件 → user/report 原文与资源不变
```

- [ ] **3.2 运行 `npx vitest run test/integration-skills.test.ts test/integration-skill-policy.test.js`，确认当前 registry 缺少启停约束时失败。**
- [ ] **3.3 实现导入与受控 provider。** managed skill 保存在 integrations/skills 而非默认自动发现目录。预览只解析 YAML/Markdown；安全复制到 staging，版本冲突按明确选择处理；原子提交并 invalidate。资源读取也必须校验 canonical path。

```text
list(context) = 所有候选技能 → 按稳定来源 ID 合并 → isSkillAllowed 过滤
get(id, context) = 先校验 isSkillAllowed → 再读取正文和资源
slash(name) = 解析稳定 ID/同名选择 → 调用相同 get，不能旁路
```

- [ ] **3.4 为现有 filesystem/bundled provider 接入同一政策。** 先确认锁定版扩展点；缺失时添加小范围 patch-package，并对安装后 patch 成功与 list/get 两条路径建立检查。模型已经读过的历史正文无法撤回，后续工具仍由任务 2 守卫。
- [ ] **3.5 重复聚焦命令；本地提交 `功能：实现技能导入与运行时启停`。**

### Task 4：MCP Supervisor 与真实发现/调用

**Files:**
- Create: `src/main/integrations/adapters/mcp.ts`。
- Create: `test/fixtures/integrations/mcp-stdio.mjs`、`test/fixtures/integrations/mcp-http.mjs`。
- Modify: `src/main/integrations/{service,runtime-bridge}.ts`、`package.json`、`package-lock.json`。
- Test: `test/integration-mcp.test.ts`。

**Interfaces:**
- `McpSupervisor.connect(connectionId: string, signal: AbortSignal): Promise<McpDiscovery>` 返回 negotiatedVersion 与 ToolBinding 候选；由用户确认的集合产生 grants。
- `invoke(connectionId: string, rawToolName: string, args: Record<string, unknown>, signal: AbortSignal): Promise<AdapterResult>`；`dispose(connectionId: string): Promise<void>`。
- 消费 Vault 和任务 2 的守卫；MCP client 仅由主进程持有，原 dsh-mcp-client 对已迁移连接必须停用。

- [ ] **4.1 写真实 SDK fixture。** STDIO/HTTP 均提供 echo、分页 tools/list、延迟工具和可切换 schema 的工具；夹具记录进程启动数和调用数。测试发现 2 页、不重复启动、断开后新调用拒绝、取消延迟请求、进程树清理、schema 改变不扩权。

```text
发现工具 search/v1 → 用户允许 → 调用返回 fixture echo
服务新增 delete 或 search schema 改为 v2 → 重连
期望：delete 未获授权；变化工具标记需要复核；列表数量来自真实发现
```

- [ ] **4.2 运行 `npx vitest run test/integration-mcp.test.ts`，确认未实现传输与生命周期时失败。**
- [ ] **4.3 实现双传输。** STDIO 使用 spawn(command, args, {shell:false, env: allowlistedEnv})；不传 Harness bridge token、账户 token 等宿主变量。HTTP 重用任务 5 网络目的地政策，支持鉴权、工具列表分页、取消和限量输出。MCP 授权扩展使用任务 7 OAuth 基础设施。

```text
连接状态：idle → starting → discovering → ready
网络故障：backoff(500ms…30s，最多10次，加抖动) → ready/unreachable
授权故障：auth-required（不循环重连）
dispose：拒绝新请求 → 注销代理 → 取消请求 → 关闭 SDK transport/子进程
```

- [ ] **4.4 固定兼容矩阵。** 直接声明已验证 SDK 版本，记录 negotiatedVersion；2025-11-25 基线必测，2026-07-28 要么通过互通、要么明确不支持，不伪造兼容。休眠恢复只重连，绝不重发结果未知的工具调用。
- [ ] **4.5 重复聚焦命令与类型检查；本地提交 `功能：实现托管 MCP 连接与工具发现`。**

### Task 5：自定义 API 与 OpenAPI 转工具

**Files:**
- Create: `src/main/integrations/adapters/{http-api,openapi,network-policy}.ts`。
- Create: `test/fixtures/integrations/api-server.mjs`。
- Modify: `src/main/integrations/{service,runtime-bridge}.ts`；网络政策由任务 4 的 `adapters/mcp.ts` 消费。
- Test: `test/integration-http-api.test.ts`、`test/integration-openapi.test.ts`。

**Interfaces:**
- `compileOpenApi(document: string, format: 'json' | 'yaml'): CompiledApi` 返回 ToolBinding 候选和带路径的逐项诊断；不支持项不可静默丢弃。
- `HttpApiAdapter.probe(connectionId: string, operationId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ProbeResult>`；`invoke` 使用同形参数返回 AdapterResult。
- `validateNetworkTarget(url: URL, policy: NetworkPolicy): Promise<void>`；NetworkPolicy 来自用户目标授权，包含允许的协议、host/port 与局域网例外，不来自模型参数。

- [ ] **5.1 建真实 HTTP fixture 和失败矩阵。** 校验 Header 注入、JSON 参数、OpenAPI 3.0/3.1、本地 ref、无 operationId、重复 ID、未知序列化、超时、超大响应。跨域重定向不能带认证；metadata 地址和 DNS 变化被拒绝；写请求接受后断连只能记录 RESULT_UNKNOWN，调用计数为 1。

```ts
const result = compileOpenApi(JSON.stringify({
  openapi: '3.1.0', info: { title: 'Echo', version: '1' },
  paths: { '/echo': { get: { operationId: 'echo', responses: {
    '200': { description: 'ok', content: { 'application/json': {
      schema: { type: 'object', properties: { value: { type: 'string' } } }
    } } }
  } } } }
}), 'json');
expect(result.tools.map(tool => tool.operationId)).toEqual(['echo']);
// CompiledApi 定义 tools: ToolBinding[] 与 diagnostics: {path, code, message}[]。
```

- [ ] **5.2 运行 `npx vitest run test/integration-http-api.test.ts test/integration-openapi.test.ts`，确认未接真实请求时失败。**
- [ ] **5.3 实现认证与请求映射。** 第一版支持 none、API Key、Bearer、自定义 Header；表单保存 secretRef。手动配置和 OpenAPI 编译产生同一 ToolBinding。外部 ref、multipart 和暂不支持的参数编码显示具体原因；没有只读探测时显示“配置有效，尚未验证调用”。

```text
输入 schema 验证 → 最新授权检查 → 固定 Base URL + 已声明 path
→ DNS/目的地址检查 → Vault 取认证 → 请求（30s/8MiB/并发4）
→ 每次重定向再验证，跨源剥离认证 → 映射结果/错误 → 脱敏输出
```

- [ ] **5.4 通过 Harness 实际执行一次 fixture API。** 断言响应中的动态 nonce 来自服务器，停用后旧 toolId 调用无法到达服务器。默认只对 GET/HEAD 的可判定安全失败有限重试；提供方写操作幂等策略单独声明。
- [ ] **5.5 重复聚焦命令；本地提交 `功能：实现自定义 API 与 OpenAPI 工具接入`。**

### Task 6：右侧工作区与完整交互流程

**Files:**
- Create: `src/preload/workspace-surface-host.ts`。
- Create: `src/preload/integrations/{view,router,style,forms,market}.ts`。
- Modify: `src/preload/{index,ui-copy,developer-mode}.ts`、`src/preload/scheduled/view.ts`、`scripts/lib/patch-sherlock-better-sidebar.mjs`。
- Test: `test/integration-view.test.ts`、`test/workspace-surface-host.test.ts`、现有 `test/scheduled-task-view.test.ts`。

**Interfaces:**
- `WorkspaceSurfaceHost.open(surface: 'scheduled' | 'integrations', route?: string): void`、`back(): void`、`setRightPaneExpanded(expanded: boolean): void`、`dispose(): void`。
- `IntegrationView.mount(host, bridge): void`；bridge 是任务 1 的 typed IPC 封装，禁止渲染层 fetch 第三方 API。
- 路由合同如下，详情 ID 只引用本地实体，不能从 URL 注入外部请求地址。

```text
integrations/{plugins|apps|mcp|skills}
integrations/market/{plugin|app|tool|skill}
integrations/plugin/:id              → 详情/依赖/设置
integrations/add                     → 连接应用/API/MCP/导入技能/创建插件
integrations/connection/:id          → 配置/权限/测试/断开
integrations/skill/import            → 选择文件 → 预览 → 导入
integrations/skill/:id               → 内容/资源/来源/启停
integrations/plugin/create          → 填 manifest → 预览 → 本地安装
```

- [ ] **6.1 用 DOM 交互测试固定回归。** 定时任务草稿→插件→返回仍保留；搜索覆盖后关闭仍保留 tab，真正打开会话才离开；右侧收起再展开仍保留表单；点击更多只出现菜单；只有卸载菜单项打开确认。测试迟到 probe 结果不能覆盖用户更改后的地址。
- [ ] **6.2 运行 `npx vitest run test/integration-view.test.ts test/workspace-surface-host.test.ts test/scheduled-task-view.test.ts`，确认新增流程缺失时失败。**
- [ ] **6.3 提取有限宿主，连接真实列表和向导。** 宿主统一管理更多菜单插入与生命周期；兼容已有 scheduled 事件，保留定时任务自身逻辑。四个列表使用一致行布局，状态来自后端 snapshot。保存按钮先显示操作受理，再跟踪 Operation；失败保留草稿，不把按钮点击当成功。

```text
表单编辑 → 字段校验 → 保存/授权 operationId → 进度 → 成功实体详情
每次路由切换增加 viewEpoch；异步结果仅在 epoch 与 configDigest 匹配时显示
危险操作 → 查询真实依赖 → 确认 → 后端变更 → 列表刷新/可操作结果
```

- [ ] **6.4 完成样式与键盘行为。** 使用现有深浅主题变量；紧凑 tab、76px 行、文字截断有完整名称提示；功能控件具备 accessible name。菜单 Esc 关闭并返回触发按钮，弹层焦点限制，键盘可完成 tab 切换与导入。普通用户能打开新入口，旧开发者插件页仍受原策略约束。
- [ ] **6.5 真实开发窗口验收 A 切片。** 完成一次 API、MCP、技能接入及真实对话，录入只在用户 UI 发生；运行聚焦检查并提交 `界面：接入插件工作区与真实管理流程`。

### Task 7：应用授权、Google Calendar 与 Notion

**Files:**
- Create: `src/main/integrations/adapters/{oauth,google-calendar,notion}.ts`。
- Create: `services/integrations/{worker,oauth-broker,provider-proxy}.js`、`services/integrations/migrations/0001_connections.sql`、`services/integrations/wrangler.jsonc`。
- Modify: `src/main/integrations/{service,vault}.ts`、`src/main/{index,account-service}.ts` 的账户退出/切换集成挂钩；复用 `services/accounts/auth.js` 身份校验模式。
- Test: `test/integration-oauth.test.ts`、`test/integration-providers.test.ts`、`test/integration-broker.test.js`。

**Interfaces:**
- `ProviderAdapter` 方法为 `describeCapabilities`、`beginAuthorization`、`completeAuthorization`、`refresh`、`probe`、`invoke`、`disconnect`；输入固定包含 providerId/connectionId 与 AbortSignal，调用参数与任务 5 相同。
- `AuthorizationAttempt` 为 id、connectionId、expiresAt、status；桌面只得到授权 URL 与 attemptId，不暴露 verifier/refresh token。
- Broker 提供 `POST /oauth/attempts`、`GET /oauth/callback/:provider`、`POST /oauth/claims`、`POST /connections/:id/invoke`、`DELETE /connections/:id`；全部需要账户绑定，callback 独立验证一次性 state。

- [ ] **7.1 用可控 OAuth server 测试攻击与失败路径。** state 错误/重放、过期回调、取消后回调、账号切换、两次并发 refresh、refresh token 旋转失败、invalid_grant、未获 scope、跨 owner 请求均有断言。refresh 只能串行一次，失效状态必须传回 UI。
- [ ] **7.2 运行 `npx vitest run test/integration-oauth.test.ts test/integration-providers.test.ts test/integration-broker.test.js`，确认缺少授权绑定时失败。**
- [ ] **7.3 实现 Google 桌面授权。** 注册产品自有 OAuth client；系统浏览器 + PKCE S256 + 随机 loopback 回调端口，默认只读 Calendar scope，超时关闭监听。保存 token 后以真实日历列表探测权限；无 scope 提示重新授权，不能直接显示已连接。

```text
begin → 生成 state/verifier → 系统浏览器
callback → 校验 state/attempt/owner → code exchange → 原子存 token
probe → 已授权且可访问 → connected；失败按 scope/auth/network 分类
```

- [ ] **7.4 实现 Notion 两条清晰路径。** 本地个人 internal token 直接经 Vault 调用；产品公开 OAuth 使用 Broker 保存 client secret，token 以版本化 AES-GCM 密文存 D1。短时一次性 claim ticket 绑定 EWork owner 和 PKCE challenge；token 不进 URL。provider 代理只接受白名单 operationId，禁止任意 URL。
- [ ] **7.5 实现撤权与账户隔离。** 断开先取消本地能力租约，再远端 revoke；失败记录待重试。退出/切换 EWork 账号立即使旧 runtime lease 失效。HTTP MCP OAuth 按服务器 metadata/issuer 校验接入同一基础设施；无 OAuth 的 MCP 不假设自动支持。
- [ ] **7.6 聚焦测试后做真实账号验收。** Google 读取真实测试日历、Notion 读取明确授权的测试页面；记录脱敏 callId/result，凭据由用户在 UI 输入。未取得真实测试授权时标记该适配器“未完成真实验收”，不能用 fixture 成功替代。提交 `功能：增加应用授权与日历知识库连接`。

### Task 8：四类真实市场、安装与创建插件

**Files:**
- Create: `src/main/integrations/{catalog,installer,manifest}.ts`。
- Create: `services/integrations/catalog.js`、`services/integrations/migrations/0002_catalog.sql`。
- Create: `scripts/validate-integration-catalog.mjs`、`test/fixtures/integrations/catalog.json`。
- Modify: `src/main/integrations/{service,ipc}.ts`、`src/preload/integrations/{market,forms}.ts`、`services/integrations/worker.js`。
- Test: `test/integration-catalog.test.ts`、`test/integration-installer.test.ts`。

**Interfaces:**
- `CatalogService.list(kind: CatalogKind, query: string, cursor?: string): Promise<CatalogPage>`；返回条目、nextCursor、fetchedAt、offline。
- `validatePluginManifest(input: unknown): PluginManifest`；字段使用技术方案第 8 节；`PluginInstaller.install(source, meta)`、`update(id, source, meta)`、`rollback(id, meta)` 返回 OperationReceipt。
- 创建插件向导生成同一 manifest，经过同一个 installer；catalog 的 app/tool 条目创建连接配置，不能误当 npm 包安装。

- [ ] **8.1 写来源与中断用例。** 覆盖签名不符/hash 损坏、版本不兼容、路径逃逸、同包并发安装、重复 requestId、stage/apply 中断、runtime apply 失败、离线未缓存包、共享连接不被卸载删除。

```text
已有 v1 可用 → 下载 v2 → 校验通过 → runtime apply 失败
期望：v1 继续可用；v2 操作显示 failed；已授权连接、用户同名技能保持原样
按“重试”不生成第二个安装实体；“取消”在不可取消提交阶段显示正在完成
```

- [ ] **8.2 运行 `npx vitest run test/integration-catalog.test.ts test/integration-installer.test.ts`，确认事务未实现时失败。**
- [ ] **8.3 建立真实目录。** 首批条目必须绑定可获取的声明式包/技能或已实现 provider，校验器检查链接、digest、版本、权限字段；四类各至少一个可完成真实操作的条目。缓存 ETag、分页、检索与离线提示。添加团队来源校验 HTTPS 与来源信任，认证引用 Vault。

```text
plugin 市场 → manifest 详情 → 权限/依赖预览 → install
app 市场 → provider 详情 → OAuth/token 连接
tool 市场 → MCP/API 详情 → 配置 → 发现/勾选工具
skill 市场 → 正文与资源预览 → import → 技能列表
```

- [ ] **8.4 实现安装事务和创建向导。** 新声明式包不执行 npm 生命周期脚本；安装时保存来源与 digest；公开目录用产品签名验证，本地/团队来源显式展示信任来源。旧 Cordis 代码包保持兼容策略，不在公开声明式目录任意执行。需重启的旧包显示待重启，运行中会话不被打断。
- [ ] **8.5 补齐 Figma 缺失的市场交互对应页面。** 应用/工具市场不再跳到添加类型或已发现工具，技能市场有真实目标；键盘返回与后端状态一致。运行聚焦检查和目录校验，提交 `功能：实现四类市场与插件安装事务`。

### Task 9：研究与定时任务使用连接

**Files:**
- Create: `src/main/integrations/dependency-index.ts`。
- Modify: `src/shared/scheduled-tasks.ts`、`src/main/scheduled/{task-store,task-runner}.ts`、`src/preload/scheduled/view.ts`、`packages/dsh-integration-runtime/context.js`、`src/main/integrations/runtime-bridge.ts`。
- Test: `test/integration-task-dependencies.test.ts`、`test/scheduled-tasks.test.ts`、`test/component-scheduled-tasks.test.ts`。

**Interfaces:**
- 任务新增 `integrationBindings`，每项包含稳定实体 ID、bindingRevision、批准的 toolIds/schemaDigest/读写范围；旧任务为空数组迁移。同等权限恢复可更新绑定 revision，权限或 schema 扩张须重新确认。
- `DependencyIndex.preflight(taskId: string): Promise<{ready: boolean; issues: DependencyIssue[]}>`；`recordUse(taskId: string, toolId: string, revision: number): Promise<void>`；`impact(entityId: string): Promise<DependencyImpact>`。
- `DependencyIssue` 包含 code、entityId、连接详情 route；TaskRun.status 加 `blocked` 并保持旧值兼容，已有 claim/rpcId 对账仍是唯一执行去重来源。

- [ ] **9.1 使用可控时钟验证 15 秒轮询。** 连接过期→任务 blocked 且不每次轮询发起新 run；修复后等下个计划点；立即运行只创建一个新 run。预检通过后再撤权，执行守卫仍拒绝。旧任务无 bindings 可加载，但新依赖按实际调用记录。

```text
09:00 计划点，连接已撤回 → blocked，未调用第三方
09:01 修复 → 解除阻塞，未补跑 09:00
09:02 用户立即运行 → 单一 claim/rpcId → 一次调用
网络中断且外部效果未知 → 对账/RESULT_UNKNOWN，不能重复写入
```

- [ ] **9.2 运行 `npx vitest run test/integration-task-dependencies.test.ts test/scheduled-tasks.test.ts test/component-scheduled-tasks.test.ts`，确认现有任务缺失 dependency preflight 时失败。**
- [ ] **9.3 接入任务编辑与错误处理。** 允许选择已授权连接并查看无人值守范围；缺少写操作预授权时阻塞并提供处理入口。动态发现依赖生成绑定建议，不从自然语言臆测完整依赖。卸载/断开影响数来自 DependencyIndex。
- [ ] **9.4 接通研究子会话。** 从现有 research 子会话映射取得 parent，再求授权交集；跨 workspace/owner 失败。已有生成内容保留，已发出的第三方操作无法撤销时明确记录未知状态。
- [ ] **9.5 聚焦测试通过后，执行一次真实研究调用与一次真实定时调用；提交 `功能：将连接能力接入研究与定时任务`。**

### Task 10：遗留迁移、打包与真实客户端验收

**Files:**
- Create: `src/main/integrations/legacy-import.ts`。
- Create: `test/integration-migration.test.ts`、`docs/ework-integrations-client-acceptance.md`。
- Modify: `src/main/bundled-plugin-profile.ts`、`src/main/bundled-skill-sync.ts`、`src/main/runtime/harness-runtime.ts`、`build/sherlock-bundled-plugins.json`、`build/dsh-desktop.patch.yml`、`package.json`。
- Read: `docs/sherlock-multi-session-integration-runbook.md`、`docs/sherlock-local-test-runbook.md`。

**Interfaces:**
- `previewLegacyImport(profileRoot: string): Promise<LegacyImportPreview>`；`applyLegacyImport(previewId: string, meta: MutationMeta): Promise<OperationReceipt>`。
- 迁移映射保存原来源、原工具名别名与新稳定 ID；写入前备份，兼容旧配置解析，不让同一 MCP 在新旧 owner 中同时启动。

- [ ] **10.1 运行迁移故障用例。** bundled/user/legacy 所有权分离；用户编辑过的 SKILL.md 不被内置同步覆盖；同名来源不合并；迁移中断重跑幂等；metadata 损坏保留原件；旧 MCP 关停确认后新 owner 才接管。`npx vitest run test/integration-migration.test.ts`。
- [ ] **10.2 实现预览、备份与迁移。** 先只读扫描并展示差异，用户确认迁移时走 Operation；凭据直接在主进程加密迁移，不经过 UI。不支持的遗留包标注来源/兼容限制，保留其原配置，禁止当成空数据删除。
- [ ] **10.3 完成打包资源检查。** 新 runtime、SDK、窄补丁、manifest 信任公钥进入最终包；扫描产物不包含测试 token、OAuth client secret、staging 缓存。测试 provider fixtures 不打入正式资源；用户 profile 不由打包脚本覆盖。
- [ ] **10.4 通过集成交接后构建本地测试客户端。** 在规定集成来源执行 `./script/build_and_run.sh --verify`；不在功能 worktree 替换共享客户端，不改版本、不公证、不上传、不推送。构建完成核验真实主界面与包来源，不能仅凭进程名。
- [ ] **10.5 按下面验收表实际操作并记录证据。** 每项记录代码 SHA、包路径、测试时间、界面状态、requestId/callId 和脱敏响应。需用户登录时由用户输入凭据；缺少外部授权的行明确标未验收，不以 mock 替代。留客户端打开供测试。
- [ ] **10.6 只对失败项修复并复测。** 通过后提交 `验证：完成集成迁移与客户端接入验收`；不扩大成全功能测试，不把本地验收写成对外发布。

## 页面—行为—后端—验收证据表

| 页面/控件 | 实际行为及后端 | 完成证据 |
| --- | --- | --- |
| 更多→插件 | WorkspaceSurfaceHost 打开 integrations | 左导航保留，返回定时任务草稿仍在 |
| 四个 tab/四个市场按钮 | kind 路由、真实 catalog、搜索分页 | 每个市场至少一个条目完成其对应真实操作 |
| 插件开关 | setEnabled + runtime revision | 旧工具名也被阻止；再启用无需重输凭据 |
| 插件更多 | 菜单→卸载影响→uninstall | 点击更多不弹确认；卸载不删除共享账号/用户技能 |
| 创建插件/添加来源 | manifest 校验、可信源、同一安装事务 | 本地包可安装并贡献真实技能/工具绑定 |
| 自有 API | 真实探测→save→ToolRuntime | 对话获得服务动态结果；失效 token 进入可恢复错误 |
| 应用连接 | Google/Notion OAuth/token adapter | 获取已授权真实内容；授权范围不足可重新授权 |
| MCP 配置/发现 | Supervisor + tools/list + invoke | STDIO/HTTP 均实际发现与调用；无重复进程 |
| 技能导入/市场 | 安全预览→provider 注册 | 无装饰图标；技能可被调用，停用后 list/get/slash 一致 |
| 更新/取消/回退 | operation journal + staged install | 中断恢复，旧版本可用；取消不假装已完成 |
| 返回/右屏收起/搜索 | 宿主状态与 viewEpoch | 表单/选中 tab 保持，迟到结果不覆盖新页面 |
| 定时任务/研究 | dependency preflight + session context | 各一次真实调用；撤权后阻塞而非循环重试 |
| 退出账号/重启/离线 | lease 撤销、恢复与缓存 | 不串账号；配置持久；断开不复活；离线状态真实 |

## 自查与交付边界

方案第 1–3 节由任务 1/2/6 落实；第 4 节由 1/2/8/9；第 5 节由 5；第 6 节由 4/7；第 7 节由 1/7；第 8 节由 3/8/10；第 9 节由 2/9；第 10 节由 6/10。Review Focus 的五类风险已分配至对应任务。

**本次文档交付不包含实际代码实现、OAuth 应用注册、云服务部署或客户端升级。** 开发开始后以每个切片的真实验收结果更新状态，不将页面接线、HTTP 200、SDK fixture 通过等单一证据描述为整套功能已完成。
