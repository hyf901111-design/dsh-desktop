import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {patchSessionRunningActivity,reconcileRunningSessions} from '../scripts/lib/session-running-activity.mjs'

function fixture(rows){
 const list=vi.fn(async()=>({result:{ok:true,value:{items:rows}}}))
 const handleRunning=vi.fn()
 const manager={summaries:[{sessionId:'parent',running:false},{sessionId:'old',parentSessionId:'parent',running:true},{sessionId:'active',running:true},{sessionId:'renewed',running:true}],api:{sessions:{list}},sessions:new Map([['old',{handleRunning}]]),updateCatalogActivity:vi.fn(),recordMutation:vi.fn()}
 return {manager,list,handleRunning}
}
it('clears only a stale local running state and keeps unrelated active work and a newer stream event',async()=>{
 const f=fixture([{sessionId:'active',running:true},{sessionId:'renewed',running:false}])
 const pending=reconcileRunningSessions(f.manager)
 f.manager.activityReconciliation.add('renewed')
 await reconcileRunningSessions(f.manager)
 await pending
 expect(f.list).toHaveBeenCalledExactlyOnceWith({activitySessionIds:['old','active','renewed']},undefined)
 expect(f.manager.recordMutation).toHaveBeenCalledExactlyOnceWith({kind:'status',sessionId:'old',running:false})
 expect(f.handleRunning).toHaveBeenCalledExactlyOnceWith(false)
 expect(f.manager.updateCatalogActivity).toHaveBeenCalledExactlyOnceWith('old',false)
})
it('does not turn a disconnected request into a false completion',async()=>{
 const f=fixture([]),controller=new AbortController()
 const pending=reconcileRunningSessions(f.manager,controller.signal);controller.abort();await pending
 expect(f.manager.recordMutation).not.toHaveBeenCalled()
 f.list.mockRejectedValueOnce(Error('disconnected'));await reconcileRunningSessions(f.manager)
 expect(f.manager.recordMutation).not.toHaveBeenCalled()
})
it('installs the scoped reconciler once with the native activity frame guard',()=>{
 const source=patchSessionRunningActivity(readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'))
 expect(patchSessionRunningActivity(source)).toBe(source)
 expect(source).toContain('this.activityReconciliation?.add(frame.sessionId)')
})
