# EWork Odyssey Figma 最终稿实施计划

**目标：** 在已有研究看板协作客户端还原 22–46 组真实界面与交互，浅深色同时验收。
**依据：** 用户 2026-09-10 明确要求及 Figma Jkyr5rMvgM8GNH6E68xnqd / 284:396。第 46 组与用户文字优先于 45 组残留的旧说明。
**源码：** 当前工作目录 dsh 是旧 0.8.1；已核实真实 EWork Odyssey 协作开发源在本 worktree，起点 7c5fbc4。保留此前 56 个功能提交，通过集成流程与私有 main 合并后再构建共享客户端。

- [x] 读取 Figma 分组、真实 1380×900 容器、精确样式属性与对应截图。
- [ ] 导航与协作：research-boards-ui/dialogs/navigation/presentation，真实服务权限、成员与菜单绑定；聚焦导航测试。
- [ ] 通知与更新：notifications/update-view/sidebar-update/about 真实状态绑定；聚焦更新测试。
- [ ] 研究组件：figma-canvas-client、bento-layout 与 planner；默认/hover/selected/生成/停止/失败及小中大整理；聚焦画布和生成测试。
- [ ] 公共材质与输入：figma-final-shell.css、patch-figma-final-shell；研究空态、4px上下文间距、收缩消息气泡、DINPro/Noto字体核验。
- [ ] 各模块经验证后按文件边界作中文本地提交。
- [ ] 创建精确交接和集成批次，运行本地测试手册 build_and_run.sh --verify 与包检查。
- [ ] 真客户端浅深色、导航收起、多成员、输入标签、组件状态截图对照；记录差异并保持客户端打开。

不运行全量测试；不发布、不推送、不递增版本、不删除用户数据。素材使用精确 Figma 导出，通知邀请不向真实用户发测试消息。组件字体保持 CSP data-only，不通过开放远程字体联网绕过隔离。
