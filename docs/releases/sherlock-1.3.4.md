# EWork Odyssey 1.3.4

日期：2026-10-19。平台：macOS Apple Silicon。

## 更新日志

- 对话首页的主题卡片保留入场动效，停留 3 秒后自动收至底部并露出三分之一，鼠标悬停时回弹展开。
- 点击组件底栏的数据来源或更新状态，可直接打开对应组件的“数据与自动更新”设置；已登记多个兼容来源的组件支持下拉切换。
- 自选股、个股行情、市场指数、新闻和公司公告新增可切换的数据来源，支持保存刷新频率和暂停状态。
- 组件底栏同时显示数据源名称与刷新频率或当前状态，更新失败、暂停时也保留来源，悬停显示完整说明并使用小手光标。
- 切换来源或刷新时保留组件布局和交互状态；部分取数失败时继续显示上次有效数据及图表，并保留原有来源和成交量单位。
- 优化数据设置中下拉箭头的间距与深浅主题显示，来源选项只显示来源名称，保留键盘操作和关闭后的焦点恢复。
- 修复启动页被主界面样式覆盖导致白色标志出现在浅色背景上的问题，深浅外观均保持清晰对比并保留启动动效。

## English

- Home theme cards keep their entrance animation, retract to one-third visibility after three seconds, and expand again on hover.
- Click a component footer source or update status to open its Data and Auto-update settings. Components with multiple registered compatible sources can switch between them.
- Add selectable data sources for watchlists, individual stock quotes, market indices, news and company announcements, with saved refresh intervals and pause settings.
- Component footers show the source alongside the refresh interval or current status, retain source names on errors and pauses, and provide full details on hover with a pointer cursor.
- Preserve component layout and interaction state while switching sources or refreshing. Partial fetch failures retain valid previous data and charts, including their source and volume units.
- Refine dropdown arrow spacing and light and dark appearances in data settings. Source options show source names, with keyboard operation and focus restoration preserved.
- Fix desktop shell styles overriding the startup background, keeping the logo readable in light and dark appearances while preserving the startup animation.

## 发布范围与校验边界

- 发布用户已验收的集成批次 20261019-01、20261019-02；OpenTerminal 全看板样式及恢复试用的新批次 20261019-04 均按用户明确选择单独暂存，保留分支、工作目录和验收证据，不纳入本次构建。
- 应用关于页和两条更新通道使用一致的中英文日志，保留历史日志。
- 按用户要求跳过 Apple 公证、stapling 和 Gatekeeper 公证检查；保留 Developer ID、旧兼容证书签名及包完整性检查。
- 仅执行发布与本次功能直接相关的聚焦检查、类型检查和公开差分校验，不执行旧客户端全量升级或安装重启测试。
- GitHub 同步 awake-ai-lab/sherlock-desktop 的 hyf 与 main，不推送版本标签。
