# EWork Odyssey 1.3.5

日期：2026-10-22。平台：macOS Apple Silicon。

## 更新日志

- 新增笔记 AI 挑战，提供宽松、标准、严格和抬杠四档强度；选定等级并关闭强度面板后按该等级开展检查，通过双剑动效和沿边流动光束提示运行状态。
- 新增段落校对状态与未解决问题计数；优化段落线间距、依次淡入淡出和悬停提示位置，区分已校对、发现问题与尚未校对的段落。
- 评论气泡靠近点击文字显示，支持查看依据、围绕原文继续回复和 AI 优化；优化气泡展开收起、关闭按钮居中、发送按钮与已解决按钮的显示。
- 客户端运行期间，已启动的自动检查可在切换会话或模式、窗口失焦后继续执行并保存；评论优化在关闭气泡后仍可继续。优化按钮显示加载状态，笔记指令提供即时反馈和处理进度。
- 替换后的文字使用独立高亮并支持原文对照、取消替换、重新应用和解决标记；替换成功后自动解决原评论，保留正文格式、讨论与未发送草稿。
- 笔记会话可组合调用组件创建、配色与顶栏设置，以及 PDF、Word、Markdown 导出，并根据实际执行和保存结果显示操作回执。
- 限制笔记内容预览面板高度，保留顶部尺寸拖动手柄与正文滚动；显示实际编辑日期，并减少重复的思考状态与计时信息。
- 新增可切换并保存的彭博工作台样式，优化行情、图表、表格和完整画布整理布局；组件菜单统一采用适配深浅外观的中性磨砂背景。
- 改进研究组件的来源、日期范围和财报期间核验，保留宽表完整字段、原始精度、来源链接与口径说明。
- 优化研究组件对不同内容规模的展示与生成处理，新闻资讯按研究主题筛选；调整行情参数与来源绑定，减少不兼容参数导致的生成失败。
- 工作台生成回执区分静态内容、手动刷新、自动更新配置及最近成功或失败；改进重试入口、状态卡位置、后台行情提醒路由和流式会话性能。
- 记忆支持逐条编辑、启用或停用，删除前增加确认，并保留冲突和未保存修改提示。
- 协作看板支持共享日历：编辑成员可管理日程，查看成员可阅读完整详情，并显示共享同步状态。
- 首页新增适配深浅外观的锦鲤动态主题；网页和新闻链接默认在右侧浏览器打开，也可选择桌面浏览器。
- 补齐新增笔记挑战、评论与替换对照、段落提示、研究组件、菜单和程序回执的英文显示，切换语言时保留正文、草稿与组件状态。

## English

- Add four AI Challenge levels for notes: Relaxed, Standard, Strict and Challenger. Reviews follow the selected level after the intensity panel closes, with animated swords and a moving edge light indicating activity.
- Add paragraph review status and unresolved issue counts. Refine line spacing, staggered fade animations and tooltip placement to distinguish reviewed, flagged and unreviewed paragraphs.
- Place comment bubbles near the clicked text, with evidence, contextual replies and AI optimization. Refine bubble transitions, close-icon alignment, send controls and resolved buttons.
- While the app remains running, started automatic reviews can continue and save their results across session or mode changes and window blur. Comment optimizations can continue after their bubbles close. Add optimization loading indicators, immediate acknowledgments and note-task progress.
- Highlight replacements separately and provide before-and-after comparison, undo, reapply and resolve controls. Applying a replacement resolves its original comment while preserving formatting, discussions and unsent drafts.
- Combine component creation, color-theme and title-bar settings, and PDF, Word or Markdown export through the note conversation, with receipts based on actual execution and saved results.
- Bound note-preview height while keeping the top resize handle and content scrolling accessible. Show the actual edit date and reduce duplicate thinking-status and timer information.
- Add a saved Bloomberg-style workbench appearance and refine quote, chart, table and full-canvas arrangement layouts. Unify component menus with neutral frosted surfaces in light and dark modes.
- Improve source, date-range and reporting-period checks for research components. Preserve complete wide-table fields, original precision, source links and metric definitions.
- Improve generation and presentation across content sizes and filter news by the research topic. Refine quote parameters and source binding to reduce failures caused by incompatible inputs.
- Distinguish static content, manual refresh, auto-update configuration and recent successes or failures in workbench receipts. Refine retry controls, status-card placement, background price-alert routing and streaming-conversation performance.
- Edit, enable or disable individual memories, with confirmation before deletion and warnings for conflicts or unsaved changes.
- Add shared calendars to collaborative boards. Editors can manage events, viewers can read full details, and synchronization status is displayed.
- Add an animated koi home theme for light and dark appearances. Open web and news links in the right-side browser by default, with an option to use the desktop browser.
- Complete English labels for new note challenges, comments, replacement comparisons, paragraph feedback, research components, menus and structured receipts while preserving note text, drafts and component state.

## 发布范围与校验边界

- 覆盖 1.3.4 正式版之后、本地集成批次 20261019-05 中用户已验收的改动；运行时代码来源为 `ad7a8d3c047ae5587fe33d103a2eb946b8cf5162`。
- 本地合入 main，通过 GitHub awake-ai-lab/sherlock-desktop 的 hyf 与 main 同步；不推送版本标签。
- 继续排除已暂存的 Harness 后台、Harness 融合和 Windows 实验，保留其分支及记录。
- 应用关于页和两条更新通道使用一致的中英文日志，保留 1.3.4 及更早版本历史。
- 按用户要求跳过 Apple 公证、stapling 和 Gatekeeper 公证检查；保留 Developer ID、旧兼容证书签名及包完整性检查。`notarized/latest/` 是既有通道路径，不表示本次完成公证。
- 仅执行发布及直接受影响的聚焦检查、类型检查与公开差分校验，不执行全功能测试或旧客户端全量升级、安装替换和重启升级测试。
- AI 挑战不承诺检出所有问题；未联网的常识筛查不等于外部事实查证。后台检查仅在客户端运行期间继续；共享日历当前不提供系统提醒，离线禁止新增写入。

[稳定下载地址](https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg) · [标准通道](https://updates.evanarts.com/notarized/latest/latest-mac.yml) · [旧证书兼容通道](https://updates.evanarts.com/latest/latest-mac.yml)
