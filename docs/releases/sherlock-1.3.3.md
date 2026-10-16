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

- 本次已验收修改通过集成批次 20261016-02 至 20261016-08 晋升到本地 main；正式签名构建来自干净提交 de834ec8ba2d5c334c43b56efeef47388356f3f8。
- 应用内和两条更新通道使用一致的中英文日志，保留历史日志。
- 按用户要求跳过 Apple 公证、stapling 和 Gatekeeper 公证检查，保留 Developer ID 与旧兼容证书签名及包完整性检查。
- 仅运行发布及直接相关的聚焦检查；只做公开 blockmap、单段 Range/206 与 SHA-512 差分合成校验，不执行旧客户端全量升级或安装重启测试。
- GitHub 源码同步到 awake-ai-lab/sherlock-desktop 的 hyf 和 main；不推送版本标签。
- 另一 session 的插件备份保留提交 8816c2bc20cef7a76ed1ad7190e1a01e2ac7e32a 未纳入本次已验收范围；保留原工作目录，分支归档为 archive/release-1.3.3-20261016/feat/profile-backup-retention-20261016，待单独验收。
- ZIP 时间戳规范化需要新旧两端均采用稳定归档元数据才能充分受益，首次迁移仍可能较大。

## 最终客户端验收

- Electron/macOS 的透明主窗口叠加透明网页底层会导致菜单的 backdrop-filter 参数正确、实际背景文字却仍清晰可见。主页面改为深浅主题对应的不透明底层，保持菜单统一的半透明颜色与 36px 模糊；页面不再透出 macOS 桌面颜色。
- 工作区、模型、权限、账户、更多、消息中心、搜索和斜杠菜单使用同一材质。搜索面板保留内部滚动；不新增伪元素遮罩或改变浮层挂载位置。
- 笔记原生浮窗使用 macOS menu vibrancy；斜杠根菜单与组件库子菜单均移除描边，保留系统阴影、跨窗口展开、定位与键盘导航。
- 在最终签名客户端验证账户、更多、消息中心、搜索和笔记斜杠及二级菜单，并手动检查更新；关于页显示当前版本 1.3.3、已是最新版本和完整九条日志。恢复原深色主题，返回笔记模式，保留正文与输入草稿。
- 最终相关聚焦检查 59 项通过，另有发布检查 77 项、主题与会话记忆等检查 113 项通过；类型检查与差异格式检查通过，未运行全功能测试。
- 透明窗口像素回归先在旧实现复现失败，再在修复后通过；真实 Electron 43.4.0 原生透明窗口同时覆盖深浅主题及透明底层反例。另一个已有的 research-derived-menu-final 测试因补丁定位锚点重复而初始化失败，在未修改基线中亦可复现；本次菜单渲染另由实际像素检查与客户端验收覆盖。
- 两个 ZIP 的全部条目 CRC、包内版本与关键模块哈希核对通过；Developer ID 应用、DMG 和旧兼容签名检查、DMG 完整性检查通过。
- 公开验证覆盖 10 项资源和 20 个 Range 样本，包括两个更新源、不可变资源、品牌及旧版稳定下载地址、缓存策略和文件名。
- 完成公开及差分验证后，仅清理最早版本 1.2.1 的五个不可变资源。19 项清理后检查通过，确认删除对象返回 404，1.3.2、1.3.3、两个更新源及稳定下载地址均保留。

## 公开差分验证：1.3.2 → 1.3.3

| 通道 | 完整 ZIP 字节 | 实际传输字节 | 复用字节 | 单段 Range 请求数 |
| --- | ---: | ---: | ---: | ---: |
| Developer ID | 527763084 | 157869398 | 369893686 | 920 |
| 旧证书兼容桥 | 582582027 | 212132307 | 370449720 | 895 |

两次均通过真实 electron-updater 差分下载器从公开版本资源合成 ZIP，所有请求要求单段 Range/206，禁止全量回退；合成文件 SHA-512 与签名发布文件完全一致。

- Developer ID ZIP SHA-512：`NWvVQsbGuxuDN+7mif3qvRxzzLhSHSpE15wcdlwTqEmyb1i/BbvpZyqmgTw4jvBbcGVjn6yfZJh8bfARbzFLvg==`
- 兼容桥 ZIP SHA-512：`ba0oN5h+6FD+cT1LxqUWxFHygRmIwfQc+ZnI6p0qVhR4LXWebk3mU8Jac9phPU3Am2Qnc19Xlet2nyPeLK4AEQ==`

这是首次切换到稳定归档元数据，实际下载仍分别约 157.9 MB 和 212.1 MB，不能将后续稳定格式之间的优化收益描述为本次实测下载量。缺少有效旧包缓存等情况下，客户端仍可能安全回退到全量下载。旧客户端本身的更新重试逻辑不能被发布源追溯修改；仍遇到 command disabled 的用户可直接安装 1.3.3。

发布证据目录：/tmp/ework-release-1.3.3-20261016。
