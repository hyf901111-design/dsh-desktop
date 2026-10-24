# 首页 PPT 教程预置资产：投资研报增强稿

成稿主题为《人工智能周期与资产配置》，副题“领航集团二〇二六年展望研读”。在原 8 页版本提交 `fdb45e2c` 基础上重做为 16 页，含 3 章规范目录、11 页实质研究内容、9 张原生数据图和 6 个原生表格（其中 3 个是章节目录），封面与谢谢封底均继承唯一品牌源 `efund-template-v6.pptx`。

资产目录：`packages/dsh-research-task-runtime/assets/home-presentation/`。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `source-report.pdf` | 969641 | `af3b10b6b05f8ee4734b35bfaeb3f272a370133a7949b7203f87cacf4c9de229` |
| `company-research-briefing.pptx` | 769660 | `6cc70ec5fccfa8f376d4f6e28d01861e976204c7de53b791bf3ecbdbb18f7748` |

原始附件是 Vanguard 官方公开研究报告 [Vanguard economic and market outlook for 2026](https://corporate.vanguard.com/content/dam/corp/research/pdf/isg_vemo_2026.pdf)，28 页，2025 年 12 月报告。宏观预测截至 2025-12-10、AI 情景表截至 2025-09-30、VCMM 模拟截至 2025-10-31。作为用户要求的本地历史研报教程示例预置，不对外发布原报告，不代表当前投资建议。

| 页 | 内容 | PDF 依据页 |
| ---: | --- | --- |
| 1 | 标准封面 | 1 |
| 2 | 第一章目录：增长与投资周期 | — |
| 3 | 结论与研读框架 | 2、9、15、17 |
| 4 | 区域增长与通胀双图 | 2 |
| 5 | 资本开支、可用资金及覆盖计算 | 5、9 |
| 6 | 就业与实际工资双图 | 12 |
| 7 | 第二章目录：AI 情景与资本回报 | — |
| 8 | 美股三情景回报区间 | 17 |
| 9 | 资本回报敏感性 | 17 |
| 10 | 情景区间中点加权计算 | 17 |
| 11 | 第三章目录：配置逻辑与研究跟踪 | — |
| 12 | 十年期预期回报与配置角色 | 15、18、26 |
| 13 | 跨情景配置角色矩阵 | 15、18、19 |
| 14 | 观察指标与反证问题 | 9、12、17、19 |
| 15 | 研究提要与结论 | 2、9、15、17、18、26 |
| 16 | 标准谢谢封底 | — |

数字口径逐项核验：美国 GDP 为四季度同比，其他地区为全年增速；劳动力比较为年化统计，未宣称 AI 因果效应。第 9 页的 3.1 万亿美元模型投入含研发，与第 5 页 2.1 万亿美元资本开支范围不同。2.4 万亿美元按原报告第 9 页脚注 6 的资金口径标示，含回购后现金流及存量现金；约 1.14 倍和 4.5% 都明确标为本稿研读计算。6% 对应非美股票整体，未冒充非美成熟市场独立预测。无回测收益、虚构波动率、估值倍数或仓位指令。

报告重述仅作简短结论与数据标签；专业解释、跨情景矩阵和反证框架标识为本稿研读判断，未逐段翻译。`source-metadata.json` 保留旧字段并新增 `chapters`、`figures`、`dataSummary`、嵌套 `source` / `presentation`，包含 16 页纲要、每页来源、全部图表数值、单位、日期及计算边界。

创作使用 `efund-ppt-maker` 与 `presentations` 技能。可编辑内容由 `@oai/artifact-tool` 实际生成，9 张图各含可编辑嵌入工作簿。精确保留 V6 原始布局、2 个母版和 6 个媒体部件原字节，封面合同零差异；中文字使用华文黑体_易方达，数字及拉丁文字使用 Arial。标准正文 12pt / 1.5 倍行距，页内小标题 15pt；来源 7pt、口径注释 8pt 逐页检查。三次目录沿用原起点、列宽和行高，仅切换当前章深蓝高亮。

最终 PPTX 在 Microsoft PowerPoint 16.74 实际无修复打开并逐页检查 16 页；全部目录显示正确的三条单线。封面、结构、delivery、字号、布局、可读性、写作与隐私检查均为 0 errors。结构 17 条及布局 15 条 warnings 已在 QA 记录逐对象解释：均为已检查的来源/脚注小字，或原封面继承字体与未使用主题定义。可见文本字体政策核验 414 项，另独立核验原生研究表格 65 个可见 run。

QA 目录为被忽略的 `output/home-presentation-rich-qa-20261024/`：`native-contact-sheet.jpg`、`native-01.png` 至 `native-16.png`、`native-crops/`、`render/slide-01.png` 至 `slide-16.png`、`template-frame-map.json`、`visual-review.json`、`qa-review.txt`、各门禁 JSON 和 finalization receipt。逐页 PNG 来自真实目标软件与独立 PDF，非估算排版。

交付格式仅为 PPTX。LibreOffice 26.8.0.3 独立 QA PDF 会省略三张目录前两行下边线；原生 PowerPoint 与 PPTX 边线 XML 均正确。此已知 PDF 渲染差异保留 `tocStyle: pending`，visual-review 门禁如实为 `review-required`，没有伪写全部通过；经主代理明确按 PPTX 原生检查验收，不阻塞本地 PPTX 预置。PDF 不进入用户附件目录。

本次只提交成稿、metadata 与此资产记录；原始 PDF 保持既有哈希，不涉及产品代码或共享客户端构建。
