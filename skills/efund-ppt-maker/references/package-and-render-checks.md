# 成品包、图表口径与实际文字边界

本规则补充既有封面、品牌、字号、目录和逐页视觉验收，不替代这些门禁。

## 逻辑页与打包内容

成品页序由 `ppt/presentation.xml` 的 `p:sldIdLst` 及其 typed slide 关系决定，不能按 `slideN.xml` 文件名排序。复制模板后，编辑器必须真正删除未使用幻灯片及其关系；只重写 `sldIdLst` 会把未展示的模板说明、示例数据及图表继续打包。

从模板新建交付件时运行：

```bash
python "$SKILL_DIR/scripts/check_efund_package.py" "$FINAL_PPTX" \
  --require-clean-slide-tree --json-output "$QA_DIR/efund-package.json"
```

`unlisted-slide-part` / `unlisted-slide-relationship` 必须通过修正构建过程清零，再完整导出；不通过隐藏页面、删除检查报告或只删除 ZIP 中个别文件来掩盖问题。`show="0"` 的隐藏幻灯片如果仍在主逻辑页列表中，不属于未列入页面。明确要求保留现有稿中的导航附页时，先说明保留范围，使用不带 clean 参数的库存报告逐一核对，不能默默把模板页当成附页。

此检查从内容类型识别 slide 部件，并核验实际关系的类型、包内目标、XML 根节点及重复引用。它不会证明一张结构正常的页面已正确渲染。

无论新建还是修改已有稿，最终候选都必须运行包检查；只有 `--require-clean-slide-tree` 随新建/保留附页的任务范围选择。报告的 `sha256` 绑定本次读取的文件字节。规范化、元数据清理或任何重新保存后，旧报告、旧 PDF 与旧原生打开记录均不能用于新文件，必须对新候选重新生成并核对哈希。

## 原生数据图表的数量

先按任务约定区分原生数据图表、可编辑形状信息图和图片。原生图表支持图表数据编辑；形状柱图可以逐对象编辑，但不能据此声称有图表数据表。一般关系图、流程和形状信息图不要求存在原生图表。

**只有需求明确要求原生数据图表数量时**，从需求取下限并增加参数，例如最低六张：

```bash
python "$SKILL_DIR/scripts/check_efund_package.py" "$FINAL_PPTX" \
  --require-clean-slide-tree --min-native-charts 6 \
  --json-output "$QA_DIR/efund-package.json"
```

数量按未隐藏逻辑页内真实 `c:chart/@r:id` 所指向的有效 `chartSpace` 部件去重统计。孤立 chart 文件、未使用关系、隐藏页图表、同一图表部件的重复实例不满足额外配额；报告另列对象数便于核对。不能用压缩包中 `ppt/charts/` 的文件个数证明任务完成。图表质量、可读性、数据来源和分析价值仍须逐图核对；结构计数不是这些要求的替代证据。

## 原生图表的数值、标签与 XML

按以下原则核对图表缓存、内嵌数据表和最终渲染，三者不能互相替代：

1. **比例条形显式从零开始。** 用柱或条的长度比较非负金额、数量或占比时，显式设置数值轴 `minimum_scale=0`，按真实范围设置上限并给标签留空间。隐藏轴线或刻度不能掩盖自动缩放产生的正数截断基线；最终柱长比例须与数值比例一致。轴范围和交叉点接口见 [python-pptx 轴 API](https://python-pptx.readthedocs.io/en/stable/api/chart.html#value-axes)。

2. **正负值保留共同零轴。** 数值轴上下限须覆盖真实数据和零点，并显式设置零交叉点，例如 `value_axis.crosses_at=0`；不要统一删除数值轴后依赖渲染器推断范围。实际渲染后逐项核对正负值位于零点两侧并符合坐标方向，以及负号、单位和标签位置；常规方向下负值向左或向下、正值向右或向上。若缓存和内嵌表保留负数，渲染却丢失负号或方向，只能先确认表现不符合数据；没有对照证据，不能断言代码取了绝对值，也不能把原因唯一归到某个参数或渲染器。

3. **系列标签完整继承后再覆盖。** series 级 `c:dLbls` 会整体覆盖 plot 级配置。逐点隐藏、改色或设置自定义文字前，如需新建 series 级 `dLbls`，先复制完整的基础标签配置，再添加点级覆盖；保留 `numFmt`、`sourceLinked`、字体和位置，并显式设置所需的 `showVal`，关闭不需要的 `showCatName`、`showSerName`、`showLegendKey`、`showPercent` 和 `showBubbleSize`。不要只创建一组点级覆盖就假定其他系列标签仍继承 plot 设置。依据见 [官方标签 XML 语义](https://python-pptx.readthedocs.io/en/latest/dev/analysis/cht-data-labels.html#xml-semantics)。

4. **删除标签与格式配置互斥。** `CT_DLbl` 在 `idx` 后选择 `delete` 或格式/文字组，不能同时写入。隐藏点可使用 `idx` 加 `delete=1`；保留并改色、改文字的点不应添加 `delete=0` 后再接 `txPr` 或 `tx`。手工修改 XML 时检查这一选择分支，见 [官方标签 schema](https://python-pptx.readthedocs.io/en/latest/dev/analysis/cht-data-labels.html#related-schema-definitions)。

5. **轴格式遵守 schema 顺序。** 优先使用 `category_axis.format.line` 等公开 API。手工修改 `CT_CatAx` 时，`spPr` 位于刻度标签配置之后、`txPr` 和 `crossAx` 之前，不能按固定子元素下标插到 `delete` 或 `axPos` 前面；交叉点也须保留规定顺序。格式字段存在不代表 XML 合法，见 [官方轴 schema](https://python-pptx.readthedocs.io/en/latest/dev/analysis/cht-axes.html#related-schema-definitions)。

6. **浮动区间标端点，不标跨度。** 用隐藏基座 `L` 加可见段 `U-L` 表示区间时，可见段长度不是指标本身。给该数据点设置明确的 `L—U` 自定义标签并保留单位，例如 `4%—5%`；不能把跨度 `1%` 当作回报率，也不能仅删除跨度标签后留下无数值的浮动条。自定义文字可使用数据点的 `data_label.text_frame`，见 [官方 DataLabel API](https://python-pptx.readthedocs.io/en/stable/api/chart.html#pptx.chart.datalabel.DataLabel)。

7. **轴标识采用 Office 可接受的非负 ID。** `c:axId` 与 `c:crossAx` 的 schema 类型均为 UInt32（[AxisId](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.axisid)、[CrossingAxis](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.crossingaxis)），Office 另限制最大值为 `2147483647`。生成库可能输出负整数；直接加 `2^32` 仍可能超过 Office 上限，不能作为修复。`efund_chart_properties.normalize_axis_ids(chartSpace)` 在发现这种已知 32 位 ID 时，按该图表的轴声明顺序分配 `1..N`，同时改写 plot 引用、轴声明及交叉轴引用；合法图表保持原样。数据点、轴范围、零交叉、标签、类型和几何都不参与这次变换。未知数值、重复声明、缺少声明或悬空引用一律停止，要求修正生成器。

`qa_efund_pptx.py` 与 `check_efund_package.py` 默认执行同一轴范围及引用门禁，逐项输出 part、位置和值；检查全部 `chartSpace`，包括隐藏和孤立图表，但不把它们计入可见图表配额。`normalize_efund_text.py DRAFT NEW_OUTPUT` 已调用同一生成 helper，仍只写新文件。生成、规范化及清理完成后再跑门禁，不能在检查后写回未规范化的旧稿。

这项检查覆盖已复现的轴问题，不是全量 OOXML schema 证明。2026-10-24 的隔离回归中，官方 Open XML SDK 3.5.1 / Office2019 对原稿报告 42 个负轴 ID 错误；对仅改写这 42 个属性的新副本报告零错误。schema 零错误、ZIP 可读、LibreOffice 可渲染和 PDF 正常均不能替代目标 PowerPoint 对最终哈希文件无修复打开；出现修复提示或删除内容即保持失败，不得填写 `nativeOpen: pass`。

## 标题换行与正文、结论框

正文小标题换行后，先按最终渲染字形高度扩展标题框，再将正文首行放到标题实际文字底边下方 12–16px。不要保留固定正文 y 坐标。正文实际文字须完整装入自己的文本框，且与同栏下方结论框保留至少 16px；不能以文本框之间有空隙证明文字没有被遮盖。

标准标题和正文须导出本次成品的 `textLayout.bbox`。`check_efund_readability.py` 额外检查：

- `narrative-text-outside-frame`：真实字形超出文本框，允许 2px 渲染取整容差。
- `narrative-callout-clearance`：同栏真实正文与下方 `takeaway`、`recommendation` 等结论框的间距不足。大文本框中未使用的空白不等于文字。

渲染器只能返回可见字形、不能暴露被裁切的文本时，须另把 PPTX 完整文字与渲染逐行文本核对，逐页检查隐藏在底板后的内容。不得把缺失内容生成一个较短的 bbox 后登记为通过。

标准说明区的 `text` 必须从成品 PPTX 对应逻辑页、Shape ID 的完整正文提取，不能沿用规划稿。其 `textLayout.lines` 拼接后只允许空白差异，必须与全文一致；`narrative-rendered-text-mismatch` 会拦截仅匹配首行、按长度达到 90% 就停止、混入右栏标签或遗漏尾段等错误。数字、破折号、项目符号和其他语义标点均不自动删除或替换。此检查仅适用于 `standard-narrative-title` / `standard-narrative-body`，不扩展到普通列表或其他段落。

若成品 XML 的 `buChar` / `buAutoNum` 设置使渲染器生成正文文本中没有的列表标记，提取器须核对该设置并显式声明 `textLayout.generatedListMarkers: true`。发生文字差异时返回 `narrative-rendered-text-review-required`，按实际段落和列表标记逐项复核；不能用该声明自动通过，也不能泛化去掉所有行首数字或符号。正文自身已含的符号仍精确核对。`source: "rendered"` 和一个 bbox 都不能单独证明取行正确；不能把预期全文直接回填成“渲染行”来消除错误。

## 正负数据标签的独立槽位

类别文字、正负数值文字与数据柱分别分配区域。负值柱不能从零轴向左侵入类别槽，负值标签也不能盖住类别文字。为类别使用 `chart-label-*` 或 `textRole: "chart-category-label"`，数值使用 `chart-value-*` 或 `textRole: "chart-value-label"`，并为两者导出实际渲染的 `textLayout.bbox`。

`chart-category-value-overlap` 检查两类真实文字是否相交，`chart-rendered-bounds-required` 表示缺少可靠字形证据。数值可以按图表语义放在自己的柱内；此规则不禁止这种排法。原生图表若不能导出内部标签对象，逐图查看类别、正值、负值和零轴附近的完整文本，保持待视觉复核，不能用外围图表框替代内部标签证据。

## 每页的品牌家具

每一页分别检查页头 Logo、标题带和完整页脚。比较最终 PPTX 与对应 PDF 渲染，不抽查一张“同版式”页面后批量登记通过。布局中的图片对象、媒体和关系均存在，只能证明资源可解析；仍可能有个别页面的 Logo 在导出时没有绘出。此类情况必须修复导出或继承过程，重新渲染并更新 visual-review 中的 `brandFurniture`、`overflow`、`textGraphicSpacing` 和 `lineBreaks` 观察记录。没有实际图像观察能力时保持待复核。
