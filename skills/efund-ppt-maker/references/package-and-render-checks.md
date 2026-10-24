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

## 原生数据图表的数量

先按任务约定区分原生数据图表、可编辑形状信息图和图片。原生图表支持图表数据编辑；形状柱图可以逐对象编辑，但不能据此声称有图表数据表。一般关系图、流程和形状信息图不要求存在原生图表。

**只有需求明确要求原生数据图表数量时**，从需求取下限并增加参数，例如最低六张：

```bash
python "$SKILL_DIR/scripts/check_efund_package.py" "$FINAL_PPTX" \
  --require-clean-slide-tree --min-native-charts 6 \
  --json-output "$QA_DIR/efund-package.json"
```

数量按未隐藏逻辑页内真实 `c:chart/@r:id` 所指向的有效 `chartSpace` 部件去重统计。孤立 chart 文件、未使用关系、隐藏页图表、同一图表部件的重复实例不满足额外配额；报告另列对象数便于核对。不能用压缩包中 `ppt/charts/` 的文件个数证明任务完成。图表质量、可读性、数据来源和分析价值仍须逐图核对；结构计数不是这些要求的替代证据。

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
