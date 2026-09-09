# Task 2 implementation report

Base: `81dd03469fe277a08a1172b43f6b2ab76bd9e34b`, branch `codex/feat/research-board-collaboration-20260909`. Task 1 was explicitly accepted before production implementation. No child implementers, source push, deployment, version change, shared app build/launch or full suite.

## Implemented

- Atomic private local store for login-free favorites (dedupe/rename/order), account-specific board bindings and source associations, pin/unpin independent from membership, frozen create manifests, pending commands, auxiliary invitation/read requests, notification cursors, durable mutation dedupe and own-change recovery. Original source sessions remain protected even when removed from favorites; successful create exposes local-only `sourceFavoriteId` for managing existing copies.
- Fixed-origin main-only authenticated collaboration transport. Typed endpoint construction rejects arbitrary destinations/path escapes/redirects. Tickets resolve only to the prescribed same-origin socket path; loopback is constructor-injected test configuration only. Main owns account credentials. Generation changes abort old HTTP/socket work, erase rendered identity immediately and reject same-account old-session replies. Failed logout preserves the existing account behavior and resumes only after a fresh generation/revalidation.
- Trusted main-frame IPC registration and frozen preload face, including synchronous historical `isSharedSession(sessionId)`. Shared legacy sync writes are rejected centrally; denied content reads return typed empty JSON, preventing the page's existing null-to-localStorage fallback. Main invalidates preview capabilities and frozen context handles on access loss/logout. Task 3 must disable/purge shared localStorage mirrors and bypass legacy workspace persistence as documented.
- Exact-base Yjs fork edits with distinct merged `canvasRevision` and local-only `localBranchRevision`. Queued typing diffs against the branch actually edited; no stale text indices are applied to a newer live document. Both field merges and text merges preserve another participant's edits. Main tracks only local Yjs origin in UndoManager; legacy page undo is never the shared authority.
- Every canvas/message/control command is persisted before send. Acknowledged checkpoint and outbox removal commit atomically. Lost acknowledgements query content-free own receipts before retry. Old epochs/role loss never automatically replay. A permanent rejection rebuilds from authoritative CRDT state instead of merging rejected optimistic structs back into the view.
- Revocation immediately closes access, clears rendered/shared cached content and strips pending CRDT causality from durable storage before receipt awaits. Recovery stores only authored fields/inserted text/deletion descriptions; nested arrays recurse so changing one table cell or chart point does not preserve the untouched peer array. Unknown receipts remain explicitly unknown, accepted receipts remove recovery claims. Discussion submission dedupe survives acknowledgement/restart.
- Current-board presence and separate notification subscription, welcome gate, ping/reconnect, cursor catch-up and notification/version dedupe. Pending invitations are retained outside ordinary notification retention. Read and invitation actions have a durable idempotent auxiliary queue. Role/epoch changes abort board-specific resource hooks; late hook completion cannot publish to a revoked board.
- Explicit Task 4 hooks for complete original capture, reviewed capture handle, staged streaming assets, async local/cloud projection, authorized materialization, two-phase personal copy and one shared request/task orchestrator. Production missing capture/resource/execution hooks return concrete errors; no placeholder success or page-history substitution. Complete capture and missing-asset tests exercise the real service create boundary.

Actual UI contract and hook signatures are in adjacent `CLIENT-CONTRACT.md`; shared types are in `src/shared/research-boards.ts`. Task 3 uses the structured page bridge, never page runtime objects through contextBridge.

## RED evidence

1. Initial `vitest run test/research-boards-store.test.ts test/collaboration-client.test.ts test/research-boards-service.test.ts`: three suites failed because the new modules did not exist (2026-09-09 12:18:15 tool clock).
2. Account test: `service.subscribeSessionChanged is not a function`; 1 failed / 6 existing passed before account implementation (12:23:11).
3. Queued local typing race initially left server text `Xabcd` instead of `Xabcde`; fixed flush draining operations appended during an active batch.
4. Atomic ACK test expected one pending operation while checkpoint GET was held, received zero; fixed checkpoint/outbox atomic acknowledgement path (12:37:53).
5. Repeated acknowledged discussion send received a new operation UUID; fixed durable clientMutationId mapping (12:40:43).
6. Server-rejected optimistic update remained `abc rejected` instead of authoritative `abc`; fixed CRDT replacement on permanent rejection (12:46:57).
7. Board resource hook signal was not aborted on revocation; fixed per-board AbortController composition and late-completion checks (12:54:26).

The directly affected existing IPC trust suite initially had two stale assertions for `main Sherlock window` while baseline production already said `main EWork Odyssey window`. Only those expected brand strings were updated; trust behavior was not weakened.

## Final focused validation

Commands:

```sh
node_modules/.bin/vitest run test/research-boards-store.test.ts test/collaboration-client.test.ts test/research-boards-service.test.ts test/account-service.test.ts test/ipc-trust.test.ts test/research-context-bridge.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.node.json
git diff --check
```

Latest result: six test files, **46 tests passed**; typecheck and diff whitespace check passed. These cover actual store restarts, service/registered IPC boundaries, actual Yjs merges/undo, account response invalidation, socket welcome/presence behavior, lost ACK receipts, delayed checkpoint acknowledgement, partial capture rejection, nested recovery privacy and in-flight resource revocation. Tests use synthetic transport/server fixtures; they are not a claim of deployed Cloudflare or packaged-client verification. Task 5 owns the real local worker/renderer integration proof.

Used an already-cached Prettier executable with single quotes, no semicolons and no trailing commas for owned modules/tests; no package/dependency changes.

## Explicit boundaries for subsequent tasks/review

- Task 3 still owns actual page adapter, sidebar/header/discussion/composer UI, mirror removal, shared collection limits and UI proof. The main/preload APIs are implemented and wired; no shared client was launched from this worktree.
- Task 4 owns production complete durable transcript capture, frozen asset cache, source-ID translation, preview/copy handles, account-scoped model/task leases and explicit request result types. Missing hooks are deliberate concrete errors until that task wires them.
- Undo history and deletion node payloads live only in the authorized main-process runtime. Deletion undo returns `DELETION_RECOVERY_REQUIRED`; explicit recovery restores fresh IDs/remaps copied-node relations. After restart only the durable own deletion description remains, so an old runtime's node-payload recovery returns `RECOVERY_UNAVAILABLE` rather than pretending to resurrect a tombstoned ID. Pending authored changes and ordinary recovery journals are durable across restart.
- Revision retention is bounded (128 issued states, 256 in-memory mutation replies). Unknown old bases return STALE_CANVAS_REVISION; persisted duplicate mutations whose prior reply was evicted return MUTATION_ALREADY_APPLIED. The page must preserve its draft rather than retry against an unrelated merged revision.
- No deployment, shared-client installation, production account access or user acceptance is claimed. This commit is ready for the controller's Task 2 review.
