export type Target = {
    pid: number;
    windowId: number;
};
export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type Element = {
    id: string;
    role: string;
    name?: string;
    identifier?: string;
    value?: string;
    enabled?: boolean;
    focused?: boolean;
    sensitive?: boolean;
    bounds?: Rect;
};
export type Screenshot = {
    mimeType: "image/png" | "image/jpeg";
    dataBase64: string;
};
export type Snapshot = {
    target: Target;
    captureId: string;
    requestedAt: number;
    receivedAt: number;
    frameCapturedAt?: number;
    elements: Element[];
    screenshots: Screenshot[];
    width: number;
    height: number;
    focus?: {
        pid: number;
        windowId?: number;
        verified: boolean;
    };
    diagnostics?: string[];
};
export type Application = {
    pid: number;
    name: string;
    bundleId?: string;
};
export type Window = Target & {
    title: string;
};
export type Action = {
    kind: "click" | "type" | "key" | "scroll" | "drag";
    elementId?: string;
    x?: number;
    y?: number;
    toX?: number;
    toY?: number;
    text?: string;
    key?: string;
    direction?: "up" | "down" | "left" | "right";
    amount?: number;
};
export type Delivery = {
    outcome: "delivered" | "unknown";
    details?: string;
};
export interface Backend {
    readonly id: string;
    apps(signal: AbortSignal): Promise<Application[]>;
    windows(pid: number, signal: AbortSignal): Promise<Window[]>;
    observe(target: Target, signal: AbortSignal): Promise<Snapshot>;
    perform(target: Target, action: Action, signal: AbortSignal): Promise<Delivery>;
    close(): Promise<void>;
}
export type Operation = "status" | "apps" | "windows" | "observe" | "click" | "type" | "key" | "scroll" | "drag" | "wait" | "finish";
export type Request = {
    op: Operation;
    pid?: number;
    windowId?: number;
    revision?: string;
    elementId?: string;
    x?: number;
    y?: number;
    toX?: number;
    toY?: number;
    text?: string;
    key?: string;
    direction?: "up" | "down" | "left" | "right";
    amount?: number;
    expectedText?: string;
    timeoutMs?: number;
};
export type Code = "INVALID_REQUEST" | "UNAVAILABLE" | "BUSY" | "REQUERY_REQUIRED" | "AMBIGUOUS_ELEMENT" | "SENSITIVE_TARGET" | "CANCELLED" | "RESULT_UNKNOWN" | "LIMIT" | "UNSUPPORTED" | "CLOSED";
export declare class ComputerError extends Error {
    readonly code: Code;
    constructor(code: Code, message: string);
}
export type ViewElement = Omit<Element, "id"> & {
    id: string;
};
export type Observation = {
    target: Target;
    revision: string;
    lineage: string;
    captureId: string;
    timing: {
        requestedAt: number;
        receivedAt: number;
        frameCapturedAt?: number;
        freshness: "producer-timestamp" | "requested-after-action" | "unknown";
    };
    elements: ViewElement[];
    diff: {
        added: string[];
        removed: string[];
        changed: string[];
    };
    screenshots: Screenshot[];
    width: number;
    height: number;
    diagnostics: string[];
};
export type Result = {
    status: "ready" | "observed" | "performed" | "waiting" | "finished" | "unavailable";
    observation?: Observation;
    apps?: Application[];
    windows?: Window[];
    action?: {
        outcome: "delivered" | "unknown";
        recovered: boolean;
    };
    verification?: {
        status: "match" | "mismatch" | "unverifiable" | "timeout";
        basis: "ax-value" | "ax-text" | "none";
    };
    owner?: string;
    backend?: string;
    capabilities?: string[];
};
export type EngineOptions = {
    backend: () => Promise<Backend>;
    now?: () => number;
    pause?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    maxCalls?: number;
    maxTaskMs?: number;
};
