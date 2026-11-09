import {expect,it,vi} from 'vitest'
import {routeBrowserUse} from '../src/main/browser/route'
it('keeps other sessions on their original browser and binds explicit page edits to the application',async()=>{
 const signal=new AbortController().signal,app={ownsSession:(id:unknown)=>id==='B',agent:vi.fn(async()=> 'app')},legacy=vi.fn(async()=> 'legacy')
 expect(await routeBrowserUse({sessionId:'A',op:'observe'},signal,app,legacy)).toBe('legacy')
 expect(await routeBrowserUse({sessionId:'B',op:'observe'},signal,app,legacy)).toBe('app')
 expect(await routeBrowserUse({sessionId:'A',op:'edit'},signal,app,legacy)).toBe('app')
 expect(await routeBrowserUse({sessionId:'A',op:'click',tabId:'old-tab'},signal,app,legacy)).toBe('app')
 expect(legacy).toHaveBeenCalledTimes(1)
})
