# 看板独立目录 Implementation Plan

> Execute inline in the existing isolated preview; focused validation only.

**Goal:** 每个新看板展示专属目录，空对话关联项目保持看板入口及内容。
**Architecture:** 保留既有唯一目录记录。会话 cwd 不可变，关联时创建内部替代会话，复制画布并原位更新 favorite，保留独立目录以便切回。选择入口沿用已有对话为空时展示的规则。
**Tech Stack:** Electron, TypeScript, React client patches, Vitest.
**Spec:** 当前任务用户确认的“新建看板目录”、完整路径气泡、独立目录菜单项和首次发送前关联项目。

- [x] runtime directory associate validates source/target and maintains original directory.
- [x] service clones canvas and atomically rebinds dedicated favorite, preserving favorite ID.
- [x] renderer presents dedicated directory and routes association without workspace navigation; keeps drafts/images and board selection.
- [x] focused directory/store/patch checks, build and real isolated-client interaction verification.
- [x] Figma editable specification sync and Chinese local commit.

验收：24 项聚焦测试通过，类型检查及构建通过。实机验证默认目录、项目关联后保留看板入口、草稿转移、切回原独立路径、重启路径保留，以及发送消息后入口隐藏。Figma 规范节点 843:27571；文案统一为“新建看板目录”。
