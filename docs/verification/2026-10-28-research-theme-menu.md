# 研究看板主题菜单验证

## 行为和实现

将底部工具栏的四个常驻主题按钮收为“当前主题图标 + 下箭头”入口，点击后在工具栏上方展开浅色、深色、彭博、易方达四项。菜单直接使用整理画布现有的 `ew-grid-menu ew-arrange-menu` 材料、勾选列和行规则；同一选择器保留原整理行的 specificity，主题图标为 16px。工具栏改为内容宽度，主题选择后更新当前图标并收起菜单。

继续调用现有 `workspace.setWorkbenchStyle`，没有新主题存储格式或画布内容写入路径。保留已有彭博试用范围和看板偏好行为。菜单支持方向键、Home/End、Enter/空格，Esc 返回入口焦点，外侧点击关闭；切换工作区关闭旧菜单。所有四个名称沿用现有中英文翻译。

## 聚焦验证

- RED：真实 production ResearchCanvas 中预期单个主题菜单入口，旧实现入口数量为 0（断言期望 1），确认行为缺失后再修改产品代码。
- `node_modules/.bin/vitest run test/workbench-theme-menu-browser.test.js test/openterminal-dark-controls.test.js test/workbench-style.test.js test/workbench-openterminal.test.js test/research-arrange-modes.test.js --reporter=dot`：5 文件、35 项通过。新增浏览器用例 7 项。
- `npm run typecheck`：通过。
- 在独立 APFS 依赖克隆执行完整 `node scripts/patch-web-frontend-loading.mjs`：通过；安装后重新执行上述 35 项，通过。浏览器 fixture 还验证 grid patch 二次安装字节等价、完整 JS 可解析。
- Chromium 实际点击全部四项、刷新页面恢复最终模式；检查键盘焦点/选择、Esc、外侧关闭、跨看板收起、英文、画布内容不变。380px 和 1000px、浅色和深色共四组截图及计算样式：菜单与整理菜单背景、边框、圆角、阴影、字体、内边距、间距及选中行尺寸相同；窄屏菜单保持视口 8px 边距；工具栏无横向溢出或多余尾部空白。
- 独立只读复审后，集成 owner 发现共享菜单的第二个 span 伸展规则导致文字列错位。补真实浏览器图标/文字 X 列断言后旧实现得到 2 个文字起始列而失败；用仅限主题菜单图标的精确 flex 覆盖修复。四组矩阵检查每行图标/文字 X 相同、图标宽 16px 且 grow/shrink 均为 0，整理菜单规则保持。

证据位于本任务 visualization 根目录的 `research-theme-menu/`，包括 `theme-menu-{380,1000}-{dark,light}.png` 及对应计算样式 JSON。测试均使用合成空白看板，未读取用户笔记或修改现有看板。

本功能 worktree 未构建、启动或替换共享客户端。最终集成后的原生客户端验证由集成 owner 执行。本次未运行全功能测试，未发布、推送或递增版本。

## 后续：工具栏外观与按钮留白

- 底栏、通知和弹出菜单跟随客户端的浅色／深色外观，彭博模式只改变画布及其组件。移除彭博选择器对全局底栏的强制深色覆盖。
- 主题入口平时透明；菜单展开但鼠标移开时仍透明。悬停复用其他工具按钮的 `#8882` 底色；键盘聚焦保留焦点轮廓。
- 按钮宽 56px，图标与下箭头分别保留 10px 左右安全距离；主题槽宽 70px。380px 窄屏原有无溢出断言继续通过。
- 新增两组真实 production ResearchCanvas 浏览器回归，覆盖客户端浅色／深色下依次选择四个看板模式，检查底栏背景、边框、按钮颜色和分隔线不随看板模式变化；检查普通、悬停、菜单展开的背景及真实图标间距。旧代码分别在 1px 左边距和深色下常驻背景处失败，修复后通过。
- 最终聚焦检查：上述五个测试文件串行执行，37 项通过；`npm run typecheck`、`git diff --check` 通过。日志为 `/tmp/sherlock-toolbar-focused-20261028.log`、`/tmp/sherlock-toolbar-typecheck-20261028.log`。共享原生客户端仍由集成流程构建后验收。
