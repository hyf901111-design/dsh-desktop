# EWork Odyssey 1.6.9

适用于 Apple Silicon Mac。

## 中文

- 新增演示工作区。在客户端打开或导入 PowerPoint，可编辑文本、表格、图表和演讲备注，进入全屏放映，也可把 PowerPoint 或 PDF 保存至知识库。
- 演示对话可引用当前选区，按页修改标题与图表，也可把对话回复直接插入当前幻灯片。探索页新增「演示编辑」示例，可回看从导入研究简报到准备逐页讲稿和修改图表的过程。
- 「探索」用例依次为研究看板、自由搭建、表格分析、笔记随航、演示文稿、演示编辑、研究报告。白酒研究工作台演示会持续显示所选模型，15 个组件生成后对话正常结束，重开仍能查看完成进度和回复。
- 修复图像编辑发送被看板会话状态拦截的问题。从首页切换工作区时，已打开的图像页签可保留，也可独立选择工作区。
- 输入框统一了拖入、选择和快捷键粘贴附件的操作。新建看板会话出现在所属工作区顶部，新建笔记的默认标题和正文命名同步。
- 管理者工作台的横向组织架构支持在窄窗口缩放和滚动，各级节点仍可查看。同步优化了工作台图表和地图的布局。

## English

- Open or import PowerPoint decks in the new Presentation workspace. Edit text, tables, charts, and speaker notes, present in full screen, and save PowerPoint or PDF files to the Knowledge Library.
- Reference a selected area in Presentation chat, revise titles and charts across slides, or insert a chat reply directly into the current slide. The new Slide editing demo shows how to import a research brief, prepare speaker notes, and revise a chart.
- Explore now orders its demos as Research board, Build freely, Spreadsheet analysis, Notes Copilot, Presentations, Slide editing, and Research reports. The baijiu research workbench demo keeps the selected model visible, completes the chat after generating all 15 components, and restores the progress and reply when reopened.
- Fixed an issue where research board session state could block image edits. Changing workspaces from Home preserves open image tabs, which can select their own workspace.
- Attach files consistently by dragging them into the composer, selecting them, or pasting with a keyboard shortcut. New board chats appear at the top of their workspace, and new notes use consistent titles in the sidebar and document.
- The horizontal organization chart in the Management Workbench supports scaling and scrolling in narrower windows. Chart and map layouts have also been refined.

## 发布范围

本版包含 EWork Odyssey macOS Apple Silicon 客户端及旧签名兼容更新。

## 发布验证

- 构建提交 `f768168a08398f7bce8295bd25e9f66fe9bf5472`。108 项发布聚焦检查、类型检查和生产构建通过。集成批次的 17 组声明检查通过。签名版在隔离配置中打开主界面，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验 DMG 内应用、两个签名要求和旧桥运行时依赖。按本次发布要求跳过 Apple 公证。
- 两个公开更新源均提供 1.6.9 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存、文件名、单段 Range 与 blockmap，并核对上传文件完整性。
- 使用本地验证过的 1.6.8 ZIP 与公开版本资源，分别重建两个 1.6.9 ZIP。两份文件的 SHA-512 均与签名发布包一致。未执行全量升级。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 957,808,592 | 99,241,975 | 858,566,617 | 186 |
| 旧签名兼容 | 1,035,555,200 | 143,887,462 | 891,667,738 | 283 |

- Homebrew Cask 已同步到 1.6.9，Tap 提交 `ee1962fc65d5f268204082c5a7ef23846881b15b`。公开 Cask 的 DMG SHA-256 为 `59a75083eeba5d338f1a10e10d0f4c5a745caf51cd57fb973452790fbd66bcaa`。
- 滚动清理移除了 1.6.3 的五个版本资源。1.6.7 和 1.6.8 的差分基线仍可访问。

[下载 EWork Odyssey 1.6.9（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.9/sherlock-mac-arm64.dmg)
