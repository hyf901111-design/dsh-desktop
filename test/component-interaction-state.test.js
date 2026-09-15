import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {Window} from 'happy-dom'
import {validResearchInteractionState,validResearchInteractionEvent,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {patchComponentInteractionState} from '../scripts/lib/component-interaction-state.mjs'
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
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8');const patched=patchComponentInteractionState(source);
 expect(patchComponentInteractionState(patched)).toBe(patched);
 expect(patched).toContain('config:{interactionState:value.config.interactionState}');
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
