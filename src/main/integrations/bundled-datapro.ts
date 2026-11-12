import { createHash } from 'node:crypto'
import tools from '../../../config/datapro-builtin-tools.json'
import type { Connection } from '../../shared/integrations'

export const DATAPRO_GATEWAY = 'https://updates.evanarts.com/v1/datapro/mcp'
export const DATAPRO_TOOLS = tools.map(tool => ({ ...tool, effect: 'read' as const }))
export const isBundledDataproId = (id: unknown): id is string =>
  typeof id === 'string' && /^builtin:datapro-mcp:[a-f0-9]{16}$/.test(id)

export interface BundledDataproOptions {
  request(body: string, signal: AbortSignal): Promise<Response>
  authenticated(): boolean
}

export function bundledDataproConnection(owner: string, authenticated: boolean): Connection {
  const config = {
    type: 'mcp' as const, transport: 'http' as const, url: DATAPRO_GATEWAY,
    auth: { type: 'none' as const }, network: { allowedOrigins: [new URL(DATAPRO_GATEWAY).origin] }
  }
  const now = Date.now()
  return {
    id: 'builtin:datapro-mcp:' + createHash('sha256').update(owner).digest('hex').slice(0, 16),
    name: '火山方舟专业数据集', providerId: 'datapro', kind: 'mcp', ownerAccountId: owner,
    config, configDigest: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
    enabled: true, revision: 1, authState: authenticated ? 'connected' : 'unconfigured', health: 'unknown',
    workspaceGrant: { mode: 'all-owned', ownerAccountId: owner }, toolGrants: [], deniedToolIds: [],
    unattendedToolGrants: [], createdAt: now, updatedAt: now
  }
}

export function bundledDataproToolEffect(connection: Connection, name: string): 'read' | 'unknown' {
  const expected = bundledDataproConnection(connection.ownerAccountId, true)
  return connection.id === expected.id && connection.providerId === expected.providerId &&
    connection.configDigest === expected.configDigest && JSON.stringify(connection.config) === JSON.stringify(expected.config) &&
    DATAPRO_TOOLS.some(tool => tool.name === name) ? 'read' : 'unknown'
}
