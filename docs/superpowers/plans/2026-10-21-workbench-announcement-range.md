# Workbench Announcement Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 防止真实公告组件把不匹配来源或范围外记录作为已核实内容交付，并继续验证完整金融工作台生成效果和耗时。

**Architecture:** 沿用工具结果采集、来源接纳、单次有界内容修复的既有链条。在真实公告记录与明确日期窗口处收紧校验，不固定模板、不编造数据、不重复取整套数据。根 agent 运行真实客户端同范围复测，独立实现 agent 处理可复现的公告问题。

**Tech Stack:** JavaScript runtime、Vitest、Electron 原生客户端、现有宿主来源记录。

**Spec:** `docs/superpowers/specs/2026-10-21-workbench-announcement-range.md`

## Global Constraints

- 完整研究对象必须保留，不以静态渲染成功代替内容／数据验收。
- 公告日期与列表展示日期不能互换；未知／模糊时间不补造。
- 用户明确的窗口不能通过修改标签绕开；不要静默删条后保留错误计数或完整覆盖声明。
- 不削弱其他来源身份、数值、工具或刷新绑定校验，不改造无来源约束的普通／模拟时间线。
- 只运行直接受影响的聚焦检查。保留旧看板与笔记；不得修改签名应用、用户配置或凭据。
- 只在集成 worktree 构建本地签名测试版，不推送、不发布、不晋升 main；每项改动通过相关验证后中文本地提交。

## Review Focus

- 原始 noticeDate 与列表展示时间跨日时仍使用正确字段；补同条不同日期回归。
- 相同网址对应冲突记录、公司不同或标题相似时不能误认；补歧义与错误公司回归。
- 日期缺失、非法日期、带时区 ISO、边界日不应被误补或误筛；补边界与未知日期回归。
- 用户明确窗口与模型自报窗口冲突时，不接受扩大标签；补可信请求窗口回归。
- 普通／模拟时间线、无公告源和其他 feed 必须保持原接纳边界；补不相关路径回归。

### Task 1: 修复已取得公告的来源与范围接纳

**Files:** 主要为 `packages/dsh-research-task-runtime/announcement-provenance.js`、`component-source-binding.js`；必要时最小修改 `index.js` 的调用点以传入已有可信任务上下文；新增专用测试或扩充 `test/component-web-snapshot-evidence.test.js`。不要修改笔记、UI、共享客户端或其他生成格式合同。

**Interfaces:** 消费现有 observed records（public_data_query/eastmoney-announcements 的真实响应）、实际 artifact 与宿主保存的 panel request；产出与既有内容修复路径兼容的明确错误信息或已证明不改变语义的元数据恢复。公开函数签名优先兼容；新增可信上下文参数必须由宿主调用点供给，不能相信模型自己标注的来源或日期。

- [ ] 先追踪原始工具结果和实际 artifact 从 collector 到 accept/recovery 的调用链，确认 timeline 怎样绕过 feed identity 及明确窗口。只读报告实际证据，不读取 private reasoning 或凭据。若旧材料不足，使用测试夹具证明代码路径，并明确区分实际数据观察与合成边界测试。
- [ ] 建立 red 回归：实际 21 条公告中的 11 条落在声明窗口外时不能作为完整有效快照交付；同条 noticeDate 与展示时间、冲突源、三家公司覆盖、明确请求窗口不被改标签绕过、未知日期、普通时间线均覆盖。
- [ ] 最小实现来源／范围检查并接入既有有界修复。仅基于已取得事实恢复展示元数据；不能猜日期或手工删除失败对象来提高成功率。对自然语言无法可靠确定的窗口诚实保留边界，不能以模糊解析发明日期规则。
- [ ] 运行直接相关 source-binding/web-snapshot/timeline 聚焦检查和 diff check。红绿证据、实现决策、实际／合成夹具边界写入任务报告。
- [ ] 自审并中文提交，仅自己的文件；不构建、不派生其他 agent。交根 agent 做独立规格／代码审阅，必要时修复后复核。

### Task 2: 完整真实工作台与本地交付验收

**Owner:** 根 agent。当前客户端集成 `e66e538b`；原生同范围新请求名称「算力产业链·优化复测1021B」，已启动。仅名称与旧需求不同，不预先指定模板或降低模型档位。

- [ ] 读取真实持久化任务／工具结果与 UI，记录规划、首卡、全部终态、数量和失败；不可因观察超时而重启任务。
- [ ] 逐卡核对公司、期次、单位、来源、走势曲线与相对强弱、日期范围、新闻同条对应、静态／绑定状态和标题／筛选／详情／布局。安排覆盖画布全体组件的整理和滚动检查。
- [ ] Task 1 与其审阅完成后，按运行手册交接到现有未验收集成批次，通过清单检查，从集成 worktree 本地签名构建／包检查，真实客户端复测受影响组件；必要时再做新完整任务，保留此前结果便于比较。
- [ ] 记录证明的改进与仍未取得的数据／未达成的耗时目标。未通过的完整研究范围不能因单卡 ready 或窄测试而改记完成。
