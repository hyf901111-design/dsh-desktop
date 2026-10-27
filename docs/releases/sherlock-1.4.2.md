# EWork Odyssey 1.4.2

发布日期：2026-10-28。平台：macOS Apple Silicon。按用户要求签名发布，不进行 Apple 公证。

## 更新内容

- 研究看板新增页签组件，可把同一看板分成多个页面，快速切换不同研究内容。
- 通过页签设置增加、重命名、排序及移除页签，绑定页面并选择显示的组件；移除页签后保留页面和组件，可恢复使用。
- 同一组件可在不同页面复用，内容和连接保持共享，位置、尺寸与画布视图按页面独立保存。
- 保持原有画布拖动方式，组件仅在靠近可接收页签时缩为预览；离开后恢复原状，拖入后平滑显示，并支持撤销移动。
- 页签数量较多或显示空间不足时，页签栏右侧自动显示左右翻页按钮；到达首尾时禁用对应按钮。
- 每个看板仅允许添加一个页签组件；重复添加时，在底部工具栏上方显示提示，2 秒后自动消失。

## Release notes

- Add a tabs component to research boards so one board can hold multiple pages for different research views.
- Use tab settings to add, rename, reorder and remove tabs, bind pages, and choose visible components. Removing a tab preserves its page and components for recovery.
- Reuse the same component across pages with shared content and connections, while saving position, size and canvas view separately for each page.
- Preserve existing canvas dragging. Components shrink into previews only near a tab that can receive them, return to their original appearance when moved away, and settle smoothly after a drop. Cross-page moves can be undone.
- Show left and right paging buttons at the far right when tabs overflow or the available width shrinks, and disable the corresponding button at each end.
- Allow one tabs component per board. A duplicate attempt shows a notice above the bottom toolbar that disappears after two seconds.
