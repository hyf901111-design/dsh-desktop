# Hindsight 本地接入验证 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this authorized, isolated validation. Do not alter the product until the gates below pass. Steps use checkbox syntax for tracking.

**Goal:** 实测中文召回、端到端检索延迟、本机启动与资源占用，决定是否进入产品改造。

**Architecture:** 独立 Python 环境运行固定版本 Hindsight，使用独立 pg0 数据目录及回环端口。Node 适配器从当前源码调用原有 MemoryRetriever，并用同一份中文合成语料和问题执行对比。原始样本、逐题结果和资源采样保留，可重复执行。

**Tech Stack:** Node 22、Python 3.12、Hindsight 1.2.0、pg0、ONNX multilingual-e5-small；抽取模型复用已配置服务，凭据仅驻留进程环境，不进入命令行、日志和报告。

**Spec:** 用户在当前会话批准的《EWork Odyssey 记忆架构研究与接入建议》（2026-11-07）及本轮要求：先本地接入验证，验证通过后再改架构与前端。

## Global Constraints

- 基线为本地 main `9035f11cf`；只在 `codex/feat/hindsight-local-validation-20261107` 工作。
- 不构建、替换或重启共享 Sherlock 客户端，不改正式记忆库、配置或版本。
- 仅采用合成办公语料，不导入实际聊天或文件。记录中明确不是线上效果。
- 固定评估集后再看结果，不按结果删难题或调低门槛。
- 相关聚焦验证后用中文创建本地 Git 提交；不 push，不运行全功能测试。
- 原始证据保存在本会话 artifacts 目录，运行时、模型和数据库不进 Git。

## Review Focus

- 金标准包含多个依据时，只找到一个不能计作完整命中。
- 同名项目及跨账户内容不能混入结果；客户端过滤与引擎原生隔离分开报告。
- 时间更新与删除后旧事实不能被当成当前有效结论；历史事实可按历史问题返回。
- 故障/超时必须显式计入失败，不从延迟统计中静默剔除。
- 资源统计含服务及数据库子进程，并说明 RSS 求和的共享内存重复计数局限。

## 预先定义的晋级门槛

这是第一轮桌面集成筛选目标，不是产品已承诺的 SLA。

- 召回：有答案问题原始 top-5 完整依据命中率 >=90%；语义改写子集相对现有实际召回提升 >=10 个百分点。
- 公平性：同时报告两者各自原生输出，以及同为 1,200 UTF-8 字节的证据上下文预算；不把更大上下文带来的收益全归因于算法。
- 控制：样本中的账户/项目串用、明确删除后再次出现、把已替代状态当作当前状态均为 0；无答案问题单独报告，不能只看正例。
- 性能：模型已缓存、顺序单请求的检索 p50 <=500ms、p95 <=1,500ms；超时计失败。另测 3 个并发请求作为诊断。
- 资源：就绪后空闲进程树 RSS <=768MiB；本批任务峰值 <=1.5GiB；缓存已具备时重启就绪 <=15s。首次下载耗时和磁盘占用独立记录。
- 如果不满足，报告失败原因与可行修正，不进入正式架构和界面改造。只允许与失败原因直接相关的一轮配置改进，再对未改动的完整评估集复测。

## Task 1: 可重复基准与数据集

**Files:** `experiments/hindsight-local-validation/{README.md,corpus.json,metrics.mjs,metrics.test.mjs,baseline.mjs}`。

- [ ] 写定至少 40 个中文/中英混合问题，含改写、精确术语、多依据、时间、无答案和范围隔离；另有删除/恢复与断线探针。
- [ ] 先写评分器的聚焦测试：多依据完整命中、正确分母、失败计入、分位数、UTF-8 预算；运行得到预期失败。
- [ ] 实现确定性评分器，并调用未改动的 `src/main/memory/retriever.ts` 生成基线。
- [ ] 冻结语料 hash，验证通过后本地中文提交。

## Task 2: 隔离服务与实测

**Files:** `experiments/hindsight-local-validation/{service.py,benchmark.mjs,monitor.py,requirements.txt}`；必要的无凭据配置。

- [ ] 完成独立安装，冻结依赖；核对模型参数、来源与本机监听地址。
- [ ] 启动本机服务并测首次安装/就绪成本，使用最小样本验证真实 retain 与 recall。
- [ ] 导入冻结语料，测每条写入结果、模型调用用量和总耗时；记录未成功写入，禁止带缺失数据宣称质量通过。
- [ ] 运行全部查询、重复测量、三并发诊断、删除/范围/故障探针，记录逐题结果。
- [ ] 测空闲及执行资源、磁盘占用、缓存重启；仅停止本次创建的进程。

## Task 3: 决策与交接

**Files:** `docs/superpowers/reviews/2026-11-07-hindsight-local-validation.md` 与可分享报告。

- [ ] 根据预定义门槛逐项判定，明确实测、推断和未覆盖项。
- [ ] 对验证脚本和结果做一次独立复核，修正会影响结论的问题。
- [ ] 中文提交验证成果，保留隔离分支和运行证据。
- [ ] 只有门槛通过才开始后续产品设计与实现；未通过则交付结果及针对性建议。

## Execution ledger

- 2026-11-07：用户已授权隔离验证；原 main 干净；原生工具创建 worktree 后建立功能分支。
- Ruling: 本轮为验证 spike，不做应用重构。采用合成办公场景，避免把新引擎的效果与读取真实历史权限混为一谈。
