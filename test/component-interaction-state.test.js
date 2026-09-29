import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {Window} from 'happy-dom'
import {validResearchInteractionState,validResearchInteractionEvent,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {patchComponentInteractionState} from '../scripts/lib/component-interaction-state.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
const e=(id,clock)=>({id,clock,targetRoute:[1],tag:'BUTTON',type:'click'})
it('bounds journal data and ties it to component source',()=>{
 expect(validResearchInteractionState({version:'v',events:{a:e('a',1)}})).toBe(true)
 expect(validResearchInteractionEvent({...e('a',1),targetRoute:[-1]})).toBe(false)
 expect(validResearchInteractionEvent({...e('a',1),value:'x'.repeat(8193)})).toBe(false)
 expect(validResearchInteractionEvent({...e('a',1),html:'<script>'})).toBe(false)
 expect(researchInteractionVersion('a')).not.toBe(researchInteractionVersion('b'))
})
it('restores JS closure state, incrementally applies remote events, and ignores foreign senders',()=>{
 const w=new Window({settings:{disableJavaScriptEvaluation:true}});w.document.body.innerHTML='<output>0</output><button>+</button>';
 const messages=[];const parent={postMessage:x=>messages.push(x)};let count=0;
 w.document.querySelector('button').onclick=()=>{w.document.querySelector('output').textContent=String(++count)};
 const source=readFileSync('packages/dsh-research-task-runtime/html-artifact.js','utf8').match(/const RESEARCH_HTML_INTERACTION_RUNTIME = String.raw`([\s\S]*?)`;/)[1];
 vm.runInNewContext('('+source+')()', {document:w.document,parent,addEventListener:w.addEventListener.bind(w),Element:w.Element,Event:w.Event,KeyboardEvent:w.KeyboardEvent,HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,HTMLTextAreaElement:w.HTMLTextAreaElement,crypto:{randomUUID:()=> 'test'}});
 const send=(events,origin=parent)=>w.dispatchEvent(new w.MessageEvent('message',{source:origin,data:{type:'sherlock-interaction-state',state:{events},readOnly:false}}));
 send({a:e('a',1)},{});expect(count).toBe(0);
 send({a:e('a',1)});expect(count).toBe(1);
 send({a:e('a',1)});expect(count).toBe(1);
 send({a:e('a',1),b:e('b',2)});expect(count).toBe(2);
 send({c:e('c',1),a:e('a',2)});expect(messages.at(-1).type).toBe('sherlock-interaction-reload');
})
it('patches the actual renderer without dropping saved state on parsing',()=>{
 const source=restoreResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));const patched=patchComponentInteractionState(source);
 expect(patchComponentInteractionState(patched)).toBe(patched);
 expect(patched).toContain('config:{interactionState:value.config.interactionState,');
 expect(patched).toContain('researchSharedStateSinks.set(sessionId');
 expect(patched).toContain('function sharedComponentRuntime()');
 expect(patched).toContain('if(!collaborationCanWrite()');
})
it('preserves independent interaction events through shared document merging',async()=>{
 const {createDocument,encodeDocument,decodeDocument,applyCanvasDiff,projectDocument}=await import('../packages/dsh-research-collaboration/document.js');
 const Y=await import('yjs');
 const base={files:[],artifacts:[{id:'a',kind:'generated-container',config:{interactionState:{version:'v',events:{}}}}]};
 const state=encodeDocument(createDocument(base));const a=decodeDocument(state),b=decodeDocument(state);
 const edit=(id)=>{const next=structuredClone(base);next.artifacts[0].config.interactionState.events[id]=e(id,1);return next};
 applyCanvasDiff(a,base,edit('a'));applyCanvasDiff(b,base,edit('b'));Y.applyUpdate(a,encodeDocument(b));Y.applyUpdate(b,encodeDocument(a));
 expect(projectDocument(a)).toEqual(projectDocument(b));expect(Object.keys(projectDocument(a).artifacts[0].config.interactionState.events)).toHaveLength(2);
})

it('replays coordinate clicks on a resized canvas in another client and after reopening',()=>{
 const runtime=readFileSync('packages/dsh-research-task-runtime/html-artifact.js','utf8').match(/const RESEARCH_HTML_INTERACTION_RUNTIME = String.raw`([\s\S]*?)`;/)[1];
 const client=(width)=>{
  const w=new Window({settings:{disableJavaScriptEvaluation:true}});w.document.body.innerHTML='<canvas></canvas>';
  const board=w.document.querySelector('canvas'), moves=[],out=[];let capture;
  board.getBoundingClientRect=()=>({left:40,top:20,width,height:width});
  board.onclick=ev=>moves.push([Math.round((ev.clientX-40)/width*14),Math.round((ev.clientY-20)/width*14)]);
  const listen=w.document.addEventListener.bind(w.document);
  w.document.addEventListener=(type,fn,...args)=>{if(type==='click')capture=fn;listen(type,fn,...args)};
  const parent={postMessage:m=>out.push(m)};
  vm.runInNewContext('('+runtime+')()', {document:w.document,parent,addEventListener:w.addEventListener.bind(w),Element:w.Element,Event:w.Event,MouseEvent:w.MouseEvent,KeyboardEvent:w.KeyboardEvent,HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,HTMLTextAreaElement:w.HTMLTextAreaElement,crypto:{randomUUID:()=> 'move-1'}});
  const send=events=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'sherlock-interaction-state',state:{events},readOnly:false}}));
  send({});return {moves,out,send,click:()=>capture({isTrusted:true,target:board,clientX:40+width*.5,clientY:20+width*.25})};
 };
 const a=client(400),b=client(280);a.click();const event=a.out.at(-1).event;
 expect(event.tag).toBe('CANVAS');expect(validResearchInteractionEvent(event)).toBe(true);
 b.send({[event.id]:event});expect(b.moves).toEqual([[7,4]]);
 b.send({[event.id]:event});expect(b.moves).toHaveLength(1);
 const reopened=client(560);reopened.send({[event.id]:event});expect(reopened.moves).toEqual(b.moves);
 expect(validResearchInteractionEvent({...event,x:NaN})).toBe(false);
 expect(validResearchInteractionEvent({...event,y:2})).toBe(false);
});

it('journals authorized agent clicks across two independent legacy closures but never loops remote replay',async()=>{
 const {JSDOM}=await import('jsdom');const {createCanvasUseSurface}=await import('../packages/dsh-research-task-runtime/canvas-use-surface.js');let serial=0
 const runtime=readFileSync('packages/dsh-research-task-runtime/html-artifact.js','utf8').match(/const RESEARCH_HTML_INTERACTION_RUNTIME = String.raw`([\s\S]*?)`;/)[1]
 function client(width){
  const dom=new JSDOM('<canvas></canvas><output>0</output>',{runScripts:'outside-only',url:'https://local.test',pretendToBeVisual:true}),w=dom.window,out=[],moves=[]
  w.PointerEvent=w.MouseEvent;const canvas=w.document.querySelector('canvas');canvas.toDataURL=()=>null
  w.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width,height:width,right:width,bottom:width})
  canvas.onclick=e=>{moves.push([Math.round(e.clientX/width*14),Math.round(e.clientY/width*14)]);w.document.querySelector('output').textContent=String(moves.length)}
  const allowed=new WeakSet(),parent={postMessage:m=>out.push(m)}
  vm.runInNewContext('('+runtime+')(allowed)',{document:w.document,parent,allowed,addEventListener:w.addEventListener.bind(w),Element:w.Element,Event:w.Event,MouseEvent:w.MouseEvent,KeyboardEvent:w.KeyboardEvent,HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,HTMLTextAreaElement:w.HTMLTextAreaElement,crypto:{randomUUID:()=>`move-${++serial}`}})
  w.dispatchAuthorized=(el,event)=>{allowed.add(event);try{return el.dispatchEvent(event)}finally{allowed.delete(event)}}
  const use=w.eval('('+createCanvasUseSurface.toString()+')(document.body,()=>null,window.dispatchAuthorized)')
  const receive=events=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'sherlock-interaction-state',state:{events},readOnly:false}}));receive({})
  return {dom,w,out,moves,receive,click:async point=>{const view=await use({op:'observe'});await use({op:'click',ref:view.elements[0].ref,revision:view.revision,point})}}
 }
 const a=client(400),b=client(280),journal={}
 try {
  for(let i=0;i<8;i++){
   const from=i%2?a:b,to=i%2?b:a;await from.click({x:(3+i)/14,y:5/14});const event=from.out.at(-1).event;journal[event.id]=event
   const before=to.out.length;to.receive(journal);to.receive(journal);expect(to.out).toHaveLength(before);expect(a.moves).toEqual(b.moves)
  }
  expect(a.moves).toHaveLength(8)
  const before=a.out.length;a.w.document.querySelector('canvas').dispatchEvent(new a.w.MouseEvent('click',{bubbles:true}));expect(a.out).toHaveLength(before)
 }finally{a.dom.window.close();b.dom.window.close()}
})


it('打开原生select不写入交互日志，实际分类change仍保存并可恢复',()=>{
 const w=new Window({settings:{disableJavaScriptEvaluation:true}});w.document.body.innerHTML='<select><option value="all">全部</option><option value="industry">行业</option></select>'
 const runtime=readFileSync('packages/dsh-research-task-runtime/html-artifact.js','utf8').match(/const RESEARCH_HTML_INTERACTION_RUNTIME = String.raw`([\s\S]*?)`;/)[1]
 const listeners={},out=[],parent={postMessage:m=>out.push(m)},select=w.document.querySelector('select'),listen=w.document.addEventListener.bind(w.document)
 w.document.addEventListener=(type,fn,...args)=>{listeners[type]=fn;listen(type,fn,...args)}
 vm.runInNewContext('('+runtime+')()', {document:w.document,parent,addEventListener:w.addEventListener.bind(w),Element:w.Element,Event:w.Event,MouseEvent:w.MouseEvent,KeyboardEvent:w.KeyboardEvent,HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,HTMLTextAreaElement:w.HTMLTextAreaElement,crypto:{randomUUID:()=> 'filter-1'}})
 w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'sherlock-interaction-state',state:{events:{}},readOnly:false}}));out.length=0
 listeners.click({isTrusted:true,target:select,clientX:0,clientY:0})
 expect(out).toHaveLength(0)
 select.value='industry';listeners.change({isTrusted:true,target:select})
 expect(out).toHaveLength(1);expect(out[0]).toMatchObject({type:'sherlock-interaction-event',event:{type:'change',tag:'SELECT',value:'industry'}})
 expect(validResearchInteractionEvent(out[0].event)).toBe(true)
 w.happyDOM.abort()
})

it('连续本地操作的部分确认不重载，完整确认后撤销仍重载；拒绝操作立即回退',()=>{
 const w=new Window({settings:{disableJavaScriptEvaluation:true}});w.document.body.innerHTML='<input><button>详情</button>'
 const runtime=readFileSync('packages/dsh-research-task-runtime/html-artifact.js','utf8').match(/const RESEARCH_HTML_INTERACTION_RUNTIME = String.raw`([\s\S]*?)`;/)[1]
 const listeners={},out=[],parent={postMessage:m=>out.push(m)},listen=w.document.addEventListener.bind(w.document);let serial=0
 w.document.addEventListener=(type,fn,...args)=>{listeners[type]=fn;listen(type,fn,...args)}
 vm.runInNewContext('('+runtime+')()', {document:w.document,parent,addEventListener:w.addEventListener.bind(w),Element:w.Element,Event:w.Event,MouseEvent:w.MouseEvent,KeyboardEvent:w.KeyboardEvent,HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,HTMLTextAreaElement:w.HTMLTextAreaElement,crypto:{randomUUID:()=> 'edit-'+(++serial)}})
 const receive=(events,extra={})=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'sherlock-interaction-state',state:{events},readOnly:false,...extra}}))
 const input=w.document.querySelector('input');receive({});out.length=0
 input.value='4';listeners.input({isTrusted:true,target:input});const first=out.at(-1).event
 input.value='40';listeners.input({isTrusted:true,target:input});const second=out.at(-1).event
 receive({[first.id]:first})
 expect(out.filter(m=>m.type==='sherlock-interaction-reload')).toHaveLength(0)
 expect(input.value).toBe('40')
 receive({[first.id]:first,[second.id]:second})
 receive({[first.id]:first})
 expect(out.at(-1).type).toBe('sherlock-interaction-reload')
 input.value='400';listeners.input({isTrusted:true,target:input});const rejected=out.at(-1).event
 receive({[first.id]:first,[second.id]:second},{rejectedEventId:rejected.id})
 expect(out.at(-1).type).toBe('sherlock-interaction-reload')
 w.happyDOM.abort()
})
