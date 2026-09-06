# 研究组件默认样式与主题验收（2026-09-05）

## 当前默认：Bklit Monochrome（用户确认样板后）

源码提交：`d5b1d737`（将研究组件默认图表统一为 Bklit 单色直角风格）。后续生成优先采用已批准的 `prototypes/bklit-theme-preview` 样板：浅色 stone / 深色 zinc 灰阶、直角细框、无默认阴影、Arial 字体、2px 折线及 4,4 虚线网格。用户明确的配色与布局要求优先；已生成 HTML 的硬编码设计不自动重写。Bklit 是默认视觉规范，不给离线 HTML 强加 React 或联网依赖。

- 普通容器、语音容器及基于资料创建组件共用生成指令。原生图表和独立 SVG 导出同步灰阶、线宽、网格与字体；单数据点折线保留可见标记，多点不常驻圆点。
- HTML 默认主题变量与基础样式置于最早的 `sherlock-component-defaults` CSS 层，允许用户普通 CSS 或后声明的 `@layer` 覆盖。原有主题消息、同文档状态保持、固定主题与离线沙盒契约保留。
- 聚焦检查共 67 项通过：生成/runtime 与 HTML 主题 59 项、HTML 安全及前后端预览一致性 4 项、原生图表/单点/主题/SVG 导出 4 项。`npm run typecheck` 与 `git diff --check` 通过，未运行全功能测试。
- Chromium 真实分层验收通过：通过实际双层 iframe 的深浅主题消息切换，用户 `@layer` 中粉色卡片、18px 圆角、红色阴影、金色按钮及紫色线条保持；次数 1 与输入文字未丢失。Happy DOM 不支持 CSS layers，单测仅解包默认层做颜色/几何检查，真实 cascade 结论来自浏览器。

### 本地包与实际生成验收

`./script/build_and_run.sh --verify` 与 `npm run verify:package:mac -- --app 'dist-notarized/mac-arm64/Sherlock.app'` 均通过。版本仍为 0.8.1，Bundle ID `com.evanarts.sherlock`，Developer ID 签名有效，明确跳过 Apple 公证；未发布、上传或推送。

本次应用主界面为 `127.0.0.1:59144`，来源 `dist-notarized/mac-arm64/Sherlock.app`。原工作区、会话仍可见。包内 conversation client、research runtime index 与 HTML wrapper 分别与本次源码 SHA-256 一致。

在「黄金价格研究」工作区新建研究，通过底部「容器」输入以下需求（没有样式提示）：

> 做一个可切换柱状图和折线图的小页面，比较一月至三月的收入12、18、16和成本8、11、10，单位万元。点击查看数据展开表格，提供一个备注输入框。这些是演示数据，不需要搜索。

真实生成 **一至三月收入与成本对比** HTML 页面。检查了灰阶系列、直角按钮/输入框、细框及虚线网格；切换柱状图到折线图、展开数据表，并录入「主题切换验收：保留这段备注」。应用深色 → 浅色 → 深色后，背景/文字/系列同步切换，折线图选择、表格展开和备注全部保持。客户端恢复原有深色并保持打开，测试页保留在当前「智能容器」研究中。

以下保留此前 Kimi 方案的历史验收记录；其配色与圆角已由上面的用户确认方案替代。

## 历史：Kimi 方案

## 范围与参考

本地 Kimi 客户端的「看板 → Hello World」中，实际检查 A股盯盘和汇率组件，并读取对应本地生成 HTML 的 CSS；默认采用黑白底、蓝色强调、12px 圆角、细分隔线、系统无衬线字体和对齐数字。每日财经的网格与红绿终端风格属于另一种特殊呈现，不作为所有页面的固定模板。

新生成的容器、语音容器及基于所选资料创建的组件共用生成规范。保留需求对应的网页、图表、表格、KPI、Markdown 和思维导图形式。用户指定品牌、字体或布局时仅覆盖明确要求的部分；明确固定深浅主题时使用 HTML 内的主题标记。既有 HTML 的硬编码样式不作自动重写。

## 实现

- 生成入口共用默认视觉与主题变量契约。
- HTML 使用同一组 light/dark 语义变量；当前客户端最终主题由 body 的 `data-ds-dark-theme` 读取。主题消息通过已有双层 iframe 单向传递，不修改 srcDoc，保留页面交互状态。
- 固定主题可通过 `<meta name="sherlock-theme" content="light|dark">` 表达。独立导出 HTML 跟随系统主题，固定标记仍然有效。
- 原生容器图表、表格、KPI、Markdown 和容器内思维导图使用相同主题变量；SVG 图表导出使用实际颜色，不依赖宿主 CSS。
- 保持四字段 HTML schema、双层 opaque sandbox、CSP、Trusted Types 和 WebRTC 限制。

## 聚焦验证

源码提交：`f3640145`（统一研究组件的看板样式并支持深浅主题联动）。

- `npx vitest run test/research-html-theme.test.js test/research-task-runtime.test.js`：55 项通过。
- UI 聚焦：主题联动、同一 iframe/srcDoc 保留、原生图表配色和独立 SVG 导出等 5 项通过。
- HTML/容器/主题/安全筛选：36 项通过；随后补充 light/dark/固定主题的前后端逐字一致性检查通过。
- `npm run typecheck` 与 `git diff --check` 通过。
- 静态 runtime 源码使用 String.raw，避免构建器改写 function.toString 后造成前后端预览不一致。
- 独立只读审查未发现阻断问题。未运行全功能测试。

## 本地包与真实客户端

执行 `./script/build_and_run.sh --verify` 与 `npm run verify:package:mac -- --app 'dist-notarized/mac-arm64/Sherlock.app'`，均通过。版本保持 0.8.1，Bundle ID 为 com.evanarts.sherlock，Developer ID 签名通过，明确跳过 Apple 公证。未上传、发布或推送。

实际运行应用为 `dist-notarized/mac-arm64/Sherlock.app`，新主界面地址为 `127.0.0.1:53011`。工作区和原会话仍可见。包内 conversation client、research runtime index 和 HTML wrapper 与构建源码 SHA-256 一致。

通过真实 UI 新建研究并使用「容器」生成：

1. **项目进度看板**：需求只提供演示数据和交互，不含配色提示。实际生成蓝色趋势图、统一卡片、指标、表格和备注输入框。深色 → 浅色 → 深色后，背景、文本、图表和控件联动；输入的「主题切换验收：保留这段备注」与 2 次记录均保持。
2. **橙色工作台**：明确要求橙色品牌、固定浅色。客户端恢复深色后，该页面仍保持橙色与浅色底；加一按钮从 0 操作至 2。

测试研究已重命名为「组件主题验收」，位于「黄金价格研究」工作区。两个组件已整理在画布内，客户端保持打开；外观恢复原先的深色设置。Kimi 原看板标签已恢复。
