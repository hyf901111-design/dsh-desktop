# 首页PPT教程预置投资研报资产

资产位于 `packages/dsh-research-task-runtime/assets/home-presentation/`。

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `source-report.pdf` | Vanguard官方28页原报告，未经修改的本地研读附件 | `af3b10b6b05f8ee4734b35bfaeb3f272a370133a7949b7203f87cacf4c9de229` |
| `company-research-briefing.pptx` | 8页中文公司规范汇报，1张原生图表、3张原生表格，可编辑文字 | `643ea5e679bd37f992f889fbf753a9b22d5f4f4c92ec024a3321493ccf2da356` |
| `source-metadata.json` | 原始URL、日期、哈希与每页来源 | `64fb9be58b04319bc5ec62de039a875c03d8ae2c5b4d057b4bb8d9101b9df0e8` |

原文：Vanguard economic and market outlook for 2026，发表于2025年12月。官方来源为 <https://corporate.vanguard.com/content/dam/corp/research/pdf/isg_vemo_2026.pdf>。这是历史研报示例，宏观预测截至2025-12-10，AI情景截至2025-09-30，VCMM模拟截至2025-10-31。PPT逐页保留来源与预测日期，没有添加回测收益或交易指令。原报告只供本地教程附件阅读，不代表已获对外再发布授权。

唯一品牌来源为`efund-ppt-maker`的`efund-template-v6.pptx`。正文由`@oai/artifact-tool`生成原生对象后置入原模板品牌壳。模板往返导出的封面属性有差异，因此保留原包的封面、母版、布局、主题与品牌媒体，避免重新描画品牌。封面逐对象精确检查为0错误0警告。

最终件已通过包完整性、画布与对象几何、原生图表工作簿、显式字体策略、标题锚点、表格无描边、文案、可读性、隐私与视觉记录门禁。最终可见字体核验171段，仅包含华文黑体_易方达与Arial。Microsoft PowerPoint 16.74无修复打开并逐页检查8页；独立PDF渲染也逐页检查8页。中间PDF只用于本地QA。

结构检查的10条警告均已判定：7—8pt来源及口径备注可读且在安全区内；封面日期“年/月”的东亚字体来自标准源对象；非首选字体仅存在于继承主题/母版。字号脚本不能枚举原生表格的graphicFrame，分别登记4:102、5:105、7:102，并独立核验36个单元格run的10pt表头、11pt正文和显式字体。普通内容布局检查0错误、8条来源字号提示。

本地QA证据位于被忽略的`output/home-presentation-qa-20261024/`：`native-contact-sheet.jpg`、`native-1.png`至`native-8.png`、`render/slide-1.png`至`slide-8.png`、`template-frame-map.json`、`visual-review.json`及各门禁结果。只提交本资产目录与本记录。
