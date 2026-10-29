import type { ConversationComponentsBridge } from '../../packages/dsh-research-task-runtime/conversation-component-contract.js';
export function createConversationComponentsBridge(invoke: (channel: string, ...args: unknown[]) => Promise<unknown>): ConversationComponentsBridge {
    const bridge: ConversationComponentsBridge = {
        read: input => invoke('conversation-components:read', input) as ReturnType<ConversationComponentsBridge['read']>,
        rename: input => invoke('conversation-components:rename', input) as ReturnType<NonNullable<ConversationComponentsBridge['rename']>>,
        exportContent: input => invoke('conversation-components:exportContent', input) as ReturnType<NonNullable<ConversationComponentsBridge['exportContent']>>,
        commitHtmlInteraction: input => invoke('conversation-components:commitHtmlInteraction', input) as ReturnType<NonNullable<ConversationComponentsBridge['commitHtmlInteraction']>>,
        updateNativeSpec: input => invoke('conversation-components:updateNativeSpec', input) as ReturnType<ConversationComponentsBridge['updateNativeSpec']>,
        queryNative: input => invoke('conversation-components:queryNative', input) as ReturnType<ConversationComponentsBridge['queryNative']>,
        readNativeSnapshot: input => invoke('conversation-components:readNativeSnapshot', input) as ReturnType<NonNullable<ConversationComponentsBridge['readNativeSnapshot']>>,
        copy: input => invoke('conversation-components:copy', input) as ReturnType<ConversationComponentsBridge['copy']>,
        saveLibrary: input => invoke('conversation-components:saveLibrary', input) as ReturnType<ConversationComponentsBridge['saveLibrary']>,
        reference: input => invoke('conversation-components:reference', input) as ReturnType<ConversationComponentsBridge['reference']>,
        resolveReference: input => invoke('conversation-components:resolveReference', input) as ReturnType<ConversationComponentsBridge['resolveReference']>
    };
    return Object.freeze(bridge);
}
