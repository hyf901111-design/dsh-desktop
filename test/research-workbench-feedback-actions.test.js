import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {componentDataStatusDefinitions} from '../scripts/lib/component-data-status.mjs'
import {publishResearchWorkbenchProgress} from '../scripts/lib/research-workbench-feedback.mjs'

const original=restoreResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const source=patchResearchCreationProgress(original)
const start=source.search(/\/\* ework:workbench-feedback:v\d+ \*\//),end=source.indexOf('const ExecutionStatusGroup =',start)
const plans=[{id:'plan',count:4}]
const card=(id,status)=>({id,workbenchId:'plan',generationTaskId:'task-'+id,generationStatus:status,...(status==='completed'?{containerSpec:{type:'html',html:'PRIVATE BODY'}}:{})})
function fixture(statuses,english=false){
 const target=new EventTarget()
 const snapshot=publishResearchWorkbenchProgress(target,'session',statuses.map((s,i)=>card('node-'+i,s)),true,true)
 const api=runInNewContext(componentDataStatusDefinitions()+source.slice(start,end)+`;({Component:ResearchWorkbenchProgress,install:typeof installResearchWorkbenchRetry==='function'?installResearchWorkbenchRetry:null,request:typeof requestResearchWorkbenchRetry==='function'?requestResearchWorkbenchRetry:null})`,{react:React,react_jsx_runtime:jsx,window:target,document:{documentElement:{dataset:{odysseyLocale:english?'en':'zh'}}},CustomEvent})
 return {...api,target,snapshot,html:()=>renderToStaticMarkup(React.createElement(api.Component,{sessionId:'session',plans,footer:true}))}
}
it('shows a circular loading indicator for real pending components, then a completed label only when all planned components exist',()=>{
 const running=fixture(['completed','completed','completed','running']).html()
 expect(running).toContain('aria-label="正在生成组件"')
 expect(running).toContain('<circle')
 expect(running).not.toContain('已完成')
 const done=fixture(['completed','completed','completed','completed']).html()
 expect(done).toContain('已完成')
 expect(done).not.toContain('<svg')
 expect(done).not.toContain('PRIVATE')
 expect(fixture(['completed','completed','completed']).html()).not.toContain('已完成')
 expect(fixture(['completed','completed','completed','completed'],true).html()).toContain('Completed')
})
it('offers retry beside real failures even while other components are still running',()=>{
 const failure=fixture(['completed','completed','failed','interrupted']).html()
 expect(failure).toMatch(/<button[^>]*>重试<\/button>/)
 const mixed=fixture(['completed','running','failed','completed']).html()
 expect(mixed).toContain('aria-label="正在生成组件"')
 expect(mixed).toMatch(/<button[^>]*>重试<\/button>/)
})
it('rechecks current plan, task identity, permission and status before retry, and never retries successful or already running components',async()=>{
 const f=fixture(['completed','running','failed','interrupted'])
 expect(typeof f.install).toBe('function')
 const current=f.snapshot.nodes.map(n=>({id:n.id,workbenchId:n.planId,generationTaskId:n.taskId,generationStatus:n.status}))
 const started=[]
 const dispose=f.install({eventTarget:f.target,sessionId:'session',getArtifacts:()=>current,canRetry:()=>true,retry:async node=>{started.push(node.id);node.generationStatus='retrying'}})
 expect(await f.request(f.target,'other',plans,{...f.snapshot,sessionId:'other'})).toBe(false)
 current[3].generationTaskId='newer-attempt'
 expect(await f.request(f.target,'session',plans,f.snapshot)).toBe(true)
 expect(started).toEqual(['node-2'])
 expect(await f.request(f.target,'session',plans,f.snapshot)).toBe(false)
 dispose()
 expect(await f.request(f.target,'session',plans,f.snapshot)).toBe(false)
 const noAccess=fixture(['failed'])
 const stop=noAccess.install({eventTarget:noAccess.target,sessionId:'session',getArtifacts:()=>current,canRetry:()=>false,retry:()=>{throw Error('must not reach generation')}})
 expect(await noAccess.request(noAccess.target,'session',plans,noAccess.snapshot)).toBe(false)
 stop()
})
