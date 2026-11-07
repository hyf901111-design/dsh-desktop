# Hindsight 中文本地验证

这是隔离的合成数据实验，不是产品功能。它不读取真实聊天，不修改正式记忆库或用户设置，不启动共享 Sherlock 客户端。

## 环境

- 基线：本地 main `9035f11cf` 的原始 `MemoryRetriever`。
- Python 3.12；Hindsight API slim 1.2.0；完整依赖见 `requirements-lock.txt`。
- 本机 PostgreSQL/pgvector（pg0）、CPU ONNX `intfloat/multilingual-e5-small`、RRF 排序。
- 记忆抽取复用已配置的 Z.AI `GLM-5.3-Flash` 服务；这是**本地存储与检索 + 远程抽取**，不代表完全离线。仅合成语料被发送给模型。
- 关闭 observation 自动归纳，先评估基本事实写入、索引和召回；本结果不能证明反思/长期归纳质量。

## 运行

选择仓库外的 `ARTIFACT_ROOT`，不要将模型、数据库和含运行日志的证据放进 Git。下列是操作示意，路径由执行者明确提供。

```sh
uv venv --python 3.12 "$ARTIFACT_ROOT/runtime/venv"
uv pip install --python "$ARTIFACT_ROOT/runtime/venv/bin/python" -r experiments/hindsight-local-validation/requirements-lock.txt
node --test experiments/hindsight-local-validation/metrics.test.mjs
node --experimental-strip-types experiments/hindsight-local-validation/baseline.mjs "$ARTIFACT_ROOT/evidence"
"$ARTIFACT_ROOT/runtime/venv/bin/python" experiments/hindsight-local-validation/service.py --root "$ARTIFACT_ROOT" --credentials "$CREDENTIALS_PATH" --label initial
# 在另一个终端，等待 service 输出 api-ready 后：
node --experimental-strip-types experiments/hindsight-local-validation/benchmark.mjs smoke "$ARTIFACT_ROOT/evidence"
node --experimental-strip-types experiments/hindsight-local-validation/benchmark.mjs ingest "$ARTIFACT_ROOT/evidence"
node --experimental-strip-types experiments/hindsight-local-validation/benchmark.mjs recall "$ARTIFACT_ROOT/evidence" rrf
node --experimental-strip-types experiments/hindsight-local-validation/benchmark.mjs probes "$ARTIFACT_ROOT/evidence"
```

凭据仅从指定 YAML 的 `ZAI_API_KEY` 读取到子进程环境，不写入源码、命令行参数或证据。服务日志会替换配置文件中的凭据值。API 监听 `127.0.0.1:19077`；本地数据库单独命名并使用独立数据目录。此单用户实验未配置服务端多租户鉴权，bank ID 不等于访问授权。

在当前服务终端按 Ctrl-C 停止本实验 API 和数据库。必须确认旧进程已退出，再用新的 `--label cached-restart` 启动，以测重启。重启后运行 `benchmark.mjs persistence` 验证事实持久化与删除持久性。

唯一一轮紧凑配置：服务加 `--compact --label compact`，benchmark 的 ingest/recall/probes 命令末尾加 `compact`。使用独立的 `ework-spike-compact-*` bank，重新抽取并索引全部语料。它选用官方 INT8 ONNX 文件，并关闭 graph/temporal 检索，保留语义和关键词融合。两个变更共同评估，不作单参数因果归因；抽取重跑也存在模型随机性。

紧凑配置重启的服务标签为 `compact-cached`；运行 `benchmark.mjs persistence OUTPUT compact`。最后停止服务，运行 `fault-probe.mjs OUTPUT` 和 `analyze.mjs OUTPUT rrf` / `analyze.mjs OUTPUT compact` 生成晋级判断。只有 `decision` 为 `PASS` 才进入产品改造。

模型版本固定在本次官方仓库快照 `614241f622f53c4eeff9890bdc4f31cfecc418b3`，校验值写入 evidence 的 model-manifest 文件。服务默认会访问 Hugging Face 检查缓存；严谨复现时应将 `--model-path` 指向已校验的对应 ONNX 文件，并将 tokenizer 指向同一快照。原生 pg0 PostgreSQL 18.1.0 二进制还会缓存在 `~/.pg0/installation/18.1.0`，不是全部位于 ARTIFACT_ROOT。

## 方法及限制

- 46 条人工合成记忆，46 道冻结问题（40 道有答案、6 道无答案）；14 道语义改写题。两个账户、两个项目，含同名项目、已替代状态、否定、数字、中英混合、多依据。
- 语料 SHA-256：`73017f842f5ca6cfd4b24d1e91fc73800b6aa2a515333801b2ae85bbf516c961`。脚本拒绝变动后的语料。
- top-5 以去重后的**来源文档**计数，多依据题必须全部命中。它衡量找回证据，不能替代最终回答事实正确率。
- 原始引擎候选、宿主过滤后的候选、1,200 UTF-8 字节证据预算分别报告。状态过滤来自原始记录，不能算成引擎自行解决冲突。
- 账户使用不同 bank；项目/global 使用 `any_strict` 标签过滤；全部原始候选仍做越界核对。
- 顺序检索 3 轮，共 138 个样本；另测 3 并发。请求超时 2 秒，计作质量失败，实际耗时保留在延迟分布。
- 首次查询单列；模型下载和冷启动单列；缓存重启另测。
- 每 250ms 采集监督进程、API、数据库进程树。RSS 求和可能重复计算共享页；CPU 秒差只能用于进程集合稳定的阶段。
- 删除探针使用独立 bank，验证写入→召回→删除→召回→明确重建→召回→再次删除，并在重启后检查。
- 没有导入真实历史，没有千/万条规模负载，没有客户端端到端验收，没有测后台归纳和跨设备同步。

晋级门槛在运行前写入 `docs/superpowers/plans/2026-11-07-hindsight-local-validation.md`，不能按结果下调。
