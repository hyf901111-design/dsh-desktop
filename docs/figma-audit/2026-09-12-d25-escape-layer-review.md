# D25 复审：Escape 逐层关闭

独立复审指出原侧栏处理仅检查 Escape 的 target 是否在 menu/dialog 内以及 defaultPrevented；实际 primitives `Menu`（lib/index.js:1583）与 `Modal`（:2003）在 document 冒泡监听中只调用 onClose，不阻止默认行为。菜单开启后焦点仍可停在左栏触发按钮，导致一次 Escape 同时收起菜单和左栏并抢走焦点。

修复：左栏覆盖展开时，在 window 捕获阶段记录这次 Escape 开始时仍打开的 menu/dialog，使用 WeakSet 将记录关联到该 KeyboardEvent。window 冒泡阶段跳过该事件，让原菜单或对话框负责关闭与焦点；下一次 Escape 才关闭侧栏并回焦开关。隐藏层不参与记录，卸载时清理两阶段监听。patch 可更新已安装的原 D25 代码且保持幂等。

回归改为挂载真实 primitives Menu 和 Modal，从仍聚焦的左栏触发按钮派发 Escape，验证首次只关闭内层且焦点保留，第二次关闭左栏并回焦。测试 onClose 使用同步卸载，确保记录在 document 处理后内层已消失时仍有效。已先观察旧实现 800/840 两例同时收起左栏的失败，再验证修复通过。overlay、final-shell、provider-menu 三个聚焦文件合计 13 tests 通过，typecheck 和 diff check 通过。

未修改既有审计结论文档、未执行原生 UI 动作、未构建、未 push。
