import { type EngineOptions, type Request, type Result } from "./protocol.ts";
/** One controller owns one desktop lease; every input is attempted at most once. */
export declare class ComputerEngine {
    private readonly options;
    private task?;
    private active?;
    private backend?;
    private closed;
    private closing?;
    private finishing?;
    private readonly now;
    private readonly pause;
    constructor(options: EngineOptions);
    getOwner(): string | undefined;
    run(session: string, r: Request, signal: AbortSignal): Promise<Result>;
    private provider;
    private execute;
    private checkCoordinates;
    private wait;
    finish(session: string): Promise<void>;
    private disposeBackend;
    close(): Promise<void>;
}
