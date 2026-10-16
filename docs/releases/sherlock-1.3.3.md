# EWork Odyssey 1.3.3

日期：2026-10-16。平台：macOS Apple Silicon。

## 更新日志

- 统一客户端滚动条颜色，深色外观使用低对比灰，浅色外观使用柔和浅灰。
- 记住外观与首页背景选择，退出并重新打开客户端后继续使用上次主题。
- 各会话独立记住最后使用的模式；切换会话或新建对话、研究后返回时，自动恢复原来的对话、研究、笔记或轨迹页签。
- 移除笔记评论的添加反应入口，保留编辑、删除和解决评论等操作。
- 修复更新准备超时后再次重试可能重复执行安装命令并提示 command disabled 的问题。
- 优化差分更新打包，减少未修改文件因归档时间戳变化而被重复下载；首次切换到新打包方式时更新包仍可能较大。
- 修复收起侧栏后设置页按钮与主题预览被压窄，以及设置打开时仍能拖动底层侧栏的问题。
- 优化首页工作区下拉箭头的颜色对比；输入 / 与按钮显示相同命令列表，具体技能统一从技能入口选择；菜单不再默认选中压缩历史，鼠标和键盘共用单一高亮状态。
- 统一工作区、模型、权限、账户、消息中心、斜杠及笔记菜单的毛玻璃背景，增强背景模糊和通透感，适配深浅外观，并移除笔记斜杠菜单描边。

## English

- Unify scrollbar colors across the client with subtle gray in dark appearance and soft light gray in light appearance.
- Remember appearance and home background choices after quitting and reopening the client.
- Remember the last mode for each session. Returning after switching sessions or creating a chat or research session restores its Chat, Research, Notes or Trajectory tab.
- Remove the Add reaction entry from note comments while preserving editing, deletion and resolution.
- Fix update retries issuing a duplicate installation command after preparation times out, which could show a command disabled error.
- Optimize differential update archives to avoid downloading unchanged files again because of timestamp changes. The first update adopting the new format may still be large.
- Fix compressed Settings buttons and theme previews with a collapsed sidebar, and prevent dragging the background sidebar while Settings is open.
- Improve contrast for the home workspace dropdown arrow. Typing / and the command button show the same command list; individual skills open from Skills. Compact history is no longer preselected, and pointer and keyboard navigation share one highlight.
- Unify frosted-glass backgrounds across workspace, model, permission, account, notification, slash-command and Notes menus, with stronger background blur and translucency in light and dark appearance. Remove the Notes slash-menu border.

## 发布范围与验证

- 本次已验收修改通过集成批次 20261016-02、20261016-03、20261016-04、20261016-05 和 20261016-06 晋升到本地 main。
- 应用内和两条更新通道使用一致的中英文日志，保留历史日志。
- 按用户要求跳过 Apple 公证、stapling 和 Gatekeeper 公证检查，保留 Developer ID 与旧兼容证书签名及包完整性检查。
- 仅运行发布及直接相关的聚焦检查；只做公开 blockmap、单段 Range/206 与 SHA-512 差分合成校验，不执行旧客户端全量升级或安装重启测试。
- GitHub 源码同步到 awake-ai-lab/sherlock-desktop 的 hyf 和 main；不推送版本标签。
- 另一 session 的插件备份保留提交 8816c2bc20cef7a76ed1ad7190e1a01e2ac7e32a 未纳入本次已验收范围；保留原工作目录，分支归档为 archive/release-1.3.3-20261016/feat/profile-backup-retention-20261016，待单独验收。
- ZIP 时间戳规范化需要新旧两端均采用稳定归档元数据才能充分受益，首次迁移仍可能较大。

发布证据目录：/tmp/ework-release-1.3.3-20261016。
