import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { installImageHistoryNavigation } from '../scripts/lib/image-history-navigation.mjs'
import { imageHistoryMode, registerImageHistoryMode } from '../packages/dsh-research-task-runtime/image-history-mode.js'
import { patchSidebarSessionExperience } from '../scripts/lib/sidebar-session-recency.mjs'

const id = 'image-task-73b2319b-d774-413b-af4b-344a50cee0eb'
const human = mode => ({type:'user/message', data:{source:{kind:'user',clientMode:mode}}})
const board = {type:'workspace-research/title-context', data:{}}

it('uses actual human and document activity even when later tool messages dominate the history', () => {
  expect(imageHistoryMode([])).toBe('unused')
  expect(imageHistoryMode([human('image'), ...Array.from({length:100},()=>({type:'user/message',data:{source:{kind:'plugin'}}}))])).toBe('image')
  expect(imageHistoryMode([human('image'), board, human('research'), board])).toBe('other')
  expect(imageHistoryMode([human('image'), human('conversation')])).toBe('other')
  expect(imageHistoryMode([board,human('image')])).toBe('image')
  expect(imageHistoryMode([{type:'workspace-spreadsheet/edited', data:{}}])).toBe('other')
  expect(imageHistoryMode([{type:'user/message', data:{source:{kind:'user'},content:[{type:'text',text:'题目\n<odyssey-image-workspace-v1>\n{}'}]}}])).toBe('legacy')
  expect(imageHistoryMode([human(undefined),{type:'tool/call',data:{name:'image_generate'}}])).toBe('legacy-image')
})

it('returns only the mode, supports persisted history after restart and rejects subagents', async () => {
  const readFrom=vi.fn(async()=>({meta:{id},events:[human('image')]}))
  const live=vi.fn()
  let route
  const ctx={webServer:{register:r=>{route=r}},sessions:{get:live},sessionPersistence:{readFrom}}
  registerImageHistoryMode(ctx,{isTrustedRequest:()=>true,readJsonBody:async()=>({sessionId:id}),checkPrivate:async()=>{}})
  const res={writeHead:vi.fn(),end:vi.fn()}
  await route.handler({method:'POST'},res)
  expect(readFrom).toHaveBeenCalledWith(id,0)
  expect(JSON.parse(res.end.mock.lastCall[0])).toEqual({mode:'image'})
  live.mockReturnValue({header:{parentSession:'parent'},events:[]})
  await route.handler({method:'POST'},res)
  expect(res.writeHead.mock.lastCall[0]).toBe(404)
})

function fixture({mode='unused',canvas=true,tab={scope:id,title:'主动有章法'},view='chat'}={}) {
  const win=new Window(),doc=win.document
  let current=id
  const sessions={list:{getSnapshot:()=>({current})},create:vi.fn(),open:vi.fn()}
  const storage={read:vi.fn(async()=>({epoch:12,tabs:tab?[tab]:[]})),hasCanvas:vi.fn(async()=>canvas)}
  const fetch=vi.spyOn(win,'fetch').mockResolvedValue({ok:true,json:async()=>({mode})})
  const restored=vi.fn();doc.addEventListener('sherlock:image-factory-restore-history',e=>restored(e.detail.sessionId))
  const off=installImageHistoryNavigation({doc,win,storage,sessions,isBoardOnly:()=>false,viewFor:()=>view})
  const pick=(event='sherlock:search-session-opened')=>doc.dispatchEvent(new win.CustomEvent(event,{detail:{sessionId:id}}))
  return {win,doc,pick,restored,storage,fetch,sessions,change:()=>{current='other'},close:async()=>{off();await win.happyDOM.abort()}}
}
it.each([
 ['sherlock:search-session-opened','unused',true],
 ['sherlock:history-session-selected','image',false],
])('restores the exact selected session on %s without creating or reselecting a new task',async(event,mode,canvas)=>{
 const f=fixture({mode,canvas})
 try {
  f.pick(event)
  await vi.waitFor(()=>expect(f.restored).toHaveBeenCalledExactlyOnceWith(id))
  expect(f.sessions.create).not.toHaveBeenCalled()
  expect(f.sessions.open).not.toHaveBeenCalled()
 } finally {await f.close()}
})
it.each([{mode:'other'},{view:'research'},{tab:{scope:id,temporary:true}}])('preserves the current view of repurposed or temporary tasks',async options=>{
 const f=fixture(options)
 try {f.pick();await new Promise(resolve=>setTimeout(resolve,5));expect(f.restored).not.toHaveBeenCalled()}finally{await f.close()}
})
it('ignores stale responses after another sidebar selection or workspace application opens',async()=>{
 const f=fixture()
 try {
  let done;f.fetch.mockImplementation(()=>new Promise(resolve=>{done=resolve}))
  f.pick()
  await vi.waitFor(()=>expect(done).toBeTypeOf('function'))
  f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:workspace-surface-change'))
  done({ok:true,json:async()=>({mode:'image'})})
  await Promise.resolve();await Promise.resolve()
  expect(f.restored).not.toHaveBeenCalled()
 }finally{await f.close()}
})
it('patches the real SDK workspace row without changing programmatic opens or adding duplicate listeners',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8')
 const installed=patchSidebarSessionExperience(source)
 expect(installed).toContain('open: (sessionId) => {\n\t\t\t\t\tctx.sessions.open(sessionId);\ndocument.dispatchEvent(new CustomEvent("sherlock:history-session-selected"')
 expect(patchSidebarSessionExperience(installed)).toBe(installed)
})

it('shares only permission to sync the requested current title of a personal image tab',async()=>{
 const events=[{seq:4,type:'session/title',data:{title:'主动有章法',messageSeqs:[],source:{kind:'fallback'}}},
  {...human('conversation'),seq:10},{seq:22,type:'session/title',data:{title:'讨论实际主题',messageSeqs:[10],source:{kind:'fallback'}}}]
 let handler,expectedTitle='讨论实际主题';const end=vi.fn()
 registerImageHistoryMode({sessions:{get:()=>({events,header:{}})},webServer:{register:r=>{handler=r.handler}}},
  {isTrustedRequest:()=>true,readJsonBody:async()=>({sessionId:id,expectedTitle}),checkPrivate:async()=>{}})
 const read=async()=>{await handler({method:'POST'},{writeHead:vi.fn(),end});return JSON.parse(end.mock.lastCall[0])}
 expect(await read()).toEqual({syncTitle:false})
 events.at(-1).data.source.kind='provider';expect(await read()).toEqual({syncTitle:false})
 events[1].data.source.clientMode='image';expect(await read()).toEqual({syncTitle:true})
 events[1].data.source.clientMode='conversation';events.at(-1).data.source.kind='user';expect(await read()).toEqual({syncTitle:true})
 events.push({seq:37,type:'workspace-research/title-context',data:{components:[]}},
  {seq:38,type:'session/title',data:{title:'讨论实际主题',messageSeqs:[37],source:{kind:'fallback'}}})
 expect(await read()).toEqual({syncTitle:false})
 expectedTitle='过期的已显示标题';expect(await read()).toEqual({syncTitle:false})
})
