# 子代理头像实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为既有真实子代理入口接入稳定角色与克制的运行提示。

**Architecture:** 无状态共享 presenter 由一个严格 installer 注入 catalog 与详情模块。child session ID 经过稳定 hash 映射到本地 30 角色；保持真实状态和原生交互。

**Tech Stack:** Native SDK plugin/React、JavaScript patches、CSS、Vitest、headless Chromium。

**Spec:** `docs/superpowers/specs/2026-10-26-subagent-avatars-design.md`

## Global Constraints

- 仅 catalog/详情；不添加任务管理树，不改 workflow/人类头像，不构建或控制共享客户端。
- UUID 稳定 hash，无 Math.random/持久层；inactive 不推断成功。
- 32/24px 占位、22/18px 图形容器、24/20px 环；弧45%→100%/900ms单程，轨道18%，角色静止。
- 严格漂移检测、两遍字节幂等；本地原资产；只聚焦测试。

## Review Focus

- 同一 ID 在状态/顺序/主题/重挂变化后角色稳定。
- 标题/摘要换行与 metrics 不改变头像首行中心；长标题不挤掉数值。
- 无真实完成证据时不出现勾；catalog diagnostic 仍禁用且不冒充任务失败。
- 减少动画不再呼吸；实际弧/轨道分层，角色无 transform 动画。
- 已安装源、未知 marker、重复/修改 hook 均经过严格门禁，静态资源逐一可获取。

### Task 1: Native 入口 RED 与原资产

**Files:** 新 `test/subagent-avatars-browser.test.js`、`test/fixtures/subagent-avatars-browser.tsx`；`build/brand/subagent-avatars/*` 与来源 manifest。

- [x] 写真实 native catalog 注册/详情头 fixture，断言两个入口头像及稳定身份、图形/标题中心。
- [x] 跑指定浏览器 case，看到缺少头像的实际 RED。
- [x] 从已核对的 Figma 规范化组件原样导出资源，保存来源及 hash；保持 PNG 内容和环几何。

### Task 2: 共享 presenter 与严格安装

**Files:** 新 `scripts/lib/subagent-avatars.mjs`；窄改 `figma-refinements-client.mjs`、`figma-subagent-panel.mjs`、`figma-refinements.css`、`install-brand-assets.mjs`；新 `test/subagent-avatars.test.js`。

**Interfaces:** `patchSubagentAvatars(source, kind)` / `stripSubagentAvatars(source, kind)`，kind 为 catalog/detail；注入同一 `OdysseySubagentAvatar` 与稳定角色函数。所有原状态/导航输入保持。

- [x] 写 native 安装/幂等/漂移与稳定 hash RED。
- [x] 实现共享定义、两个可逆 hook、本地资产复制和作用域 CSS。
- [x] 跑 RED case 收 GREEN，保持原生打开/展开/诊断。

### Task 3: 聚焦验证与交付

- [x] 浏览器检查深浅/减少动画/长标题/顺序和重挂，保存并亲自看图。
- [x] 校准受影响原 menu/panel tests 的真实 presenter 提取，保留其 native 行为断言。
- [x] 跑新旧直接 tests、`npm run typecheck`、syntax/diffcheck；不跑全功能。
- [x] Root/独立审查后申请短 index 窗口，只提交本 scope 中文提交；Root 负责后续正式集成与原生验收。

## 聚焦结果（2026-10-26）

- 实际 native 浏览器先 RED（头像0/预期3），再完成共享接线；安装/身份4 RED，资源层校验1 RED，均已 GREEN。
- 8 个直接文件34/34，`npm run typecheck` EXIT0；production Node 两遍逐字相等并解析，严格 marker 漂移回归保留。
- `/tmp/subagent-avatars-20261026/` 保存深浅两入口和30角色双尺寸图及像素几何。50%前景轮廓最小留白2.0566px；原图插值淡边约1.9557px，未为消除淡边缩小原图。
- 资源取舍：25MB原PNG按Figma规范化组件以固定32逻辑像素/DPR2原样导出，共30个64px透明PNG；保留源PNG SHA与原/规范化节点，连4个原SVG及manifest约130KB，不重复打包大图。
- 旧直接fixture校准实际managed源阶段及真实installed sidebar；central padding在HEAD与现版同为4px/0/12px，非本轮产品变化。新Avatar剥离后，catalog/detail输出与HEAD旧patch逐字相等，证明原状态/导航/输入变换未变。
- 仅headless fixture，未触正式客户端/共享包/Root UI，正式集成和原生验收待Root。
