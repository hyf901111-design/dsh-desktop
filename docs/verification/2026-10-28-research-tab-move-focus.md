# 组件跨页移动保留当前页签

基线 `3542b6a2c3594ecef42f084cebfb920524c53fdc`，独立功能 worktree；没有构建或替换共享客户端，没有推送或修改版本。

原拖放结束调用 `moveToBoardTab`，同一事务中写入归属/目标布局后显式 `grid.switch(target)`，并重置 viewport、选中移走组件，导致自动跳页。生产只有拖放在调用该方法，没有独立菜单移动入口。

移动现在保留 active page 和 viewport，只从当前选择去除已移走的组件；目标页归属、布局追加、内容、身份、连接和原子存储/撤销沿用现有机制。显式点击标签与键盘导航保持原行为。移动后的卡片在当前页已隐藏，收尾直接清理拖影，不再对零尺寸隐藏卡片计算返回动画。

## 聚焦验证

- 首先通过旧实现稳定复现 source/target active ID 不等的 RED，覆盖原生 pointer 与真实 Chromium 鼠标拖放。
- 真实 production ResearchCanvas Chromium：移入目标但源页仍选中、移走组件隐藏且无残余拖影；刷新仍恢复源页选择和目标归属；手动点击目标才显示移入组件。
- 连续拖两卡不切页，撤销一步只恢复最后一张；Esc 取消以及松手在非接收标签处均不改归属或切页；方向键和 Enter 仍手动导航。
- 客户端/连接回归：保留组件身份尺寸/内容/源页布局，视口及其他选中项保留，目标视口由手动切换恢复；跨页股票联动、连线端点、删除和撤销继续验证。旧测试中依赖自动导航的步骤改成显式切页，Undo 后从当前 DOM 重新取得已重挂载的 handle。
- serializer 重复安装字节等价与语法检查包含在真实浏览器 fixture 中。

命令仅直接相关：

```sh
node_modules/.bin/vitest run test/board-tabs-client.test.js test/board-tabs-connection-client.test.js test/board-tabs-contract.test.js test/board-tabs-drop-focus-browser.test.js --reporter=dot
npm run typecheck
git diff --check
```

检查结果与截图由官方交接卡及外部 evidence 记录；共享原生客户端由集成 owner 在批准的集成分支构建后实际验收，本功能 worktree 未操作它。
