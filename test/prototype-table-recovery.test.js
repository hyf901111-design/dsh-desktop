import {expect,it,vi} from 'vitest'
import {recoverPrototypeTable} from '../packages/dsh-research-task-runtime/prototype-table-recovery.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchSourcePolicy} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'

const file='/Users/user/Downloads/原型.html',request='根据 '+file+' 创建运营工作台。'
const options={panelType:'table',title:'完整产品',panelRequest:'显示 DATA.products 全部244只产品的完整明细。',workbenchRequest:{originalRequest:request,dataMode:'source'}}
const rows=Array.from({length:244},(_,i)=>({code:String(i).padStart(5,'0'),name:i===243?'末条产品':'原始产品'+i,flow:i===243?-0.1137:i/100,selected:false}))
const record={tool:'read_prototype',args:{file_path:file,section:'DATA.products',limit:500},response:{path:file,section:'DATA.products',offset:1,total:244,rows}}

it('materializes all observed scalar fields without row transcription, guessed labels, data queries or refreshing',()=>{
 const saved=JSON.stringify(record),result=recoverPrototypeTable([record],options)
 expect(result.data.columns).toEqual(['code','name','flow','selected'])
 expect(result.data.rows).toHaveLength(244)
 expect(result.data.rows.at(-1)).toEqual(['00243','末条产品','-0.1137','false'])
 expect(result.data.note).toContain('尚未完成')
 expect(JSON.parse(result.output).type).toBe('html')
 expect(result).not.toHaveProperty('recipe')
 expect(JSON.stringify(record)).toBe(saved)
})
it('does not convert unsupported, scoped, unobserved, incomplete or ambiguous data into a completed table',()=>{
 for(const changes of [{panelType:'html'},{panelRequest:'仅显示前3条产品'},{panelRequest:'全部3条 DATA.products'},{workbenchRequest:{originalRequest:'创建一个表格',dataMode:'source'}}])expect(recoverPrototypeTable([record],{...options,...changes})).toBeNull()
 for(const change of [{tool:'read'}, {args:{...record.args,file_path:'/private/other.html'}},{response:{...record.response,rows:rows.slice(0,3)}},{response:{...record.response,offset:2}},{response:{...record.response,nextOffset:245}},{response:{...record.response,rows:rows.map(row=>({...row,nested:{private:'do not drop'}}))}}])expect(recoverPrototypeTable([{...record,...change}],options)).toBeNull()
 const second={...record,args:{...record.args,section:'DATA.other'},response:{...record.response,section:'DATA.other'}}
 expect(recoverPrototypeTable([record,second],{...options,panelRequest:options.panelRequest+' DATA.other'})).toBeNull()
})
it('recovers the complete source at the real runtime after the first invalid output instead of launching repeated format repairs',async()=>{
 const plan=validateWorkbench({requestId:'recover',title:'运营工作台',dataMode:'source',originalRequest:request,panels:[{title:options.title,type:'table',size:'large',prompt:options.panelRequest}]}),panel=plan.panels[0]
 const start=vi.fn(async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:'244条记录已读取，请继续输出。'}],sourceRecords:[record]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,panel)},{sourceRequirement:panel.prompt,sourcePolicy:workbenchSourcePolicy(request,panel),workbenchRequest:options.workbenchRequest})
  await vi.waitFor(()=>expect(runtime.tasks.get(receipt.taskId)?.state).toBe('completed'))
  const output=runtime.tasks.get(receipt.taskId).finalOutput
  expect(output).toContain('末条产品');expect(output).toContain('尚未完成');expect(start).toHaveBeenCalledTimes(1)
  expect(output).not.toContain('请继续输出')
 }finally{await runtime.dispose()}
})
