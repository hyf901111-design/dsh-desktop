import { Context } from '@deepseek-ai/cordis';
import type { EngineOptions } from './protocol.ts';
export interface Config {
    binaryPath?: string;
    hostBundleId?: string;
}
/** A public Backend can be supplied without changing the tool's safety/lifecycle layer. */
export declare function createComputerUsePlugin(options: EngineOptions): {
    name: string;
    apply(ctx: Context): void;
};
/** Normal Cordis bundle entry. Neither installation nor status starts the daemon. */
export declare function apply(ctx: Context, config?: Config): void;
