import { expect, it } from 'vitest'
import { maySkipDataYesToolPrompt } from '../src/main/integrations/datayes-approval'

const connection = {
  id: 'data-yes', kind: 'mcp', enabled: true, authState: 'connected',
  config: { type: 'mcp', transport: 'http', url: 'https://gw.datayes.com/rwtracker/datayes-mcp' },
  toolGrants: ['search-tool']
} as any
const tool = { id: 'search-tool', connectionId: 'data-yes', operationId: 'search_api' } as any

it('uses the existing DataYes grant without a second per-call prompt', () => {
  expect(maySkipDataYesToolPrompt(tool, connection)).toBe(true)
})

it('does not bypass prompts for ungranted, disabled, or unrelated MCP tools', () => {
  expect(maySkipDataYesToolPrompt({ ...tool, id: 'other' }, connection)).toBe(false)
  expect(maySkipDataYesToolPrompt(tool, { ...connection, enabled: false })).toBe(false)
  expect(maySkipDataYesToolPrompt(tool, { ...connection, config: { ...connection.config, url: 'https://other.example/mcp' } })).toBe(false)
  expect(maySkipDataYesToolPrompt({ ...tool, operationId: 'delete_all' }, connection)).toBe(false)
})
