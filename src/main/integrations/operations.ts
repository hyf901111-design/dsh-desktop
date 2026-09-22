import { randomUUID } from 'node:crypto';
import { IntegrationError, integrationMessage, type OperationReceipt } from '../../shared/integrations';
import { IntegrationStore } from './store';
export class OperationManager {
    private active = new Map<string, {
        controller: AbortController;
        promise: Promise<void>;
    }>();
    constructor(private store: IntegrationStore) { }
    async recover(): Promise<void> {
        if (!Object.values(this.store.snapshot().operations).some(op => op.phase === 'running' || op.phase === 'queued'))
            return;
        await this.store.change(state => { for (const op of Object.values(state.operations))
            if (op.phase === 'running' || op.phase === 'queued') {
                op.phase = 'failed';
                op.cancelable = false;
                op.errorCode = 'RESULT_UNKNOWN';
                op.error = '上次操作被中断，请核对当前状态后重试';
                op.finishedAt = Date.now();
            } });
    }
    async start(kind: string, entityId: string, requestId: string, work: (signal: AbortSignal) => Promise<void>, validate?: () => void, ownerAccountId?: string): Promise<OperationReceipt> {
        if (typeof requestId !== 'string' || !requestId || requestId.length > 128)
            throw new IntegrationError('INVALID_CONFIG', '请求标识无效');
        let created = false;
        const op = await this.store.change(state => {
            const existing = Object.values(state.operations).find(op => op.requestId === requestId);
            if (existing) {
                if (existing.ownerAccountId !== ownerAccountId || existing.kind !== kind || existing.entityId !== entityId)
                    throw new IntegrationError('VERSION_CONFLICT', '请求标识已用于其他操作');
                return existing;
            }
            validate?.();
            const id = randomUUID();
            created = true;
            const operation = { id, requestId, kind, entityId, ownerAccountId, phase: 'running' as const, cancelable: true, startedAt: Date.now(), revision: state.revision + 1 };
            state.operations[id] = operation;
            const old = Object.values(state.operations).filter(o => !['queued', 'running'].includes(o.phase)).sort((a, b) => b.startedAt - a.startedAt);
            for (const stale of old.slice(200))
                delete state.operations[stale.id];
            return operation;
        });
        if (created) {
            const controller = new AbortController();
            const promise = Promise.resolve().then(() => work(controller.signal)).then(() => this.finish(op.id, 'succeeded'), error => this.finish(op.id, controller.signal.aborted ? 'cancelled' : 'failed', error)).catch(() => { }).finally(() => this.active.delete(op.id));
            this.active.set(op.id, { controller, promise });
        }
        return { operationId: op.id, entityId: op.entityId, revision: this.store.snapshot().revision };
    }
    private async finish(id: string, phase: 'succeeded' | 'failed' | 'cancelled', error?: unknown) {
        await this.store.change(state => { const op = state.operations[id]; if (!op)
            return; op.phase = phase; op.cancelable = false; op.finishedAt = Date.now(); if (error) {
            op.error = integrationMessage(error);
            op.errorCode = error instanceof IntegrationError ? error.code : phase === 'cancelled' ? 'CANCELLED' : 'INVALID_CONFIG';
        } });
    }
    async cancel(id: string): Promise<void> { const op = this.store.snapshot().operations[id]; if (!op)
        throw new IntegrationError('NOT_FOUND', '操作不存在'); if (op.cancelable)
        this.active.get(id)?.controller.abort(new IntegrationError('CANCELLED', '操作已取消')); }
    async wait(id: string): Promise<void> { await this.active.get(id)?.promise; }
    abortAll(): void { for (const op of this.active.values())
        op.controller.abort(); }
    async dispose(): Promise<void> { this.abortAll(); await Promise.allSettled([...this.active.values()].map(op => op.promise)); }
}
