# 1.1.0：跨渲染器样式与真实视觉验收

本版针对实际成品出现的黑色标题、主题阴影和目录跨软件差异补齐门禁。原有检查继续执行。任何无法解析或未经检查的项不得转成“通过”。

## 标题与阴影

内置品牌青色顶栏标题必须逐个非空 run 写入 `a:rPr/a:solidFill/a:srgbClr val="FFFFFF"`，无透明度或亮度变换。复制原标题框、只替换首个 run 的文本，不保证保留布局/母版中继承的白色。检查实际 slide 上的 run，不能拿布局占位符替代标题来判断颜色。用户明确提供不同标题颜色时，应据用户模板新增明确配置与回归测试，不可用任意映射值豁免。

禁止阴影、发光及残留的非零 `a:effectRef`。python-pptx 的 `shape.shadow.inherit=False` 只写局部 effectLst；形状的 `p:style/a:effectRef idx="2"` 仍可能带回主题阴影。创建对象后清除局部 shadow/glow，并将 effectRef 设为 0；检查组合子对象、实际使用的布局、母版、图表与图示部件。不要删除品牌图或整个母版来消除阴影。检查器保守拦截非零主题效果引用，即使某个预览器暂时没有画出阴影。

## 目录必须稳定显示

V6 目录数字沿用源稿 `1EB9E1`，不能用通用品牌青替换；列宽、水平起点、行高、字号和字重沿用源目录。标题高亮按章节规则执行。

原生表格显式关闭 firstRow/lastRow/firstCol/lastCol/bandRow/bandCol；每个单元格写白色 RGB 填充，关闭左/右/上/对角线，仅保留下边 `w=6350`（0.5pt）、`CCCCCC`、`dash`。不能留下主题样式决定填充、顶边和条纹，否则 PowerPoint 与 PDF 可能不同。仅调整表格总高度、删行或把表格标成“非文本视觉”不能豁免样式校验。用户提供不同源稿时先增加源配置，不能修改检查器来适配错误成品。独立文本框目录当前返回待检查错误，需补齐真实对象样式检查后才能通过；不得静默跳过。

## XML 可解析不代表 PowerPoint 可打开

禁止对 rPr/defRPr/endParaRPr 无序 append solidFill。DrawingML 中 fill 必须位于效果、下划线、latin/ea/cs 字体和超链接之前；优先使用编辑库的颜色 setter/get_or_add_solidFill 等保持序列的方法。本次旧成品把目录颜色 append 到字体后，PowerPoint 提示修复并删除部分内容，目录首行消失、其余变黑，而 LibreOffice 仍能渲染。门禁新增 text-properties-child-order-invalid，检查重复填充和错误子节点顺序。这是针对已知缺陷的检查，不是全量 OOXML Schema 验证。

参考：[python-pptx 的颜色节点后继顺序](https://github.com/scanny/python-pptx/blob/master/src/pptx/oxml/text.py)。任何 PowerPoint 修复提示都意味着失败；不得接受修复后页面作为原文件通过证据。

## 两种交付格式都要看

结构零错误、PDF 字体嵌入、像素存在性检查均不能证明视觉正确。PPTX 必须在目标演示软件实际打开检查，PDF 必须单独渲染并逐页看图；同一个 PDF 的 PNG 不能充当 PPTX 原生外观验证。记录渲染器与版本。检查标题颜色、无阴影、目录样式、溢出及品牌家具；非目录页的 tocStyle 表示已确认无目录对象，无需伪造检查内容。

生成 `visual-review.json`：顶层 `pptxSha256`、`pdfSha256`、`method`（image-capable-model 或 human）、`reviewer`，以及按页码完整有序的 `pages`。每页含 `page` 和 `pptx`/`pdf` 两份记录，分别含 `image`（相对报告路径）、`imageSha256`、`renderer`、具体 `notes`、`checks`。checks 中 titleColor/noShadow/tocStyle/overflow/brandFurniture 均需真实审阅后记为 pass。未看过图片必须保持 pending，严禁为过门禁补写虚假观察。

```bash
PYTHONDONTWRITEBYTECODE=1 python -B "$SKILL_DIR/scripts/check_efund_visual_review.py" "$FINAL_PPTX" --pdf "$FINAL_PDF" --review "$QA_DIR/visual-review.json" --json-output "$QA_DIR/efund-visual-review.json"
```

此脚本只核验记录完整性与文件哈希，不替代视觉判断。修改最终文件或图像后重新渲染、复核、计算哈希并重跑全部受影响门禁。没有视觉能力时可以交付明确标注“待视觉复核”的草稿和检查结果，但任务不得宣称“全部质量门禁通过”或把视觉复核标为已完成。不得将“未执行”写进偏差日志后自行视为已豁免。
