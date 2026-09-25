import type { Connection, ToolBinding } from '../../shared/integrations'

/** Per-call prompts add no consent when this exact tool already has an active grant. */
export function maySkipGrantedToolPrompt(tool: ToolBinding, connection: Connection): boolean {
  return connection.enabled && connection.authState === 'connected' && tool.enabled &&
    tool.connectionId === connection.id && connection.toolGrants.includes(tool.id)
}
