# 应用内本地记忆技术样机

用途：替代 Hindsight 独立服务，验证 Node/Electron 可嵌入的 SQLite + sqlite-vec + 本地 ONNX 语义检索。这里是实验代码，不是产品入口、生产鉴权实现或数据迁移工具。

## 结构

- `engine.mjs`：直接读取固定 ONNX 和 tokenizer 文件，384 维 mean-pool/L2 embedding；按用户创建内存 SQLite，中文分词 FTS5 和 sqlite-vec 精确向量距离；持久库只保存 AES-GCM 合成测试密文。
- `worker.mjs`：隔离进程和串行请求队列，模拟桌面后台 worker。测试命令显式传递合成 owner；真正接入必须由主进程账户状态绑定，不能把这个接口直接给 renderer。
- `benchmark.mjs`：冻结的 46 原题、24 新题、1,000 干扰记忆，纯语义/纯词法/固定融合对照，1/3/10 请求并发与真实进程重启探针。
- `engine.test.mjs`：直接覆盖隔离、更新删除、状态过期过滤和加密持久化的 4 项测试。
- `package-lock.json`：隔离依赖锁；不会添加到产品 `package.json`。

原始语料和新保留集分别复用同级 `hindsight-local-validation/corpus.json` 与 `hindsight-backend-validation/heldout.json`，脚本校验 SHA-256。干扰数据规则在第一次运行前冻结；不根据结果改变题目、标签或融合权重。

## 复现

使用仓库外的新目录 `SPIKE_ROOT`，模型目录 `MODEL_DIRECTORY` 必须是已校验的官方快照 `614241f622f53c4eeff9890bdc4f31cfecc418b3`。路径由操作者设置；不需要 API key。

```sh
mkdir -p "$SPIKE_ROOT/runtime"
cp experiments/local-memory-spike/package.json experiments/local-memory-spike/package-lock.json "$SPIKE_ROOT/runtime/"
npm ci --prefix "$SPIKE_ROOT/runtime" --no-audit --no-fund
LOCAL_MEMORY_RUNTIME="$SPIKE_ROOT/runtime" node --test experiments/local-memory-spike/engine.test.mjs
node experiments/local-memory-spike/benchmark.mjs "$SPIKE_ROOT/evidence" "$SPIKE_ROOT/runtime" "$MODEL_DIRECTORY"
```

本次 Node 22.23.2、macOS arm64 已执行；不能据此宣称 Electron 或 Intel 打包已通过。首次 npm 安装需要网络；模型资产预置完成后，此脚本不调用 HTTP、Hindsight 或模型 API。没有执行操作系统层断网测试。

同一 evidence 目录不能重复运行，避免遗留 canary 改变语料规模。结果保存在 `results.json`，`partial-or-final.json` 用于中途失败诊断。`synthetic-test.key` 是仅用于合成数据的 0600 文件，不是生产 Keychain 集成；不得用此样机导入真实用户记忆。

## 统计口径

- 返回候选按来源完整命中计算 top-5；多依据题需要全部命中。1,200 UTF-8 字节证据包单独计分，不额外叠加 top-5 截断。
- 历史题的 `mode: history` 来自固定测试标注，尚未验证产品如何从自然语言识别历史查询。
- 向量、词法两路先做账户、项目、状态和过期过滤；关键词分词使用 `Intl.Segmenter('zh-CN')` 加中文二字片段。
- 融合固定 RRF k=60，语义权重 0.75、词法 0.25；查询 embedding 每次重新计算，没有用问题向量缓存美化延迟。
- 延迟从父进程提交请求开始，到收到完整结果为止：IPC、排队、分词/embedding、SQLite、证据打包与结果传输全部包含。聊天模型生成、前端渲染及正式应用启动未包含。
- 每并发档 210 次、总计 630 次；5 秒超时也计入分布与失败率。RSS 是该 worker 进程采样/检查点，非完整桌面应用内存，短暂峰值可能漏采。
- 加密持久库的大小在重启探针之后记录（原有 1,066 条，加两条保留 canary）。
- 未设“无答案”过滤阈值：相似度不是回答置信度。所有无答案题返回候选这一限制必须明确报告。

## 当前结论

参见 `docs/superpowers/reviews/2026-11-07-local-memory-alternative.md`。技术可行性通过，产品未接入；召回正例成绩不能替代无答案防误用、自动抽取、真实账户切换、迁移和前端验收。
