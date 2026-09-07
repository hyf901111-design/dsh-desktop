# 构建模式与组件生成进展验证

日期：2026-09-08（Asia/Shanghai）

## 来源与范围

- Canonical repository: `/Users/heyafeng/Documents/ChatGPT/sherlock-desktop`
- Feature worktree: `/Users/heyafeng/Documents/ChatGPT/sherlock-build-mode-20260907`
- Branch: `codex/feat/build-mode-20260907`
- Base: `598d956c62f19b713ceb67bab4c71457fc8702f7`，版本维持 0.8.9。
- 功能开发与隔离浏览器验证；未构建或替换共享客户端，未上传 Cloudflare、推送 Git 或更改更新源。

## 实现

构建模式沿用标准模式全部能力，仅增加需求判断与工作台规划策略。简单问答直接回复；多维研究需求调用 `research_workbench_create` 一次提交 2–10 个独立面板，由现有并发上限为 10 的任务运行时执行。医药研究案例只作为面板用途拆分参考，不硬编码固定清单，不宣称持续监控已启用。

规划先确定面板类型、边界、720px 宽度和内容高度，随后持久化面板身份并并发启动任务。创建请求幂等，部分启动失败独立显示，重启恢复未领取规划，页面确认领取后不会重复插入。前端自动切换研究页并定位整组面板；四面板采用两列，其他数量按规则排布，生成过程保留预先规划尺寸，完成后按实际尺寸调整行间距。

组件进展优先展示公开的子代理回报及脱敏、限长的搜索主题/来源标题。去重并显示最近实际进展，不循环播放虚构步骤。进入实际 JSON/HTML 输出后显示对应构建阶段；不显示私有推理、原始工具结果或组件代码。

## 聚焦验证

- `npx vitest run test/research-workbench.test.js test/standard-agent-preset.test.ts test/research-task-runtime.test.js`：101 passed。
- `npx vitest run test/sherlock-composer-workspace-ui.test.ts -t 'optional Conversation root|blank Research session|Research empty-state|generation events into bounded|shows real progress immediately|complete composer into the single'`：6 passed，234 skipped。
- `npm run typecheck`：通过。
- 四个 package patches 对恢复的原始依赖执行 `git apply --check`：通过。
- `git diff --check`：通过。
- 未执行全功能测试。

重点覆盖：标准/构建能力一致、选择身份持久化、2–10 面板约束、重复请求、恢复与确认领取、部分启动失败、跨会话确认隔离、拒绝不可信请求、真实进展去重、私有推理/代码排除、组件预置尺寸、完成后重排、全组视野以及空白会话渲染。

## 真实浏览器与模型验证

隔离 Harness 使用本工作树依赖，服务在 `127.0.0.1:18789`；数据位于 `/tmp/sherlock-build-mode-qa/harness`，未触及正式用户会话。通过实际 UI 选择构建模式，使用配置的 Kimi K3 进行测试。

1. 简单问答：`1+1等于几？只回复答案。` 返回 `2`，保持对话，没有创建工作台。
2. 四个医药离线面板：公司比较、管线、催化剂日历、研究问题全部完成；四个子任务约 11.7–15.6 秒，并发执行。自动进入研究画布，组件内容没有内部滚动溢出。
3. 四个混合研究面板：规划、并发、两列布局、持久化均完成。联网子任务实际调用搜索，但隔离网页没有 Electron 本地搜索桥接，返回 `WEB_LOCAL_SEARCH_UNAVAILABLE`。该用例不能作为联网资料质量验收。
4. 双面板离线用例：真实模型完成表格与待办；自动进入研究页，输入框没有被新面板引用标签污染。
5. 最终双面板全组定位：658px 宽画布内，两面板的屏幕横向边界分别为 112–402.54px、415.46–706px，顶边一致，均完整位于画布内。修复并回归自动定位重渲染循环、空白会话未初始化尺寸以及只定位单面板的问题。

## 尚需桌面验证

本轮为真实前后端与模型的隔离浏览器验证，不等同于安装包验证。桌面原生联网搜索、麦克风语音与共享客户端启动未在本轮重新验证；本次不修改这些原生能力。模型的面板拆分与内容精简仍受所选模型能力影响。
