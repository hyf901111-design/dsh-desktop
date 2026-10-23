# 内置研报写作 Implementation Plan

> **For agentic workers:** Use parallel implementation for the independent engine and managed-skill integration; root implements the report workflow and reviews the combined change. This executes the user's explicitly approved route without further option prompts.

**Goal:** 让用户在 EWork 中直接使用有证据台账和确定性计算的易方达配色研报技能。

**Architecture:** 既有受管理技能注册/路由 + 技能包内 Node ESM CLI + 同次运行的台账、计算和 HTML 产物。模型负责研究及观点，程序校验事实、计算和输出数值；无新增常驻服务。

**Tech Stack:** 当前 EWork Electron/TypeScript、Node ESM/标准库、Vitest、独立 HTML/SVG。

**Spec:** `docs/superpowers/specs/2026-10-23-equity-research-skill-design.md`

## Global Constraints

- 默认启用但遵守托管技能关闭状态，稳定 ID `builtin:ework-equity-research`。
- 不新增产品运行依赖；不复制 LEDGER 完整代理链或其宣传素材。
- 数值和假设有来源；财报期、研究日与行情时点分别保存。
- 易方达蓝青配色，报告保持来源、缺失项和模型限制可读。
- 只跑直接相关测试和类型检查；本地测试不发布、不改版本、不推送。

## Review Focus

1. 同一页另一列数字不能被当成目标期事实；明确行/列和期间校验。
2. 模型没有读取原始快照时不能获得可信状态；symlink/路径不得逃逸输入目录。
3. 没有行情或估值桥字段时不能暗补零、输出评级或现价回报。
4. 自由文稿数字和 HTML 注入不能绕过结构化结果。
5. 停用或同名本地技能不能绕过用户选择；包内脚本必须实际存在。

## Task 1: Evidence and deterministic engine

Owner: research_engine. Files: `skills/ework-equity-research/scripts/lib/{index,evidence,numbers,calculate}.mjs`（按职责调整）、`examples/`、`test/equity-research-engine.test.js`。

- [x] 先运行证据歧义、错期、错指标、单位、大金额与无行情等失败用例。
- [x] 实现 `validatePacket(packet,{root})` 和 `calculatePacket(packet,validated)`，固定 schemaVersion 1。
- [x] 实现显式输入派生计算和可选固定年期 FCFF DCF；导出诊断与未决状态。
- [x] 聚焦测试通过，提供API/样例交接，root审阅后中文提交。

## Task 2: Report CLI and built-in skill resources

Owner: root. Files: `SKILL.md`、`_meta.json`、`references/`、`scripts/research.mjs`、`scripts/lib/report.mjs`、CLI测试。

- [x] 编排采用同次校验/计算，写入产物及哈希；失败保留明确 validation，不交付已知错误报告。
- [x] 数字模板只接受事实/计算引用，渲染正文、数据表、来源、假设与复核项；HTML转义、无外链脚本。
- [x] 创建易方达配色的可打印HTML；以离线合成和真实已核验资料验证。
- [x] 用新技能在独立工作目录走一次实际报告生成和逐页/浏览器检查。

## Task 3: Managed discovery and packaging

Owner: research_integration. Files: bundled-skills、skill-policy/provider/priority、runtime index、包验证和聚焦测试。

- [x] 先写稳定入口、发现与停用的失败测试。
- [x] 注册研报技能、稳定alias和精确自动加载指引，不改变金融数据路由。
- [x] 包验证包含技能及运行脚本，测试provider/关闭/同名替代边界。
- [x] 聚焦测试和类型检查，交给root做整合审查。

## Task 4: Local integration and user test launch

- [ ] 聚焦检查后对feature创建中文提交与handoff。
- [ ] 运行integration preflight/create/merge，记录准确候选tip及所有权。
- [ ] 在许可源码树执行本地测试手册；完整本地包校验。
- [ ] 核验真实EWork主界面与技能入口；保持应用打开，提供一句可测试指令。
- [ ] 如实保留未验收的候选状态和未覆盖项，不自动发布或伪造用户accepted。


## Feature verification evidence

- 独立审查先复现并关闭错列指标、旧期间表头、冲突单位、未来披露日期与指标量纲五类漏检；合法独立单位列和回溯访问输入仍通过。
- 真实茅台官方 PDF 提取包在独立验收目录生成：十二项事实、十项确定性计算；PDF 原件、表格 TSV、逐页行映射与 hash 分别保留。不使用模型补写的“原文”。
- 聚焦范围为研报内核/CLI/渲染、技能发现和启停、金融路由、内置技能包一致性及 macOS 包运行时；不运行全功能单元测试。
- 浏览器实际检查合成报告桌面与窄屏布局，核对易方达蓝青配色、DCF每股值/手工假设/价值桥及来源近引用。
- 原生主界面和技能入口必须在 integration 候选构建后核验；用户实际接受和 main 晋升留待真实验收。
