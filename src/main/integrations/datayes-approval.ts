import type { Connection, ToolBinding } from '../../shared/integrations'

const DATAYES_TOOLS = new Set([
  'ai_search', 'reportdata_search', 'meeting_search', 'announcement_search',
  'search_api', 'get_catalog', 'get_api_info', 'call_api',
  'macro_industry_data', 'cite_link'
])

/** The user's connection-level grant covers the ten known DataYes data tools. */
export function maySkipDataYesToolPrompt(tool: ToolBinding, connection: Connection): boolean {
  if (connection.kind !== 'mcp' || connection.config.type !== 'mcp' ||
      connection.config.transport !== 'http' || !connection.config.url ||
      !connection.enabled || connection.authState !== 'connected' ||
      tool.connectionId !== connection.id || !connection.toolGrants.includes(tool.id) ||
      !DATAYES_TOOLS.has(tool.rawName ?? tool.operationId)) return false
  try {
    const url = new URL(connection.config.url)
    return url.protocol === 'https:' && url.hostname === 'gw.datayes.com' &&
      url.pathname === '/rwtracker/datayes-mcp' && !url.search && !url.hash
  } catch { return false }
}
