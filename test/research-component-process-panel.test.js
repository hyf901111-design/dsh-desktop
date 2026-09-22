import {it,expect,vi} from 'vitest'
import {openComponentProcess} from '../scripts/lib/figma-subagent-panel.mjs'
it('opens the exact current child from its real parent catalog in the right panel',async()=>{
 const sessions={refreshSubagents:vi.fn(async()=>{}),list:{getSnapshot:()=>({subagentsByParent:{parent:{entries:[{kind:'child',id:'old',mode:'one-shot'},{kind:'child',id:'retry',mode:'persistent'}]}}})},openSubagentPanel:vi.fn()}
 await openComponentProcess(sessions,'parent','retry')
 expect(sessions.refreshSubagents).toHaveBeenCalledWith('parent')
 expect(sessions.openSubagentPanel).toHaveBeenCalledExactlyOnceWith({parentSessionId:'parent',childSessionId:'retry',mode:'persistent'})
 await expect(openComponentProcess(sessions,'other','retry')).rejects.toThrow('未找到')
 expect(sessions.openSubagentPanel).toHaveBeenCalledTimes(1)
})
