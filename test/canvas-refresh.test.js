import {it,expect,vi} from 'vitest'
import {readFile} from 'node:fs/promises'
import {patchCanvasRefresh,refreshResearchCanvasView} from '../scripts/lib/canvas-refresh.mjs'
it('remounts local previews without changing canvas state or calling generation',async()=>{
 const remount=vi.fn(),adapter={call:vi.fn()}
 await refreshResearchCanvasView({sessionId:'s',shared:false,adapter,remount,isActive:()=>true})
 expect(remount).toHaveBeenCalledOnce();expect(adapter.call).not.toHaveBeenCalled()
})
it('refreshes the current shared board and remounts only after successful sync',async()=>{
 const events=[],adapter={refreshCanvas:async id=>events.push('refresh '+id)}
 await refreshResearchCanvasView({sessionId:'s',shared:true,adapter,remount:()=>events.push('remount'),isActive:()=>true})
 expect(events).toEqual(['refresh s','remount'])
})
it('permits readonly refresh and does not remount after switching boards',async()=>{
 let active=true
 const remount=vi.fn(),adapter={refreshCanvas:vi.fn(async()=>{active=false})}
 await refreshResearchCanvasView({sessionId:'s',shared:true,adapter,remount,isActive:()=>active})
 expect(adapter.refreshCanvas).toHaveBeenCalledWith('s');expect(remount).not.toHaveBeenCalled()
})
it('patches both context menus once and preserves existing menu entries',async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),once=patchCanvasRefresh(raw)
 expect(patchCanvasRefresh(once)).toBe(once)
 const legacy=once.replace('await adapter.refreshCanvas(sessionId);',"await adapter.call('boards.refresh');")
 expect(patchCanvasRefresh(legacy)).toBe(once)
 expect(once.match(/data-research-context-refresh/g)).toHaveLength(2)
 expect(once).toContain('data-research-context-arrange')
})
it('restores refresh helper after the layout patch regenerates pre-canvas helpers',async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const once=patchCanvasRefresh(raw)
 const stripped=once.replace('/* odyssey:canvas-refresh:v1 */','').replace(/async function refreshResearchCanvasView[\s\S]*?\n}/,'')
 const restored=patchCanvasRefresh(stripped)
 expect(restored.match(/async function refreshResearchCanvasView/g)).toHaveLength(1)
 expect(restored.match(/const \[canvasRefreshEpoch/g)).toHaveLength(1)
 expect(restored.match(/data-research-context-refresh/g)).toHaveLength(2)
})
