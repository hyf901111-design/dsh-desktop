# 组件规范落地验证记录

基线：`d797cb43c5fc81efa4cf8ef17f3e5f49d3402215`（当前主分支 1.0.6）。

## 功能分支验证

- 2026-09-22：10 个直接相关 Vitest 文件，283 项通过。覆盖 HTML 沙盒/主题与状态、设计静态检查、个人/共享生成修复、手动框生命周期、生成状态按钮、过程记录、客户端适配与渲染性能。
- Chromium HTML 渲染器：Light/Dark、28px 控件、输入r6/按钮r7、外部作者CSS与动态inline important覆盖、ARIA图标、业务图表/状态保留、输入/计数/重置连续性通过。
- Chromium 完成态：78 项尺寸与颜色断言通过，原生/HTML壳分层；iframe 内容仍由其宿主渲染器管理。
- Chromium 真实 ResearchCanvas：18 组 Light/Dark × wide/tall/compact × running/stopped/error 通过；鼠标/键盘气泡、停止请求与真实终态、手动重试位置尺寸、表面等于frameBounds、前景锚点、等待00:00、减少动态效果通过。
- 图片已目视核对。动态点阵使用原稿点路径和9.921px格距，流动相位与7秒周期是实现参数，记录在 `build/figma-generation/provenance.json`；没有声称复刻原静态背景每一个点的透明度。

可复验脚本：

```sh
node scripts/verify-research-component-design.mjs
node scripts/verify-research-completed-design.mjs
node scripts/verify-research-generation-design.mjs
```

前两个脚本可用 `PLAYWRIGHT_MODULE_PATH`、`PLAYWRIGHT_EXECUTABLE_PATH` 指定已有浏览器依赖；生成态脚本使用 `SHERLOCK_TEST_PLAYWRIGHT`、`SHERLOCK_TEST_CHROMIUM`。证据输出在对应 `output/research-*-design/`。

## 既有失败记录

额外检查 `research-container-chrome.test.ts` 时有16项失败；在未修改的基线主分支上重跑同样是16项，涉及旧尺寸/摘要截断/焦点断言。`research-board-client-adapter.test.js` 基线45项通过；本次仅需将被新状态组件替代的旧文案源码断言改为当前语义，修改后45项通过。另 `research-artifact-resilience.test.js` 的既有“carries web evidence”用例在基线也失败。

这些既有失败作为独立限制保留；本次没有运行全功能测试。实际打包客户端的可见状态与操作结果在集成回归后追加。自动测试通过不等于用户已接受或公开发布。
