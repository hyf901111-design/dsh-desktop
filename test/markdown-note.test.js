import {designPolicyIssue,normalizeGeneratedHostStyles} from '../packages/dsh-research-task-runtime/design-policy.js'
import {requestedOperationsType} from '../packages/dsh-research-task-runtime/operations-template-contract.js'
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js'
import {workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {Window} from 'happy-dom'
import {it,expect} from 'vitest'
import {noteDataIssue,noteMarkdownHtml,noteReduce,validNoteState,noteDraftSource,noteMarkdownNodes,noteEditActions} from '../packages/dsh-research-task-runtime/note-template-contract.js'
import {renderNoteArtifact} from '../packages/dsh-research-task-runtime/note-artifact.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const note={version:1,type:'note',title:'研究笔记',asOf:'用户提供的本地材料 · 2026-10-01',content:'# 观察\n\n**原值**：0、-5、未提供。\n\n- 核对单位\n- 保留来源\n\n[来源](https://example.com/source)'}
it('完整笔记与空白笔记都可预置，超过容量或缺少来源必须明确拒绝',()=>{
 expect(noteDataIssue(note)).toBe(null);expect(noteDataIssue({...note,content:''})).toBe(null)
 expect(noteDataIssue({...note,asOf:''})).toBeTruthy();expect(noteDataIssue({...note,content:'中'.repeat(11000)})).toBeTruthy();expect(noteDataIssue({...note,content:'a'.repeat(16001)})).toBeTruthy()
 expect(noteDataIssue({...note,html:'<script>'})).toBeTruthy()
})
it('普通Markdown格式与原字面值可读，HTML与危险链接保留为文字',()=>{
 const html=noteMarkdownHtml(note.content+'\n\n```js\n<script>alert(1)</script>\n```\n\n[危险](javascript:alert(1))\n\n<img src=x onerror=alert(1)>')
 expect(html).toContain('<h1>观察</h1>');expect(html).toContain('<strong>原值</strong>');expect(html).toContain('0、-5、未提供。');expect(html).toContain('<ul>');expect(html).toContain('href="https://example.com/source"');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('href="javascript:');expect(html).not.toContain('<img')
})
it('草稿用有界补丁保存长中文及选择视图，非法操作不改变已有笔记',()=>{
 let state={content:note.content,view:'edit',align:'left'}
 const value='中'.repeat(10000)
 for(let i=0;i<value.length;i+=1000)state=noteReduce(state,{op:'edit',start:i,remove:i?0:state.content.length,insert:value.slice(i,i+1000)})
 expect(state.content).toBe(value);expect(validNoteState(state)).toBe(true)
 const prior=state;expect(noteReduce(state,{op:'edit',start:0,remove:0,insert:'文'.repeat(1000)})).toBe(prior);expect(noteReduce(state,{op:'edit',start:-1,remove:0,insert:'x'})).toBe(prior)
 state=noteReduce(state,{op:'view',value:'preview'});expect(state.view).toBe('preview');expect(state.content).toBe(value)
 expect(noteReduce(state,{op:'html',value:'<script>'})).toBe(state)
})
it('预置模板留存完整来源，不更改既有markdown摘要格式',()=>{
 const rendered=renderNoteArtifact(note);expect(rendered.html).toContain('data-sherlock-template="note"');expect(rendered.html).toContain('data-workbench-state-owned');expect(templateFor(note).figma).toBe('1917:352841');expect(templateFor(note).minWidth).toBe(280)
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(note)));expect(readTemplateModel(spec).data).toEqual(note)
 const legacy={version:1,type:'markdown',title:'摘要',content:'原有摘要'};expect(JSON.parse(acceptArtifactOutput(JSON.stringify(legacy)))).toEqual(legacy)
 const plan=validateWorkbench({requestId:'note-fixture',title:'笔记工作台',dataMode:'simulated',panels:[{type:'note',size:'large',title:note.title,prompt:'本地虚构材料的Markdown笔记，不联网',artifact:note}]});expect(plan.panels[0].artifact.content).toBe(note.content)
})

it('builds safe formatted preview with DOM methods and preserves values in tables',async()=>{
 const win=new Window();try{const root=win.document.createElement('article');noteMarkdownNodes(root,note.content+'\n\n| 项目 | 原值 |\n| --- | --- |\n| 收入 | 0 |\n| 利润 | -5 |\n\n<img src=x onerror=alert(1)>');expect(root.querySelector('strong').textContent).toBe('原值');expect(root.querySelectorAll('td')[3].textContent).toBe('-5');expect(root.querySelector('img')).toBeNull();expect(root.textContent).toContain('<img src=x onerror=alert(1)>');}finally{await win.happyDOM.abort();}
})
it('permits only links present in the current exact note draft through the host source panel',()=>{
 const html=renderNoteArtifact(note).html,state={content:'[新来源](https://example.com/new?a=1&b=2)\n`[代码](https://example.com/code)`',view:'preview',align:'left'},node={containerSpec:{type:'html',html},config:{sharedComponentState:{version:'v1',state}}};
 expect(noteDraftSource(node,'https://example.com/new?a=1&b=2','v1')).toEqual({href:'https://example.com/new?a=1&b=2',label:'新来源'});
 for(const url of ['https://example.com/code','https://attacker.invalid','javascript:alert(1)','https://user:pass@example.com/'])expect(noteDraftSource(node,url,'v1')).toBe(null);
 expect(noteDraftSource(node,'https://example.com/new?a=1&b=2','v2')).toBe(null);expect(noteDraftSource({...node,containerSpec:{type:'html',html:'<p>ordinary</p>'}},'https://example.com/new?a=1&b=2','v1')).toBe(null);
})

it('counts JSON escaping in bounded draft transport without truncating control characters',()=>{
 const value='\u0000'.repeat(9000),actions=noteEditActions('原文',value);expect(actions.length).toBeLessThanOrEqual(32);let state={content:'原文',view:'edit',align:'left'};
 for(const action of actions){expect(new TextEncoder().encode(JSON.stringify(action)).length).toBeLessThan(4096);state=noteReduce(state,action);}expect(state.content).toBe(value);expect(noteEditActions('', '\u0000'.repeat(11000))).toBe(null);
})

it('ordinary Chinese editable-note intent selects the compact note contract',()=>{
 expect(requestedOperationsType('创建一张可编辑Markdown笔记')).toBe('note');expect(requestedOperationsType('请总结这份研究报告')).toBeUndefined();
 const prompt=buildResearchTaskPrompt({parentSessionId:'synthetic',canvasNodeId:'note',kind:'container',prompt:workbenchPanelPrompt({title:'笔记工作台'},{title:'研究笔记',type:'note',size:'large',prompt:'保留提供的本地材料，可编辑Markdown笔记'})});
 expect(prompt).toContain('type:"note"');expect(prompt).toContain('完整Markdown原文');expect(prompt).toMatch(/ework-workbench-components v\d+\.\d+\.\d+/);
})

it('模型看到的工具支持note，完整原材料同次准备且不启动逐卡模型',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'note-tool-contract-'));let tool,prepared=[];let childCalls=0;
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}};
 const runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected-child'}}};
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});
 try{
  expect(tool.parameters.properties.panels.items.properties.type.enum).toContain('note');
  const result=await tool.execute({requestId:'note-source-once',title:'研究笔记',panels:[{type:'note',size:'large',title:note.title,prompt:'可编辑Markdown笔记，完整保留用户原文',artifact:note}]},{agent:{session:{id:'synthetic-note'}}});
  expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['note']);expect(prepared[0].artifact).toEqual(note);expect(childCalls).toBe(0);
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
})

it('host note controls pass the same generation design policy without removing editable content',()=>{
 const artifact=JSON.parse(acceptArtifactOutput(JSON.stringify(note)));
 expect(designPolicyIssue(normalizeGeneratedHostStyles(artifact.html))).toBeNull();
 expect(readTemplateModel(artifact).data).toEqual(note);
 expect(artifact.html).toContain('data-note-color="#005096"');
 expect(artifact.html).toContain('aria-label="深蓝">深蓝</button>');
})
