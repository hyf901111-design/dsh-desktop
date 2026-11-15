# EWork Odyssey 1.6.1

适用于 Apple Silicon Mac。

## 更新内容

- 新增知识库。自动收录工作区会话的主要交付文件并保留来源，支持筛选、收藏、拖放上传和右侧预览，也可以通过右侧对话查找和整理文件。
- 知识库按文件、研究、笔记和表格分类。共享会话可在原模式只读预览，并可创建归属自己的可编辑副本。
- 笔记支持导入 Word、TXT、Markdown 和 PDF；常用文件可从「打开方式」快捷送入笔记或表格编辑。
- 对话、研究、笔记和表格分别保留未发送的草稿，共享已发送的历史。表格支持用 Shift＋方向键扩选并引用选区。
- 知识库分页随列表宽度收起跳页控件，保持单行。收起侧栏后可在「更多」菜单首项新建工作区。

## Release notes

- Use the new Knowledge Base to collect key files from workspace sessions with source links. Filter, bookmark, drag in, and preview files, or find and organize them using the side chat.
- Browse files, research boards, notes, and spreadsheets in the Knowledge Base. Open shared sessions in their original mode with read-only access, or create editable copies.
- Import Word, TXT, Markdown, and PDF into Notes. Use Open With to send supported files directly to Notes or Spreadsheets for editing.
- Chat, Research, Notes, and Spreadsheets keep separate unsent drafts and share sent messages. Use Shift and the arrow keys to extend and reference a spreadsheet selection.
- Knowledge Base pagination stays on one row by hiding jump controls as the list narrows. New Workspace is the first item in the collapsed sidebar's More menu.

## 发布验证

- 构建提交 `d55fe7989dd1cd71259a70bf10b3796b4b25f8cc`。98 项发布相关检查、集成检查、类型检查与生产构建通过。已在正式签名客户端验证双侧栏窄布局、单行分页与前后翻页。
- 标准 App 和 DMG 使用 Developer ID 签名。兼容桥保留 `io.dsh.desktop` 和旧签名，内嵌应用为 `com.evanarts.sherlock`。签名、两个 ZIP 的完整性和 DMG 校验通过。本次按要求跳过 Apple 公证。
- Cloudflare 两条更新源均为 1.6.1，公开资源与稳定下载入口通过大小、缓存与单段 Range/206 核验。两份公开 blockmap 与本地逐字节一致。
- 两条差分通道均从 1.6.0 重建 1.6.1 ZIP，SHA-512 与发布包一致。本次核验范围为差分传输与重建。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 899,625,031 | 85,942,827 | 813,682,204 | 158 |
| 旧签名兼容 | 976,912,369 | 129,830,486 | 847,081,883 | 271 |

- Homebrew Cask 已同步到 1.6.1，Tap 提交 `6f3778916f26a9c72231c77de8da4d528a26e131`，DMG SHA-256 为 `57b872d1500d7852b56c2a1a6247b19ff52a16c923fe60849577d66d8f8a0873`。
- 滚动清理移除 1.5.0 的 5 个旧版资源，两条 1.6.0 blockmap 保留且可访问。

[下载 EWork Odyssey 1.6.1（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.1/sherlock-mac-arm64.dmg)
