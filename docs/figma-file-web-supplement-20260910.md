# 第 48 组：文件与网页的紧凑入口

用户已授权在同一 Figma 文件补齐缺失交互。新组追加于主画板 `284:396` 末尾，没有改动第 22–47 组；逐一核对原有 55 个直属节点的名称、位置和尺寸，差异为零。

- [浅色 414:588](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=414-588)
- [深色 414:591](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=414-591)

两版各四态：文件 S 默认、文件 S 悬停、网页 M 摘要、完整阅读器。文件浅色节点为 `415:593 / 415:605`，深色为 `415:664 / 415:676`；网页为 `415:628 / 415:699`；阅读器为 `415:639 / 415:710`。

默认外框直接复用第 46 组 `379:649 / 379:764` 的颜色与描边：文件 320×220，网页示例 656×220，圆角 12、描边 1、无外部阴影。浅色白色、深色 #292A2D。标题内边距横向 18、上方 16；标题 Noto Sans SC Medium 15/23，正文 Regular 13/21，类型行 Regular 11/19。浅正文 #292B2F、次要 #81858C；深正文 #E7E7E9、次要 #989AA0。正文遵循第 43 组信息层级，以 Hug 高度容纳实际文字，没有缩小字体或遮住溢出。

悬停浮层直接克隆 `354:680 / 354:874`，60×30，距右、上各 12，以绝对布局叠放，不挤占标题。完整 16×16 file 图标来自 `209:151`，link 图标来自 `284:634`；原始 SVG 位于 [figma-file.svg](figma-file-web-evidence/figma-file.svg) 与 [figma-link.svg](figma-file-web-evidence/figma-link.svg)，没有另画替代图标。

闭合组件只保留一次标题及真实类型、已有摘要或来源网址。具体类型按真实 PDF、Word、Excel、PPT、HTML、Markdown、文本等资源判断；设计采用通用中文样例“文档”，不要求产品固定显示该文案。没有日期、体积或网址时，不编造字段、不显示占位。设计中的示例标题与正文不作为产品默认数据。没有新增“打开”等正文按钮；沿用现有悬停放大阅读入口。

完整阅读器允许滚动，关闭回到原卡片，保留现有阅读位置或编辑状态。示例阅读视口 1380×420 仅用于本组排版，实际按可视区域适配，不是默认卡片尺寸。闭合文件内容 Hug 52 高、网页 Hug 73 高，均在 220 高卡片内；仅完整阅读器的 349 高内容视口开启纵向滚动。各类原始阅读器沿用真实能力，初次放大前不要求读取完整资源。

已检查两版原始截图、字体与布局：新增文本无缺失字体；中文样例避免引入替代 DINPro 字体。原始 1580×1100 截图、SHA-256 和节点属性见 [validation.json](figma-file-web-evidence/validation.json)、[浅色原图](figma-file-web-evidence/light.png)、[深色原图](figma-file-web-evidence/dark.png)。这些是补充设计参考，实际代码由并行模块接入，生产验收证据应独立记录。该设计补充阶段没有修改代码、构建客户端或宣称实际阅读器验收完成。

## 真实组件接入与聚焦验收

实现位于 `scripts/lib/figma-file-preview-client.mjs`，在最终画布补丁之后接入 `patch-research-board-client.mjs`。只修改闭合文件/网页的呈现及原放大阅读的挂载边界，没有新增导航或正文入口，没有改变文件接纳、权限或数据服务。

- PDF、Word、Excel、PPT、HTML 文件、Markdown、文本的闭合态显示真实类型与已有摘要；文件默认 S 320×220，历史正数宽高及 manual 几何保留。图片继续走原 contain 与比例逻辑；不支持的文件继续使用原文件入口。PDF 自然页比例单独保存为元数据，不再把闭合卡片撑成整页比例，手动调整不锁定 PDF 页比例。
- 独立网页显示真实 URL 与已有摘要，闭合前不授权或挂载 iframe。网页示例 M、历史/已配置 L 均可适配；本补丁不修改前一轮已确定的新建网页 L 默认值。没有来源或摘要时不编造字段。
- 首次明确放大才调用原预览授权并显示原 loading/失败；关闭后保留已挂载阅读器，退出可见与可访问树，再次打开复用原实例。PDF.js、HTML、Web、原生文本和 Markdown 沿用原实现。完整网页不使用原卡片内的整页 scale，原文档自身字号和交互保持。
- 生成网页的 `ResearchGeneratedContainer` 控制器始终保留，惰性边界下移到 `ResearchContainerBody` 的 WebFrame；原自动刷新定时器、权限判断、编辑提交及取消继续工作。闭合态把真实刷新/失败信息纳入有限摘要，完整阅读显示原状态全文。“编辑需求”进入既有放大阅读以容纳原表单。
- 卡片材质、标题及摘要按上述节点实现。CSS 内边距扣除 1 px 边框占位后，Chromium 实测标题距外框 x18/y16；标题15/23、正文13/21、类型11/19。英文通过项目真实字体别名 `EWork DIN Pro` 加载 DIN Pro，中文 Noto Sans SC；没有创建另一份字体资源。闭合内容按可用行数和真实字体宽度生成摘要，没有缩小字号、内部滚动或仅隐藏溢出。

聚焦检查：

```sh
npx vitest run test/figma-file-preview.test.ts test/research-file-drop.test.ts test/research-container-chrome.test.ts
npx tsc --noEmit -p tsconfig.node.json
node scripts/verify-figma-file-preview.mjs
```

21 + 127 + 26 = 174 项通过；只更新旧文件大卡/PDF比例规则直接冲突的 9 项几何断言，原授权、拖拽、权限、持久化和图片比例用例保留。新增覆盖文件首次闭合无授权、失败、原阅读器实例复用、PDF比例重载、生成网页编辑提交/取消、首次阅读前及关闭后的原自动刷新、真实刷新状态。完整 conversation 补丁连续两次变换幂等、产物语法检查通过，TypeScript 通过。没有运行全功能测试、构建客户端或发布。

浏览器脚本默认使用项目可解析的 `playwright` 与其已安装 Chromium；统一运行时可显式设置 `PLAYWRIGHT_MODULE_PATH=/path/to/playwright/index.js PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium node scripts/verify-figma-file-preview.mjs`。不写入开发者个人路径。

证据目录为 `output/figma-file-preview-20260910/`，`results.json` 保存 17 个闭合状态的实际尺寸、材质、标题位置、内容 client/scroll、默认工具栏隐藏和实际平台字体；另记录 6 个原阅读器场景及生成网页编辑提交。主要截图：

| 图像 | 对照与实际结果 |
| --- | --- |
| `light-pdf-entry.png` / `dark-pdf-entry.png` / `*-pdf-hover.png` | 第48组文件 S 默认/悬停；320×220、R12、无外部阴影，默认不常驻操作按钮 |
| `*-pdf-reader.png` | 原 PDF.js 渲染三页，阅读区786高/正文5543高；关闭再打开保留 scrollTop350 |
| `dark-html-reader.png` / `dark-web-reader.png` | 原 iframe 完整文档17px，transform none；计数与输入值保留 |
| `dark-txt-reader.png` / `dark-md-reader.png` / `*-returned.png` | 80条正文保留，关闭改为适配摘要；Markdown使用包内真实解析器 |
| `dark-generated-web-edit-reader.png` / `dark-generated-web-refreshing.png` / `dark-generated-web-refresh-error.png` | 原编辑操作可见并提交；运行与长失败信息在闭合卡片中适配 |
| `dark-manual-small-summary.png` / `dark-long-web-summary.png` | 手调220×100及长URL/摘要的内容适配，无内部溢出 |
| `dark-pdf-loading-reader.png` / `dark-pdf-unavailable-reader.png` / `dark-pdf-unavailable-entry.png` | 原授权等待圆环、原失败状态、关闭后真实失败记录 |

这些是 **真实 Chromium 内的生产组件与原阅读器链、受控本地文档/桥接回包**，不是打包 Electron 验收。17 个闭合状态实测 client 与 scroll 尺寸相等；页面异常0；PDF类型行实际字形命中自定义 DINPro，中文标题命中自定义 Noto Sans SC。Office 覆盖原生产包装器对既有预览服务组件的传参、惰性授权及实例/输入状态保留；未在这组 Chromium 中伪造 `sherlock-preview://` 能力协议运行完整 Office 引擎。原 Office 服务和解析器未修改，其格式兼容性与最终包导入操作仍由最终客户端验收记录限定。浏览器中的文档、来源和更新提交回调均为本地夹具；不证明任意远端网页、任意 Office 文件或真实附件授权服务均通过。最终打包图继续归档至 `output/figma-final-review/index.html`。
