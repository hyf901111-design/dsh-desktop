# EWork Odyssey 1.4.1

发布日期：2026-10-27。平台：macOS Apple Silicon。按用户要求签名发布，不进行 Apple 公证。

## 更新内容

- 优化 macOS 应用内更新：优先复用旧包进行差分下载，对短暂网络故障进行有限重试，显示实际差分下载进度。
- 更新下载保留经过校验的未完成数据，支持失败重试及重启后续传；服务器支持 Range 且校验通过时继续下载，条件不满足时安全重新下载。
- 修复发送消息后思考状态先于用户消息出现的问题，覆盖继续会话、排队和追加指令，优先显示用户气泡再显示回复状态。
- 回复顶部保留一个总计时及常显展开按钮；中间过程不再重复计时，展开按钮仅在悬停或键盘聚焦时出现在右侧。
- 优化“加载更早”：一次连续获取多批历史，尽量带回多个完整对话轮次，并保持阅读位置，减少只加载一两条消息的情况。
- PPT 标注删除后按现存标记重新连续编号，保留历史引用定位；标注修改不再自动添加 PPT 制作技能，用户手动添加的技能仍保留。
- 技能菜单将 PPT 制作助手和研报写作置顶，并增加小号配图；修复斜杠二级菜单定位，统一背景模糊与菜单显示。
- 拖入文件时仅突出实际输入框区域，优化首页不可发送状态的箭头颜色；长工作区标题采用尾部淡出与悬停滚动，插件返回按钮固定显示。
- 内置 PPT 制作助手升级至 1.1.2，同步表头与表内容对齐、表头垂直居中、小标题与正文间距、封面空格及 PowerPoint 文件兼容性检查规则。
- 新增 Homebrew 软件源发布同步，保持安装版本、安装包校验值和公开更新源一致。

## Release notes

- Improve in-app macOS updates with differential downloads that reuse cached packages, bounded retries for transient network failures, and progress based on the actual delta transfer.
- Preserve verified partial downloads for retries and continuation after an app restart. Resume when the server supports Range and validation succeeds; safely restart otherwise.
- Show the user message before thinking and reply states, including continued conversations, queued messages, and follow-up instructions.
- Keep one total timer and an always-visible expand control at the top of each reply. Intermediate stages no longer repeat timers, and show their right-side expand control only on hover or keyboard focus.
- Load multiple history batches per click to retrieve more complete conversation turns while preserving the reading position.
- Renumber remaining PPT annotation pins after deletion while preserving historical references. Annotation edits no longer add the PPT skill automatically; manually selected skills remain intact.
- Place PPT Maker and Equity Research first in the skill menu with compact illustrations. Fix slash submenu anchoring and unify blurred menu surfaces.
- Highlight only the actual composer when dropping files, soften the disabled send arrow, use fading and hover scrolling for long workspace titles, and keep the Plugins back button fixed.
- Update the bundled PPT Maker to 1.1.2 with rules for header and body column alignment, vertically centered table headers, subtitle-to-body spacing, cover whitespace, and PowerPoint compatibility checks.
- Synchronize Homebrew releases with the public update feed, package version, and verified package checksum.

## 更新机制边界

差分需要有效旧包缓存和可用的 blockmap；续传需要服务器支持 Range 且数据校验通过。旧客户端必须先升级至 1.4.1 才能使用新增的失败重试和跨重启续传机制；不能追溯修改 1.3.x 已安装客户端。Homebrew 使用完整 DMG 安装，与应用内差分更新是不同路径。

## 发布验证

验证记录待实际发布完成后补充。证据目录：`release-cloudflare/1.4.1/`。
