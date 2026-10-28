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

## 发布验证

- 正式构建来源：`4b0af40f1dcd8f7054e51c3de6a6d0be6600b774`（干净的本地 main）。
- 发布聚焦验证：10 个文件、81 项检查通过；类型检查、构建、包内运行时代码一致性及两套 ZIP CRC 校验通过。
- Developer ID App 和 DMG 签名通过；兼容桥外层 `io.dsh.desktop` 使用原证书，内嵌 App 为 `com.evanarts.sherlock`，Squirrel/ShipIt、Mantle、ReactiveObjC 依赖齐全。按用户要求跳过 Apple 公证。
- 两条公开更新源均为 1.4.2，中英文更新日志各 6 项；26 项公开元数据、缓存、单段 Range 和 blockmap 检查通过。
- 标准通道 1.4.1 → 1.4.2：实际下载 61,897,026 字节，复用 484,283,479 字节，96 次单段 Range 请求；重建 ZIP 的 SHA-512 与发布包完全一致。
- 兼容通道 1.4.1 → 1.4.2：实际下载 95,170,332 字节，复用 506,863,277 字节，194 次单段 Range 请求；重建 ZIP 的 SHA-512 与发布包完全一致。未执行旧客户端全量安装或重启升级测试。
- 真实签名 App 已使用隔离配置启动，主界面、系统版本面板与应用内关于页均确认 1.4.2；关于页显示 6 条中文更新日志并保留旧版历史。默认目录迁移隔离验证通过：旧数据复制、目标目录已有值保留、旧目录不被改写、完成标记正常。
- Homebrew 软件源提交：`22c4c18d16df8f59cf204cc56fc2d2a88be2cf80`；语法、风格、Cask 审查、公开文件逐字节对照及 brew info 核验通过。
- Homebrew DMG SHA-256：`2697c91952318e5e4215fc306107aa201d659ebf816b339765c5e1bc842584ac`。
- 仅清理最旧的 1.3.3 目录内 5 个不可变对象；其余 5 个版本的 25 个资源可访问，当前两条更新源及 Homebrew 指向 1.4.2。

完整证据目录：`release-cloudflare/1.4.2/`。
