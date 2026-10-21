# 笔记挑战 v16 实施计划
Spec: docs/superpowers/specs/2026-10-21-notes-challenge-v16.md
基线 e66e538b，功能worktree notes-challenge-v16-20261021。只在功能分支写源码并提交，构建仅集成checkout。每次提交中文，聚焦验证。

## Task 1: 评论交互与 Figma v16 视觉修正
阅读 spec 的评论交互全部要求。修改 src/preload/notes/challenge-controller.ts、challenge-ui.tsx、challenge.css、src/shared/notes-challenge.ts 及必要的 runtime requestedReplacement/类型。按真实正文顺序排序；优化变为持久化建议+替换按钮；显式直接编辑意图允许执行，不以模型内容作为授权。保留 exact-anchor、stale、取消、草稿、撤销/日期语义。修复滚动卸载、作者名/精确双剑资源、Enter/IME、宿主CSS影响关闭/发送几何。使用现有真实挂载浏览器夹具验证，无app构建或操作。只跑受影响 tests；记录已知基线失败。提交并自审，报告实现、测试、图像/几何证据、限制到任务报告。

## Task 2: 审查全篇明显错误的覆盖
阅读 spec 的明显错误漏检要求。诊断 packages/dsh-research-task-runtime/notes-challenge-runtime.js 的提示/过滤/批次与 scheduler 覆盖语义。修正过度严格的常识门槛和只列少数首段结果的问题，保持资源预算、精确引用与来源诚实。让各段都有检查机会，按等级控制问题类型与频率而非只读开头。构建六段通用回归夹具、正常/假设/未完成语句对照；真实结果契约与覆盖测试，不能硬编码用户文章错误清单或仅测试提示字符串。需要模型探针时由主agent执行，子agent不得读取凭据或调用用户客户端。只跑相关聚焦测试。中文提交、自审、报告。

## Task 3: AI挑战执行时双剑交叉晃动
实现spec新增执行动效。先读 .superpowers/sdd/2026-10-21-notes-challenge-v16/task-3-motion-prebrief.md 的完整要求。基于现有16x16静态双剑精确SVG路径分组，新增实际忙碌态资源/动画，两把剑独立轻微相向摆动；静态形状/色/尺寸不变。只实际scheduler running及真实thread action在执行时动，等待不动，结束/错误/中止/关闭/离开笔记复静态；controller暴露真实状态，toolbar据此切图与aria-busy说明。尊重reduced-motion，无toast/额外请求/持久状态变化。真实mountNotes生命周期及动画/几何验证，保留原icon静态，Node无变化；聚焦验证，中文本地提交/自审/任务报告，不构建/操作共享app/不派生agents。

## Task 4: 集成与客户端验收
主agent完成独立任务审查、全分支审查、必要修复与相关聚焦验证，再生成新功能交接卡，append到未验收20261019-05批次并按手册预检、合并。集成checkout ./script/build_and_run.sh --verify，无公证/发布/版本变化。核验真实客户端当前文章标记、评论预览/替换/直接编辑/样式/排序/滚动/Enter，不覆盖用户正在编辑的笔记。保留证据，应用保持打开。
