# 子代理运行圆环旋转验证

基线：`3542b6a2c3594ecef42f084cebfb920524c53fdc`。功能分支仅修改运行态装饰动画和直接相关验证；未构建、替换或操作共享客户端。

## 根因与修改

原头像 arc 采用 `odyssey-subagent-breath`，只在 `.45` 与 `1` 之间改变透明度，`transform` 一直为 `none`，所以看不到旋转。改为复用既有 `odyssey-subagent-loading` 旋转关键帧，900ms、linear、infinite。头像图片与淡色底环保持静止；空闲时移除运行环；隐藏或 inert 时暂停；系统减少动态效果时保留静态运行环。

## 真实组件回归

先将真实顶部 catalog、子代理详情 header、右侧任务树的运动断言改为自然时间的三帧采样，在未修改 CSS 时观察到两条 RED：三个 transform 全为 `none`，唯一角度数量为 1。修改后，三帧 DOMMatrix 角度均发生变化，同时 X/Y 缩放为 1、位移为 0，头像和 track 的 transform 为 `none`。验证浅色/深色、隐藏暂停、减少动态效果、空闲移除环及身份重排/重载、任务行导航保持正常。

catalog 旧夹具未按当前已安装外层顺序卸载，先遇 Home presentation/PPT anchor drift；改为调用现有 `stripConversationGridOverlays` 和 Node 原生生产卸载/安装函数，仍渲染生产注册的 catalog 和详情 header。若集成环境已有 Composer Voice，则先由同分支的 `stripComposerVoice` 卸载其外层记录。没有修改生产安装器、放宽 anchor 校验或重装依赖。

聚焦命令：

```sh
node_modules/.bin/vitest run test/subagent-avatars-browser.test.js test/subagent-task-tree-avatars-browser.test.js test/subagent-task-tree-avatars.test.js --reporter=dot
npm run typecheck
git diff --check
```

结果：3 文件、11 项通过，其中 6 项真实 Chromium 交互/渲染。未运行全功能测试。证据保存在交接卡旁的 `subagent-loading` 目录：RED/GREEN 日志、catalog/header 和 task-tree 三帧矩阵 JSON、暗浅截图、原图资产与布局验证。

## 数量问题边界

顶部计数读取 `Math.max(healthy.length, descendants.count)`，不是把 catalog 与 summaries 相加；右侧任务树也按真实 child ID 渲染。组件生成失败后的修复调用创建新 child session，属于生成运行链路的源头问题，由 Notes 功能分支独立修复。本分支不隐藏真实失败记录、不删除历史、不凭标题去重、不改变 child 身份及计数语义。共享原生客户端仍需集成 owner 在最终构建核验旋转和真实任务状态。
