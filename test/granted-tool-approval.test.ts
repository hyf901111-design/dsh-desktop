import { expect, it } from 'vitest'
import { maySkipGrantedToolPrompt } from '../src/main/integrations/granted-tool-approval'

const connection = {
  id: 'configured', kind: 'mcp', enabled: true, authState: 'connected',
  toolGrants: ['search-tool', 'write-tool']
} as any
const tool = { id: 'search-tool', connectionId: 'configured', operationId: 'search_api', enabled: true } as any

it('reuses explicit grants for user-configured tools, including unknown-effect tools', () => {
  expect(maySkipGrantedToolPrompt(tool, connection)).toBe(true)
  expect(maySkipGrantedToolPrompt({ ...tool, id: 'write-tool', operationId: 'create_event' }, connection)).toBe(true)
  expect(maySkipGrantedToolPrompt(tool, { ...connection, kind: 'app' })).toBe(true)
})

it('does not bypass missing or stale grants', () => {
  expect(maySkipGrantedToolPrompt({ ...tool, id: 'other' }, connection)).toBe(false)
  expect(maySkipGrantedToolPrompt(tool, { ...connection, enabled: false })).toBe(false)
  expect(maySkipGrantedToolPrompt(tool, { ...connection, authState: 'revoked' })).toBe(false)
  expect(maySkipGrantedToolPrompt({ ...tool, enabled: false }, connection)).toBe(false)
  expect(maySkipGrantedToolPrompt({ ...tool, connectionId: 'other' }, connection)).toBe(false)
})
