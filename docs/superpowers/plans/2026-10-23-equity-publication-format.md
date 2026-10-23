# 正式研报版式与文件命名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** 让内置研报技能按样例的投研摘要封面与正式内页输出，并以正式报告名默认交付 HTML/PDF。

**Architecture:** 共用现有事实/计算引擎与 HTML 渲染内容；新增纯出版元数据函数，扩展 CLI manifest 与可信 runtime 的实际文件映射。打印宿主继续隔离离线渲染。

**Tech Stack:** Node ESM、现有有理数引擎、自包含 HTML/SVG/CSS、Electron PDF、Vitest、Poppler/Pillow。

**Spec:** `docs/superpowers/specs/2026-10-23-equity-publication-format-design.md`

## Global Constraints

- 易方达配色不变；评级、行情、预测、作者/机构只按真实可核验信息呈现。
- HTML/PDF 共用正式 basename；机器 JSON 保持稳定名，所有输出可由 manifest 检查。
- Bash 凭据过滤、可信工具会话边界和沙箱不变；不得任意脚本/env/路径。
- 不裁切、隐藏或整页缩字；长内容允许分页。全文数值绑定同次事实/计算。
- 仅聚焦测试与本地构建，不晋升/发布/推送；中文本地提交。

## Review Focus

- 超长/恶意中文公司名、代码、重复清洗与路径字符：文件不越界且名称有界、可区分。
- 映射缺键/换名/换文件/符号链接/取消：不能宣称双格式成功，保留真实失败入口。
- 全年/中期/时点或不同范围混合：封面图与财务摘要分清口径，不凑可比。
- 长要点/长表/长原文与缺数据：不裁切、伪造页码或填零，打印仍可读。
- 观点标题、正式报告名与研究状态：不冒充评级、资质、机构签发或预测完成。

### Task 1: 出版元数据、动态正式文件名与可信映射

**Files:** 新增 `scripts/lib/publication.mjs`；修改技能 `scripts/research.mjs`、runtime `research-report-tool.js`；测试 CLI、PDF client、research-report-tool 及新增 publication 测试。

**Interfaces:** `publicationMetadata(packet)` 返回 spec 中五字段；`manifest.artifacts` 仅记录已生成的七类 basename。renderer 消费该纯函数，工具不动态导入研究包脚本。

- [ ] 先写红回归：正式双文件名、旧 packet 默认类别、非法/超长输入及 metadata；动态映射必需哈希、取消恢复及恶意路径。
- [ ] 实现纯元数据、CLI actual filenames/manifest map、runtime 安全映射及真实回执。
- [ ] 聚焦验证通过，精确中文提交所属文件。

### Task 2: 摘要封面、正式内页、目录与财务摘要

**Files:** `scripts/lib/report.mjs`，必要时拆出 `publication-layout.mjs`；`quality.mjs` 的 label 校验；新增正式版式测试；`src/main/research/research-pdf.ts`、目录解析 helper 与宿主测试；schema/evidence 的 EPS/ROE 严格事实能力及聚焦回归。

**Interfaces:** 消费同次 verified facts/calculations、publicationMetadata、已有段落/表格/SVG helpers；保持 validateReport/renderReport 公共签名。summary label 必须进入已有模板/数字校验。

- [ ] 建立红回归：两层封面/基本数据/财务摘要、目录/图表索引、编号与来源、逃逸/缺数据/全年中期分隔。
- [ ] 实现封面与正文样式，三表摘要和可点击导航；禁止捏造页码、行情或作者。
- [ ] 真实内部 Link destinations 得到目录/图表页码，固定几何槽填数后第二遍目的页验证；保留禁JS/离线/取消与资源限制，输出正式页眉页脚和书签。
- [ ] EPS/ROE 输入只扩受控别名与正确单位，真实TSV/hash核验与错误口径红绿回归；不搬参考数字。
- [ ] 真实打印茅台稿，逐页比对参考的结构与数据要素；修复版式后重新生成。
- [ ] 聚焦验证并精确中文提交。

### Task 3: 技能规范、样例与本地验收

**Files:** `SKILL.md`、`references/{workflow,packet-contract,report-style}.md`、`_meta.json`；评估仓库新的 v3 研究包、实际产物与验收记录。

- [ ] 将参考格式学习结果写入可复用规范；技能升 1.2.0，强调正式绝对入口、完整封面和缺口处理。
- [ ] 用既有真实原件准备茅台封面/摘要，不改变财务原文，独立重算并审稿。
- [ ] 独立审阅、聚焦检查、严格后继 handoff/refresh/merge，不改 main。
- [ ] 构建本地包、验证包、真实默认任务输出正式名两文件并原生预览，应用保持打开。
- [ ] 更新并中文提交可复现证据；向用户提供正式文件入口和真实限制。
