import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust';
import type { ConversationComponentUiService } from './service';
type IpcMain = {
    handle(channel: string, handler: (event: any, value: unknown) => unknown): unknown;
    removeHandler(channel: string): void;
};
/** Keep the privileged surface finite; no renderer supplied method or channel. */
export function installConversationComponentHandlers(options: {
    ipcMain: IpcMain;
    getWindow(): TrustedWindow | undefined;
    service: ConversationComponentUiService;
}): () => void {
    const methods = ['read', 'updateNativeSpec', 'queryNative', 'copy', 'saveLibrary', 'reference', 'resolveReference'] as const;
    for (const method of methods) {
        const channel = `conversation-components:${method}`;
        options.ipcMain.removeHandler(channel);
        registerTrustedMainWindowHandler(options.ipcMain, channel, options.getWindow, (_event, value: unknown) => (options.service[method] as (input: unknown) => Promise<unknown>)(value));
    }
    return () => { for (const method of methods)
        options.ipcMain.removeHandler(`conversation-components:${method}`); };
}
