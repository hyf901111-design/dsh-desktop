# EWork Odyssey 1.5.1

发布日期：2026-11-10。平台：macOS Apple Silicon。按用户要求签名发布，跳过 Apple 公证。

## 更新内容

- 新增客户端内置 Chromium 浏览器，提供独立浏览器入口；打开浏览器不创建对话，支持网页导航、站点图标、拖动排序、多页签切换与关闭动效。
- 浏览器复用全局右侧对话栏，可先选择项目，发送首条消息后再创建会话；问答自动参考当前网页，并支持按用户需求修改网页内容。
- 新增网页右键翻译为中文，使用当前配置的 AI 模型分批翻译并保留网页布局；点击“部分翻译”或“已翻译”可直接还原原文，完成后收起状态按钮。
- 新增“框选并询问AI”：框选网页后在选区旁输入并发送，选区截图和文字同步到右侧输入框；支持右键取消框选、删除选区与失败后重试。
- 完善收藏管理，支持收藏状态切换、文件夹、搜索、编辑与移动；历史记录和下载记录改为独立页签，主页提供下载记录入口。
- 保留普通浏览的 Cookie 与站点存储，支持网站在有效登录状态下记住登录；无痕页签继续隔离站点数据与历史记录。
- 网页右键增加保存图片、另存网页、打印、刷新等操作；优化地址栏全选、即时缩放、菜单悬停、弹出位置与响应速度。
- 修复原生网页遮挡菜单和气泡、菜单开显闪烁、窗口失焦、底部圆角与底部面板展开问题；菜单直接覆盖实时网页。
- 优化侧栏、应用入口、页签与浅深色界面的图标、字号、留白和动画；浏览器标题旁悬停可展开对话、研究、笔记和轨迹入口。
- 完善研究看板的竖向页签、拖动调宽、组件滚动和放大阅读；长明细表支持搜索、排序、分页及更合适的阅读高度。
- 改进文档转看板和复杂数据生成，保留来源、分页明细、层级附注与筛选范围；格式或容量不匹配时自动恢复合适呈现，并改善来源查看与完整性交付。
- 探索页新增定时随机壁纸与滚动切换，改善历史消息重发、生成占位及全局图标和菜单的一致性。

## Release notes

- Add a built-in Chromium browser with its own app entry. Opening it creates no conversation; navigation, favicons, tab reordering, switching and closing animations are supported.
- Reuse the global right-hand conversation panel in the browser. Choose a project before the first message creates a conversation; replies reference the current page and can modify it when requested.
- Add AI translation to Chinese through the page context menu using the selected model. Preserve page layout and click either the partial or completed translation indicator to restore the original and hide the indicator.
- Add Select and Ask AI: select a page region and send from a nearby composer. The screenshot and text stay synchronized with the right-hand draft; cancel by right-clicking, remove the selection, or retry after failure.
- Improve bookmark management with folders, search, editing, moving and a working bookmark toggle. Open history and downloads in separate tabs and add a Downloads shortcut to the start page.
- Persist cookies and site storage for normal browsing so valid website login sessions can survive restarts. Keep private tabs isolated from normal site data and history.
- Add image saving, page saving, printing and reloading to the page context menu. Improve address selection, immediate zoom, menu hover, positioning and responsiveness.
- Fix native pages covering menus and tooltips, menu flicker, lost window activation, bottom corners and the bottom-panel toggle. Menus appear over the live page.
- Refine icons, type sizes, spacing and animations across the sidebar, browser tabs and light and dark themes. Hover beside the browser title to reveal Chat, Research, Notes and Timeline.
- Improve vertical research-board tabs, draggable widths, component scrolling and expanded reading. Add search, sorting, pagination and better reading heights for long detail tables.
- Improve document-to-board and complex data generation while preserving sources, paginated details, hierarchy notes and filters. Recover suitable presentations from format or capacity mismatches and improve source inspection and delivery completeness.
- Add timed random wallpapers and scrolling transitions in Explore. Refine resending historical messages, generation placeholders, global icons and menu consistency.

## 发布范围与验证

- 已验收浏览器集成：`d3ac5e2bfeb2efc5a9094e8aac43a26c346e85c0`；独立分支按[范围记录](../superpowers/parked/2026-11-10-release-1.5.1-scope.md)保留。
- 保留双通道签名、包完整性、公开更新源、Range 与差分合成验证；不运行全功能测试或旧客户端全量升级测试。
- 最终发布与校验证据将在完成后补充。
