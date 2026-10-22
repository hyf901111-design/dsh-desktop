import ts from 'typescript'
import {WORKBENCH_ENGLISH} from '../../packages/dsh-research-task-runtime/workbench-locale.js'
export {WORKBENCH_ENGLISH,workbenchText} from '../../packages/dsh-research-task-runtime/workbench-locale.js'
export function useWorkbenchLocale() {
 const [,render]=react.useReducer(n=>n+1,0)
 react.useEffect(()=>{const observer=new MutationObserver(()=>render());observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});return()=>observer.disconnect()},[])
}
const UI_FUNCTIONS=new Set(['ResearchCreationPlanningCard','ResearchContainerChart','ResearchInteractiveTable','ResearchNativeWebFrame','ComponentScheduledTitle','ResearchGenerationAction','WorkbenchChrome','WorkbenchMenu','WorkbenchSelectedCreateContext','WorkbenchSelectedCreateDraft','WorkbenchResizeControls','WorkbenchStylePicker','ResearchCanvas','ResearchHtmlArtifact','ResearchContainerDraft','ResearchLinkDraftCard','ResearchContainerSettings','ResearchContainerPreview','ResearchCanvasContextMenu','ResearchCanvasActionReceipt','ComponentDataStatusBar','ComponentDataSettings','ComponentScheduledTasks','ResearchComponentSchedule','ResearchWebLinkPreview','ResearchNativeWebPreview','ResearchGenerationPreview','ResearchGenerationProcess','ResearchGenerationPlaceholder','ResearchCanvasInlineContentEditor','ResearchSelectedCreateDialog','ResearchCanvasArtifactCard','workbenchRefreshTooltip','componentDataStatusView','useWorkbenchSettings','ResearchTaskGenerationCard','ResearchVoiceDraft','ResearchVoiceControl','researchGenerationPresentation','researchGenerationLog','ResearchCanvasInlineTitleEditor','ResearchCanvasFrameMenu','ResearchCanvasRichNodeFrame','ResearchCanvasImagePreview','ResearchCanvasNativeTextPreview','ResearchCanvasPdfPreview','ResearchCanvasHtmlPreview','ResearchCanvasOfficePreview','ResearchCanvasFileCard','ResearchMindMapNodeEditor','ResearchDerivedHeading','ResearchDerivedSources','ResearchMindMap','ResearchCanvasWechatReader','ResearchCanvasStandardWebFrame','ResearchHybridWebFrame','ResearchMarketNativeTable','ResearchContainerMenu','ResearchGeneratedContainer','ResearchDerivedDetailMenu','ResearchDerivedCreatePopover','ResearchAssistantCanvasAction','ResearchConversationPanel'])
UI_FUNCTIONS.add('ComponentDataSettingsPanel')
UI_FUNCTIONS.add('componentRssStatusView')
// Only known presentation functions are translated. Stored user content, model
// prompts, identifiers and generated business data are outside this transform.
export function localizedWorkbenchFunctions(source) {
 const file=ts.createSourceFile('client.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),ranges=[]
 function scan(n,inside=false){
  if(ts.isFunctionDeclaration(n)&&n.name&&UI_FUNCTIONS.has(n.name.text)&&!inside){
   const edits=[];function visit(x){
    if(ts.isBinaryExpression(x)&&ts.isPropertyAssignment(x.parent)&&x.parent.name.getText(file).replace(/['\"]/g,'')==='aria-label'&&/^['\"]按['\"]\s*\+/.test(x.getText(file))){edits.push({start:x.getStart(file),end:x.end,text:'workbenchText('+x.getText(file)+')'});return}
    // Translate complete fixed UI phrases before their individual literals;
    // dynamic titles, source names, article text and progress remain untouched.
    const text=x.getText(file),name=n.name.text
    if(ts.isBinaryExpression(x)&&((name==='ComponentDataSettingsPanel'&&/^['\"]每 ['\"]\s*\+.+\+\s*['\"] (?:小时|分钟)['\"]$/.test(text))||(name==='ResearchGenerationProcess'&&/^['\"](?:基于所选 |来源：)['\"]\s*\+.+\+\s*['\"] 个组件['\"]$/.test(text)))){edits.push({start:x.getStart(file),end:x.end,text:'workbenchText('+text+')'});return}
    if(ts.isPropertyAssignment(x)&&x.name.getText(file)==='children'&&((name==='ComponentDataSettingsPanel'&&x.initializer.getText(file)==='error||binding.error')||(name==='WorkbenchChrome'&&x.initializer.getText(file)==='error||time.relative'))){const value=x.initializer;edits.push({start:value.getStart(file),end:value.end,text:'workbenchText('+value.getText(file)+')'});return}
    if(name==='ResearchGenerationProcess'&&ts.isCallExpression(x)&&x.expression.getText(file)==='researchPublicProgress'&&/^node\.generationError\b/.test(x.arguments[0]?.getText(file)||'')){edits.push({start:x.getStart(file),end:x.end,text:'workbenchText('+text+')'});return}
    if((ts.isStringLiteral(x)||ts.isNoSubstitutionTemplateLiteral(x))&&Object.hasOwn(WORKBENCH_ENGLISH,x.text)&&!(ts.isPropertyAssignment(x.parent)&&x.parent.name===x))edits.push({start:x.getStart(file),end:x.end,text:'workbenchText('+JSON.stringify(x.text)+')'})
    if(ts.isTemplateExpression(x)&&/[\u4e00-\u9fff]/.test(x.getText(file))&&!/style|<|function|prompt|frameBounds/.test(x.getText(file)))edits.push({start:x.getStart(file),end:x.end,text:'workbenchText('+x.getText(file)+')'})
    else ts.forEachChild(x,visit)
   }visit(n)
   if(/^[A-Z]/.test(n.name.text)&&n.body)edits.push({start:n.body.getStart(file)+1,end:n.body.getStart(file)+1,text:'\nuseWorkbenchLocale();'})
   if(edits.length){let text=n.getText(file);for(const e of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,e.start-n.getStart(file))+e.text+text.slice(e.end-n.getStart(file));ranges.push({before:n.getText(file),after:text,name:n.name.text})}
   return
  }ts.forEachChild(n,c=>scan(c,inside))
 }scan(file);return ranges
}
