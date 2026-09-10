# 2026-09-10 研究组件字体传递与验证

## 实现

父页面 Blob URL 不能被 `sandbox="allow-scripts"` 的不透明来源 iframe 读取。Chromium 148 实测，即使 `font-src blob:`，仍报 `Not allowed to load local resource` / `NetworkError`，最终中文回退 PingFang；将完整 Blob URL 写进 CSP 还会被识别为非法 source。未采用该方案。

运行预览使用 `buildResearchHtmlPreview(html, title, theme, { notoFont: 'runtime' })`。宿主缓存固定 `/fonts/NotoSansSC.woff2` 的 Blob，按当前 iframe 身份验证请求，再向可信外层 wrapper 传递；wrapper 校验 `event.source === parent`，只转发固定字体的 Blob 到自己的 inner iframe。inner 在任何用户脚本前安装监听，通过 `FontFace(ArrayBuffer)` 加载字体。

- 请求：`{ type: 'sherlock-font-request', font: 'noto-sc' }`。
- 回复：`{ type: 'sherlock-font-data', font: 'noto-sc', blob }`。必须是真实 Blob，尺寸 1–16 MiB，不接收 URL、路径、字体名或额外字段。
- 失败：`{ type: 'sherlock-font-failed', font: 'noto-sc' }`。
- 状态：inner 的 `data-sherlock-font-status` 和受校验转发的 `sherlock-font-status`，值为 `loading` / `loaded` / `failed`。未收到字体会在 15 秒标记失败。
- 失败时组件可见地显示“字体加载失败”和“重试”。点击发送严格双字段 `sherlock-font-retry`，宿主与 wrapper 清理本次缓存后重读固定字体文件；重试期间显示“正在加载字体…”，成功后提示移除。正常状态不增加提示或控件。

`font-src data:`、`connect-src 'none'`、`frame-src 'none'` 和 Trusted Types 保持原值，两层继续使用不透明 sandbox；不增加 `allow-same-origin` 或任意网络能力。

原生卡调用 `researchComponentTypographyCss(scope, { notoFont: 'local' })`，使用固定本地字体 URL。默认三参数 `buildResearchHtmlPreview` 保留 DIN 和完整 Noto data 字体，导出文件继续自包含。DIN 的 Latin 范围优先用于数字及英文，中文由 Noto 覆盖。

## 实际证据

`output/playwright/sandbox-font-prototype/` 保存本地 Chromium 148 验证产物：

- `evidence.json` / `prototype.png`：父 Blob URL 失败，子 Blob URL与 ArrayBuffer 字体可行的对照；未据此放宽生产 CSP。
- `production-evidence.json` / `production-runtime.png`：直接使用生产生成器，两张真实双层 sandbox 卡，宿主只请求一次字体；inner 来源均为 `null`，Noto 字体状态均 `loaded`。
- `production-native.png`：原生 CSS 的固定字体 URL。
- `production-export.png`：默认独立导出，页面没有宿主字体桥，字体仍完整加载；唯一 HTTP 请求是文档自身 `/export`。
- `retry-evidence.json` / `production-font-failed.png` / `production-font-recovered.png`：真实 HTTP 503 首次失败后出现可见提示；点击“重试”获得字体 200，状态依次为 `loading → failed → loading → loaded`，提示移除，实际字体检查通过。

CDP `CSS.getPlatformFontsForNode` 对三个路径均返回中文 11 字形使用 `NotoSansSC-Thin_Regular`、`isCustomFont: true`；数字英文 13 字形使用 `DINPro-Medium`、`isCustomFont: true`。DOM `document.fonts.check` 同时通过。主题切换到深色后输入内容与按钮计数保留；页面未出现运行异常。

同一含中文、数字、输入和按钮的内容，最终运行 srcdoc 为 **153,168 bytes**（包含失败重试界面），默认内嵌 Noto 的同内容文档为 **10,525,804 bytes**。运行文档低于 200 KB；该数值包括约 123 KB DIN，实际文档还会随用户内容长度增长，原有 200 KB 原始 HTML 上限未擅自改变。此方案消除每张卡约 10 MB 的 Noto base64 文档字符串；每个 iframe 仍有自身 FontFace 与解码成本，未声称所有内存成本都只发生一次。

## 聚焦检查

`npx vitest run test/research-html-theme.test.js`：17 项通过。新增回归覆盖运行文档体积与导出兼容、严格 CSP、父子身份、消息字段、字体名、空 Blob/伪 Blob 和回复复用。没有运行全量测试。

这里的浏览器证据证明生产生成器与字体路径；真实客户端渲染 caller 和最终打包主界面由集成验收另行核验。
