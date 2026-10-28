# 电源与睡眠开关实现计划

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in this session. Steps use checkbox syntax for tracking.

**Goal:** 在通用设置提供合盖继续运行和阻止自动睡眠两个真实生效的开关。

**Architecture:** 主进程持有偏好和生命周期；普通睡眠使用 Electron 断言，合盖使用管理员授权的临时 launchd 守护。preload 仅渲染状态和提交已知布尔变更。

**Tech Stack:** TypeScript、Electron、macOS pmset/launchd、Vitest、Happy DOM。

**Spec:** `docs/superpowers/specs/2026-10-28-power-sleep-settings-design.md`

## Global Constraints

- 默认关闭；合盖仅本次运行有效，普通自动睡眠偏好持久化。
- 不修改 sudoers，不运行用户提供的代码，不覆盖已有 SleepDisabled=1。
- 仅聚焦测试，不构建或替换来自 feature worktree 的共享客户端。
- 不公开发布、不改版本、不推送；完成后中文本地提交。

## Review Focus

- 取消授权/异常与并发切换时开关不显示虚假成功。
- 应用退出、崩溃、心跳过期、重启时不会残留系统覆盖。
- 原已存在的其他应用电源策略不会被关闭操作覆盖。
- 深浅主题、中文英文、设置卸载重开与 keyboard switch 状态正确。
- 子 frame、其他窗口、未知键、非布尔值不能触发系统电源操作。

### Task 1: 电源生命周期与设置界面

**Files:** 新建 `src/shared/power-settings.ts`、`src/main/power/{controller,macos-lid-guard,ipc}.ts`、`src/preload/power-settings.ts`、聚焦 `test/power-*.test.ts`；修改 main/preload 入口和设置 CSS。

**Interfaces:** `PowerSettingsController.get()/set(key,value)/dispose()`；`MacOSLidGuard.start()/stop()/active()`；preload bridge `get()/set()` 返回实际 `PowerSettingsState`。

- [x] 写并运行失败测试：持久化普通睡眠偏好，独立关闭，取消授权回滚，串行与退出竞争、漂移、已有外部策略；租约消失、PID 退出、过期时脚本恢复；不可信 IPC；DOM 重开/授权中禁用/错误提示。Switch 使用原生 button，键盘沿用原生语义。
- [x] 实现最小主进程控制器、固定 root 守护脚本与安全 IPC。
- [x] 实现原有通用设置分组内两个 switch，状态回读与中英文提示。
- [x] 运行 `node_modules/.bin/vitest run test/power-settings.test.ts test/power-lid-guard.test.ts test/power-settings-ui.test.ts test/power-settings-ipc.test.ts test/ipc-trust.test.ts test/figma-settings-layout.test.ts`，30 项通过。
- [x] 运行 `npm run typecheck` 与 `git diff --check`，通过。
- [ ] 检查补丁、记录物理合盖验收边界、创建中文提交并生成精确交接卡。

## 审查记录

独立审查指出安装器中断可残留未加载的 root plist，已加入仅限本功能固定路径、root 所有权、普通文件且无活动 job 的恢复逻辑，以及安装失败回滚；真实生成脚本在隔离命令替身中先失败后通过。再次独立审查无剩余重要发现。真实管理员授权、物理合盖、真实进程崩溃及重启仍需本地客户端验收，测试脚本不能替代该证据。
