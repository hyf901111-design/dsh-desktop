# EWork Odyssey 1.7.0

适用于 Apple Silicon Mac。

## 中文

- 研究看板会按问题和数据字段规划组件。同一份持仓披露，问集中度时可以看到前几大持仓的占比和排名，要求逐笔复核时则可以按披露顺序检索明细、核对单位并打开原文。
- 在对话里提出看板需求后，助手会直接在画布上创建组件。需要持续跟踪的数据可绑定支持刷新的来源，复杂对比可用交互组件切换观察条件。手动搭建时仍可使用智能容器。
- 切换表格、演示、笔记或图像时，右侧助手会随应用切换工具。可以先讨论方案，再要求执行。复杂任务会先给出与需求有关的回复，并在执行中报告进展。
- 演示文稿可以从底栏直接放映当前页。开启演讲者朗读后可暂停、继续，读完一页会自动翻页。投委会示例内置 20 页讲稿录音，改进了标注发送和连续翻页朗读。
- 图像会话以「新图像」开始。离开未使用的会话时会自动回收，使用模板、进入画布或开始对话后会保留；会话标题随模板或话题更新。修复了工作区切换后会话错位、串用图片标题和误回对话首页的问题。
- 表格和演示首页的内容位置已对齐。演示工具菜单、滚动条、画布右键菜单和标尺支持深色模式。研究看板在易方达主题下使用蓝底白字表头，个人看板取消了默认添加的管理者工作台。

## English

- Research boards choose components from the question and the available fields. With the same holdings disclosure, a concentration question can show top holdings and weights, while a line-by-line review opens searchable records in their original order with units and a link to the filing.
- Ask in chat to create components directly on the board. Monitoring components can bind to sources that support refresh, and interactive comparisons let you change the observation criteria. Smart Containers remain available when building by hand.
- The chat panel switches tools with the spreadsheet, presentation, notes, or image workspace. Discuss an approach before asking the assistant to act. For complex tasks, it can respond to the request before execution and report progress as work proceeds.
- Start a slideshow from the current slide using the footer. Speaker narration supports pause, resume, and automatic advance. The investment committee demo includes recordings for all 20 slides and improves annotation submission and narration across slides.
- Image sessions start as “New image”. Unused sessions are cleared when you leave. Using a template, entering the canvas, or starting a chat keeps the session and lets its title reflect the template or topic. Fixed misplaced chats, reused image titles, and unwanted navigation to the chat homepage when switching workspaces.
- Spreadsheet and presentation start screens now align. Presentation menus, scrollbars, canvas context menus, and rulers follow dark mode. Tables on E Fund research boards use white headers on brand blue. The Management Workbench is no longer added to every personal board by default.

## 发布范围

本版包含 EWork Odyssey macOS Apple Silicon 客户端及旧签名兼容更新。

## 发布验证

- 构建提交 `c517e6b6fc0fb70c896f25110cbeb7dc50850013`。108 项发布聚焦检查、类型检查和生产构建通过。集成批次的 58 组声明检查通过。签名版在隔离配置中打开主界面，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验 DMG 内应用、两个签名要求和旧桥运行时依赖。按本次发布要求跳过 Apple 公证。
- 两个公开更新源均提供 1.7.0 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存、文件名、单段 Range 与 blockmap，并核对上传文件完整性。
- 使用本地验证过的 1.6.9 ZIP 与公开版本资源，分别重建两个 1.7.0 ZIP。两份文件的 SHA-512 均与签名发布包一致。未执行全量升级。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 965,738,384 | 114,190,922 | 851,547,462 | 186 |
| 旧签名兼容 | 1,043,658,958 | 159,671,647 | 883,987,311 | 268 |

- Homebrew Cask 已同步到 1.7.0，Tap 提交 `0131bbe919dd60edbe40b291d05b8dc281f9e00b`。公开 Cask 的 DMG SHA-256 为 `004eeee38fc9244f1b081bb31e95eddce5e57a1b17020fc9167ba8e0db700ad7`。
- 滚动清理移除了 1.6.4 的五个版本资源。1.6.8 和 1.6.9 的差分基线仍可访问。

[下载 EWork Odyssey 1.7.0（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.7.0/sherlock-mac-arm64.dmg)
