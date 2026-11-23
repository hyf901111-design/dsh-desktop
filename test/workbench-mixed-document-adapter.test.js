import {expect,it,vi} from 'vitest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {zipSync,strToU8} from 'fflate'
import {createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'

import {workbenchCreationRequest} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {workbenchSourceText} from '../packages/dsh-research-task-runtime/workbench-prototype-evidence.js'

it.each([[false,'docx'],[true,'docx'],[false,'md'],[true,'md']])('混合=%s 的真实 %s 附件正文和网络权限分别传给子任务',async(mixed,extension)=>{
 const dir=await mkdtemp(join(tmpdir(),'ework-mixed-document-')),file=join(dir,'report.'+extension)
 await writeFile(file,extension==='md'?'正文中的真实部门与核查日期':zipSync({'word/document.xml':strToU8('<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>正文中的真实部门与核查日期</w:t></w:r></w:p></w:body></w:document>')}))
 const parent={id:'parent',session:{events:[]}},child={id:'child',session:{events:[]}},resolve=Promise.withResolvers()
 const ctx={agents:{get:()=>parent},tools:{schemas:()=>[{name:'web_fetch'},{name:'web_search'},{name:'read'},{name:'run_code'}]},subagents:{start:vi.fn(async()=>({id:'child',localAgent:child,result:resolve.promise,dispose:async()=>{}}))},on:()=>()=>{}}
 const intent=(mixed?'使用附件做看板，再从官网补充职责':'只使用附件做看板')
 const attached='📎 文件：`'+file+'`'
 const turn=(id,text)=>({type:'user/message',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text}]}})
 parent.session.events=extension==='md'?[turn('first',attached),turn('second','\uFFFC 根据这个文档，'+intent)]:[turn('first',intent+'。 '+attached)]
 const request=workbenchSourceText(parent.session,workbenchCreationRequest(parent.session))
 const query=workbenchPanelPrompt({title:'研究台',dataMode:'source',originalRequest:request},{title:'职责说明',type:'markdown',size:'medium',prompt:'按原始来源整理机构职责'})
 const adapter=createSubagentAdapter(ctx)
 let handle
 try{
  handle=await adapter.start({parentSessionId:'parent',kind:'container',query,prompt:query,hostContext:{workbenchRequest:{originalRequest:request,dataMode:'source'}},signal:new AbortController().signal,onSessionEvent(){}})
  const args=ctx.subagents.start.mock.calls[0][1],text=typeof args.prompt==='string'?args.prompt:args.prompt.filter(p=>p.type==='text').map(p=>p.text).join('\n')
  expect(text).toContain('正文中的真实部门与核查日期')
  expect(args.toolFilter.allow.includes('web_fetch')).toBe(mixed)
  expect(args.toolFilter.allow).not.toContain('run_code')
  resolve.resolve({stopReason:'completed',output:[]})
  const result=await handle.result
  expect(result.documentExclusive).toBe(!mixed)
  expect(result.documentEvidence[0].blocks[0].text).toBe('正文中的真实部门与核查日期')
 }finally{await handle?.dispose();await adapter.dispose();await rm(dir,{recursive:true,force:true})}
})
