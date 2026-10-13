import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installNotesService } from '../src/main/notes/service'

vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const roots: string[] = []
afterEach(() => {roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));vi.unstubAllGlobals()})
function service(base?:string) {
  const root = mkdtempSync(join(tmpdir(), 'ework-note-ipc-')); roots.push(root)
  const progress:any[]=[]
  const window = { isDestroyed: () => false, webContents: { mainFrame: { processId: 1, routingId: 2 },send:(channel:string,value:any)=>progress.push({channel,value}) } }
  let handler: any, owner = 'alice', allowed = true
  const dispose = installNotesService({ ipcMain: { handle: (_channel: string, fn: any) => { handler = fn }, removeHandler: () => {} }, root, getWindow: () => window, owner: () => owner, canRead: () => allowed, runtimeUrl: () => base, clipboard: () => undefined })
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  return { call: (method: string, input: any = {}) => handler(event, method, { sessionId: 'session', owner, ...input }), handler: () => handler, event, progress,changeOwner: () => { owner = 'bob' }, deny: () => { allowed = false }, dispose }
}
it('relays progress to the trusted request and separates it from the final document result',async()=>{
 const s=service('http://127.0.0.1:9999'),wire=[{type:'progress',stage:'thinking',reasoning:'先整理段落。',outputChars:0},{type:'result',result:{kind:'text',markdown:'结果正文'}}].map(v=>JSON.stringify(v)+'\n').join('')
 vi.stubGlobal('fetch',async()=>new Response(wire))
 expect(await s.call('generate',{requestId:'r',markdown:'正文',prompt:'写作',selection:''})).toEqual({kind:'text',markdown:'结果正文'})
 expect(s.progress).toEqual([{channel:'notes:progress',value:{sessionId:'session',requestId:'r',owner:'alice',stage:'thinking',reasoning:'先整理段落。',outputChars:0}}]);s.dispose()
})
it('does not forward a previous account’s progress after identity changes',async()=>{
 const s=service('http://127.0.0.1:9999')
 vi.stubGlobal('fetch',async()=>{s.changeOwner();return new Response(JSON.stringify({type:'progress',stage:'thinking',reasoning:'旧账号内容',outputChars:0})+'\n'+JSON.stringify({type:'result',result:{kind:'text',markdown:'旧结果'}})+'\n')})
 await expect(s.call('generate',{requestId:'r'})).rejects.toThrow('账号已变化');expect(s.progress).toEqual([]);s.dispose()
})
it('refuses child frames and sessions unavailable to the account', async () => {
  const s = service()
  expect(() => s.handler()({ ...s.event, senderFrame: { processId: 1, routingId: 3 } }, 'load', { sessionId: 'session' })).toThrow('main EWork')
  s.deny(); await expect(s.call('load')).rejects.toThrow('不可用')
})
it('rejects writes from an earlier account and keeps account notes separate', async () => {
  const s = service(), content = { title: 'A', blocks: [], yjs: '' }
  await s.call('save', { revision: 0, content, clientId: 'client' })
  s.changeOwner()
  await expect(s.call('save', { owner: 'alice', revision: 1, content })).rejects.toThrow('账号已变化')
  expect((await s.call('load')).saved.title).toBe('')
})
it('renders a native line chart with its real data and SVG instead of a blank block', async () => {
  const result = await service().call('render', { spec: { version: 1, type: 'chart', title: '测试', variant: 'line', labels: ['一月', '二月'], series: [{ name: '收入', values: [10, 20] }] } })
  expect(result.html).toContain('<svg')
  expect(result.html).toContain('收入')
  expect(result.html).toContain('二月')
})
it('renders a native table and escapes supplied cell markup', async () => {
  const result = await service().call('render', { spec: { version: 1, type: 'table', title: '比较', columns: ['项目', '值'], rows: [['<script>unsafe</script>', 0], ['B', -5]] } })
  expect(result.html).toContain('<table')
  expect(result.html).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
  expect(result.html).toContain('-5')
})
