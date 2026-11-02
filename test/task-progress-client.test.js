import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {patchTaskProgressClient,continueUnfinishedTask} from '../scripts/lib/task-progress-client.mjs'
import {legacyTaskResumeClient} from './fixtures/task-resume-client-v3.js'
const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
it('stops stale running glyphs and reports incomplete checklists honestly after a run ends',()=>{
 const patched=patchTaskProgressClient(source)
 expect(patchTaskProgressClient(patched)).toBe(patched)
 const start=patched.indexOf('function OdysseyTaskStatus('),end=patched.indexOf('function TodoPanel(',start)
 const glyph=runInNewContext(patched.slice(start,end)+';OdysseyTaskStatus',{react_jsx_runtime:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},PendingGlyph:'pending'})
 expect(glyph({status:'in_progress',running:false}).type).toBe('pending')
 expect(glyph({status:'in_progress',running:true}).props['data-odyssey-task-status']).toBe('in_progress')
 expect(glyph({status:'completed',running:false}).props['data-odyssey-task-status']).toBe('completed')
 expect(patched.includes('running=useSession(s=>s.running)')).toBe(true)
 expect(patched).toContain('任务尚未完成 · 可继续')
 expect(patched).toContain('data-task-continue')
})
it('only resumes after an explicit click through the native input actions without replacing a draft or attachment',()=>{
 const calls=[],inputActions={setDraft:text=>calls.push(['draft',text]),submit:()=>calls.push(['submit'])},todos=[{content:'读取资料',status:'completed'},{content:'渲染核验并交付',status:'in_progress'}],plain={phase:'plain',draft:'',imageIds:[],occurrences:[]}
 for(const input of [{...plain,draft:'用户自己的草稿'},{...plain,imageIds:['image']},{...plain,occurrences:[{id:1}]},{...plain,phase:'submitting'}])expect(continueUnfinishedTask({inputActions,input,todos,running:false})).toBe(false)
 expect(continueUnfinishedTask({inputActions,input:plain,todos,running:true})).toBe(false)
 expect(calls).toEqual([])
 expect(continueUnfinishedTask({inputActions,input:plain,todos,running:false})).toBe(true)
 expect(calls).toHaveLength(2);expect(calls[0][1]).toContain('不扩大任务范围');expect(calls[0][1]).toContain('渲染核验并交付');expect(calls[0][1]).not.toContain('读取资料');expect(calls[1]).toEqual(['submit'])
})
it('releases a synchronous submission failure without clearing or replacing its retained draft',()=>{
 let draft=''
 const inputActions={setDraft:text=>{draft=text},submit:()=>{throw Error('executor unavailable')}},input={phase:'plain',draft:'',imageIds:[],occurrences:[]},todos=[{content:'核验并交付',status:'pending'}]
 expect(continueUnfinishedTask({inputActions,input,todos,running:false})).toBe(false)
 expect(draft).toContain('核验并交付')
})
it('migrates the installed v3 dock to one measured card without changing continuation policy',()=>{
 const current=patchTaskProgressClient(source),legacy=legacyTaskResumeClient(current)
 expect(legacy).not.toContain('sherlock:task-continue-footer:v1')
 expect(patchTaskProgressClient(legacy)).toBe(current)
 expect(patchTaskProgressClient(current)).toBe(current)
 expect(current).toContain('return react_jsx_runtime.jsx(TodoPanel,{todos,running,objective,t,continuation:canContinue&&')
 expect(current).toContain('if(clicked.current||blocked)return')
 expect(current).toContain('input.draftRev!==clicked.current.revision')
})
it('fails closed on a partial or drifted footer, including an old dock with damaged panel anchors',()=>{
 const current=patchTaskProgressClient(source),legacy=legacyTaskResumeClient(current)
 expect(()=>patchTaskProgressClient(current.replace('/* sherlock:task-continue-footer:v1 */',''))).toThrow('incomplete')
 expect(()=>patchTaskProgressClient(current+'\n/* sherlock:task-continue-footer:v1 */')).toThrow('drifted')
 expect(()=>patchTaskProgressClient(current.replace("margin:0,maxWidth:'100%'","margin:0,maxWidth:'50%'"))).toThrow('drifted')
 expect(()=>patchTaskProgressClient(current.replace('if(clicked.current||blocked)return','if(blocked)return'))).toThrow('drifted')
 expect(()=>patchTaskProgressClient(legacy.replace('if(clicked.current||blocked)return','if(blocked)return'))).toThrow('anchor drifted')
 expect(()=>patchTaskProgressClient(legacy.replace('children:taskList})]','children:taskList}) /* damaged */ ]'))).toThrow('anchor drifted')
})
