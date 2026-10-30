import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {NativeHomeNotesGuidePortal} from '../../scripts/lib/home-guide-notes-native.mjs'
import {notesComposerSource} from '../../scripts/lib/notes-composer.mjs'

/** Real Portal + SDK shell. Only Host replies and InputBar presentation are fixture boundaries. */
export async function homeNoteRewritePortalBrowser(){
 const runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const conversation=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const helpers=notesComposerSource.slice(notesComposerSource.indexOf('function eworkSettleNoteInput('),notesComposerSource.indexOf('function EWorkSharedInputBar('))
 const draftHandler=notesComposerSource.split('\n').find(line=>line.trim().startsWith('const draft=event=>'))
 if(!draftHandler)throw Error('Native draft adapter source missing')
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import{createRoot}from'react-dom/client';
 import{HOME_NOTES_CHART_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_RESULT}from'./packages/dsh-research-task-runtime/home-notes-guide-contract.js';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const load=(source,nativeRuntime)=>{let descriptor;const previous=window.__ModuleLoader__;window.__ModuleLoader__={load:value=>descriptor=value};new Function(source)();window.__ModuleLoader__=previous;return descriptor.factory(id=>id==='react'?react:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-runtime/client'?nativeRuntime:id==='@deepseek-ai/cordis'?{Service:class{}}:fake)};
 const runtime=load(${JSON.stringify(runtime)}),library=load(${JSON.stringify(conversation)},runtime),SessionInputShell=library.SessionInputShell,eworkNotesInputs=new Map(),cleanups=[];
 ${helpers}
 const NativePortal=${NativeHomeNotesGuidePortal.toString()};
 let sherlockBoardsAdapter;
 window.installRewritePortal=async()=>{
  const sessionId='real-guide-session',runId='notes-natural-run',cwd='/native-rewrite-fixture',host=document.querySelector('#guide');
  const center=document.createElement('main');center.className='pI_x6G_centerCol';host.before(center);const header=document.createElement('header');header.dataset.srbSessionHeader='';header.dataset.eworkNotesSession=sessionId;center.append(header);
  const guide=document.createElement('section');guide.dataset.homeGuide=runId;guide.dataset.kind='note';center.append(guide);guide.append(host);
  const composer=document.createElement('div');composer.dataset.eworkNotesComposerHost=sessionId;composer.style.cssText='position:fixed;right:8px;bottom:8px;width:330px;height:120px;z-index:100;background:white';composer.innerHTML='<div class="uV2eYG_root"><textarea aria-label="Native shell draft" style="width:300px;height:65px"></textarea><button class="uV2eYG_primary">发送</button></div>';center.append(composer);
  const conversation={serializeImages:async()=>[],draftImages:()=>[],releaseDraftImage(){}};
  const ordinary=new SessionInputShell({actx:{effect:fn=>{const off=fn();if(off)cleanups.push(off)}},defaultSink:async()=>{throw Error('ordinary chat sink must not receive note rewrite')}});
  const record=eworkNotesInput(sessionId,ordinary,conversation);record.active=true;record.ready=true;
  ${draftHandler}
  document.addEventListener('sherlock:notes-composer-draft',draft);
  document.addEventListener('sherlock:notes-composer-state',event=>{if(event.detail?.sessionId===sessionId){record.ready=event.detail.ready===true;record.running=event.detail.running===true}});
  const input=composer.querySelector('textarea'),button=composer.querySelector('button');record.shell.state.subscribe(()=>input.value=record.shell.snapshot.draft);button.addEventListener('click',()=>record.shell.submit('queue'));
  sherlockBoardsAdapter={getHomeGuideSession:id=>id===sessionId?{kind:'note',cwd}:undefined};
  const nativeHost=document.createElement('div');center.append(nativeHost);createRoot(nativeHost).render(react.createElement(NativePortal,{sessionId}));
  const originalFetch=window.fetch;window.fetch=async(url,options)=>{if(url!='/sherlock/home-guide/notes')return originalFetch(url,options);const body=JSON.parse(options.body);if(body.action==='generate'){window.nativePortalGenerations.push(body.input);const result=body.input.prompt===HOME_NOTES_CHART_PROMPT?window.portalChartFixture(runId):{kind:'text',markdown:HOME_NOTES_REWRITE_RESULT};let done=false;return{ok:true,body:{getReader:()=>({read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode(JSON.stringify({type:'result',result})+String.fromCharCode(10))})})}}}return{ok:true,json:async()=>({ok:true,prompts:{chart:HOME_NOTES_CHART_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT,note:HOME_NOTES_TASK_PROMPT}})}};
  const command=(command,extra={})=>new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),receive=event=>{const value=event.detail;if(value?.requestId!==requestId)return;window.removeEventListener('sherlock:home-guide-notes-native-reply',receive);value.ok?resolve(value.result):reject(Error(value.message))};window.addEventListener('sherlock:home-guide-notes-native-reply',receive);window.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-native-request',{detail:{requestId,runId,sessionId,hostId:host.id,command,...extra}}))});
  let mounted=false;const ready=async()=>{if(mounted)return;await new Promise(resolve=>setTimeout(resolve,30));await command('mount',{cwd,fresh:true});mounted=true;window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{sessionId,runId,playing:true}}))};
  window.nativePortalGenerations=[];window.nativePortalDrafts=[];document.addEventListener('sherlock:notes-composer-draft',event=>{if(event.detail?.sessionId===sessionId&&typeof event.detail.text==='string')window.nativePortalDrafts.push(event.detail.text)});
  window.nativeRewriteBridge={async type(stage){await ready();await command('type',{stage})},async generate(input){await ready();return command('generate',{input})},async configureQuote(){await ready();await command('configure-quote')},stop:async()=>{},dispose(){if(mounted)void command('dispose')},reviewSummary:async()=>{},appendSummary:async()=>{}};
  window.nativeRewriteProbe={snapshot:()=>({draft:record.shell.snapshot.draft,occurrences:record.shell.snapshot.occurrences.length,submission:record.submission}),setDraft:text=>record.shell.setDraft(text),type:stage=>command('type',{stage})};
 };
 `},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}})
 return result.outputFiles[0].text
}
