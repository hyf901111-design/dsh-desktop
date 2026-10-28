# 合盖设置持久化实现计划

> **For agentic workers:** Use superpowers:executing-plans for the TypeScript workflow and the delegated native helper for its isolated file ownership.

**Goal:** 一次安装授权后，合盖设置随客户端自动恢复，退出释放但保留选择。

**Architecture:** root 原生辅助服务持有睡眠覆盖及恢复日志；主进程保存偏好和签名进程租约，preload 仅显示实际状态。自动恢复禁止安装授权。

**Tech Stack:** TypeScript/Electron、Objective-C++、Security/IOKit、launchd、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-28-persistent-lid-power-design.md`

## Global Constraints

- macOS 12+；固定命令与路径，无 sudoers、网络和任意命令接口。
- 首次授权需用户完成；以后正常启动不弹窗；失败不显示虚假开启。
- 功能工作树不构建共享客户端；仅聚焦测试，不公开发布。

## Review Focus

- 首次授权失败不能写入虚假的成功偏好；退出授权竞态不留下活动租约。
- 客户端重启只恢复租约，服务仍已安装，安装次数保持1。
- 复制后验签、root 路径与文件描述符校验，拒绝符号链接和伪造 PID。
- 外部电源设置保留，root journal 恢复覆盖崩溃/重启窗口。
- 原生二进制正确编译、嵌入身份、打包和签名。

### Task 1: 原生服务

- [x] 原生策略失败测试与最小服务实现，验证 journal、外部借用、租约失效、安全停止、漂移及精确释放回执。
- [x] 编译生产辅助程序并验证嵌入 identifier；不实际提权运行测试。

### Task 2: 偏好与客户端租约

- [x] 先测试跨启动恢复、无安装权限自动恢复、授权取消及保存失败回滚。
- [x] 持久化两项偏好，实现可信服务检查、一次安装器、原子租约及确认读取。
- [x] 更新设置描述和服务未就绪提示，接入启动恢复及构建/包检查。

### Task 3: 交付

- [ ] 聚焦检查、类型检查、独立审查、中文提交与精确交接卡。
- [ ] 刷新未验收集成批次，按本地手册构建并核验真实主界面，保留待用户手动首次授权的边界。

2026-10-28 实现核验：直接相关9文件67项通过（含原生29项），类型检查通过；独立审查已确认释放失败、保存偏好、安全停止、旧版恢复记录与崩溃后握手问题修正。首次真实管理员安装、物理合盖与系统重启仍待用户参与。
