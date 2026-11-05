// packages/computer-use/src/protocol.ts
var ComputerError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ComputerError";
  }
};

// packages/computer-use/src/observation.ts
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
    const visual = (s) => JSON.stringify([
      s.width,
      s.height,
      s.screenshots,
      s.elements.map(({ id: _opaqueToken, ...state }) => state)
    ]);
    if (!previous.screenshots.length || !fresh.screenshots.length || visual(previous) !== visual(fresh))
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
export {
  ComputerEngine,
  ComputerError
};
