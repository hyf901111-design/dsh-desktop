# 笔记挑战正确正文误报修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 减少标题干扰和模型明确承认原句相符后仍追问的误报，保留正文事实错误与内部矛盾检查。

**Architecture:** 审查提示明确title只提供主题、实体、文体背景，正文targets/context仍是可定位审查范围。既有低打扰过滤仅补足明确以原句为主语的相符/一致陈述，保持否定、疑问和实质转折保护。提示效果由真实模型对照验证，不用提示文案断言代替效果测试。

**Tech Stack:** ESM runtime、Vitest、受控集成客户端与真实模型。

**Spec:** docs/superpowers/specs/2026-10-21-notes-challenge-v16.md；真实误报证据 /tmp/notes-title-interference-native-evidence-20261022.json。基线79fd7535447a7f95185ca829eaeedd9f8c767baa。

## Global Constraints

- 宽松到抬杠共享明显事实错误检查底线；不以降低错误召回换取零误报。
- title保留以理解文体；仅在targets/context中可定位的正文可作问题引用/依据，不增加标题评论UI。
- 只过滤模型明确自承无冲突的常识候选，不用领域关键词或宿主事实判断抹去评论；真正的正文转折矛盾须保留。
- 不改原文、日期、历史、已接受改动、两条草稿；不删除旧标记美化结果。
- 既有模型路由、预算、一次结构恢复、精确引用、来源边界保持；不全套测试、不发布、不推送、不accept/promote。

## Review Focus

- 原句“大体相符/基本一致”但仅追问精确年代的候选不应打扰。
- 否定/疑问形式的相符与带真正错误的转折不能被过滤。
- 标题错误且正文正确时不得将标题错误嫁接到正文；同标题下正文真实错误仍须发现。
- 标题辅助表明虚构体裁时仍结合上下文，不把普通事实文章的局部拟人当整篇豁免。
- 真实结果如仍有漏检或误报需如实记录；格式200不等于逐项事实覆盖。

### Task 1: 明确审查范围并补足自承相符过滤

**Files:** Modify packages/dsh-research-task-runtime/notes-challenge-runtime.js; Test test/notes-challenge-recall.test.js.

**Interfaces:** generateNoteChallenge(ctx, input) 输入输出协议不变；acknowledgesNoConflict(message)继续只处理常识候选。

- [ ] 先写RED：捕获的“该句大体相符”与“该表述基本一致”候选应消失，同时其它段真实问题保留且覆盖不变。否定、疑问、实质转折正对照须保留。
- [ ] 运行recall聚焦测试，确认因旧过滤缺失出现预期FAIL。标题问题已有原生6轮中4轮误报作效果基线，不加提示原文grep测试。
- [ ] 最小实现主语明确的相符/一致识别；提示明确title背景与正文审查/证据边界，保留体裁信息与真实正文矛盾检查。
- [ ] runtime/recall/consensus聚焦检查、typecheck、diffcheck；task-done验证并中文本地提交，独立整项复审。
- [ ] 刷新交接，干净integration受控构建、包/模块一致性检查、真实UI验收。
- [ ] 原文6轮只读复检；正确正文/误导标题对照、虚构体裁对照、正文内部矛盾对照、四档明显错误对照。核对正文/历史/草稿并恢复原文前台。

**Completion:** 来源修复先红后绿，真实文章单列误报/遗漏，不把有限样本通过当全场景保证。
