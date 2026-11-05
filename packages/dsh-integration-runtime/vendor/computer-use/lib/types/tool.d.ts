import type { Context } from '@deepseek-ai/cordis';
import { type EngineOptions } from './protocol.ts';
/** Optional public tools integration. Each activation owns exactly one lazy engine. */
export declare function registerComputerUse(ctx: Context, options: EngineOptions): void;
