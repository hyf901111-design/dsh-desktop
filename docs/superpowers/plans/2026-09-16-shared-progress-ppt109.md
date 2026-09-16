# Shared discussion progress and PPT 1.0.9 Implementation Plan

> Execute the three bounded tasks below, using systematic-debugging and focused regression tests. Independent PPT and service fixes are delegated under dispatching-parallel-agents.

**Goal:** Show real shared-main-task activity and immediate replies, visually distinguish component activity, and ship PPT skill 1.0.9 in a locally testable client.
**Architecture:** Keep existing native main/subagent execution and queue boundaries; expose already-sanitized task progress through the local board view, deliver messages independently of canvas asset materialization, and render component activity separately from conversation turns.
**Spec:** User request and two screenshots in this task.
**Constraints:** App remains 0.9.9. Local testing only. No full test suite, release, cloud deployment, source push, or user-data reset.

## Service delivery
- [ ] Reproduce pre-result refresh reuse with a deferred board.get; require a post-result fresh snapshot.
- [ ] Verify messages/tasks are emitted while old canvas resources remain materializing, with matching canvas/revision and permission checks.
- [ ] Expose local sanitized progress on tasks and test revocation isolation.
- [ ] Focused service/runtime checks and Chinese commit.

## Discussion presentation
- [ ] Render running-task tool activity, bounded progress summary and elapsed/last-update time using task.progress; no raw reasoning/tool arguments.
- [ ] Component request/result groups use a neutral activity card labelled 组件子智能体 and 独立执行, distinct from user chat bubbles and queue entries.
- [ ] React regression: update progress with unchanged server seq; publish final reply while mounted; preserve task controls and group identity.
- [ ] Avoid redundant canvas hydration for identical projected canvas. Validate only if regression demonstrates it.
- [ ] Focused UI tests and Chinese commit.

## PPT skill
- [ ] Fix cover subtitle bold and first contents-row top rule in actual templates/authoring/validation contracts.
- [ ] Specify left-text/right-chart as the normal evidence-page choice with meaningful exceptions, update 1.0.9 metadata.
- [ ] Focused regression and rendered sample of all three changes; Chinese commit.

## Integration and local acceptance
- [ ] Generate bound handoff card, preflight new integration batch, merge, accept and promote per project runbook.
- [ ] Build canonical main using ./script/build_and_run.sh --verify and verify:package:mac; verify bundled skill parity.
- [ ] Inspect real client right panel with an authorized test task, retain existing data and keep app open.
