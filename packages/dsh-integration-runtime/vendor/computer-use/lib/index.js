var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/computer-use/src/protocol.ts
var ComputerError;
var init_protocol = __esm({
  "packages/computer-use/src/protocol.ts"() {
    "use strict";
    ComputerError = class extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "ComputerError";
      }
    };
  }
});

// packages/computer-use/src/cua-backend.ts
var cua_backend_exports = {};
__export(cua_backend_exports, {
  createCuaBackend: () => createCuaBackend
});
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
function targetValid(t) {
  if (!integer(t.pid) || t.pid > 4294967295 || !integer(t.windowId)) throw new ComputerError("INVALID_REQUEST", "An exact safe PID and window identifier are required.");
}
function safeId(n) {
  if (typeof n === "bigint") return n > 0n && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : void 0;
  return integer(n) ? n : void 0;
}
function nativeError(e, write = false) {
  if (e instanceof ComputerError) return e;
  const failure = (code2, message) => {
    const error2 = new ComputerError(code2, message);
    Object.defineProperty(error2, "cause", { value: e, configurable: true });
    return error2;
  };
  const o = e && typeof e === "object" ? e : {};
  const inner = o.inner && typeof o.inner === "object" ? o.inner : {};
  const code = [o.errorCode, o.code, inner.code, inner.reason, inner.message, o.message].filter((x) => typeof x === "string").join(" ").toLowerCase();
  if (/permission|accessibility.*denied|screen.?recording|tcc|not.?authorized/.test(code)) return failure("UNAVAILABLE", "Cua Driver requires the host Accessibility and Screen Recording grants.");
  if (/stale|snapshot|window_owner_pid_mismatch|window_id_not_found|invalid_element|element.*not.found/.test(code)) return failure("REQUERY_REQUIRED", "The native target or element changed. Observe the exact window again.");
  if (/unsupported|not.support|background_unavailable|background.*unavailable|ambiguous.*target|same_pid_keyboard_ambiguity/.test(code)) return failure("UNSUPPORTED", "Cua Driver cannot safely deliver this exact background action.");
  if (/secure|password|sensitive/.test(code)) return failure("SENSITIVE_TARGET", "Sensitive native input is not supported.");
  if (/invalid.argument|invalid_request/.test(code)) return failure("INVALID_REQUEST", "Cua Driver refused invalid action arguments.");
  return failure(write ? "RESULT_UNKNOWN" : "UNAVAILABLE", write ? "Native action result is unknown; it must not be replayed." : "Cua Driver is unavailable in this host.");
}
function imageSize(image) {
  if (!image.dataBase64 || image.dataBase64.length > 32 * 1024 * 1024 || !/^[-+/A-Za-z0-9]*={0,2}$/.test(image.dataBase64)) return;
  const b = Buffer.from(image.dataBase64, "base64");
  if (image.mimeType === "image/png" && b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString("ascii", 12, 16) === "IHDR") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (image.mimeType === "image/jpeg" && b[0] === 255 && b[1] === 216) {
    for (let p = 2; p + 4 <= b.length; ) {
      if (b[p++] !== 255) return;
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 217 || marker === 218) return;
      if (marker === 0 || marker === 1 || marker === 216 || marker !== void 0 && marker >= 208 && marker <= 215) continue;
      const len = b.readUInt16BE(p);
      if (len < 2 || p + len > b.length) return;
      if (marker !== void 0 && [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && len >= 7) return { height: b.readUInt16BE(p + 3), width: b.readUInt16BE(p + 5) };
      p += len;
    }
  }
}
function inventory(json) {
  const parsed = JSON.parse(json);
  const list = Array.isArray(parsed) ? parsed : parsed?.tools;
  if (!Array.isArray(list)) throw new ComputerError("UNAVAILABLE", "Cua Driver returned no tool metadata.");
  for (const [name, properties] of Object.entries({ click: ["target", "snapshot_id", "element_token", "delivery_mode"], type_text: ["target", "snapshot_id", "element_token", "delivery_mode", "text"], press_key: ["target", "snapshot_id", "element_token", "delivery_mode", "key"], scroll: ["target", "snapshot_id", "element_token", "delivery_mode", "direction"], drag: ["target", "delivery_mode", "from_x", "from_y", "to_x", "to_y"] })) {
    const tool = list.find((t) => t && typeof t === "object" && t.name === name);
    const schema = tool?.input_schema ?? tool?.inputSchema;
    if (!schema?.properties || properties.some((p) => !(p in schema.properties))) throw new ComputerError("UNAVAILABLE", `Cua Driver ${name} contract is incompatible.`);
  }
}
function actionDelivery(result) {
  if (result.isError) throw nativeError({ errorCode: result.errorCode, message: result.text }, true);
  const a = result.action;
  if (!a) return { outcome: "unknown", details: "Provider returned no structured action delivery evidence." };
  if (a.effect === 4) throw new ComputerError(a.escalation?.reason === 4 ? "UNAVAILABLE" : "UNSUPPORTED", "Cua Driver refused the action; no alternate delivery was attempted.");
  const effect = ["confirmed", "partial", "unverifiable", "suspected_noop", "refused"][a.effect] ?? "unknown";
  const route = ["accessibility", "synthetic_events", "global_input", "system_api", "dom", "trusted_input"][a.route] ?? "unknown";
  const mode = ["background", "foreground", "not_applicable", "unknown"][a.delivery?.mode ?? 3] ?? "unknown";
  const delivered = (a.effect === 0 || (a.delivery?.deliveredCount ?? 0) > 0) && a.effect !== 1 && a.effect !== 3 && a.route !== 2 && mode !== "foreground" && mode !== "unknown";
  return { outcome: delivered ? "delivered" : "unknown", details: `effect=${effect}; route=${route}; delivery=${mode}` };
}
async function createCuaBackend(options = {}) {
  const binaryPath = options.binaryPath ?? fileURLToPath(new URL("../native/darwin-universal/cua-driver", import.meta.url));
  const session = `ework-${randomUUID2()}`;
  let host, driver, initializing;
  let ready = false;
  let closed = false, cleanup, activeAbort;
  let tail = Promise.resolve();
  const pending = /* @__PURE__ */ new Set();
  const snapshots = /* @__PURE__ */ new Map();
  async function stopOwned() {
    closed = true;
    snapshots.clear();
    activeAbort?.abort();
    if (cleanup) return cleanup;
    cleanup = (async () => {
      const first = host;
      try {
        await first?.stop();
      } catch {
      }
      try {
        await initializing;
      } catch {
      }
      if (host && host !== first) try {
        await host.stop();
      } catch {
      }
      await Promise.allSettled([...pending]);
      try {
        await driver?.shutdown();
      } catch {
      }
      try {
        driver?.uniffiDestroy?.();
      } catch {
      }
      try {
        host?.uniffiDestroy?.();
      } catch {
      }
    })();
    return cleanup;
  }
  async function init(signal) {
    if (initializing) return initializing;
    initializing = (async () => {
      if (process.platform !== "darwin") throw new ComputerError("UNSUPPORTED", "This package includes only the pinned macOS native provider.");
      if (!isAbsolute(binaryPath)) throw new ComputerError("INVALID_REQUEST", "The native binary path must be absolute.");
      const sdk = await import("@trycua/cua-driver");
      if (closed || signal.aborted) throw new ComputerError("CANCELLED", "Native startup was cancelled.");
      const grants = sdk.currentMacOsPermissionStatus();
      if (!grants.accessibility || !grants.screenRecording) throw new ComputerError("UNAVAILABLE", "Grant Accessibility and Screen Recording to the actual host application before using Computer Use.");
      await access(binaryPath, constants.X_OK);
      if (!options.binaryPath) {
        const manifest = JSON.parse(await readFile(new URL("../native/manifest.json", import.meta.url), "utf8"));
        const digest = createHash("sha256").update(await readFile(binaryPath)).digest("hex");
        if (manifest.version !== VERSION || manifest.archiveSha256 !== ARCHIVE_SHA256 || manifest.executableSha256 !== digest || manifest.platform !== "darwin" || manifest.arch !== "universal") throw new ComputerError("UNAVAILABLE", "The packaged Cua Driver integrity receipt is invalid.");
      }
      if (closed || signal.aborted) throw new ComputerError("CANCELLED", "Native startup was cancelled.");
      host = sdk.EmbeddedCuaDriverHost.withOptions({ binaryPath, hostBundleId: options.hostBundleId ?? "org.ework.computer-use-plugin", permissionMode: sdk.EmbeddedPermissionMode.Standard, approveCapabilityManifest: false, approveSessionPolicy: false, dangerouslyBypassApprovals: false, startupTimeoutMs: 15000n, shutdownTimeoutMs: 5000n, environment: [{ name: "CUA_DRIVER_RS_TELEMETRY_ENABLED", value: "false" }, { name: "CUA_TELEMETRY_ENABLED", value: "false" }], inheritStderr: false, noOverlay: true });
      const connection = await host.start({ signal });
      if (closed || signal.aborted) throw new ComputerError("CANCELLED", "Native startup was cancelled.");
      driver = sdk.CuaDriver.connect(connection.socketPath);
      const metadata = await driver.metadata({ signal });
      if (connection.driverVersion !== VERSION || metadata.driverVersion !== VERSION || metadata.contractVersion !== "0.8.0") throw new ComputerError("UNAVAILABLE", "The native driver version does not match the pinned SDK contract.");
      inventory(await driver.listToolsJson({ signal }));
      if (typeof host.waitForExit === "function") void host.waitForExit(connection.generation).then(() => {
        if (!closed) void stopOwned();
      }, () => {
        if (!closed) void stopOwned();
      });
      ready = true;
      return driver;
    })();
    return initializing;
  }
  async function run(signal, write, work) {
    if (signal.aborted) throw new ComputerError("CANCELLED", "Native request was cancelled before admission.");
    if (closed) throw new ComputerError("CLOSED", "The native backend is closed.");
    const previous = tail;
    let release;
    tail = new Promise((r) => release = r);
    await previous;
    let dispatched = false;
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
      void stopOwned();
    };
    let task;
    try {
      if (signal.aborted) throw new ComputerError("CANCELLED", "Native request was cancelled before admission.");
      if (closed) throw new ComputerError("CLOSED", "The native backend is closed.");
      activeAbort = controller;
      signal.addEventListener("abort", abort, { once: true });
      task = (async () => {
        const d = await init(controller.signal);
        if (controller.signal.aborted || closed) throw new ComputerError("CANCELLED", "Native request was cancelled.");
        return work(d, controller.signal, () => {
          dispatched = true;
        });
      })();
      pending.add(task);
      let value;
      try {
        value = await task;
      } catch (e) {
        if (signal.aborted || controller.signal.aborted) throw new ComputerError(write && dispatched ? "RESULT_UNKNOWN" : "CANCELLED", write && dispatched ? "Cancelled after native dispatch; the result is unknown and must not be replayed." : "Native request was cancelled.");
        if (!ready) {
          if (host) await stopOwned();
          else initializing = void 0;
        }
        throw nativeError(e, write && dispatched);
      }
      if (controller.signal.aborted || signal.aborted) throw new ComputerError(write && dispatched ? "RESULT_UNKNOWN" : "CANCELLED", write && dispatched ? "Cancelled after native dispatch; do not replay the action." : "Native request was cancelled.");
      return value;
    } finally {
      if (task) pending.delete(task);
      signal.removeEventListener("abort", abort);
      if (controller.signal.aborted) await stopOwned();
      if (activeAbort === controller) activeAbort = void 0;
      release();
    }
  }
  return {
    id: `cua-driver-${VERSION}`,
    apps: (signal) => run(signal, false, async (d, s) => {
      const r = await d.listApps({}, { signal: s });
      return r.apps.filter((a) => a.running && integer(a.pid) && typeof a.name === "string").map((a) => ({ pid: a.pid, name: a.name, ...typeof a.bundleId === "string" ? { bundleId: a.bundleId } : {} }));
    }),
    windows: (pid, signal) => {
      if (!integer(pid) || pid > 4294967295) return Promise.reject(new ComputerError("INVALID_REQUEST", "A safe PID is required."));
      return run(signal, false, async (d, s) => {
        const r = await d.listWindows({ pid, onScreenOnly: false }, { signal: s });
        return r.windows.flatMap((w) => {
          const id = safeId(w.windowId);
          return w.pid === pid && id && typeof w.title === "string" ? [{ pid, windowId: id, title: w.title }] : [];
        });
      });
    },
    observe: (target, signal) => {
      targetValid(target);
      return run(signal, false, async (d, s) => {
        const key = keyOf(target);
        snapshots.delete(key);
        const requestedAt = Date.now();
        const r = await d.getWindowState({ pid: target.pid, windowId: BigInt(target.windowId), session, includeAccessibilityTree: true, includeScreenshot: true, maxElements: 2e3, maxDepth: 25 }, { signal: s });
        const receivedAt = Date.now();
        if (r.pid !== target.pid || r.windowId !== BigInt(target.windowId) || typeof r.snapshotId !== "string" || !r.snapshotId) throw new ComputerError("REQUERY_REQUIRED", "Native snapshot does not prove the requested exact target.");
        const diagnostics = ["Producer image timestamp is unavailable; screenshot and AX state are not claimed atomic.", "AX identifier, secure subrole and focused-element metadata are not exposed by this SDK."];
        if (r.degradedReason) diagnostics.push(`Native degraded state: ${r.degradedReason}`);
        if (r.truncated) diagnostics.push("Native AX observation is truncated.");
        const indexed = /* @__PURE__ */ new Map();
        const elements = [];
        for (const e of r.elements ?? []) {
          const index = typeof e.elementIndex === "bigint" && e.elementIndex >= 0n && e.elementIndex <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(e.elementIndex) : void 0;
          if (index === void 0 || typeof e.role !== "string" || !e.role) throw new ComputerError("REQUERY_REQUIRED", "Native element identity is invalid.");
          const token = typeof e.elementToken === "string" && e.elementToken ? e.elementToken : void 0;
          const id = token ?? `index:${index}`;
          if (indexed.has(id)) throw new ComputerError("REQUERY_REQUIRED", "Native snapshot returned duplicate element identities.");
          const sensitive2 = /secure|password|密码/i.test(`${e.role} ${e.label ?? ""}`);
          const element = { id, role: e.role, ...typeof e.label === "string" ? { name: e.label } : {}, ...typeof e.enabled === "boolean" ? { enabled: e.enabled } : {}, ...sensitive2 ? { sensitive: true } : {}, ...!sensitive2 && !e.inWebContent && typeof e.value === "string" ? { value: e.value } : {} };
          if (e.inWebContent) diagnostics.push("Web-content AX values omitted because renderer echo is not reliable input verification.");
          elements.push(element);
          indexed.set(id, { element, index, token });
        }
        let width = r.windowBounds?.width ?? 0, height = r.windowBounds?.height ?? 0;
        const screenshots = [];
        if (r.screenshotFrameValid === true && integer(r.screenshotWidth) && integer(r.screenshotHeight)) {
          for (const image of r.images ?? []) {
            if (image.mimeType !== "image/png" && image.mimeType !== "image/jpeg") continue;
            const candidate = { mimeType: image.mimeType, dataBase64: image.dataBase64 };
            const dims = imageSize(candidate);
            if (dims?.width === r.screenshotWidth && dims.height === r.screenshotHeight) screenshots.push(candidate);
          }
          if (screenshots.length) {
            width = r.screenshotWidth;
            height = r.screenshotHeight;
          }
        }
        const pixelFrame = screenshots.length > 0;
        if (!pixelFrame) diagnostics.push("No validated screenshot pixel frame; coordinate actions are disabled.");
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new ComputerError("REQUERY_REQUIRED", "Native window dimensions are unavailable.");
        snapshots.set(key, { captureId: r.snapshotId, elements: indexed, width, height, pixelFrame });
        return { target: { ...target }, captureId: r.snapshotId, requestedAt, receivedAt, elements, screenshots, width, height, diagnostics: [...new Set(diagnostics)] };
      });
    },
    perform: (target, action, signal) => {
      targetValid(target);
      return run(signal, true, async (d, s, dispatch) => {
        const key = keyOf(target), observed = snapshots.get(key);
        if (!observed) throw new ComputerError("REQUERY_REQUIRED", "Observe this exact window before native input.");
        const args = { target: { kind: "window", pid: target.pid, window_id: target.windowId }, session, delivery_mode: "background" };
        const element = action.elementId ? observed.elements.get(action.elementId) : void 0;
        if (action.elementId && !element) throw new ComputerError("REQUERY_REQUIRED", "The element is not in the latest exact-window observation.");
        if (element?.element.sensitive) throw new ComputerError("SENSITIVE_TARGET", "Sensitive native input is not supported.");
        if (element?.element.enabled === false) throw new ComputerError("UNSUPPORTED", "The native element is disabled.");
        const point = (x, y) => {
          if (!observed.pixelFrame) throw new ComputerError("REQUERY_REQUIRED", "A validated screenshot pixel frame is required.");
          if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= observed.width || y >= observed.height) throw new ComputerError("INVALID_REQUEST", "Pixel coordinates must lie inside the exact observed image.");
          return { x, y };
        };
        if (element) {
          args.snapshot_id = observed.captureId;
          if (element.token) args.element_token = element.token;
          else args.element_index = element.index;
        } else if (action.kind !== "drag" && action.x !== void 0 && action.y !== void 0) Object.assign(args, point(action.x, action.y));
        if (["type", "key", "scroll"].includes(action.kind) && !element) throw new ComputerError("UNSUPPORTED", "Keyboard and scroll input require a freshly observed element target.");
        let name;
        switch (action.kind) {
          case "click":
            name = "click";
            if (!element) Object.assign(args, point(action.x, action.y));
            break;
          case "type":
            name = "type_text";
            if (typeof action.text !== "string") throw new ComputerError("INVALID_REQUEST", "Text input requires a string.");
            args.text = action.text;
            break;
          case "key":
            name = "press_key";
            if (typeof action.key !== "string" || !action.key.trim()) throw new ComputerError("INVALID_REQUEST", "A single key name is required.");
            args.key = action.key;
            break;
          case "scroll":
            name = "scroll";
            if (!action.direction || !["up", "down", "left", "right"].includes(action.direction)) throw new ComputerError("INVALID_REQUEST", "A scroll direction is required.");
            if (action.amount !== void 0 && (!integer(action.amount) || action.amount > 50)) throw new ComputerError("INVALID_REQUEST", "Scroll amount must be 1 to 50.");
            args.direction = action.direction;
            args.by = "line";
            args.amount = action.amount ?? 3;
            break;
          case "drag": {
            name = "drag";
            if (element) throw new ComputerError("UNSUPPORTED", "Drag requires two validated image coordinates.");
            const from = point(action.x, action.y), to = point(action.toX, action.toY);
            Object.assign(args, { from_x: from.x, from_y: from.y, to_x: to.x, to_y: to.y });
            break;
          }
          default:
            throw new ComputerError("UNSUPPORTED", "This native action is not supported.");
        }
        snapshots.delete(key);
        dispatch();
        return actionDelivery(await d.callTool(name, JSON.stringify(args), { signal: s }));
      });
    },
    close: stopOwned
  };
}
var VERSION, ARCHIVE_SHA256, integer, keyOf;
var init_cua_backend = __esm({
  "packages/computer-use/src/cua-backend.ts"() {
    "use strict";
    init_protocol();
    VERSION = "0.28.2";
    ARCHIVE_SHA256 = "386db225a3080714a0f9f935525e61efaf46709587ef8b94dd2df81aeb2f6daa";
    integer = (n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
    keyOf = (t) => `${t.pid}:${t.windowId}`;
  }
});

// packages/computer-use/src/index.ts
import { Context } from "@deepseek-ai/cordis";

// packages/computer-use/src/tool.ts
import { HarnessError } from "@deepseek-ai/dsh-llm";

// packages/computer-use/src/engine.ts
init_protocol();

// packages/computer-use/src/observation.ts
init_protocol();
import { randomUUID } from "node:crypto";
var sameTarget = (a, b) => a.pid === b.pid && a.windowId === b.windowId;
var sensitive = (e) => e.sensitive === true || /secure|password|密码/i.test(`${e.role} ${e.name ?? ""}`);
function semantic(e) {
  const identity = e.identifier ? ["identifier", e.identifier] : e.name ? ["name", e.name] : void 0;
  return identity ? JSON.stringify([e.role, ...identity]) : void 0;
}
function counts(elements) {
  const result = /* @__PURE__ */ new Map();
  for (const e of elements) {
    const key = semantic(e);
    if (key) result.set(key, [...result.get(key) ?? [], e]);
  }
  return result;
}
function exposed(e, id) {
  const { id: _, ...rest } = e;
  return {
    ...rest,
    ...sensitive(e) ? { value: void 0, sensitive: true } : {},
    id
  };
}
var Observations = class {
  constructor(target) {
    this.target = target;
  }
  lineage = randomUUID();
  counter = 0;
  revision = 0;
  snapshot;
  view;
  raw = /* @__PURE__ */ new Map();
  accept(s, afterAction = false) {
    if (!sameTarget(s.target, this.target) || !Number.isFinite(s.requestedAt) || !Number.isFinite(s.receivedAt) || s.receivedAt < s.requestedAt || s.frameCapturedAt !== void 0 && (!Number.isFinite(s.frameCapturedAt) || s.frameCapturedAt < 0 || s.frameCapturedAt > s.receivedAt) || !Number.isFinite(s.width) || !Number.isFinite(s.height) || s.width <= 0 || s.height <= 0 || new Set(s.elements.map((e) => e.id)).size !== s.elements.length)
      throw new ComputerError(
        "REQUERY_REQUIRED",
        "Provider returned an invalid or different window snapshot."
      );
    const current = counts(s.elements), old = this.snapshot ? counts(this.snapshot.elements) : /* @__PURE__ */ new Map();
    const priorByRaw = new Map(
      [...this.raw.entries()].map(([handle, e]) => [e.id, handle])
    );
    const mapping = /* @__PURE__ */ new Map();
    const elements = s.elements.map((e) => {
      const key = semantic(e), prior = key && current.get(key)?.length === 1 && old.get(key)?.length === 1 ? old.get(key)[0] : void 0;
      const handle = (prior && priorByRaw.get(prior.id)) ?? `e${++this.counter}`;
      mapping.set(handle, e);
      return exposed(e, handle);
    });
    const previous = new Map(
      this.view?.elements.map((e) => [e.id, JSON.stringify(e)]) ?? []
    ), next = new Map(elements.map((e) => [e.id, JSON.stringify(e)]));
    const view = {
      target: { ...this.target },
      revision: `${this.lineage}:${++this.revision}`,
      lineage: this.lineage,
      captureId: s.captureId,
      timing: {
        requestedAt: s.requestedAt,
        receivedAt: s.receivedAt,
        ...s.frameCapturedAt === void 0 ? {} : { frameCapturedAt: s.frameCapturedAt },
        freshness: s.frameCapturedAt !== void 0 ? "producer-timestamp" : afterAction ? "requested-after-action" : "unknown"
      },
      elements,
      diff: {
        added: [...next.keys()].filter((id) => !previous.has(id)),
        removed: [...previous.keys()].filter((id) => !next.has(id)),
        changed: [...next.keys()].filter(
          (id) => previous.has(id) && previous.get(id) !== next.get(id)
        )
      },
      screenshots: s.screenshots,
      width: s.width,
      height: s.height,
      diagnostics: [
        ...s.diagnostics ?? [],
        ...s.frameCapturedAt === void 0 ? [
          "Producer image timestamp unavailable; screenshot and AX state are not claimed atomic."
        ] : []
      ]
    };
    this.snapshot = s;
    this.view = view;
    this.raw = mapping;
    return view;
  }
  element(handle) {
    return this.raw.get(handle);
  }
};

// packages/computer-use/src/engine.ts
var operations = /* @__PURE__ */ new Set([
  "status",
  "apps",
  "windows",
  "observe",
  "click",
  "type",
  "key",
  "scroll",
  "drag",
  "wait",
  "finish"
]);
var writes = /* @__PURE__ */ new Set(["click", "type", "key", "scroll", "drag"]);
var capabilities = [
  "window-bound-actions",
  "unique-element-refetch",
  "observation-lineage",
  "ax-readback",
  "bounded-wait",
  "exclusive-session-lease"
];
function error(code, message) {
  throw new ComputerError(code, message);
}
var positive = (n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
var finite = (n) => typeof n === "number" && Number.isFinite(n);
function validate(r) {
  if (!r || typeof r !== "object" || !operations.has(r.op))
    error("INVALID_REQUEST", "Unsupported operation.");
  if (["observe", "wait", ...writes].includes(r.op) && (!positive(r.pid) || !positive(r.windowId)))
    error("INVALID_REQUEST", "A positive PID and windowId are required.");
  if (r.op === "windows" && !positive(r.pid))
    error("INVALID_REQUEST", "A positive PID is required.");
  if (writes.has(r.op) || r.op === "wait") {
    if (!r.revision || typeof r.revision !== "string")
      error("INVALID_REQUEST", "Use the revision returned by observe.");
    if (r.elementId !== void 0 && (typeof r.elementId !== "string" || !r.elementId))
      error("INVALID_REQUEST", "Invalid element handle.");
  }
  if (["type", "key", "scroll"].includes(r.op) && !r.elementId)
    error(
      "INVALID_REQUEST",
      "This operation requires an explicit observed element."
    );
  if (r.op === "type" && (typeof r.text !== "string" || r.text.length > 32768))
    error(
      "INVALID_REQUEST",
      "text must be a string of at most 32768 characters."
    );
  if (r.op === "key" && (typeof r.key !== "string" || !r.key || r.key.length > 100))
    error("INVALID_REQUEST", "A bounded key name is required.");
  if (r.op === "scroll" && (!["up", "down", "left", "right"].includes(r.direction ?? "") || !finite(r.amount ?? 1) || (r.amount ?? 1) <= 0 || (r.amount ?? 1) > 10))
    error("INVALID_REQUEST", "Specify scroll direction and amount in (0,10].");
  if (r.op === "click" && !r.elementId && (!finite(r.x) || !finite(r.y)))
    error("INVALID_REQUEST", "Click needs an element or window coordinates.");
  if (r.op === "drag" && (!finite(r.x) || !finite(r.y) || !finite(r.toX) || !finite(r.toY)))
    error("INVALID_REQUEST", "Drag requires start and end window coordinates.");
  if ([r.x, r.y, r.toX, r.toY].some((v) => v !== void 0 && !finite(v)))
    error("INVALID_REQUEST", "Coordinates must be finite.");
  if (r.x === void 0 !== (r.y === void 0))
    error("INVALID_REQUEST", "Coordinate pairs must be complete.");
  if (r.expectedText !== void 0 && (typeof r.expectedText !== "string" || r.expectedText.length > 32768))
    error("INVALID_REQUEST", "Invalid expectedText.");
  if (r.op === "wait" && (typeof r.expectedText !== "string" || !r.expectedText))
    error("INVALID_REQUEST", "Wait needs nonempty expectedText.");
  if (r.timeoutMs !== void 0 && (!finite(r.timeoutMs) || r.timeoutMs < 0 || r.timeoutMs > 5e3))
    error("INVALID_REQUEST", "Wait timeout must be between 0 and 5000 ms.");
}
async function pause(ms, signal) {
  signal.throwIfAborted();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    function done() {
      cleanup();
      resolve();
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
var ComputerEngine = class {
  constructor(options) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.pause = options.pause ?? pause;
  }
  task;
  active;
  backend;
  closed = false;
  closing;
  finishing;
  now;
  pause;
  getOwner() {
    return this.task?.session;
  }
  async run(session, r, signal) {
    if (this.closed) error("CLOSED", "Plugin has been closed.");
    validate(r);
    if (typeof session !== "string" || !session)
      error("INVALID_REQUEST", "A session identity is required.");
    if (r.op === "status")
      return {
        status: "ready",
        owner: this.getOwner(),
        backend: "lazy",
        capabilities
      };
    if (r.op === "finish") {
      await this.finish(session);
      return { status: "finished", owner: this.getOwner() };
    }
    if (signal.aborted)
      error("CANCELLED", "Request cancelled before dispatch.");
    if (this.finishing || this.active || this.task && this.task.session !== session)
      error("BUSY", "Desktop is owned by another active task or is draining.");
    const task = this.task ?? (this.task = { session, started: this.now(), calls: 0 });
    if (this.now() - task.started >= (this.options.maxTaskMs ?? 6e5) || task.calls >= (this.options.maxCalls ?? 60))
      error(
        "LIMIT",
        "Task budget exhausted; finish this task before starting a new one."
      );
    task.calls++;
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal]);
    const remainingTaskMs = task.started + (this.options.maxTaskMs ?? 6e5) - this.now();
    const timeout = setTimeout(
      () => controller.abort(
        new ComputerError(
          remainingTaskMs <= 6e4 ? "LIMIT" : "CANCELLED",
          remainingTaskMs <= 6e4 ? "Task time budget exhausted." : "Request exceeded 60 seconds."
        )
      ),
      Math.min(6e4, remainingTaskMs)
    );
    const done = Promise.resolve().then(() => this.execute(task, r, combined));
    this.active = { session, controller, done };
    try {
      return await done;
    } finally {
      clearTimeout(timeout);
      if (this.active?.done === done) this.active = void 0;
    }
  }
  async provider(signal) {
    signal.throwIfAborted();
    this.backend ??= this.options.backend();
    try {
      const b = await this.backend;
      if (signal.aborted) {
        await b.close();
        signal.throwIfAborted();
      }
      return b;
    } catch (e) {
      this.backend = void 0;
      throw e;
    }
  }
  async execute(task, r, signal) {
    let dispatched = false;
    try {
      const backend = await this.provider(signal);
      if (r.op === "apps") {
        const apps = await backend.apps(signal);
        signal.throwIfAborted();
        return { status: "ready", apps, backend: backend.id };
      }
      if (r.op === "windows") {
        const windows = await backend.windows(r.pid, signal);
        signal.throwIfAborted();
        return { status: "ready", windows, backend: backend.id };
      }
      const target = { pid: r.pid, windowId: r.windowId };
      if (r.op === "observe") {
        const snapshot = await backend.observe(target, signal);
        signal.throwIfAborted();
        if (!task.observations || !sameTarget(task.observations.target, target))
          task.observations = new Observations(target);
        return {
          status: "observed",
          observation: task.observations.accept(snapshot),
          backend: backend.id
        };
      }
      const store = task.observations;
      if (!store?.view || !sameTarget(store.target, target) || store.view.revision !== r.revision)
        error(
          "REQUERY_REQUIRED",
          "The target or revision is stale. Observe the exact window again."
        );
      if (r.op === "wait")
        return await this.wait(backend, store, r, task, signal);
      const previous = store.snapshot, origin = r.elementId ? store.element(r.elementId) : void 0;
      if (r.elementId && !origin)
        error(
          "REQUERY_REQUIRED",
          "Element handle does not belong to the current observation."
        );
      if (origin && previous.elements.filter((e) => semantic(e) === semantic(origin)).length !== 1)
        error(
          "AMBIGUOUS_ELEMENT",
          "The observed element has no unique semantic identity."
        );
      if (origin && sensitive(origin))
        error("SENSITIVE_TARGET", "Sensitive input targets are not supported.");
      const fresh = await backend.observe(target, signal);
      signal.throwIfAborted();
      store.accept(fresh);
      let rawId, recovered = false;
      if (origin) {
        const key = semantic(origin), matches = key ? fresh.elements.filter((e) => semantic(e) === key) : [];
        if (matches.length > 1)
          error(
            "AMBIGUOUS_ELEMENT",
            "Multiple elements match; observe again and choose an unambiguous target."
          );
        if (matches.length !== 1 || matches[0].enabled === false)
          error(
            "REQUERY_REQUIRED",
            "The original element disappeared or is disabled. Observe again."
          );
        const current = matches[0];
        if (sensitive(current))
          error(
            "SENSITIVE_TARGET",
            "Sensitive input targets are not supported."
          );
        rawId = current.id;
        recovered = rawId !== origin.id;
      }
      if (r.x !== void 0 || r.op === "drag")
        this.checkCoordinates(previous, fresh, r);
      if (!rawId && r.x === void 0)
        error(
          "INVALID_REQUEST",
          "An explicit element or coordinate target is required."
        );
      const action = {
        kind: r.op,
        ...rawId ? { elementId: rawId } : {},
        ...r.x === void 0 ? {} : { x: r.x, y: r.y },
        ...r.toX === void 0 ? {} : { toX: r.toX, toY: r.toY },
        ...r.text === void 0 ? {} : { text: r.text },
        ...r.key === void 0 ? {} : { key: r.key },
        ...r.direction === void 0 ? {} : { direction: r.direction, amount: r.amount ?? 1 }
      };
      signal.throwIfAborted();
      if (this.now() - task.started >= (this.options.maxTaskMs ?? 6e5))
        error(
          "LIMIT",
          "Task expired during input preflight; no input was dispatched."
        );
      dispatched = true;
      const delivery = await backend.perform(target, action, signal);
      signal.throwIfAborted();
      const completedAt = this.now(), after = await backend.observe(target, signal);
      signal.throwIfAborted();
      if (after.requestedAt < completedAt || after.frameCapturedAt !== void 0 && after.frameCapturedAt < completedAt)
        error(
          "RESULT_UNKNOWN",
          "Input was dispatched but the producer image predates completion. Observe again; do not replay blindly."
        );
      const observation = store.accept(
        delivery.outcome === "unknown" ? {
          ...after,
          diagnostics: [
            ...after.diagnostics ?? [],
            "Delivery is unconfirmed. Inspect this post-action observation before deciding the next step; do not replay the input blindly."
          ]
        } : after,
        true
      );
      let verification = {
        status: "unverifiable",
        basis: "none"
      };
      if (r.expectedText !== void 0 && origin) {
        const key = semantic(origin), matches = after.elements.filter(
          (e) => semantic(e) === key && !sensitive(e)
        );
        if (matches.length === 1 && typeof matches[0].value === "string")
          verification = {
            status: matches[0].value === r.expectedText ? "match" : "mismatch",
            basis: "ax-value"
          };
      }
      return {
        status: "performed",
        observation,
        action: { outcome: delivery.outcome, recovered },
        verification,
        backend: backend.id
      };
    } catch (e) {
      if (signal.aborted) await this.disposeBackend().catch(() => {
      });
      if (dispatched) {
        error(
          "RESULT_UNKNOWN",
          "Input was attempted once; delivery or post-action verification is uncertain. Observe again before any further input."
        );
      }
      if (signal.aborted) {
        if (signal.reason instanceof ComputerError && signal.reason.code === "LIMIT")
          throw signal.reason;
        error("CANCELLED", "Request cancelled before input dispatch.");
      }
      if (e instanceof ComputerError) throw e;
      error(
        "UNAVAILABLE",
        e instanceof Error ? e.message : "Native backend unavailable."
      );
    }
  }
  checkCoordinates(previous, fresh, r) {
    for (const [x, y] of [
      [r.x, r.y],
      [r.toX, r.toY]
    ])
      if (x !== void 0 && y !== void 0 && (x < 0 || y < 0 || x >= fresh.width || y >= fresh.height))
        error(
          "INVALID_REQUEST",
          "Coordinates must be inside the observed window."
        );
    const visual2 = (s) => JSON.stringify([
      s.width,
      s.height,
      s.screenshots,
      s.elements.map(({ id: _opaqueToken, ...state }) => state)
    ]);
    if (!previous.screenshots.length || !fresh.screenshots.length || visual2(previous) !== visual2(fresh))
      error(
        "REQUERY_REQUIRED",
        "Coordinate context changed or is unavailable. Observe again and use an element when possible."
      );
  }
  async wait(backend, store, r, task, signal) {
    const duration = Math.min(
      r.timeoutMs ?? 1e3,
      task.started + (this.options.maxTaskMs ?? 6e5) - this.now()
    );
    const deadline = this.now() + duration;
    let observation = store.view;
    const budget = new AbortController();
    const bounded = AbortSignal.any([signal, budget.signal]);
    const timer = setTimeout(
      () => budget.abort(new Error("Wait deadline reached")),
      Math.max(0, duration)
    );
    try {
      for (let attempts = 0; attempts < 27 && this.now() < deadline; attempts++) {
        bounded.throwIfAborted();
        const snapshot = await backend.observe(store.target, bounded);
        signal.throwIfAborted();
        observation = store.accept(snapshot);
        if (budget.signal.aborted || this.now() >= deadline) break;
        const matches = observation.elements.filter(
          (e) => !sensitive(e) && (e.value === r.expectedText || e.name === r.expectedText)
        );
        if (matches.length)
          return {
            status: "observed",
            observation,
            verification: {
              status: "match",
              basis: matches.some((e) => e.value === r.expectedText) ? "ax-value" : "ax-text"
            }
          };
        const remaining = deadline - this.now();
        if (remaining <= 0) break;
        await this.pause(Math.min(200, remaining), bounded);
      }
    } catch (e) {
      if (budget.signal.aborted && !signal.aborted) await this.disposeBackend();
      else throw e;
    } finally {
      clearTimeout(timer);
    }
    signal.throwIfAborted();
    return {
      status: "waiting",
      observation,
      verification: { status: "timeout", basis: "none" }
    };
  }
  async finish(session) {
    if (this.task?.session !== session) return;
    if (this.finishing) return this.finishing;
    this.active?.controller.abort(
      new ComputerError("CANCELLED", "Task finished.")
    );
    this.finishing = (async () => {
      try {
        await this.active?.done.catch(() => {
        });
        await this.disposeBackend();
      } finally {
        if (this.task?.session === session) this.task = void 0;
        this.finishing = void 0;
      }
    })();
    return this.finishing;
  }
  async disposeBackend() {
    const pending = this.backend;
    this.backend = void 0;
    if (pending) {
      const backend = await pending.catch(() => void 0);
      await backend?.close();
    }
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      if (this.task) await this.finish(this.task.session);
      else await this.disposeBackend();
    })();
    return this.closing;
  }
};

// packages/computer-use/src/tool.ts
init_protocol();
var TOOL = "computer_use_plus";
var LEGACY = "computer_use";
var visual = /* @__PURE__ */ new Set(["observe", "click", "type", "key", "scroll", "drag", "wait"]);
var requestKeys = /* @__PURE__ */ new Set(["op", "pid", "windowId", "revision", "elementId", "x", "y", "toX", "toY", "text", "key", "direction", "amount", "expectedText", "timeoutMs"]);
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
function request(value) {
  const input = record(value);
  if (!input || Object.keys(input).some((key) => !requestKeys.has(key))) throw new ComputerError("INVALID_REQUEST", "Only declared computer-use operation fields are accepted");
  return input;
}
function sessionId(exec) {
  const id = exec.agent?.session?.id;
  if (typeof id !== "string" || !id || id.length > 256) throw new ComputerError("INVALID_REQUEST", "Computer use requires an executing session");
  return id;
}
function operation(exec) {
  return record(exec.arguments)?.op;
}
function finished(value) {
  if (typeof value === "string") {
    try {
      return finished(JSON.parse(value));
    } catch {
      return false;
    }
  }
  const result = record(value);
  return result?.stopped === true || result?.status === "finished" || record(result?.action)?.terminal === true;
}
async function requireVision(ctx, exec) {
  const route = exec.agent?.session?.requestHeader()?.config ?? exec.agent?.options;
  const llm = ctx.get("llm"), attachments = ctx.get("attachments");
  if (!attachments) throw new ComputerError("UNAVAILABLE", "Screenshot attachment storage is unavailable; no desktop operation was started");
  if (!route?.provider || !route.model || !llm) throw new ComputerError("UNAVAILABLE", "Current model image capability is unknown; no desktop operation was started");
  const info = await llm.resolveModelInfo(route.provider, route.model, exec.signal);
  exec.signal.throwIfAborted();
  if (!info.inputModalities?.includes("image")) throw new ComputerError("UNAVAILABLE", "Current model does not support image input; no desktop operation was started");
}
async function storeObservation(ctx, result, signal) {
  const { observation, ...rest } = result;
  if (!observation) return { ...rest, images: [] };
  if (!observation.screenshots.length) throw new ComputerError(result.action ? "RESULT_UNKNOWN" : "UNAVAILABLE", "No valid screenshot was returned; desktop control has stopped. An attempted action must not be replayed");
  const attachments = ctx.get("attachments");
  if (!attachments) throw new ComputerError(result.action ? "RESULT_UNKNOWN" : "UNAVAILABLE", "Screenshot attachment storage was withdrawn; desktop control has stopped");
  const { screenshots, ...view } = observation, images = [];
  try {
    for (const image of screenshots) {
      signal.throwIfAborted();
      images.push(await attachments.saveImage({ data: Buffer.from(image.dataBase64, "base64"), mediaType: image.mimeType, name: "Computer use observation" }));
    }
    signal.throwIfAborted();
  } catch {
    throw new ComputerError(result.action ? "RESULT_UNKNOWN" : "UNAVAILABLE", "Screenshot persistence or cancellation prevented result inspection; desktop control has stopped. Do not replay an attempted action");
  }
  return { ...rest, observation: view, images };
}
function computerTool(execute) {
  return {
    name: TOOL,
    description: "Operate a selected macOS application window with bounded semantic element recovery. Start with apps/windows then observe(pid,windowId). Every action uses the latest revision. type/key/scroll require a unique explicit observed elementId. click accepts elementId or current window-local screenshot coordinates; drag requires window-local start/end coordinates. wait is read-only, at most 5000 ms, and expectedText checks AX text only. Never guess IDs, replay uncertain writes, target sensitive/password fields, run scripts, or use global coordinates. A verified AX value is not business success. Read the returned screenshot and verification. status does not capture the screen; finish releases this session. This tool coexists with computer_use; finish the other desktop task first.",
    parameters: { type: "object", properties: { op: { type: "string", enum: ["status", "apps", "windows", "observe", "click", "type", "key", "scroll", "drag", "wait", "finish"] }, pid: { type: "integer" }, windowId: { type: "integer" }, revision: { type: "string" }, elementId: { type: "string" }, x: { type: "number" }, y: { type: "number" }, toX: { type: "number" }, toY: { type: "number" }, text: { type: "string" }, key: { type: "string" }, direction: { type: "string", enum: ["up", "down", "left", "right"] }, amount: { type: "integer" }, expectedText: { type: "string" }, timeoutMs: { type: "integer" } }, required: ["op"], additionalProperties: false },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => {
      const { images, ...text } = value;
      return [{ type: "text", text: JSON.stringify(text) }, ...images.map((attachment) => ({ type: "image", attachment }))];
    } },
    timeoutMs: 6e4,
    isConcurrencySafe: () => false,
    execute
  };
}
function registerComputerUse(ctx, options) {
  ctx.inject(["tools"], (scope) => {
    const tools = scope.tools, engine = new ComputerEngine(options), abort = new AbortController();
    const flights = /* @__PURE__ */ new Set();
    let closed = false, scheduled = false, remove;
    let legacyOwner, legacyFlights = 0, legacyEnding = false, reserved, pluginFlights = 0;
    const owner = () => engine.getOwner() ?? reserved;
    const ours = (exec) => exec.name === TOOL && tools.get(TOOL, exec.agent) === definition;
    const conflict = (exec) => {
      if (exec.name === LEGACY && operation(exec) !== "finish" && owner()) return "EWork computer_use_plus owns the desktop; finish its session first";
      if (exec.name === TOOL && operation(exec) !== "status" && operation(exec) !== "finish" && owner() && !ours(exec)) return "A previous computer_use_plus controller still owns the desktop; wait for its input to drain";
      if (ours(exec) && operation(exec) !== "status" && operation(exec) !== "finish" && legacyOwner) return "Legacy computer_use owns the desktop; finish its session first";
      return void 0;
    };
    const track = (pending) => {
      flights.add(pending);
      void pending.finally(() => flights.delete(pending)).catch(() => {
      });
      return pending;
    };
    const definition = computerTool(async (args, exec) => {
      if (closed) throw new ComputerError("CLOSED", "Computer use plugin was unloaded");
      const id = sessionId(exec);
      const signal = AbortSignal.any([exec.signal, abort.signal]);
      return track((async () => {
        try {
          const input = request(args);
          if (visual.has(input.op)) await requireVision(scope, { ...exec, signal });
          signal.throwIfAborted();
          const result = await engine.run(id, input, signal);
          return JSON.parse(JSON.stringify(await storeObservation(scope, result, signal)));
        } catch (error2) {
          if (engine.getOwner() === id) await engine.finish(id);
          if (error2 instanceof ComputerError) {
            const failure = new HarnessError(error2.message, error2.code, { cause: error2 });
            failure.name = "ComputerError";
            throw failure;
          }
          throw error2;
        } finally {
          if (!pluginFlights && !engine.getOwner()) reserved = void 0;
        }
      })());
    });
    scope.effect(() => {
      if (typeof tools.guard !== "function") throw new ComputerError("UNSUPPORTED", "This host lacks the public tool guard contract; computer_use_plus was not registered");
      const gateContext = scope.root, gateTools = gateContext.get("tools");
      if (!gateTools || typeof gateTools.guard !== "function") throw new ComputerError("UNSUPPORTED", "A shared public tool registry is required for desktop arbitration");
      const removeGuard = gateTools.guard(conflict);
      const removeAround = gateContext.on("tools/execute", async (exec, next) => {
        const denied = conflict(exec);
        if (denied) throw new ComputerError("BUSY", denied);
        if (exec.name !== LEGACY && !ours(exec)) return next();
        const op = operation(exec), id = sessionId(exec);
        if (exec.name === TOOL) {
          if (closed) throw new ComputerError("CLOSED", "Computer use plugin was unloaded");
          if (op === "status" || op === "finish") return next();
          if (owner() && owner() !== id) throw new ComputerError("BUSY", "Another session owns the desktop");
          reserved = id;
          pluginFlights++;
          try {
            return await next();
          } finally {
            pluginFlights--;
            if (!pluginFlights && !engine.getOwner()) reserved = void 0;
          }
        }
        if (legacyOwner && legacyOwner !== id) throw new ComputerError("BUSY", "Another legacy session owns the desktop");
        if (op !== "finish") legacyOwner = id;
        legacyFlights++;
        try {
          const result = await next();
          if (op === "finish" && !result.isError || !result.isError && finished(result.value)) legacyEnding = true;
          return result;
        } finally {
          legacyFlights--;
          if (!legacyFlights && legacyEnding) {
            legacyOwner = void 0;
            legacyEnding = false;
          }
        }
      });
      scope.on("session/event", (session, event) => {
        if (event.type !== "turn/end") return;
        if (session.id === legacyOwner) {
          legacyEnding = true;
          if (!legacyFlights) {
            legacyOwner = void 0;
            legacyEnding = false;
          }
        }
        if (session.id === owner()) track(engine.finish(session.id).then(() => {
          if (!pluginFlights) reserved = void 0;
        })).catch((error2) => scope.logger.warn(error2));
      });
      const install = () => {
        if (closed || remove || tools.get(TOOL)) return;
        remove = tools.register(definition);
      };
      scope.on("tools/change", () => {
        if (closed || scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          install();
        });
      });
      install();
      return async () => {
        closed = true;
        remove?.();
        remove = void 0;
        abort.abort(new ComputerError("CLOSED", "Computer use plugin was unloaded"));
        try {
          await Promise.allSettled([...flights]);
          await engine.close();
          reserved = void 0;
        } finally {
          removeAround();
          removeGuard();
        }
      };
    }, "EWork computer use: withdraw tool, cancel and drain input before removing guard");
  });
}

// packages/computer-use/src/index.ts
function createComputerUsePlugin(options) {
  return { name: "ework-computer-use", apply(ctx) {
    if (!Context.is(ctx)) throw Error("EWork computer use requires the shared host Cordis instance");
    registerComputerUse(ctx, options);
  } };
}
function apply(ctx, config = {}) {
  createComputerUsePlugin({ backend: async () => {
    const { createCuaBackend: createCuaBackend2 } = await Promise.resolve().then(() => (init_cua_backend(), cua_backend_exports));
    return createCuaBackend2(config);
  } }).apply(ctx);
}
export {
  apply,
  createComputerUsePlugin
};
