import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { IntegrationError, type ToolCall } from '../../shared/integrations';
type BridgeService = {
    runtimeSnapshot(): unknown;
    reportPluginStatus?(input: unknown): unknown;
    execute(call: ToolCall, signal: AbortSignal): Promise<unknown>;
    readSkill(input: any): Promise<unknown>;
};
export async function startIntegrationBridge(service: BridgeService): Promise<{
    url: string;
    token: string;
    dispose(): Promise<void>;
}> {
    const token = randomBytes(32).toString('hex'), controllers = new Set<AbortController>();
    const server: Server = createServer(async (request, response) => {
        const supplied = Buffer.from(request.headers.authorization?.replace(/^Bearer /, '') ?? ''), expected = Buffer.from(token);
        const respond = (status: number, value: unknown) => { if (!response.destroyed) {
            response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            response.end(JSON.stringify(value));
        } };
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            respond(401, { error: 'Unauthorized' });
            return;
        }
        if (request.headers.origin) {
            respond(403, { error: 'Forbidden' });
            return;
        }
        const controller = new AbortController();
        controllers.add(controller);
        response.on('close', () => { if (!response.writableEnded)
            controller.abort(); });
        try {
            const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
            if (request.method === 'GET' && pathname === '/snapshot') {
                respond(200, service.runtimeSnapshot());
                return;
            }
            if (request.method !== 'POST' || !['/execute', '/skills/read', '/plugins/status'].includes(pathname)) {
                respond(404, { error: 'Not found' });
                return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                size += chunk.length;
                if (size > 1024 * 1024) {
                    respond(413, { error: 'Request too large' });
                    request.destroy();
                    return;
                }
                chunks.push(Buffer.from(chunk));
            }
            let input: unknown;
            try {
                input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            catch {
                respond(400, { error: 'Invalid JSON' });
                return;
            }
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                respond(400, { error: 'Invalid request' });
                return;
            }
            const result = pathname === '/plugins/status' ? await service.reportPluginStatus?.(input) : pathname === '/execute' ? await service.execute(input as ToolCall, controller.signal) : await service.readSkill(input);
            respond(200, result);
        }
        catch (error) {
            respond(error instanceof IntegrationError && error.code === 'ACCESS_DENIED' ? 403 : 400, { error: error instanceof IntegrationError ? error.message : '集成调用未完成', code: error instanceof IntegrationError ? error.code : 'INVALID_CONFIG' });
        }
        finally {
            controllers.delete(controller);
        }
    });
    server.requestTimeout = 70000;
    server.headersTimeout = 10000;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token, async dispose() { for (const controller of controllers)
            controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
