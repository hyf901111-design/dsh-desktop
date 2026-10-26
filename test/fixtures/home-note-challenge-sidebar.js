import {readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'

/** Real sidebar store/service and production evidence component, with a fixture-only mount. */
export async function homeNoteChallengeSidebarSource(){
 // Installed helpers are serialized by native Node; Vitest transforms their
 // function.toString() bytes. Validate with the same strict production loader.
 const source=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{patchBetterSidebarClient}from'./scripts/lib/patch-sherlock-better-sidebar.mjs';process.stdout.write(patchBetterSidebarClient(readFileSync(0,'utf8')));"],{input:await readFile(process.env.SHERLOCK_TEST_SIDEBAR_SOURCE||'build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8'),encoding:'utf8',maxBuffer:16*1024*1024})
 const start=source.indexOf('const SIDEBAR_PREFS_DEFAULTS ='),end=source.indexOf('//#region src/client/chunk-loader.ts',start)
 if(start<0||end<0)throw Error('Native notes challenge service fixture source drifted')
 return `
 import * as EvidenceReact from'react';import{createRoot as createEvidenceRoot}from'react-dom/client';
 import{createNotesChallengeSidebar,NotesChallengeTab}from'./scripts/lib/notes-challenge-client.mjs';
 const {SidebarStore,createBetterSidebarService}=new Function(${JSON.stringify(source.slice(start,end))}+';return {SidebarStore,createBetterSidebarService}')();
 const evidenceStore=new SidebarStore();evidenceStore.setSession('home-notes-evidence-pending');const evidenceService=createBetterSidebarService(evidenceStore);
 let evidenceSession='',evidenceHeader;
 const activeEvidenceSession=()=>document.querySelector('[data-srb-session-header][data-ework-notes-session]')?.dataset.eworkNotesSession||document.querySelector('[data-note-source-session]')?.dataset.noteSourceSession||'';
 const syncEvidenceSession=()=>{const id=activeEvidenceSession();if(!id||id===evidenceSession)return;evidenceSession=id;evidenceStore.setSession(id);if(!document.querySelector('[data-srb-session-header][data-ework-notes-session]')){evidenceHeader??=document.createElement('header');evidenceHeader.hidden=true;evidenceHeader.dataset.eworkNotesSession=id;if(!evidenceHeader.isConnected)document.body.append(evidenceHeader)}};
 syncEvidenceSession();new MutationObserver(syncEvidenceSession).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-note-source-session']});
 const evidenceSessions={list:{getSnapshot:()=>({current:evidenceSession,byId:evidenceSession?{[evidenceSession]:{id:evidenceSession}}:{}})}};
 const evidenceController=createNotesChallengeSidebar({service:evidenceService,sessions:evidenceSessions,document,window,render:props=>EvidenceReact.createElement(NotesChallengeTab,{...props,react:EvidenceReact})});
 const evidenceHost=document.createElement('aside');evidenceHost.dataset.actualNotesChallengeSidebar='';evidenceHost.style.cssText='position:fixed;right:0;top:44px;bottom:0;width:340px;z-index:46;background:#fff;color:#222;overflow:hidden';document.body.append(evidenceHost);
 const evidenceLeaves=node=>node.kind==='leaf'?[node]:node.children.flatMap(evidenceLeaves);
 function EvidencePanel(){const snapshot=EvidenceReact.useSyncExternalStore(evidenceService.subscribeState,evidenceService.getSnapshot),state=snapshot.state,leaf=evidenceLeaves(state.splits).find(value=>value.id===state.activePane)||evidenceLeaves(state.splits)[0],tab=leaf?.tabs.find(value=>value.id===leaf.active),descriptor=tab&&evidenceService.getTab(tab.type);return state.panelOpen&&tab&&descriptor?EvidenceReact.createElement(descriptor.component,{scope:{sessionId:evidenceSession},tab}):null}
 createEvidenceRoot(evidenceHost).render(EvidenceReact.createElement(EvidencePanel));
 window.actualEvidenceService=evidenceService;window.actualEvidenceStore=evidenceStore;
 `
}
