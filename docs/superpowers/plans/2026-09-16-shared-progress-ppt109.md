# Shared discussion progress and PPT 1.0.9 Implementation Plan

> Execute the three bounded tasks below, using systematic-debugging and focused regression tests. Independent PPT and service fixes are delegated under dispatching-parallel-agents.

**Goal:** Show real shared-main-task activity and immediate replies, visually distinguish component activity, and ship PPT skill 1.0.9 in a locally testable client.
**Architecture:** Keep existing native main/subagent execution and queue boundaries; expose already-sanitized task progress through the local board view, deliver messages independently of canvas asset materialization, and render component activity separately from conversation turns.
**Spec:** User request and two screenshots in this task.
**Constraints:** App remains 0.9.9. Local testing only. No full test suite, release, cloud deployment, source push, or user-data reset.

## Service delivery
- [x] Reproduce pre-result refresh reuse with a deferred board.get; require a post-result fresh snapshot.
- [x] Verify messages/tasks are emitted while old canvas resources remain materializing, with matching canvas/revision and permission checks.
- [x] Expose local sanitized progress on tasks and test revocation isolation.
- [x] Focused service/runtime checks and Chinese commit.

## Discussion presentation
- [x] Render running-task tool activity, bounded progress summary and elapsed/last-update time using task.progress; no raw reasoning/tool arguments.
- [x] Component request/result groups use a neutral activity card labelled 组件子智能体 and 独立执行, distinct from user chat bubbles and queue entries.
- [x] React regression: update progress with unchanged server seq; publish final reply while mounted; preserve task controls and group identity.
- [x] Reviewed canvas hydration; no proven redundant-hydration regression, so no hydration behavior change.
- [x] Focused UI tests and Chinese commit.

## PPT skill
- [x] Fix cover subtitle bold and first contents-row top rule in actual templates/authoring/validation contracts.
- [x] Specify left-text/right-chart as the normal evidence-page choice with meaningful exceptions, update 1.0.9 metadata.
- [x] Focused regression and rendered sample of all three changes; Chinese commit.

## Integration and local acceptance
- [x] Generate bound handoff card, preflight new integration batch, merge, accept and promote per project runbook.
- [x] Build canonical main using ./script/build_and_run.sh --verify and verify:package:mac; verify bundled skill parity.
- [x] Inspect real client right panel with an authorized test task, retain existing data and keep app open.

## Local acceptance 2026-09-16

- Built source: 7b107241d7b6efc34dd96a51c0b14934fb26c73a; batch 20260916-06. App 0.9.9, PPT skill v1.0.9.
- 86 focused checks in 9 files and typecheck passed. Three rendered PPT sample slides visually inspected.
- Canonical main build_and_run.sh --verify and verify:package:mac passed; notarization skipped; signature and skill source parity verified.
- Same packaged build, isolated native test owner, existing shared test board: P109 Bash sleep 15 showed elapsed time, command activity and completion. Final P109 response appeared without switching sessions.
- Component activity cards visually verified in dark isolated client and light real client.
- Isolated app and service stopped. Real user main client remains open on existing collaboration board with retained data.
- Limits: no model inference latency guarantee; detailed progress remains local to executor. Queue focused regressions passed; no repeat of full two-client queue acceptance this turn.
- No publish, push or online service deployment. Evidence logs: /tmp/shared-progress-ppt109/.
