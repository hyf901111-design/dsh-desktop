import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {patchTaskProgressClient} from '../scripts/lib/task-progress-client.mjs'
const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
it('stops stale running glyphs and reports incomplete checklists honestly after a run ends',()=>{
 const patched=patchTaskProgressClient(source)
 expect(patchTaskProgressClient(patched)).toBe(patched)
 const start=patched.indexOf('function OdysseyTaskStatus('),end=patched.indexOf('function TodoPanel(',start)
 const glyph=runInNewContext(patched.slice(start,end)+';OdysseyTaskStatus',{react_jsx_runtime:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},PendingGlyph:'pending'})
 expect(glyph({status:'in_progress',running:false}).type).toBe('pending')
 expect(glyph({status:'in_progress',running:true}).props['data-odyssey-task-status']).toBe('in_progress')
 expect(glyph({status:'completed',running:false}).props['data-odyssey-task-status']).toBe('completed')
 expect(patched).toContain('running: useSession(s=>s.running)')
 expect(patched).toContain('本轮已结束 · 清单待核对')
})
