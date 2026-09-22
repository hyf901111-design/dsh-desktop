import { expect, it } from 'vitest'
import { resolveIntegrationContext } from '../src/main/integrations/context'
import type { CapabilityContext } from '../src/shared/integrations'
import type { ScheduledTask } from '../src/shared/scheduled-tasks'
const context: CapabilityContext = { ownerAccountId: 'owner', sessionId: 'child', rootSessionId: 'root', workspaceId: 'workspace', unattended: false, runtimeEpoch: 'epoch' }
const workspaces = async () => [{ workspaceId: 'workspace', path: '/workspace' }]
const sessions = async () => [{ sessionId: 'root', cwd: '/workspace' }, { sessionId: 'child', cwd: '/workspace', origin: 'subagent', parentSessionId: 'root' }]
it('derives unattended privileges from the scheduler despite a false incoming flag', async () => {
  const task = { id: 'task', sessionId: 'root', runs: [], integrationBindings: [] } as unknown as ScheduledTask
  expect(await resolveIntegrationContext(context, { ownerId: 'owner', tasks: [task], workspaces, sessions })).toMatchObject({ unattended: true, taskId: 'task', taskBindings: [] })
})
it('strips forged task grants and rejects a different owner or missing workspace', async () => {
  const resolved = await resolveIntegrationContext({ ...context, unattended: true, taskId: 'forged', taskBindings: [] }, { ownerId: 'owner', tasks: [], workspaces, sessions })
  expect(resolved).toMatchObject({ unattended: false, taskId: undefined, taskBindings: undefined })
  await expect(resolveIntegrationContext(context, { ownerId: 'other', tasks: [], workspaces, sessions })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  await expect(resolveIntegrationContext(context, { ownerId: 'owner', tasks: [], workspaces: async () => [], sessions })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
})

it('rejects forged sessions, unrelated workspaces and forged root identities', async () => {
  const options = { ownerId: 'owner', tasks: [], workspaces, sessions }
  await expect(resolveIntegrationContext({ ...context, sessionId: 'never-existed' }, options)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  await expect(resolveIntegrationContext({ ...context, rootSessionId: 'child' }, options)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  await expect(resolveIntegrationContext(context, { ...options, workspaces: async () => [{workspaceId:'workspace', path:'/other'}] })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
})
