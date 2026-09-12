# D25 响应式顶栏与左侧覆盖展开

范围：仅最终 shell/header 响应式样式、layout patch、右栏宽度约束中左侧占位的读取、对应行为回归。未修改右栏 compact 分支、D21 routing/portal、通知中心、画布组件数据或坐标。

依据：Figma 699:26789 指定小窗口左栏收起后覆盖展开；697:28069 的 840 像素示例保留 80 / 400 / 340 三区。父任务真实客户端证据为 `output/figma-audit-20260912/actual/v8-responsive-840-dark`、`v8-responsive-840-sidebar-open-dark` 和 `v8-responsive-800-sidebar-open-dark`。源码原生窗口 `minWidth:800` 与父任务实测一致。

实现裁定：保留既有 1024 自动收起规则，800–840（含边界）手动展开左栏时保持 80 像素 grid track，导航自身以其原有宽度覆盖主区。画布与会话 subtree 保留。覆盖层低于 shell 菜单层；外部点击关闭、Escape 关闭并回焦至开关，菜单与对话框保留自己的 Escape 行为。覆盖状态不提供拖柄。右栏边界约束读取覆盖层背后的 80 像素轨道，避免误把覆盖宽度作为主区占位。

顶栏保持 56 像素高及 regular / compact / narrow 分级；标题 14 / 21 medium。窄顶栏左 16、右 20；标题最多 80 并优先收缩，三页签各 48、间隔 4；模式 40、More 28、工具各 28。400 像素主区可得到标题 44、页签 x72、模式 x236、More x284、工具 x320–380，无示例文案硬编码；较宽时工具仍自动贴右。

验证：新增 real React + Happy DOM 的 AppFrame/store 行为测试，先观察旧实现 800/840 overlay 缺失失败，再观察右栏误缩 280 的失败，修复后通过；覆盖 800、840、841 边界、grid稳定、画布节点/输入保留、右栏340、外部关闭、菜单保留、Escape回焦、原有宽度偏好不变。与 responsive header、final shell patch、panel drag recovery 合计 18 tests 通过；typecheck、diff check 通过。未运行全功能测试，未构建或替换共享客户端、未 push。原生视觉与菜单实际验收由父任务继续完成，当前报告不代替原生验收。
