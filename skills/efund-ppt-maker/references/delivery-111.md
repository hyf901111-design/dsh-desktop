# 1.1.1：封面字号、阅读间距与原生字体

本版与 delivery-110.md 累积生效。内置所有封面副标题已改为 **18pt、常规字重**，包括中文、双语、英文和 AI 技术封面；只修改指定副标题段的 run/defRPr/endParaRPr，保留主标题和固定家具。用户明确提供不同模板时仍以用户模板为准。

## 封面槽、数据表与标准说明区

- 封面可编辑槽逐段拼接 runs 检查，不得保留段首/段尾占位空格；清空空白 run 文本，保留原始段落、字号和框体几何。固定布局品牌文字不改动。
- 普通正文数据表表头 cell properties 显式垂直居中，上下内边距相等。同列 header/body 均左对齐，左右内边距分别相同并显式写入；目录沿用源模板，纯数字列/短标签列仅按 table-layout-contract.md 的 `tableLayoutExceptions` 精确声明改变水平对齐。
- 左说明右图页的小标题和正文都显式 top anchor，正文实际首行紧接小标题实际文字底边下方 12–16px；短正文仍从顶部排列。按真实标题行高收紧标题框，不能只改 anchor 后保留空白高框。两者从最终渲染回读 `textLayout.bbox`，不以 Shape 边界或估算代替。
- `check_efund_cover.py` 拦截封面空白；`check_efund_delivery.py` 从最终 XML 检查表头、同列属性和说明区 anchor；`check_efund_readability.py` 检查实际文字间距，缺少 rendered bbox 返回错误。旧模板资产和旧预制稿通过过往门禁，不能代替新规则的复验。

## 正文布局须经实际换行核验

- 小标题与其表格/图形外沿至少留 **16px**；不是“未重叠”就合格。以实际文字底边核验；文本框过矮时先扩高，不能靠降低字号解决。
- 同级卡片水平/垂直间距至少 **12px**；解释正文至强调条至少 **16px**。统一同级卡片尺寸、内边距及行距。
- 不允许自动或手动换行产生独占一行的一个汉字（包括标点后的单字尾行）。优先改写短句、按词组断行、调整列宽或拆分模块，不减小标准字号。例：“不直连生产业务数据库”改成“禁止直连\n生产业务数据库”，保留完整词组。
- 右侧流程须以**整个流程组**（节点、箭头、旁注）在右栏居中，不能把窄流程贴着右栏左边导致大片空白。左右剩余空间差超过 `max(32px, 栏宽×15%)` 需重排。可采用横向或两行流程，但不得为了填空添加无信息装饰。目录/封面/封底的固定品牌留白不适用此规则。
- 页内“模块对齐”与“模块在分栏内的位置”分别检查；节点之间对齐不代表整体留白均衡。

`textLayout.lineCount` 不得用字符数估算后作为验收证据。多行对象必须从成品渲染回读逐行文本，导出 `textLayout: {source: "rendered", lineCount: 2, lines: ["第一行实际文本", "第二行实际文本"]}`。缺少回读能力时保留待复核，不伪造 lines。

新增必跑门禁（960px 版心单位，其他尺寸按比例）：

```bash
python "$SKILL_DIR/scripts/check_efund_readability.py" "$QA_DIR/layouts" --map "$QA_DIR/template-frame-map.json" --json-output "$QA_DIR/efund-readability.json"
```

## 字体与 PowerPoint 打开

更换中文字体不能只改 typeface 同时保留旧字体的 charset/panose/pitchFamily。对改写的品牌中文 run 显式使用 `华文黑体_易方达`，纯中文 run 的 Latin/East Asian/CS 字体保持一致，lang=zh-CN，清除旧字体分类属性。混合中英文需按语言拆分 run，英文/数字保留 Arial。检查所有中文字符可显示，尤其封底“谢谢”；原文件中的正确 Unicode 文本并不能证明渲染字形正确。

`efund_text_properties.py` 提供保序属性规范化；`normalize_efund_text.py SOURCE NEW_OUTPUT`（需 lxml，python-pptx 自带依赖）规范化显式品牌中文字体、已知文本属性顺序、图表轴 ID 和不兼容折线标签位置，拒绝覆盖输入及已有输出。它不改变文字内容、字号、色彩、数据、图表类型或外框几何；标签位置改动必须重新渲染复核。它不替代字体安装或完整 OOXML 验证。优先在生成时使用库的保序 setter，避免事后修补。

DrawingML 文本属性顺序为：线条 → 填充 → 效果 → 高亮/下划线 → latin → ea → cs → sym → 超链接。除了填充，**ea 追加在 cs 后同样非法**；重复互斥属性也必须报错。现有 portability 门禁已覆盖这些已知错误。

任何原生 PowerPoint 的修复提示、[Repaired]、文字缺失/方框/乱码均为失败；修复后打开的文件不能替原文件通过。必须在原生 PowerPoint 无修复打开并检查封底及问题页；PDF 单独渲染检查。无法进行原生检查时只交付“待原生兼容性复核”草稿。

最终 visual-review.json 的每种格式记录新增 `textGraphicSpacing`、`whitespaceBalance`、`lineBreaks`、`glyphs`、`nativeOpen` 检查。nativeOpen 对 PPTX 表示目标演示软件无修复打开，对 PDF 表示 PDF 阅读器无错误打开。全部依据真实观察填写，不能把暂时无视觉能力改写成 pass。

### 原生逐页访问，防止延迟加载后修复

封面正常显示不代表整份 PPTX 正常。必须在 Microsoft PowerPoint 中访问最终稿的全部逻辑页，按页等待图表和媒体加载，核对原有内容完整并走到封底；特别检查图表页、复杂页及“谢谢”字形。演示模式只走到中段、静态 PNG 全部正常、SDK 零错误或 LibreOffice 可渲染都不能代替这一步。任何后页触发修复、删除内容或空白页，整稿不得交付。

在 `visual-review.json` 顶层增加 `pptxNativeVisit`。以下是**未完成记录**，不能通过门禁；只能在真实观察后更新，不得把示例当成验收结果：

```json
{
  "pptxNativeVisit": {
    "application": "Microsoft PowerPoint",
    "pptxSha256": "实际打开文件的SHA256",
    "visitedPages": [],
    "repairObserved": null,
    "contentLossObserved": null,
    "notes": ""
  }
}
```

`visitedPages` 是实际访问的逻辑页码，最终必须按 `1..N` 完整列出，不包含重复、遗漏或额外页；`N` 来自最终 PPTX 页列表。只有全部实际访问且没有修复与内容丢失时，两个观察字段才可写 `false`；`notes` 记录本次所用 PowerPoint 和真实观察。逐页 `nativeOpen` 检查仍须保留。门禁分别拒绝缺少访问记录、只访问封面、非 PowerPoint 证据、后页修复、内容丢失和旧哈希记录。脚本只校验证据完整性，不能替代真实观察，也不能证明填报真实。

访问完成后再次核对 PPTX 哈希；包括 PowerPoint 自动保存的任何字节变化，都要求对新候选重新执行结构、包、渲染和原生检查。不得用原生修复后另存的文件，替原候选登记通过。

## 已复现的每次打开修复问题

成品清理曾把 `docProps/app.xml` 的 AppVersion 写成空字符串。XML 可解析且通过通用 XSD，原生 PowerPoint 仍弹出修复和删除内容两个警告。仅删除这个空属性后，同一文件无修复打开。清理时删除可选 AppVersion 节点，禁止清空节点文本或自行杜撰办公软件版本；结构门禁新增 invalid-app-version。使用技能自带 sanitize_pptx_metadata.py，禁止生成另一个简化脱敏脚本后跳过最终文件复验。

在导出 PDF 前运行 `normalize_efund_text.py "$DRAFT_PPTX" "$FINAL_PPTX"`（新输出路径），随后清理元数据、重跑封面/结构/包/布局等门禁并渲染。此工具处理已知文本属性、空 AppVersion 和轴 ID，不保证所有任意 PPTX 自动修复。

折线图标签须使用与图表类型匹配的位置，默认 `t`；共享 `normalize_label_positions(chartSpace)` 覆盖正确 plot 内的系列及单点覆盖，保留条形图 `outEnd`、省略的位置和隐藏标签。`outEnd` 在通用枚举中合法，并不证明其在目标 PowerPoint 的折线 plot 中可用；已复现其导致第 13 页延迟加载修复，而仅改成 `t` 后全 20 页访问及重开通过。两道结构门禁对此增加独立运行兼容性检查，SDK 零错误仍不能代替逐页原生检查。

图表的 `c:axId` / `c:crossAx` 必须同时满足 UInt32 与 Office 最大值 `2147483647` 的约束。负值和加 `2^32` 后超上限的值都由结构与包门禁默认拒绝。共享的 `efund_chart_properties.normalize_axis_ids(chartSpace)` 仅对已知 32 位 ID 图谱按声明顺序重新编号并同步全部引用，不取绝对值、不改负数数据；重复轴声明、悬空引用及未知值停止规范化。详见 [包与图表检查](package-and-render-checks.md)。每次写文件后核对包报告 `sha256` 并重跑验证，原生无修复打开仍为独立必需证据。

### 1.1.1 原生故障回归记录

用户 15 页 EWork 交付件的 `docProps/app.xml` 存在空 `AppVersion`。只修字体和 XML 子节点顺序仍会弹修复提示；在同一副本中仅删除空 `AppVersion` 后，原生 PowerPoint 能直接打开，未出现修复及删除内容的两个提示。空字符串能通过通用 XML schema 校验，因此必须保留本技能的额外语义检查。

封底原文仍是“谢谢”，并未变成问号；其字体属性混用 Arial / 华文黑体_易方达、zh-TW 及旧字体属性。归一化品牌中文运行字体后，原生 PowerPoint 中“谢谢”正常显示。测试副本与原始交付件分开保存，未覆盖用户原文件。
