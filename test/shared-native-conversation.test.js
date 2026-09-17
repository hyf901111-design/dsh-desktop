import { expect, it } from 'vitest'
import { sharedTaskNativeSlice, patchSharedNativeConversation } from '../scripts/lib/shared-native-conversation.mjs'
import { readFile } from 'node:fs/promises'
const nodes = new Map([
 ['before',{id:'other',kind:'user'}],
 ['u',{id:'shared-board-task:t:resume:1',kind:'user'}],
 ['p',{kind:'assistant-step',data:{blocks:[{kind:'text',text:'actual streamed progress'}]}}],
 ['tool',{kind:'tool-call'}],
 ['tail',{kind:'turn-tail',data:{closing:{finalNode:{seq:8}}}}],
 ['after',{id:'another',kind:'user'}],['later',{kind:'assistant-step'}]
])
it('uses exact durable task attempt identity and excludes frozen prompt and neighboring turns',()=>{
 expect(sharedTaskNativeSlice([...nodes.keys()],nodes,{conversation:true,taskId:'t',resumeCount:1})).toEqual({keys:['p','tool','tail'],hasClosing:true})
 expect(sharedTaskNativeSlice([...nodes.keys()],nodes,{conversation:true,taskId:'t',resumeCount:0})).toEqual({keys:[],hasClosing:false})
})
it('does not borrow another users native turn when local task history is absent',()=>{
 expect(sharedTaskNativeSlice([...nodes.keys()],nodes,{conversation:true,taskId:'peer'}).keys).toEqual([])
})
it('patches the actual conversation renderer using its native flow and node seats idempotently',async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchSharedNativeConversation(raw)
 expect(patched).toContain('}, SharedResearchChatView);')
 expect(patched).toContain('? sessionPresentation.conversationView : researchEmpty ?')
 expect(patched).not.toContain('renderSlot("conversation.view", {}, { entryKey: "chat" }) : researchEmpty ?')
 expect(patched).toContain('compactConversationFlow(slice.keys, nodeStore, runningTurn)')
 expect(patched).toContain('NativeGroup: SharedResearchRequest')
 expect(patched).not.toContain('sessionId,MarkdownText:_deepseek_ai_dsh_client_ui_primitives.MarkdownText}) : researchEmpty ?')
 expect(patchSharedNativeConversation(patched)).toBe(patched)
})

it('mounts the actual native execution group and streams real commentary instead of a summary label', async()=>{
 const { Window }=await import('happy-dom')
 const React=await import('react'); const {createRoot}=await import('react-dom/client')
 const {runInNewContext}=await import('node:vm'); const {createRequire}=await import('node:module')
 const require=createRequire(import.meta.url)
 const w=new Window({url:'http://localhost/'}); const old={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:w,document:w.document,IS_REACT_ACT_ENVIRONMENT:true})
 let module
 w.__ModuleLoader__={load:value=>module=value}
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const source=patchSharedNativeConversation(raw).replace('exports.apply = apply;','exports.__NativeRequest = SharedResearchRequest; exports.apply = apply;')
 runInNewContext(source,{window:w,document:w.document,navigator:w.navigator,localStorage:w.localStorage,sessionStorage:w.sessionStorage,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,console,AbortController,TextEncoder,TextDecoder})
 const empty=function(){return null}; const fallback=new Proxy(empty,{get:(target,key)=>key==='prototype'?target.prototype:fallback,construct:()=>({})})
 const primitives=new Proxy({MarkdownText:({text})=>React.createElement('p',null,text),Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty})
 const exports=module.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fallback)
 const task={taskId:'native',conversation:true,status:'running'}
 const loc={kind:'step',turn:{turn:1,status:'open'},step:{step:1}}
 const nodeStore=new Map([['u',{id:'shared-board-task:native',kind:'user',data:{content:[{type:'text',text:'PRIVATE FROZEN PROMPT'}]}}],['a',{id:'a',key:'a',kind:'assistant-step',location:loc,data:{status:'running',blocks:[{kind:'text',text:'正在核对两份资料中的日期与口径'}]}}]])
 const snapshot={order:['u','a'],nodeStore,timeline:{turns:new Map()},cwd:'/tmp'}
 const group={rows:[{id:'request',role:'user',createdAt:Date.now(),text:'核对资料',author:{username:'甲',userId:'self'}}]}
 const props={currentUserId:'self',sharedSnapshot:snapshot,useSession:select=>select({chat:{nodes:nodeStore}}),renderSlot:()=>null,t:key=>key}
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host)
 try {
 await React.act(async()=>root.render(React.createElement(exports.__NativeRequest,{group,tasks:[task],nativeProps:props})))
 expect(host.querySelector('[data-chat-flow-kind="execution"]')).not.toBeNull()
 expect(host.textContent).toContain('正在核对两份资料中的日期与口径')
 expect(host.textContent).not.toContain('PRIVATE FROZEN PROMPT')
 expect(host.querySelector('[data-shared-native-message="user"]')?.dataset.self).toBe('true')
 group.rows[0].author.userId='peer'
 await React.act(async()=>root.render(React.createElement(exports.__NativeRequest,{group:{...group},tasks:[task],nativeProps:props})))
 expect(host.querySelector('[data-shared-native-message="user"]')?.dataset.self).toBe('false')
 const actions=host.querySelector('[data-shared-native-message="user"] .p-xYUq_actions')
 expect(actions.firstElementChild.tagName).toBe('BUTTON')
 expect(actions.lastElementChild.className).toBe('p-xYUq_timeEnd')
 expect(host.querySelector('[data-shared-agent-author]').textContent).toBe('甲的智能助理')
 group.rows.push({id:'reply',role:'assistant',author:{username:'乙'},text:'完成核对'})
 await React.act(async()=>root.render(React.createElement(exports.__NativeRequest,{group:{...group},tasks:[task],nativeProps:props})))
 expect(host.querySelector('[data-shared-native-message="assistant"] .srb-native-author').textContent).toBe('乙的智能助理')
 nodeStore.set('a',{...nodeStore.get('a'),data:{status:'running',blocks:[{kind:'text',text:'资料已核对，正在整理结果'}]}})
 await React.act(async()=>root.render(React.createElement(exports.__NativeRequest,{group,tasks:[task],nativeProps:{...props,sharedSnapshot:{...snapshot,nodeStore:new Map(nodeStore)}}})))
 expect(host.textContent).toContain('资料已核对，正在整理结果')
 } finally {await React.act(async()=>root.unmount());await w.happyDOM.abort();Object.assign(globalThis,old)}
})

it('overrides the shell auto margin for peer bubbles while preserving self alignment',async()=>{
 const {Window}=await import('happy-dom');const w=new Window();
 const shell=await readFile('src/preload/figma-final-shell.css','utf8');
 const board=(await readFile('src/preload/research-board-dialogs.ts','utf8')).split('style.textContent = `')[1].split('`')[0];
 w.document.head.innerHTML='<style>'+shell+'</style><style>'+board+'</style>';
 w.document.body.innerHTML='<div class="srb-discussion"><div data-shared-native-message="user" data-self="false"><small class="srb-native-author">乙</small><div class="gdEzaW_userRow"><div class="gdEzaW_userStack">peer</div></div></div><div data-shared-native-message="user" data-self="true"><small class="srb-native-author">甲</small><div class="gdEzaW_userRow"><div class="gdEzaW_userStack">self</div></div></div></div>';
 const stacks=w.document.querySelectorAll('.gdEzaW_userStack');
 expect(w.getComputedStyle(stacks[0]).marginLeft).toBe('0px');
 expect(w.getComputedStyle(stacks[0]).alignItems).toBe('flex-start');
 expect(w.getComputedStyle(stacks[1]).marginLeft).toBe('auto');
 expect(w.getComputedStyle(w.document.querySelector('[data-self=true] small')).textAlign).toBe('right');
 await w.happyDOM.close();
});
