# Hindsight 统一后端验证 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Keep the prior local experiment immutable apart from reusable bug fixes. One final independent review is required; no implementer subagents.

**Goal:** 验证统一服务拓扑下的中文来源召回、客户端完整请求延迟、并发与服务端用户隔离；真实部署验证通过后才进入产品改造。

**Architecture:** 客户端只访问记忆网关。网关向现有账户接口核验 opaque session，服务端决定用户与项目范围，向私网 Hindsight 签发短期身份断言。Hindsight TenantExtension 校验断言并把用户映射到独立 PostgreSQL schema；客户端不能指定 schema、bank、tags 或用户身份。网关只开放记忆操作，不转发管理 API。

**Tech Stack:** Node 22 HTTP gateway、Python 3.12/Hindsight 1.2.0、PostgreSQL/pgvector、固定 multilingual-e5-small INT8 ONNX。继续使用同一隔离 worktree；新数据目录、端口与证据目录。

**Spec:** 当前会话用户明确要求“按统一后端部署继续推进，验证召回效果、端到端延迟、并发和用户隔离，通过后再改造记忆架构和前端设置界面”。

## Global Constraints

- 不将桌面 RSS 768MiB 或 +10pp 作为统一后端通用门槛。资源只记录为容量参考。
- 不改变旧实验门槛和历史结论；本文件是用户部署假设修正后的新验证。
- 合成语料与测试账户；不读取真实聊天、不修改生产账户、不开公网匿名端口。
- 未取得实际测试环境 URL/主机前，只能称“后端拓扑本机预检”；不能把 loopback 或人工 RTT 算成跨机端到端延迟。
- 查询延迟计入账户核验、网关、Hindsight、状态/范围处理和证据打包；不包括最终聊天模型生成。生成延迟不能冒充召回延迟，反之亦然。
- 只运行直接相关聚焦测试，完成后中文本地提交；不构建客户端、不 push、不发布。

## Review Focus

- 修改请求中的 userId/schema/bank/tags/身份头，不能读取或改写其他用户数据。
- 两个用户使用相同 bank 和 document ID，所有读取、更新、删除与并发请求仍隔离。
- 非成员项目、无令牌、错误签名、过期/撤销令牌、身份接口超时必须拒绝；不存在默认 public 用户降级。
- 统计必须包含失败和超时，完整字节预算不得再次截断 top-5；固定样本与负例单列。
- 未有真实部署证据时总体状态必须是 PENDING_REMOTE，不得据本机预检改造产品。

## 工程验证参考门槛

以下用于本轮样机筛选，不是用户承诺的 SLA；测试前固定，结果不足则如实报告。

- 40 道原冻结正例 top-5 完整来源命中 ≥90%，语义改写不低于旧基线 12/14；完整 1,200 字节证据包覆盖 ≥95%。无答案候选单列，不把检索候选等同生成回答；注入相关性策略另需产品验收。
- 附加未参与旧配置选择的中文保留集：至少 20 题，完整来源命中 ≥90%；不按结果改题。
- 至少 1,000 条合成记忆下测试 1/10/25 并发，各至少 200 次；客户端端到端 p95 在单请求 ≤1,000ms、25 并发 ≤2,000ms，成功率 ≥99%，超时 5 秒且完整计入。50 并发只作容量诊断，不据此宣称任意用户规模。
- 所有身份/项目/跨用户读写删除攻击探针：越权成功 0；明确撤销后必须即时拒绝。
- 真实测试服务器上的 TLS 网络往返、端到端链路与服务端隔离都完成后，才判 PASS；缺部署目标是 PENDING_REMOTE，不是引擎 NO_GO。

## Task 1: 有身份的服务边界

**Files:** `experiments/hindsight-backend-validation/{gateway.mjs,gateway.test.mjs,tenant_extension.py,test_tenant_extension.py}`。

- [ ] 先写拒绝伪造/失效身份、跨项目操作、私有管理路径和同名 document 隔离的聚焦失败测试。
- [ ] 实现网关身份核验、严格请求字段、短期断言和固定 bank；项目 ACL 在服务端注册表校验。
- [ ] 实现 Hindsight 租户扩展：固定 issuer/audience/HS256、必需 exp/sub、仅已登记用户、独立 schema，无 public 回退。
- [ ] 跑直接受影响测试并中文提交。

## Task 2: 可部署后端与独立压测

**Files:** `experiments/hindsight-backend-validation/{launch.py,fixtures.mjs,validate.mjs,heldout.json,README.md}`，必要的容器部署文件。

- [ ] 冻结保留集与负载集；已有结构化记忆走 chunks 模式避免重复 LLM 抽取，并明确它与旧原始文本抽取实验不同。
- [ ] 启动真实 Hindsight 和数据库、测试账户 HTTP 服务及网关，先完成本机后端拓扑预检。
- [ ] 运行语料召回、1/10/25/50 并发及攻击探针，保存原始响应/失败/延迟；验证同名 ID 的更新删除不影响另一用户。
- [ ] 准备可重复部署与远程运行入口；获得用户测试环境后执行跨机 TLS 测量，不自行选择或覆盖生产后端。
- [ ] 停止本次进程，保留合成证据，中文提交。

## Task 3: 结论与下一阶段

- [ ] 依据本轮门槛区分本机预检、真实部署和产品验收；进行一次独立复核，修正实质问题。
- [ ] 生成报告与本地中文提交；若 PENDING_REMOTE 明确缺失的部署入口，不伪造通过。
- [ ] 仅真实部署 PASS 后，从最新本地 main 进入架构/前端设计和实现，遵守多 session 集成流程。

## Execution ledger

- 2026-11-07：用户改为统一后端部署；原分支干净，main 为 `9035f11cf`，本轮起点 `da5e9fef3`。
- Discovery: 现有账户后端为 Cloudflare Workers/D1，提供 `/v1/account/me`；没有找到 Hindsight 测试 URL 或可用部署主机 SSH 配置。已通过异步问题请求测试入口，独立准备工作继续。
- Ruling: 私网 Hindsight schema 隔离与网关项目 ACL 两层同时验证；仅 bank 命名不同不视为用户鉴权通过。测试身份服务遵循账户接口形状，但不能冒充真实账户服务已完成联调。
- Ruling: 本轮验证已保存结构化记忆的服务化检索；chunks 模式不重复进行事实抽取。原始聊天抽取质量沿用此前单独证据，不把两种写入流程成绩混为一谈。
