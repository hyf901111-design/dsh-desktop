import {spreadsheetRangeCodec,collectSpreadsheetReferences,installSpreadsheetReferences,spreadsheetMessageParts} from './spreadsheet-inline-references.mjs'
import {SPREADSHEET_QUICK_PROMPTS} from '../../packages/dsh-research-task-runtime/spreadsheet-quick-prompts.js'
import {eworkWorkspaceDraftText,eworkWorkspaceDraftRevision,eworkBindWorkspaceDraft,eworkRestoreWorkspaceDraft,eworkWorkspaceDraftImages} from './workspace-draft-state.mjs'

const modeWelcome={
 spreadsheet:{
  zh:{heading:['从一个问题，','开始一张表格。'],body:['导入已有 Excel，或直接描述需要的分析。','我可以创建工作表、填写公式、整理格式。'],
   labels:['制作消费行业可比估值表','整理上传的数据并去重','创建现金流预测模型'],prompts:SPREADSHEET_QUICK_PROMPTS.zh},
  en:{heading:['Start with a question,','build a spreadsheet.'],body:['Import an Excel workbook or describe the analysis you need.','Create worksheets, fill in formulas, and format data.'],
   labels:['Build a consumer-sector valuation table','Clean up and deduplicate imported data','Create a cash flow forecast'],prompts:SPREADSHEET_QUICK_PROMPTS.en}
 },
 notes:{
  zh:{heading:['从一份材料，','开始一篇笔记。'],body:['导入资料或说说你想写什么。','可以整理要点、起草正文，也可以润色现有笔记。'],
   labels:['整理会议纪要','把资料整理成阅读笔记','润色当前笔记'],
   prompts:['请根据我提供的会议记录起草一份纪要，整理主要决定、待办事项、负责人和截止日期。没有提及的信息标为待确认。','请把我提供的资料整理成一篇阅读笔记。提炼核心观点、对应证据和待核实的问题，并标出资料出处。','请润色当前笔记，清理重复表述，调整段落结构，保留原有事实和术语。如果笔记还没有正文，请先询问主题。']},
  en:{heading:['Start with your material,','turn it into a note.'],body:['Import a document or describe what you want to write.','Organize key points, draft a note, or polish an existing one.'],
   labels:['Draft meeting minutes','Turn source material into reading notes','Polish the current note'],
   prompts:['Draft minutes from my meeting notes. Organize decisions, action items, owners, and deadlines. Mark unspecified details as open.','Turn the materials I provide into reading notes. Highlight the main claims, supporting evidence, and open questions, and cite the source materials.','Polish the current note by removing repetition and improving its structure while preserving facts and terminology. If it is empty, ask me for a topic.']}
 },
 research:{
  zh:{heading:['从一个问题，','开始一次研究。'],body:['告诉我想研究的行业、公司或假设。','可以在看板上整理证据、指标和待验证的问题。'],
   labels:['搭建行业研究看板','跟踪公司关键指标','梳理投资逻辑与风险'],
   prompts:['请围绕我指定的行业搭建研究看板，整理行业规模、竞争格局和关键指标，标注数据来源和日期。如果缺少行业名称，请先询问我。','请为我指定的公司搭建跟踪看板，汇总关键指标、近期财报和重要事件，标注数据来源和时间。如果缺少公司名称或代码，请先询问我。','请为我指定的研究对象梳理投资逻辑与风险，在看板上列出支持证据、反证和待验证事项，并标明来源。如果目标不明确，请先询问我。']},
  en:{heading:['Start with a question,','build a research board.'],body:['Name a sector, company, or hypothesis to investigate.','Organize evidence, metrics, and open questions on the board.'],
   labels:['Build an industry research board','Track key company metrics','Map an investment thesis and its risks'],
   prompts:['Build a research board for the industry I specify. Organize market size, competitors, and key metrics, with sources and dates. Ask for the industry if I have not supplied it.','Build a tracking board for the companies I specify. Summarize key metrics, recent results, and material events with sources and dates. Ask for company names or tickers if missing.','Map the investment thesis and risks for the subject I specify. Use the board to show supporting evidence, counterevidence, and checks still needed, with sources. Ask for the subject if it is unclear.']}
 }
}
const marker='/* ework:spreadsheet-client:v2 */'
const restore='/* ework:spreadsheet-client:restore '
function replace(source,before,after,label){
 const actual=source.split('/* browser-app-native:v1 */')[0]
 if(actual.split(before).length!==2)throw Error('Spreadsheet client anchor drift: '+label)
 return source.replace(before,()=>after)
}
export function stripSpreadsheetClient(source){
 const at=source.indexOf(restore);if(at<0)return source
 const end=source.indexOf(' */',at)
 if(end<0)throw Error('Spreadsheet restore record missing')
 const entries=JSON.parse(source.slice(at+restore.length,end))
 source=source.slice(0,source[at-1]==='\n'?at-1:at)+source.slice(end+3)
 for(const [before,after,label] of entries.reverse())source=replace(source,after,before,label)
 return source
}
export function patchSpreadsheetClient(source){
 source=stripSpreadsheetClient(source)
 const entries=[]
 const change=(before,after,label)=>{source=replace(source,before,after,label);entries.push([before,after,label])}
 const register='registerResearchCanvasView(slots, t, researchWorkspaces, researchOfficePreview);'
 change(register,register+`
${marker}
function EWorkSpreadsheetView({sessionId}){
 return react.createElement(react.Fragment,null,react.createElement('div',{'data-ework-spreadsheet-view':sessionId}),react.createElement(EWorkNoteComponentViews,{sessionId,active:false,spreadsheet:true}));
}
slots.register({name:'conversation.view',id:'spreadsheet',order:10,label:()=>document.documentElement.dataset.odysseyLocale==='en'?'Spreadsheet':'表格',inject:sessionId=>({sessionId})},EWorkSpreadsheetView);
ctx.effect(()=>{
 const fill=event=>{
  const detail=event.detail;
  if(!detail||sessions.list.getSnapshot().current!==detail.sessionId)return;
  const {sessionId,mode,index}=detail,surface=document.body.dataset.workspaceSurface;
  if(mode==='notes'?surface!=='notes':surface)return;
  if(mode==='spreadsheet'&&document.body.dataset.eworkSpreadsheetSession!==sessionId)return;
  const prompt=eworkModeWelcome[mode]?.[eworkModeLocale()]?.prompts[index];
  if(typeof prompt!=='string')return;
  const shell=eworkActiveInput(sessionId,inputHub.shell(sessionId)),draft=shell?.snapshot;
  if(!draft||shell.disposed||draft.phase!=='plain'||draft.researchContextPreparing)return;
  if(!shell.insertText((draft.draft.trim()?'\\n':'')+prompt,{start:draft.draft.length,end:draft.draft.length,draftRev:draft.draftRev}))return;
  requestAnimationFrame(()=>{
   if(sessions.list.getSnapshot().current!==sessionId)return;
   const inputs=document.querySelectorAll('[data-research-composer-host] textarea[data-odyssey-file-reference-session]');
   [...inputs].find(input=>input.dataset.odysseyFileReferenceSession===sessionId&&input.getClientRects().length&&!input.disabled)?.focus({preventScroll:true});
  });
 };
 window.addEventListener('sherlock:mode-quick-prompt',fill);
 return()=>window.removeEventListener('sherlock:mode-quick-prompt',fill);
},'Workspace mode composer shortcuts');
ctx.inject(['inputTriggers'],scope=>scope.effect(()=>scope.get('inputTriggers').registerSource((${spreadsheetRangeCodec.toString()})()),'Spreadsheet range codec'));
ctx.effect(()=>(${installSpreadsheetReferences.toString()})({win:window,doc:document,sessions,getInput:id=>inputHub.shell(id)}),'Spreadsheet range insertion');`,'registration')
 const draftHub='var InputHub = class {'
 change(draftHub,[eworkWorkspaceDraftText,eworkWorkspaceDraftRevision,eworkBindWorkspaceDraft,eworkRestoreWorkspaceDraft,eworkWorkspaceDraftImages].map(fn=>fn.toString()).join('\n')+'\n'+draftHub,'mode draft state')
 const draftWrite='setDraft: (d, text) => {\n\t\t\t\t\t\td.draft = text;\n\t\t\t\t\t},'
 change(draftWrite,`setDraft: (d,text,mode='chat')=>{
  d.workspaceDrafts={...d.workspaceDrafts,[mode]:text};
  if(mode==='chat')d.draft=text;
 },`,'persist workspace draft text')
 const savedDraft='const storedDraft = useStore((s) => s.draft);'
 change(savedDraft,savedDraft+'\nconst workspaceDrafts=useStore(s=>s.workspaceDrafts);','saved workspace drafts')
 const draftEffect=`(0, react.useEffect)(() => {
				if (inputState.draft === "" && storedDraft !== "") inputActions.setDraft(storedDraft);
				const unmirror = bindDraftMirror(actions.setDraft);
				return () => {
					unmirror();
				};
			}, [inputActions]);`
 change(draftEffect,`react.useLayoutEffect(()=>bindDraftMirror(actions.setDraft,view,storedDraft,workspaceDrafts),[inputActions,sessionId,view]);`,'activate draft with current workspace mode')
 const bindDraft='bindDraftMirror: (write) => inputHub.shell(sessionId).bindMirror(write)'
 change(bindDraft,`bindDraftMirror:(write,view,legacyDraft,savedDrafts)=>{
 const shell=inputHub.shell(sessionId);
 if(sherlockShared(sessionId)){
  if(!shell.snapshot.draft&&legacyDraft)shell.setDraft(legacyDraft);
  return shell.bindMirror(write);
 }
 return eworkBindWorkspaceDraft(shell,view,legacyDraft,savedDrafts,write,()=>new InputMachine({now:()=>Date.now()}));
 }`,'bind editor to mode drafts')
 const releaseDrafts='const drafts = shell.snapshot.imageIds;'
 change(releaseDrafts,'const drafts = eworkWorkspaceDraftImages(shell);','release every mode draft attachment')
 const draftAdmission='const admissionSnapshot = admissionShell?.snapshot;'
 change(draftAdmission,draftAdmission+`
    const admissionCore=admissionShell?.core;
    const ownsWorkspaceDraft=()=>!admissionShell||(!admissionShell.disposed&&admissionShell.core===admissionCore&&admissionShell.snapshot.draftRev===admissionSnapshot.draftRev);`,'pin submission to originating mode')
 const submissionState='const shellSnapshot = annotationAdmission?.pptxAnnotation===true?annotationAdmission:shell?.snapshot;'
 change(submissionState,'if(!ownsWorkspaceDraft())return;\n'+submissionState,'reject stale submission after preparing references')
 const restoreDraft=`shell?.restoreImages(attempt.imageIds);
						const restoreDraft = shell?.snapshot.draft === "" && shell.snapshot.draftRev === committedDraftRev;
						if (restoreDraft) shell.restoreDraftState(attempt.draftState);`
 change(restoreDraft,'const restoreDraft=eworkRestoreWorkspaceDraft(shell,admissionCore,committedDraftRev,attempt.draftState,attempt.imageIds);','restore failed send to original mode')
 const committedRev='const committedDraftRev = shell?.snapshot.draftRev;'
 change(committedRev,'const committedDraftRev = admissionCore ? eworkWorkspaceDraftRevision(admissionCore) : undefined;','remember original draft revision after send')
 const mode="const sidebarMode=(research || activeView==='notes' || browserAppActive || pendingRight)&&(!homeGuideResident||homeGuideSidebar||browserAppActive||pendingRight);"
 change(mode,mode.replace("research || activeView==='notes'","research || activeView==='notes' || !subagentPanel&&activeView==='spreadsheet'").replace('||homeGuideSidebar||browserAppActive','||homeGuideSidebar||activeView===\'spreadsheet\'||browserAppActive'),'shared conversation')
 const page='"data-phase": phase,\n\t\t\t\t"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",'
 change(page,page.replace('research ?','activeView===\'spreadsheet\'&&!subagentPanel ? "spreadsheet" : research ?'),'resident layout')
 const welcomeAnchor='function HomeGuideNativeOriginalConversationRoot('
 change(welcomeAnchor,`const eworkModeWelcome=${JSON.stringify(modeWelcome)};
const eworkSheetContextOptOut=new WeakSet();
const eworkModeLocale=()=>document.documentElement.dataset.odysseyLocale==='en'?'en':'zh';
function subscribeEWorkModeLocale(notify){
 const observer=new MutationObserver(notify);
 observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});
 return()=>observer.disconnect();
}
function EWorkModeWelcome({sessionId,mode}){
 const language=react.useSyncExternalStore(subscribeEWorkModeLocale,eworkModeLocale,eworkModeLocale);
 const {heading,body,labels}=eworkModeWelcome[mode][language];
 const choose=index=>window.dispatchEvent(new CustomEvent('sherlock:mode-quick-prompt',{detail:{sessionId,mode,index}}));
 const h=react.createElement,br=()=>h('br');
 return h('div',{className:'ew-sheet-welcome','data-mode-welcome':mode,'data-research-empty-state':mode==='spreadsheet'?undefined:'','data-note-empty-state':mode==='notes'?'':undefined},
  h('div',{className:'ew-sheet-welcome-content'},
  h('h2',null,heading[0],br(),heading[1]),
  h('p',null,body[0],br(),body[1]),
  h('div',{className:'ew-sheet-welcome-actions'},labels.map((title,i)=>h('button',{key:i,type:'button','data-prompt':i,onClick:()=>choose(i)},
   h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinejoin:'round','aria-hidden':true},
    h('path',{d:'M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3z'})),
   h('span',null,title))))));
}
function EWorkSpreadsheetContextBadge({keyboard,input,disabled}){
 const language=react.useSyncExternalStore(subscribeEWorkModeLocale,eworkModeLocale,eworkModeLocale);
 const [optOut,setOptOut]=react.useState(()=>eworkSheetContextOptOut.has(keyboard));
 const [open,setOpen]=react.useState(false);
 const id=react.useId(),hasRange=input?.occurrences?.some(item=>item.source==='spreadsheet-range');
 react.useEffect(()=>{if(hasRange)setOpen(false)},[hasRange]);
 if(!keyboard||hasRange)return null;
 const [use,skip]=language==='en'?['Use current workbook','Skip current workbook']:['参考当前表格内容','不参考当前表格内容'];
 const toggle=()=>{
  if(optOut)eworkSheetContextOptOut.delete(keyboard);
  else eworkSheetContextOptOut.add(keyboard);
  setOptOut(!optOut);setOpen(false);
 };
 const h=react.createElement;
 return h('div',{'data-sheet-context-anchor':'',
  onBlur:event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)},
  onKeyDown:event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);event.currentTarget.firstElementChild?.focus()}}},
  h('button',{type:'button','data-sheet-context-badge':'','data-opt-out':optOut||undefined,disabled,'aria-expanded':open,'aria-controls':open?id:undefined,onClick:()=>setOpen(!open)},optOut?skip:use),
  open&&h('div',{id,'data-sheet-context-directory':'',role:'region','aria-label':use},
   h('button',{type:'button',disabled,onClick:toggle},optOut?use:skip)));
}
${welcomeAnchor}`,'right pane welcome component')
 const portal='pendingRight ? researchConversationView : activeView === \'notes\' && document.body.dataset.workspaceSurface!==\'browser\' ?'
 change(portal,"pendingRight ? researchConversationView : activeView==='spreadsheet'&&!browserAppActive&&!subagentPanel ? (conversationVacant ? react.createElement(EWorkModeWelcome,{sessionId,mode:'spreadsheet'}) : sessionPresentation.conversationView) : activeView==='notes'&&!browserAppActive&&!subagentPanel ?",'right pane welcome')
 const notePortal='EWorkNotesConversation,{sessionId,t,empty:conversationVacant,children:sessionPresentation.conversationView}'
 change(notePortal,"EWorkNotesConversation,{sessionId,t,empty:conversationVacant,welcomeView:react.createElement(EWorkModeWelcome,{sessionId,mode:'notes'}),children:sessionPresentation.conversationView}",'notes welcome without replacing native history')
 const researchWelcome=': researchEmpty ? (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: "sRp_emptyState",'
 change(researchWelcome,": researchEmpty && research && !browserAppActive && !subagentPanel ? react.createElement(EWorkModeWelcome,{sessionId,mode:'research'}) "+researchWelcome,'research welcome without replacing personal history')
 const inputBar='function InputBar({ subagentPanel=false,'
 change(inputBar,inputBar.replace('subagentPanel=false','eworkSpreadsheet=false, eworkNoteContext, subagentPanel=false'),'spreadsheet context composer input')
 const barProps='eworkNotes:activeView === "notes",'
 change(barProps,barProps+"\n eworkSpreadsheet:activeView==='spreadsheet'&&!browserAppActive&&!pendingRight&&!subagentPanel,", 'spreadsheet context surface')
 const canvasContext='researchCanvasWorkspace: research && sessionId !== void 0 ? researchWorkspace : void 0,'
 change(canvasContext,canvasContext.replace('research &&','research && !browserAppActive && !pendingRight && !subagentPanel &&'),'research context surface')
 const badge='researchCanvasWorkspace !== void 0 && (0, react_jsx_runtime.jsx)(ResearchCanvasContextBadge, { workspace: researchCanvasWorkspace, input, keyboard, t, disabled }, sessionId),'
 change(badge,"eworkNoteContext,\n "+badge+"\n eworkSpreadsheet && react.createElement(EWorkSpreadsheetContextBadge,{key:sessionId,keyboard,input,disabled}),",'spreadsheet context badge')
 for(const [before,after] of [["notes:'新笔记',trajectory:", "notes:'新笔记',spreadsheet:'新表格',trajectory:"],["notes:'New Note',trajectory:", "notes:'New Note',spreadsheet:'New Spreadsheet',trajectory:"]]){
  const nativeTitle=source.split('/* browser-app-native:v1 */')[0]
  if(nativeTitle.split(before).length===2)change(before,after,'spreadsheet blank title '+before)
 }
 const utilities=`children: [active?.id === 'notes' && (0,react_jsx_runtime.jsx)(EWorkNoteExportMenu,{sessionId}), renderSlot("conversation.session.header.utilities", {})]`
 change(utilities,utilities.replace('children: [', "children: [active?.id==='spreadsheet' && react.createElement('div',{'data-ework-spreadsheet-actions':sessionId,'data-ework-spreadsheet-title':explicitSessionTitle?.trim()||(!blankResearchTitle&&ancestry.at(-1)?.displayTitle)||(document.documentElement.dataset.odysseyLocale==='en'?'New Spreadsheet':'新表格')}),"),'spreadsheet top bar actions')
 const binding="const mode=active.id==='notes'?'notes':active.id==='research'?'research':'conversation';"
 change(binding,binding.replace(":'conversation'",":active.id==='spreadsheet'?'spreadsheet':'conversation'"),'tool mode')
 const select='const selectView = (0, react.useCallback)((viewId) => {'
 change(select,select+`
                if(active?.id==='spreadsheet'&&viewId!=='spreadsheet'&&document.body.dataset.eworkSpreadsheetSession===sessionId){
                  void window.dshDesktop?.spreadsheetFlush?.(sessionId).then(()=>{if(document.body.dataset.eworkSpreadsheetSession===sessionId){
                    explicitHomeViewSessions.delete(sessionId);explicitResearchViewSessions.add(sessionId);
                    if(viewId!=='research')clearInitialResearchSession(sessionId);
                    actions.setView(viewId);
                  }}).catch(()=>{});
                  return;
                }
 `,'flush before leaving')
 const selectEnd='}, [actions, sessionId]);\n\t\t\tconst ancestry ='
 change(selectEnd,selectEnd.replace('[actions, sessionId]','[actions, sessionId, active?.id]'),'view lifecycle')
 const chip='children: [chip.source === "pptx-annotation" && renderPptxAnnotationPin'
 const gridIcon=`react.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},react.createElement('rect',{x:4,y:4,width:16,height:16,rx:2}),react.createElement('path',{d:'M4 9h16M4 14h16M10 4v16'}))`
 change(chip,chip.replace('children: [',`children: [chip.source==='image-factory-layer' && react.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},react.createElement('path',{d:'m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5'})), chip.source==='spreadsheet-range' && ${gridIcon}, chip.source==='knowledge-reference' && react.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},react.createElement('path',{d:'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14'})), `),'range chip icon')
 const remove='(researchReference !== null || chip.source === "pptx-annotation") && selectedResearchOccurrenceId'
 change(remove,remove.replace('|| chip.source', '|| chip.source === "spreadsheet-range" || chip.source === "knowledge-reference" || chip.source === "image-factory-layer" || chip.source'),'range chip removal')
 const history='function projectUserText(text, openFile) {'
 change(history,history+`
 const sheetParts=(${spreadsheetMessageParts.toString()})(text)
 if(sheetParts)return react.createElement(react.Fragment,null,sheetParts.map((part,i)=>part.label?
  react.createElement('span',{key:i,className:MessageItem_module_css_default.refChip,'data-ref-chip':'spreadsheet-range',title:part.label},${gridIcon},part.label):
  react.createElement(react.Fragment,{key:i},projectUserText(part.text,openFile))))
 `,'sent range chip')
 const commit='shell?.commitSend(attempt.imageIds, attempt.draftState.draft);'
 change(commit,`if(!ownsWorkspaceDraft())return;
                if(document.body.dataset.eworkSpreadsheetSession===session.sessionId){
                  try{
                    const sheetRefs=(${collectSpreadsheetReferences.toString()})(attempt.draftState);
                    if(!window.dshDesktop?.spreadsheetAdmission)throw Error('表格尚未就绪，草稿已保留。');
                    await window.dshDesktop.spreadsheetAdmission(session.sessionId,attempt.text,sheetRefs,!eworkSheetContextOptOut.has(shell));
                    if(shell?.disposed||this.researchSendAttempts.get(session.sessionId)!==sendAttempt||
                       shell&&shell.snapshot.draftRev!==shellSnapshot?.draftRev||
                       document.body.dataset.eworkSpreadsheetSession!==session.sessionId)return;
                  }catch(error){shell?.notify("error",error?.message??"表格尚未同步，草稿已保留。");return}
                } else if(attempt.draftState.occurrences.some(o=>o.source==='spreadsheet-range')){
                  shell?.notify("error","请回到表格发送选区引用，或先移除选区。");return;
                }
                if(!ownsWorkspaceDraft())return;
                `+commit,'capture before composer commits')
 return source+'\n'+restore+JSON.stringify(entries).replaceAll('*/','*\\/')+' */'
}

export function hideTrajectoryTab(source){
 const tag='/* ework:trajectory-tab-hidden */'
 if(source.includes(tag))return source
 const start=source.indexOf('ctx.slots.inject("conversation.view", () => ctx.slots.register({')
 const end=source.indexOf('}, TrajectoryView));',start)
 if(start<0||end<0||!source.slice(start,end).includes('id: "trajectory"'))throw Error('Trajectory tab registration missing')
 // Keep trajectory event types, tool details and history processing registered.
 return source.slice(0,start)+tag+'\n\t\t'+source.slice(end+'}, TrajectoryView));'.length)
}
