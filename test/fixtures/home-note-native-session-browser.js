import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {patchNoteSessionRuntime} from '../../scripts/lib/notes-session.mjs'

// Real main-world Sidebar + session/workspace runtimes. Only the wire boundary
// is controlled; connectWorkspace/startSession/create/open are never replaced.
export async function homeNoteNativeSessionBrowser(){
 const runtime=patchNoteSessionRuntime(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'))
 const sidebar=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.SidebarRoot=SidebarRoot;')
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import{createRoot}from'react-dom/client';import * as cordis from '@deepseek-ai/cordis';
 import{installNoteSessionTitles}from'./scripts/lib/notes-session.mjs';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??(()=>null)});
 const load=source=>{let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};new Function(source)();return descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake)};
 const native=load(${JSON.stringify(runtime)}),sidebar=load(${JSON.stringify(sidebar)}),ctx=new cordis.Context(),created=[],opened=[],retained=[];
 const ok=value=>({result:{ok:true,value}}),workspace={workspaceId:'note-workspace',path:'/example-notes',title:'笔记练习',sessionIds:[],createdAt:1,updatedAt:1};
 const api={sessions:{create:async input=>{const sessionId='native-new-'+crypto.randomUUID();created.push({sessionId,...input});workspace.sessionIds.push(sessionId);return ok({sessionId})},history:async()=>ok({events:[],hasMore:false,lastSeq:0}),subscribe:async()=>ok({}),unsubscribe:async()=>ok({})},subagents:{list:async()=>ok({entries:[],parentAvailable:true})},workspace:{list:async()=>ok({items:[workspace],archivedSessionIds:[]})}};
 const sessions=new native.SessionRuntime(ctx,api,{}),workspaces=new native.WorkspaceRuntime(ctx,api,sessions);
 installNoteSessionTitles(sessions,document);
 document.addEventListener('sherlock:notes-edited',event=>retained.push(event.detail.sessionId));
 const sync=()=>{const id=sessions.list.getSnapshot().current;if(id&&opened.at(-1)!==id){opened.push(id);document.documentElement.dataset.nativeCurrentSession=id;const header=document.querySelector('[data-ework-notes-session]');if(header)header.dataset.eworkNotesSession=id}};sessions.list.subscribe(sync);
 const commands=new Map();window.addEventListener('sherlock:home-guide-session-request',event=>commands.set(event.detail.requestId,event.detail.command));
 window.addEventListener('sherlock:home-guide-session-reply',event=>{const reply=JSON.parse(JSON.stringify(event.detail));if(!reply.ok||!reply.sessionId)return;const id=reply.sessionId;if(!sessions.list.getSnapshot().byId[id]){workspace.sessionIds.push(id);sessions.manager.recordMutation({kind:'upsert',summary:{sessionId:id,cwd:workspace.path,blank:true,running:false,updatedAt:Date.now()}});workspaces.manager.installViews([workspace])}if(commands.get(reply.requestId)!=='prepare')sessions.open(id)});
 const root=document.createElement('div');root.style.cssText='position:absolute;left:0;top:0;width:80px;height:100%;z-index:60';document.body.append(root);
 createRoot(root).render(React.createElement(sidebar.SidebarRoot,{collapsed:true,width:240,t:key=>({'session.new.label':'新建对话','session.newResearch.label':'新建研究'}[key]||key),renderSlot:()=>null,toggleSidebar:()=>{},startResearchSession:()=>{},startSession:()=>workspaces.startSession(undefined,id=>window.dispatchEvent(new CustomEvent('sherlock:conversation-initial-chat',{detail:{sessionId:id}})))}));
 window.nativeSessionProbe={snapshot:()=>({current:sessions.list.getSnapshot().current,byId:sessions.list.getSnapshot().byId,created,opened,retained}),retain:id=>document.dispatchEvent(new CustomEvent('sherlock:notes-edited',{detail:{sessionId:id}}))};
 document.addEventListener('test:note-storage-request',async event=>{const value=JSON.parse(event.detail);try{const result=await window.noteStorageRequest(value.method,value.input);document.dispatchEvent(new CustomEvent('test:note-storage-reply',{detail:JSON.stringify({id:value.id,ok:true,result})}))}catch(error){document.dispatchEvent(new CustomEvent('test:note-storage-reply',{detail:JSON.stringify({id:value.id,ok:false,message:error.message})}))}});
 void workspaces.manager.refresh();
 `},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}})
 return result.outputFiles[0].text
}

// Test-only JSON transport crosses real Chromium isolated/main worlds, like the
// preload/native boundary, without exporting a production test hook.
export const isolatedNoteStorage=`window.noteStorageRequest=(method,input)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const receive=event=>{const value=JSON.parse(event.detail);if(value.id!==id)return;document.removeEventListener('test:note-storage-reply',receive);value.ok?resolve(value.result):reject(Error(value.message))};document.addEventListener('test:note-storage-reply',receive);document.dispatchEvent(new CustomEvent('test:note-storage-request',{detail:JSON.stringify({id,method,input})}))});`
