# OpenTerminal 全看板样式暂存

用户于 2026-10-19 明确选择：“先暂存样式，只发布当前已验收版本”。本次 1.3.4 发布仅包含已验收的主题卡片自动收起、组件来源和自动更新设置，不包含 OpenTerminal 样式。

- 保留功能分支 `codex/feat/openterminal-style-20261019`，提交 `bdc7ab3482733c30056d4c33de6945624d28c42d`。
- 保留功能工作目录 `.worktrees/openterminal-style-20261019`。
- 保留集成分支 `codex/integration/20261019-03` 及工作目录 `.worktrees/integration-20261019-03`，提交 `72a04004ccc96d356a614f075808e5bdfa7d0194`。
- 按用户取舍归档该集成批次的活动租约；不删除分支、提交、工作目录或验收证据，不将其代码合并或打入本次发布。
- 在 `config/sherlock-parked-experiments.json` 登记精确功能 tip。后续只有用户明确要求恢复该样式时，才解除暂存，从当时的本地 main 重新交接、集成和验收；不复用已取消批次。
