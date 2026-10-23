---
name: ework-equity-research
description: Use when the user asks to write, update, or verify a listed-company equity research report, financial-results research note, or evidence-backed valuation report. 用户明确要求撰写、更新或核验公司研报、财报研究、估值报告时使用；单次报价、普通问答和非证券写作沿用原有能力。
---

# 研报写作

交付有清晰观点、可追溯事实和可复算数字的中文研报。借鉴 LEDGER 的“模型研究与写作、程序校验与计算”分工，使用 EWork 当前模型和工具；首批无需安装 Claude Code 或 Python。

## 在 EWork 中使用

用户从技能列表选择“研报写作”，或输入 `/ework-equity-research 给贵州茅台写一份研报`。自然语言明确要求研报时也可加载。停用后不继续调用本技能。

加载技能时返回的资源目录为 `SKILL_ROOT`，不能猜测为当前工作目录。先读 [运行与输入约定](references/workflow.md)，用现有 Bash/文件工具执行资源目录中的 Node 脚本：

```sh
node "<SKILL_ROOT>/scripts/research.mjs" doctor
node "<SKILL_ROOT>/scripts/research.mjs" init --company "贵州茅台" --ticker "600519.SH" --as-of "<实际研究日>" --out "<会话工作区>/research/packet.json"
```

只把技能目录当作只读资源，原文、输入和产物写入当前会话工作区。Node 来自 EWork 当前运行环境，不从网络安装软件。命令长耗时则使用可用的后台任务和状态查询。

## 研究和取证

1. 从用户问题确定公司、证券代码、报告用途和研究截止日。现有信息足够时自主推进，不重复询问已知选项；默认交付完整可阅读 HTML，而非堆砌资料。
2. 优先用户资料、交易所/公司正式披露；金融连接和检索沿用当前可见工具及已启用“基础金融分析逻辑”“基础数据源”的规则。目录不是业务数据，来源失效就换可用来源；不能假定付费行情或一致预期已开通。
3. 读取原文后保存本地快照，记录来源、发布日期、访问日期、文件 hash、指标、具体报告期、单位及合并/归母口径。证据指向该数据行与期间列，不用整页另一个数字冒充目标事实。PDF 原件和提取文本分别保留 hash；程序不能证明提取忠实性，关键值回到原 PDF 复核。
4. 将事实填入 `packet.json`，格式见 [输入与证据合同](references/packet-contract.md)。缺失项保留缺口，不能填零。没有最新数据时写明最近已核验期间，未核验现价不输出市值、P/E、涨跌空间或评级。
5. 对重要论点写“支持事实—推论—假设—反证—下次观察”。财务分析应解释业务驱动；营收、毛利、费用、现金流和估值不应是相互孤立的指标清单。

## 计算与写作

```sh
node "<SKILL_ROOT>/scripts/research.mjs" validate --input "<工作区>/research/packet.json"
node "<SKILL_ROOT>/scripts/research.mjs" run --input "<工作区>/research/packet.json" --out "<工作区>/research/run-<本次唯一名称>"
```

同比分解、差额、比例和合计用结构化计算请求交给程序。可选 FCFF 情景估值要求显式预测假设和逐项股权桥，不以勾稽通过替代估值合理性。固定完整年期折现不等于滚动到当前交易日的目标价；金融业务混合、预收款及股本变化需明确复核。

`report` 中定量文字通过 `{{事实或计算ID}}` 插入，亿元可用 `{{revenue-current|yi}}`、比例可用 `{{margin|pct}}`；期间可用 `{{period:revenue-current}}`。财务数字不自由手填，引用来源由 `refs` 自动关联。正文、数据表和图表读取同次计算，错误输入不能靠改文稿绕过。数量词等自然语言仍需人工复核，模板检查不代表全文语义正确。

根据证据组织结论、核心争议、业务与行业、业绩驱动、盈利及现金质量、预测假设、估值与敏感性、风险及跟踪条件。按真实问题取舍，不为页数或图表数量凑内容；没有核验行情/同行/预期，相关结论就写缺口。

## 交付

程序生成 `report.html`、`evidence.json`、`calculations.json`、`validation.json`、`run.json`。报告固定使用易方达蓝青配色，样式规则见 [报告与配色](references/report-style.md)；无需让用户再选主题。打开实际 HTML 检查表格、来源、中文和打印布局，修正后重跑生成。用户要 PDF 时可使用当前已可用的打印工具，从已核验 HTML 导出并检查实际页面；未生成就不要声称已交付 PDF。

向用户先给报告文件入口和主要判断，再简述数据截止、尚未解决的关键问题。所有产物保存在会话文件区，原始输入与输出 hash 关联到本次运行。校验状态表示“快照与字段核对”，不声称外部来源真实或证券研究员专业签发。当前版本不提供原版 LEDGER 五角色盲评、自动滚动三表模型或全链路 Excel 重算保证。
