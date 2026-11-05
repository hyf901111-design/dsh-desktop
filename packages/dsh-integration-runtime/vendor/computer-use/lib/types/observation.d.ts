import { type Element, type Observation, type Snapshot, type Target } from "./protocol.ts";
export declare const sameTarget: (a: Target, b: Target) => boolean;
export declare const sensitive: (e: Element) => boolean;
export declare function semantic(e: Element): string | undefined;
export declare class Observations {
    readonly target: Target;
    readonly lineage: `${string}-${string}-${string}-${string}-${string}`;
    private counter;
    private revision;
    snapshot?: Snapshot;
    view?: Observation;
    private raw;
    constructor(target: Target);
    accept(s: Snapshot, afterAction?: boolean): Observation;
    element(handle: string): Element | undefined;
}
