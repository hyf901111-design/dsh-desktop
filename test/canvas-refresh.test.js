import {it,expect,vi} from 'vitest'
import {readFile} from 'node:fs/promises'
import {patchCanvasRefresh,refreshResearchCanvasView} from '../scripts/lib/canvas-refresh.mjs'
it('remounts local previews without changing canvas state or calling generation',async()=>{
 const remount=vi.fn(),adapter={call:vi.fn()}
 await refreshResearchCanvasView({sessionId:'s',shared:false,adapter,remount,isActive:()=>true})
 expect(remount).toHaveBeenCalledOnce();expect(adapter.call).not.toHaveBeenCalled()
})
it('flushes collaborative edits before reading latest state, then remounts',async()=>{
 const events=[],adapter={getView:()=>({permissions:{edit:true}}),flushCanvas:async()=>events.push('flush'),call:async()=>events.push('refresh')}
 await refreshResearchCanvasView({sessionId:'s',shared:true,adapter,remount:()=>events.push('remount'),isActive:()=>true})
 expect(events).toEqual(['flush','refresh','remount'])
})
it('permits readonly refresh and does not remount after switching boards',async()=>{
 let active=true
 const remount=vi.fn(),adapter={getView:()=>({permissions:{edit:false}}),flushCanvas:vi.fn(),call:async()=>{active=false}}
 await refreshResearchCanvasView({sessionId:'s',shared:true,adapter,remount,isActive:()=>active})
 expect(adapter.flushCanvas).not.toHaveBeenCalled();expect(remount).not.toHaveBeenCalled()
})
it('patches both context menus once and preserves existing menu entries',async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),once=patchCanvasRefresh(raw)
 expect(patchCanvasRefresh(once)).toBe(once)
 expect(once.match(/data-research-context-refresh/g)).toHaveLength(2)
 expect(once).toContain('data-research-context-arrange')
})
