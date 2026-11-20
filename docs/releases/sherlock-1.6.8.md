# EWork Odyssey 1.6.8

适用于 Apple Silicon Mac。

## 中文

- 顶栏可在同一会话里切换对话、研究、笔记、图像等模式，并保留会话上下文。对话固定在首位，其余四个位置可拖拽配置。空间不足时，多出的标签收进三个点菜单，长短标题与展开按钮的间距保持一致。

- 左侧应用入口沿用当前工作区。浏览器和图像页签可分别选择项目，历史对话也会在原会话中继续。新对话优先显示在当前项目顶部，首条消息可自动生成会话标题。

- 从右侧切换工作区会立即进入新会话，沿用「新研究」「新表格」或「新笔记」等默认标题。进入后可直接打开斜杠命令菜单。只打开过的空表格离开后会从侧栏收起，保存过的工作簿、对话和文字草稿会保留。

- 图像应用的右侧支持普通对话，检测到生图需求时才开始生成图片。图像画廊始终可新建页签，离开后会回收未编辑的图像页签。

- 优化研究看板的网页滚动和菜单关闭。网页滚到边缘后可继续滚动看板，点到菜单外部可关闭菜单。修复内置浏览器浮层遮挡和下载文件操作。

- 点击对话里的过程截图可预览大图，关闭后回到原网页。修复连续打开应用和启动时恢复看板的问题。顶栏空白处可拖动窗口，探索页背景改为中性灰。

- 改进探索演示的启动与中断恢复。演示文稿和研究报告保留当前模型显示，演示文稿示例可从知识库拖入参考 PDF。

- 修复首页初始化时预设加载失败阻塞首条消息的问题，并减少拖动客户端窗口时误选知识库文字的情况。

## English

- Switch between Chat, Research, Notes, Images, and other modes from the same session while keeping its context. Chat stays first, and the other four positions can be customized by dragging. Extra modes move into the three-dot menu in narrow layouts, and the expand button keeps the same spacing for short and long titles.

- Apps opened from the sidebar inherit the current workspace. Browser and image tabs can select projects independently, and existing conversations continue in their original session. New chats appear at the top of the current project and can be titled automatically after the first message.

- Changing workspaces from the side chat opens a new session immediately with a default title such as New Research, New Spreadsheet, or New Note. Slash commands are available as soon as the session opens. Empty spreadsheet sessions clear from the sidebar when you leave, while saved workbooks, conversations, and text drafts remain accessible.

- The Images assistant supports regular conversation and starts image generation when requested. A new image tab is always available, and unused gallery tabs are cleared when leaving.

- Improved webpage scrolling and menu dismissal on research boards. Scrolling continues on the board when an embedded page reaches its edge. Fixed overlay stacking and download actions in the built-in browser.

- Open screenshots from conversation activity at full size and return to the same webpage when you close the preview. Fixed repeated app launches and restoration of boards during startup. Empty areas of the title bar can move the window, and Explore now uses a neutral background.

- Improved how Explore demos start and resume after interruptions. The presentation and report demos keep the selected model visible, and the presentation demo accepts a reference PDF dragged from the Knowledge Library.

- Fixed a startup issue where a preset-loading failure could block the first message, and reduced accidental text selection in the Knowledge Library when dragging the window.

## 发布范围

独立的账号管理后台额度与排序开发继续保留在原分支，另行验收。

## 发布验证

- 构建提交 `5c8bd5f33c6b3c27cfd8b611f9e2ce1bcf1dd2a3`。169 项聚焦检查、类型检查和生产构建通过。签名版在隔离配置中打开工作区，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名。旧客户端兼容桥保留原更新证书。已核验安装包和其中的 App。按本次发布要求跳过 Apple 公证。
- 两个公开更新源均提供 1.6.8 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存策略、文件名、单段 Range 响应和 blockmap，固定版本 DMG 的全文件内容与本地签名产物一致。
- 使用 1.6.7 缓存从公开版本下载差分数据，分别重建两个 1.6.8 ZIP。两份文件的 SHA-512 均与签名发布包一致。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 934,437,076 | 92,274,967 | 842,162,109 | 163 |
| 旧签名兼容 | 1,011,196,375 | 128,159,417 | 883,036,958 | 267 |

- Homebrew Cask 已同步到 1.6.8，Tap 提交 `3c83e3f2150616e93fc8c8b7c8c779c4c7056324`，公开 Cask 的 DMG SHA-256 为 `d6e686281de39a0e29463887672f014bd68de56b28efc159072df7abcb16be29`。
- 滚动清理移除了 1.6.1 的五个版本资源，1.6.7 的差分基线仍可访问。

[下载 EWork Odyssey 1.6.8（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.8/sherlock-mac-arm64.dmg)
