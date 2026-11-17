# EWork Odyssey 1.6.5

适用于 Apple Silicon Mac。

## 中文

- 图像应用新增易方达品牌资产库，可拖入标识、标识容器、品牌图形、色块与带可编辑文字的常用版式。

- 扩充易方达宣传营销模板及提示词画廊，涵盖基金海报、品牌图片、字体与元素设计、跑步和登山等主题。模板支持分层编辑，优化排版、间距和画廊浏览。

- 选中图层后可在右侧对话中插入引用标签，结合文字同时修改多个指定图层；支持上传参考图及框选局部修改，生成失败时保留原有图层。

- 画布支持鼠标框选多元素、快捷键编组、撤销与重做，并显示各选中元素的外框；工具栏空间不足时自动收纳到右侧更多菜单。

- 新增 PNG、JPG 导出和「保存至知识库」。主动保存的图像显示在「我的图像」，再次打开可继续编辑完整图层工程。

- 修复图像应用及演示用例影响主页跳转的问题，点击主页或新建对话后默认收起右侧栏，并改善工作区返回与应用切换。

## English

- Add an E Fund brand asset library with draggable logos, logo containers, brand graphics, color blocks, and editable text layouts.

- Expand E Fund marketing templates and the prompt gallery with fund posters, brand imagery, typography, graphic elements, running, and climbing. Templates retain editable layers with improved spacing, alignment, and gallery browsing.

- Insert selected layer references into the side chat and combine them with text to edit multiple specified layers. Use uploaded references or selected regions for image edits; failed generation preserves existing layers.

- Select multiple canvas elements by dragging, group with keyboard shortcuts, undo and redo, and see individual selection outlines. Extra toolbar actions move into the More menu on the right.

- Export PNG or JPG, or explicitly save a layered project to My Images in the Knowledge Base and reopen it for further editing.

- Fix Home navigation from Images and walkthroughs. Home and New Chat now collapse the side pane by default, with improved workspace return and app switching.

## 发布验证

- 构建提交 `3f2b44e34dbeb0095a6c8f85b618c4d5389dd8f3`。246 项聚焦检查、类型检查及生产构建通过。签名客户端已显示真实对话首页，右侧栏默认收起。隔离客户端启动、默认目录迁移及与 DSH Desktop 共存检查通过。
- 标准 App 和 DMG 使用 Developer ID 签名。兼容桥外层为 `io.dsh.desktop`，保留旧签名及 Squirrel、ShipIt、Mantle、ReactiveObjC，内嵌 App 为 `com.evanarts.sherlock`。签名、ZIP 和 DMG 完整性检查通过。按要求跳过 Apple 公证。
- Cloudflare 两条更新源均为 1.6.5，均包含中英文更新日志。公开资源的大小、缓存策略、稳定下载文件名及单段 Range/206 已核验。两份公开 blockmap 与本地发布文件一致。
- 使用 1.6.4 ZIP 分别从两条通道重建 1.6.5，合成结果的 SHA-512 与签名发布包一致。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 934,054,683 | 110,617,038 | 823,437,645 | 142 |
| 旧签名兼容 | 1,011,502,025 | 147,961,073 | 863,540,952 | 267 |

- Homebrew Cask 已同步至 1.6.5，Tap 提交 `dc854affcc50e6fff15c6a66be9d2d6b793919fd`。公开 Cask 与 Homebrew 解析结果一致，DMG SHA-256 为 `ce401843bc6f5e5bea575174c5fe42e4b3fa8881545e9cdac12b486b4331836f`。
- 滚动清理移除了 1.5.6 的五个版本资源，1.6.4 的两份 blockmap 和 1.6.5 安装包仍可访问。

[下载 EWork Odyssey 1.6.5（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.5/sherlock-mac-arm64.dmg)
