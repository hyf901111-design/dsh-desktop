import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {Window} from 'happy-dom'
import {expect,it,vi} from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives',()=>Object.fromEntries(['StateDot','Modal','Button','IconTrashOutline16','Menu','IconPlusOutline16','IconEllipsisOutline16','IconSearchOutline16','IconFolderOpenOutline16','IconEditOutline16','IconTriangleRightFill14'].map(name=>[name,()=>null])))
import * as boardsModule from '../src/preload/research-boards-ui'
const {patchHomeGuidePresentationNative,stripHomeGuidePresentationNative}=await import(new URL('../scripts/lib/home-guide-presentation-native.mjs',import.meta.url).href) as {patchHomeGuidePresentationNative(source:string):string;stripHomeGuidePresentationNative(source:string):string}

function store<T>(value:T){return{getSnapshot:()=>value,subscribe:()=>()=>{}}}

it('the injected presentation dependencies resolve registered sessions through the actual ResearchBoardsPage instance',async()=>{
 const win=new Window({url:'http://localhost:43210'}),oldDocument=globalThis.document,oldEvent=globalThis.Event
 const entry={kind:'ppt',sessionId:'ppt-example',cwd:'/workspace/公司风格演示示例',title:'公司风格演示示例',createdAt:1}
 const records=new Map([['sherlock.home-guide.sessions.v1:account%3Aowner',JSON.stringify({version:1,scope:'account:owner',entries:[entry]})]])
 const sessions={list:store({current:entry.sessionId,byId:{[entry.sessionId]:{id:entry.sessionId,cwd:entry.cwd,title:entry.title,blank:true}}}),binding:()=>undefined,open:()=>{},create:async()=>{throw Error('Test must not create another session')}}
 const inputHub={shells:new Map()},researchSidebar={service:null},workspaces={list:store({items:[]})},cleanups:Array<()=>void>=[]
 let page:ReturnType<typeof boardsModule.createResearchBoardsPage>|undefined
 globalThis.document=win.document as unknown as Document;globalThis.Event=win.Event as unknown as typeof Event
 ;(win as any).dshDesktop={researchCanvasStorage:{getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value);return true}}}
 try{
  page=boardsModule.createResearchBoardsPage({document:win.document as unknown as Document,sessions,workspaces,inputHub,researchWorkspaces:{for:()=>({getSnapshot:()=>({files:[],artifacts:[]}),subscribe:()=>()=>{}})},bridge:{isSharedSession:()=>false,getSnapshot:async()=>({version:1,eventSeq:1,account:{status:'ready',generation:1,user:{userId:'owner'}},favorites:[],boards:[],current:null,recoveries:[],notifications:{cursor:0,unreadCount:0,pendingCount:0,notifications:[]}}),subscribe:()=>()=>{},invoke:async(action:string,input:any)=>{if(action==='board.activate'&&input.localSessionId===null)return{ok:true,value:null};throw Error('Unexpected backend command: '+action)}}} as any)
  await page.whenHomeGuideSessionsReady()
  // Unwind the actual outer profile layers before testing this inner binding.
  // Node preserves the serialized helper bytes used by the real installer.
  const source=execFileSync(process.execPath,['--input-type=module','-e',`
   import{readFileSync}from'node:fs';
   import{stripConversationGridOverlays}from'./test/fixtures/strip-conversation-transient-ui.mjs';
   import{stripPlainSlashInput}from'./scripts/lib/plain-slash-input.mjs';
   import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';
   import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';
   import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';
   process.stdout.write(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(stripPlainSlashInput(stripConversationGridOverlays(readFileSync(0,'utf8')))))));
  `],{input:readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),encoding:'utf8',maxBuffer:64*1024*1024}),patched=patchHomeGuidePresentationNative(source)
  const effect=patched.match(/\/\* odyssey:home-presentation-binding:v1 \*\/\n([^\n]+)/)?.[1]
  expect(effect).toBeTruthy()
  const ctx={effect:(start:()=>()=>void)=>{const stop=start();cleanups.push(stop);return stop}}
  const bind=new Function('ctx','sessions','inputHub','researchSidebar','sherlockBoardsPage','sherlockBoardsAdapter','let HomePresentationNativeDeps=null;'+effect+';return {dependencies:HomePresentationNativeDeps,setAdapter:next=>{sherlockBoardsAdapter=next}};')
  const live=bind(ctx,sessions,inputHub,researchSidebar,boardsModule,null)
  expect(live.dependencies.getHomeGuideSession(entry.sessionId)).toBeUndefined()
  live.setAdapter(page)
  expect(live.dependencies.getHomeGuideSession(entry.sessionId)).toEqual(entry)
  expect(live.dependencies.getHomeGuideSession('unregistered')).toBeUndefined()
  live.setAdapter(null)
  expect(live.dependencies.getHomeGuideSession(entry.sessionId)).toBeUndefined()
  expect(stripHomeGuidePresentationNative(patched)).not.toContain('HomePresentationNativeDeps')
 }finally{for(const stop of cleanups.reverse())stop();page?.dispose();globalThis.document=oldDocument;globalThis.Event=oldEvent;await win.happyDOM.close()}
})
