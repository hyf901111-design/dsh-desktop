import {expect,it,vi} from 'vitest'
import {createPendingComposerPreferences,installPendingPresetFlush,patchPendingPresetClient} from '../scripts/lib/pending-composer-preferences.mjs'
import {readFileSync} from 'node:fs'
it('loads the native model catalog and defaults without a session, stages choices, and applies only after creation',async()=>{
 const models=vi.fn(async()=>({result:{ok:true,value:{groups:[{id:'p',name:'模型服务',models:[{id:'m',name:'模型'}]}],failures:[]}}})),describe=vi.fn(async()=>({result:{ok:true,value:{namespaces:[{ns:'agent-default-model',value:{provider:'p',model:'m'}}]}}})),selectModel=vi.fn(async()=>({result:{ok:true}})),api={llm:{models},settings:{describe},sessions:{selectModel}};
 const p=createPendingComposerPreferences({api});await p.model.load();expect(p.model.store.getSnapshot().current).toEqual({provider:'p',model:'m'});await p.model.select({provider:'p',model:'m',reasoningEffort:'high'});expect(selectModel).not.toHaveBeenCalled();await p.apply('created');expect(selectModel).toHaveBeenCalledWith({sessionId:'created',provider:'p',model:'m',reasoningEffort:'high'});
})
it('persists the pending composer permission without needing a session and surfaces failures',async()=>{
 let preset='company-read'
 const savePermission=vi.fn(async value=>{preset=value})
 const api={llm:{models:async()=>({result:{ok:true,value:{groups:[],failures:[]}}})},settings:{describe:async()=>({result:{ok:true,value:{namespaces:[{ns:'permission',value:{defaultPreset:preset}}]}}})}}
 const p=createPendingComposerPreferences({api,savePermission,permissionOptions:()=>[{value:'company-read',name:'公司只读'},{value:'company-edit',name:'公司编辑'}]})
 await p.model.load()
 await p.setPermission('company-edit')
 expect(p.model.store.getSnapshot().permissions.currentValue).toBe('company-edit')
 await expect(p.setPermission('unknown')).rejects.toThrow('权限选项已变化')
 savePermission.mockRejectedValueOnce(Error('权限应用失败'))
 await expect(p.setPermission('company-read')).rejects.toThrow('权限应用失败')
 expect(p.model.store.getSnapshot().permissions.currentValue).toBe('company-edit')
 await p.apply('new')
 expect(savePermission).toHaveBeenCalledTimes(2)
})
it('upgrades the shipped preset bridge idempotently', () => {
 const raw = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js', 'utf8')
 const patched = patchPendingPresetClient(raw)
 expect(patchPendingPresetClient(patched)).toBe(patched)
 expect(patched).not.toContain('native-pending-preset-flush:v1')
 expect(patched).toContain('native-pending-preset-flush:v2')
 expect(() => new Function(patched)).not.toThrow()
})
it('awaits a pending preset even when a sessionless notification applied first', async () => {
 let current
 const apply = vi.fn(async () => { if (current) seat.staged = undefined })
 const seat = { apply, staged: 'build' }
 const scope = { sessions: { list: { getSnapshot: () => ({ current }) } }, effect: fn => fn(), on: () => () => {} }
 const win = {}
 installPendingPresetFlush(seat, scope, win)
 const sessionless = seat.apply()
 current = 'created'
 await win[Symbol.for('sherlock:pending-preset-flush')](current)
 await sessionless
 expect(seat.staged).toBeUndefined()
 expect(apply).toHaveBeenCalledTimes(2)
})
