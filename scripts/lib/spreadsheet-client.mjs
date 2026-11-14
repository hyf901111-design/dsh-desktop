import {spreadsheetRangeCodec,collectSpreadsheetReferences,installSpreadsheetReferences,spreadsheetMessageParts} from './spreadsheet-inline-references.mjs'
import {SPREADSHEET_QUICK_PROMPTS} from '../../packages/dsh-research-task-runtime/spreadsheet-quick-prompts.js'
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
 const prompts=${JSON.stringify(SPREADSHEET_QUICK_PROMPTS)};
 const fill=event=>{
  const detail=event.detail,choices=prompts[document.documentElement.dataset.odysseyLocale==='en'?'en':'zh'];
  if(!detail||sessions.list.getSnapshot().current!==detail.sessionId||document.body.dataset.eworkSpreadsheetSession!==detail.sessionId||!Object.hasOwn(choices,detail.action))return;
  const shell=eworkActiveInput(detail.sessionId,inputHub.shell(detail.sessionId)),draft=shell?.snapshot;
  if(!draft||shell.disposed||draft.phase!=='plain'||draft.researchContextPreparing)return;
  const panel=document.querySelector('[data-odyssey-panel-entry="right"]');
  if(panel?.getAttribute('aria-expanded')==='false')panel.click();
  shell.insertText((draft.draft.trim()?'\\n':'')+choices[detail.action],{start:draft.draft.length,end:draft.draft.length,draftRev:draft.draftRev});
  requestAnimationFrame(()=>document.querySelector('[data-research-composer-host] textarea')?.focus({preventScroll:true}));
 };
 window.addEventListener('sherlock:spreadsheet-quick-prompt',fill);
 return()=>window.removeEventListener('sherlock:spreadsheet-quick-prompt',fill);
},'Spreadsheet shared composer shortcuts');
ctx.inject(['inputTriggers'],scope=>scope.effect(()=>scope.get('inputTriggers').registerSource((${spreadsheetRangeCodec.toString()})()),'Spreadsheet range codec'));
ctx.effect(()=>(${installSpreadsheetReferences.toString()})({win:window,doc:document,sessions,getInput:id=>inputHub.shell(id)}),'Spreadsheet range insertion');`,'registration')
 const mode="const sidebarMode=(research || activeView==='notes' || browserAppActive || pendingRight)&&(!homeGuideResident||homeGuideSidebar||browserAppActive||pendingRight);"
 change(mode,mode.replace("research || activeView==='notes'","research || activeView==='notes' || !subagentPanel&&activeView==='spreadsheet'").replace('||homeGuideSidebar||browserAppActive','||homeGuideSidebar||activeView===\'spreadsheet\'||browserAppActive'),'shared conversation')
 const page='"data-phase": phase,\n\t\t\t\t"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",'
 change(page,page.replace('research ?','activeView===\'spreadsheet\'&&!subagentPanel ? "spreadsheet" : research ?'),'resident layout')
 const welcomeAnchor='function HomeGuideNativeOriginalConversationRoot('
 change(welcomeAnchor,`function EWorkSpreadsheetWelcome({sessionId}){
 const prompt=(e)=>window.dispatchEvent(new CustomEvent('sherlock:spreadsheet-quick-prompt',{detail:{sessionId,action:e.currentTarget.dataset.prompt}}));
 return react.createElement('div',{className:'ew-sheet-welcome'},react.createElement('div',{className:'ew-sheet-welcome-content'},
  react.createElement('h2',null,'从一个问题，',react.createElement('br'),'开始一张表格。'),
  react.createElement('p',null,'导入已有 Excel，或直接描述需要的分析。',react.createElement('br'),'我可以创建工作表、填写公式、整理格式。'),
  react.createElement('div',{className:'ew-sheet-welcome-actions'},['制作消费行业可比估值表','整理上传的数据并去重','创建现金流预测模型'].map((title,i)=>react.createElement('button',{key:i,type:'button','data-prompt':i,onClick:prompt},react.createElement('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinejoin:'round','aria-hidden':true},react.createElement('path',{d:'M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3z'})),react.createElement('span',null,title))))));
}
${welcomeAnchor}`,'right pane welcome component')
 const portal='pendingRight ? researchConversationView : activeView === \'notes\' && document.body.dataset.workspaceSurface!==\'browser\' ?'
 change(portal,portal.replace(' : activeView', " : activeView==='spreadsheet'&&!browserAppActive ? (conversationVacant ? react.createElement(EWorkSpreadsheetWelcome,{sessionId}) : sessionPresentation.conversationView) : activeView"),'right pane welcome')
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
 change(chip,chip.replace('children: [',`children: [chip.source==='spreadsheet-range' && ${gridIcon}, chip.source==='knowledge-reference' && react.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},react.createElement('path',{d:'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14'})), `),'range chip icon')
 const remove='(researchReference !== null || chip.source === "pptx-annotation") && selectedResearchOccurrenceId'
 change(remove,remove.replace('|| chip.source', '|| chip.source === "spreadsheet-range" || chip.source === "knowledge-reference" || chip.source'),'range chip removal')
 const history='function projectUserText(text, openFile) {'
 change(history,history+`
 const sheetParts=(${spreadsheetMessageParts.toString()})(text)
 if(sheetParts)return react.createElement(react.Fragment,null,sheetParts.map((part,i)=>part.label?
  react.createElement('span',{key:i,className:MessageItem_module_css_default.refChip,'data-ref-chip':'spreadsheet-range',title:part.label},${gridIcon},part.label):
  react.createElement(react.Fragment,{key:i},projectUserText(part.text,openFile))))
 `,'sent range chip')
 const commit='shell?.commitSend(attempt.imageIds, attempt.draftState.draft);'
 change(commit,`if(document.body.dataset.eworkSpreadsheetSession===session.sessionId){
                  try{
                    const sheetRefs=(${collectSpreadsheetReferences.toString()})(attempt.draftState);
                    if(!window.dshDesktop?.spreadsheetAdmission)throw Error('表格尚未就绪，草稿已保留。');
                    await window.dshDesktop.spreadsheetAdmission(session.sessionId,attempt.text,sheetRefs);
                    if(shell?.disposed||this.researchSendAttempts.get(session.sessionId)!==sendAttempt||
                       shell&&shell.snapshot.draftRev!==shellSnapshot?.draftRev||
                       document.body.dataset.eworkSpreadsheetSession!==session.sessionId)return;
                  }catch(error){shell?.notify("error",error?.message??"表格尚未同步，草稿已保留。");return}
                } else if(attempt.draftState.occurrences.some(o=>o.source==='spreadsheet-range')){
                  shell?.notify("error","请回到表格发送选区引用，或先移除选区。");return;
                }
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
