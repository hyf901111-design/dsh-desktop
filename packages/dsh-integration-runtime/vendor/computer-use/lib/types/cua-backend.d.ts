import { type Backend } from './protocol.ts';
/** A plugin-owned daemon, imported and started only by the first native query.
 * The public host, not this plugin, owns TCC grants. All actions use background
 * delivery and exact window/snapshot addressing; no write is automatically retried.
 */
export declare function createCuaBackend(options?: {
    binaryPath?: string;
    hostBundleId?: string;
}): Promise<Backend>;
