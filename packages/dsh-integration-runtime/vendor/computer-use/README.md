# EWork Computer Use

`@ework/dsh-computer-use` is an independent Cordis bundle. It registers `computer_use_plus` and exports a pure ESM SDK at `@ework/dsh-computer-use/sdk`. It does not replace the host's `computer_use` tool. No native service starts when the package loads or when `status` is requested.

Actions bind to a session, PID, window and observation revision. Element recovery requires one semantic match; ambiguous or sensitive targets fail closed. Role/name/identifier matching is a conservative heuristic, not a durable native AX identity or an ancestry guarantee. Input reports AX readback as `match`, `mismatch` or `unverifiable`; a match does not establish business success. Waits match text exposed in structured element names/values; they do not perform OCR and cannot match every visible static label. Cancellation or an unknown delivery reports uncertainty and does not replay input.

The default provider uses the public MIT Cua Driver SDK **0.28.2** and the bundled, hash-verified macOS universal daemon from the same release. Accessibility and Screen Recording use normal macOS permissions. The package does not bypass permissions, control the lock screen, execute shell/scripts, or claim physical-input/AXObserver monitoring. There is no global user-interruption monitor. Cua does not supply a producer frame timestamp on this path; the result reports it as unknown/requested-after-action instead of claiming an atomic frame. This plugin does not establish that the formal host's existing capture-stream issue is fixed. Current native distribution supports macOS only.

## Build and package

Use Node 22 and the repository's declared development tools. From the repository root:

```sh
node scripts/prepare-computer-use-native.mjs
node --test scripts/computer-use-distribution.test.mjs
node scripts/computer-use-build-pack.mjs --output /absolute/path/to/new-artifact-directory
```

The runner builds only this package, runs real `npm pack --ignore-scripts`, verifies public exports and declaration files, checks the daemon receipt, rejects undeclared/private imports, and compares packed bytes with built files. It writes the `.tgz`, SHA-256, npm receipt and `distribution.json`. Production imports use public packages; development caches and worktrees are not part of the package contract. SDK/runtime peers list only exact tested versions in `package.json`; Cua's normal dependency closure is resolved by the package manager.

## Install later into a chosen profile

Stop the chosen profile before changing its installed packages. This command uses the official DSH CLI belonging to the intended host; choose an existing compatible profile deliberately:

```sh
DSH_HOME=/absolute/path/to/target-dsh-home node /absolute/path/to/official-install/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile target-profile add /absolute/path/to/ework-dsh-computer-use-0.1.0.tgz --ignore-scripts --config.auto-install-peers=false
```

The peer flag preserves the host-provided SDK instances instead of adding another SDK cohort to this profile; the host must already provide a supported exact version. Start or restart only after the previous desktop task has ended: public APIs cannot discover a legacy call that began before this plugin's guard was registered. The mutex covers public tool-pipeline calls after registration and does not detect external automation. Restart that profile and check its tools. Removing this bundle uses the same host, `DSH_HOME` and profile:

```sh
DSH_HOME=/absolute/path/to/target-dsh-home node /absolute/path/to/official-install/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile target-profile remove @ework/dsh-computer-use
```

These examples are instructions for a later explicit integration. The distribution verification does not install into an existing user profile or rebuild the shared EWork application.

## Repeat the isolated installation proof

```sh
node scripts/computer-use-profile-check.mjs \
  --host /absolute/path/to/untouched-official-alpha2-install \
  --tar /absolute/path/to/ework-dsh-computer-use-0.1.0.tgz \
  --root /absolute/path/to/new-proof-directory
```

The proof requires a fresh directory, keeps `HOME` unchanged, sets a new `DSH_HOME`, strips inherited model credentials, uses a separate package cache, and disables installation scripts. It installs an independent synthetic third-party fixture and the actual tar through `dsh plugin add`, compares installed bytes, and loads its public ESM exports and Cua dependency. It exercises public Cordis/ToolRuntime lifecycle with an injected backend that refuses startup, then mounts the two installed bundle patches through the official public Loader in a separate empty tree. The default `apply()` is tested with `status` only, including Loader off/on and owned guard withdrawal. Finally it calls `dsh plugin remove`. The stock bundles and third-party fixture remain. Logs and receipts stay in the proof directory. These checks are not native desktop acceptance.

Default proof cohort is official DSH `0.2.1-alpha.2`, matching the pinned public SDK. Another version requires `--expected-host <exact-version>` and a separate result. The existing alpha.1 installation, an alpha.4 candidate, and the formal EWork 1.3.4 client on the legacy rc.7 host are distinct cohorts. An alpha.2 package/registry pass does not establish compatibility with those hosts. No formal-client integration is claimed until its actual public loader and registry pass independently.

## Owned native fixture

On macOS with normal permissions granted to the test process:

```sh
node --import tsx scripts/computer-use-native-fixture.mjs /absolute/path/to/new-native-fixture-output
```

This compiles an independent AppKit test window, targets only that invocation's PID/window, and closes its window and provider afterwards. The 2026-10-21 run observed 75 structured elements plus a screenshot, confirmed typed text by AX readback, and observed the completion button after clicking; the fixture's independent stdout also confirmed its input/click handler. The click transport reported `unknown`, which remains `unknown` in the action result despite the later fixture confirmation. Static text omitted from the structured Cua result cannot satisfy a text wait merely because it appears in the screenshot.

The native fixture, alpha.2 installed-bundle/Loader proof and rc.7 public-registry compatibility are separate evidence layers. They do not establish formal-client UI integration or general desktop task reliability.

## Public SDK

`./sdk` exports `ComputerEngine`, `ComputerError`, and TypeScript contracts including `Backend`, `Snapshot`, `Request` and `Result`. Supply a provider through the public `Backend` contract:

```ts
import { ComputerEngine } from '@ework/dsh-computer-use/sdk';
import type { Backend } from '@ework/dsh-computer-use/sdk';

declare const ownedBackend: Backend;
const engine = new ComputerEngine({ backend: async () => ownedBackend });
const signal = new AbortController().signal;
const status = await engine.run('owned-session', { op: 'status' }, signal);
await engine.close();
```

Native tests must use an owned test window. A successful package installation, state readback or synthetic registry test is not a claim about general desktop task success.
