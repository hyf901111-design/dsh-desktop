import type { IntegrationBridge, SkillCommandSegment, SkillComposerPrefill } from '../../shared/integration-ui';
import type {SkillReference} from '../../shared/skill-reference';

type ComposerReply = { requestId: string; ok: boolean; token?: string; message?: string };
type ComposerRequest = { phase: 'prepare' | 'insert' | 'cancel' | 'focus'; token?: string; invocationName?: string; reference?:SkillReference; sessionId?:string; expectedDraftRev?:number; commandSegment?:SkillCommandSegment; prefill?:SkillComposerPrefill };
const requestEvent = 'sherlock:skill-compose-request';
const replyEvent = 'sherlock:skill-compose-reply';

/** Transfers an approved skill to the native composer without sending a message. */
export function createSkillUseBridge(document: Document, bridge: Pick<IntegrationBridge, 'request'>, revealConversation: () => void) {
    const win = document.defaultView!;
    let generation = 0;
    let disposed = false;
    const pending = new Set<() => void>();
    const tokens = new Set<string>();
    const dispatch = (input: ComposerRequest, requestId: string) => win.dispatchEvent(new win.CustomEvent(requestEvent, { detail: { ...input, requestId } }));
    const exchange = (input: ComposerRequest, signal?: AbortSignal): Promise<ComposerReply> => new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new Error('页面已变化，请重新选择技能。')); return; }
        const requestId = win.crypto.randomUUID();
        const cleanup = () => { win.removeEventListener(replyEvent, onReply); signal?.removeEventListener('abort', cancel); clearTimeout(timer); pending.delete(cancel); };
        const cancel = () => { cleanup(); reject(new Error('页面或账号已变化，请重新选择技能。')); };
        const onReply = (event: Event) => {
            const reply = (event as CustomEvent<ComposerReply>).detail;
            if (reply?.requestId !== requestId) return;
            cleanup();
            if (reply.ok) resolve(reply);
            else reject(new Error(reply.message || '无法将技能添加到当前对话，请重试。'));
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error('对话输入框尚未就绪，请稍后重试。')); }, 3000);
        pending.add(cancel);
        signal?.addEventListener('abort', cancel, { once: true });
        win.addEventListener(replyEvent, onReply);
        dispatch(input, requestId);
    });
    const reset = () => {
        generation++;
        for (const cancel of [...pending]) cancel();
        for (const token of tokens) dispatch({ phase: 'cancel', token }, win.crypto.randomUUID());
        tokens.clear();
    };
    const useSkill: NonNullable<IntegrationBridge['useSkill']> = async input => {
        if (disposed) throw new Error('页面已关闭，请重新打开技能。');
        const attempt = generation;
        const prepared = await exchange({ phase: 'prepare', ...(input.sessionId?{sessionId:input.sessionId}:{}), ...(input.expectedDraftRev !== undefined?{expectedDraftRev:input.expectedDraftRev}:{}), ...(input.commandSegment?{commandSegment:input.commandSegment}:{}) }, input.signal);
        const token = prepared.token;
        if (!token) throw new Error('无法定位当前对话，请重新选择会话。');
        tokens.add(token);
        try {
            const detail = await bridge.request({ type: 'skill-detail', id: input.id, revision: input.revision });
            if (attempt !== generation || disposed || input.signal?.aborted) throw new Error('页面或账号已变化，请重新选择技能。');
            if (detail.type !== 'skill-detail' || detail.id !== input.id || detail.revision !== input.revision) throw new Error('技能已变化，请刷新详情后重试。');
            if (!detail.enabled || detail.usable === false) throw new Error(detail.unavailableReason || '请先启用技能。');
            if (input.prefill !== undefined && !detail.invocationLabel) throw new Error('技能引用尚未就绪，请刷新后重试。');
            // Use the freshly verified runtime name, never a display name or stale UI alias.
            await exchange({ phase: 'insert', token, invocationName: detail.invocationName, ...(detail.invocationLabel?{reference:{id:detail.id,revision:detail.revision,invocationName:detail.invocationName,label:detail.invocationLabel}}:{}), ...(input.prefill !== undefined?{prefill:input.prefill}:{}) }, input.signal);
            if (attempt !== generation || disposed || input.signal?.aborted) return;
            revealConversation();
            await exchange({ phase: 'focus', token }, input.signal);
        } finally {
            tokens.delete(token);
            dispatch({ phase: 'cancel', token }, win.crypto.randomUUID());
        }
    };
    return { useSkill, reset, dispose: () => { disposed = true; reset(); } };
}
