import {address,parseRange,safeFormula,sheetName,label,MAX_COLUMNS,MAX_ROWS,MAX_SHEETS,type Workbook} from '../../shared/spreadsheet/workbook'
import type {WorkbookRecord} from '../../main/spreadsheet/store'
import type {SheetEngine} from './engine'
import {sheetIcon as icon} from './icons'
import css from './view.css?raw'

type Recent={id:string;name:string;sheetCount:number}
type Selection={sheetId:string;range:string}
type Bridge={request(method:string,input:Record<string,unknown>):Promise<any>;flushResult(input:Record<string,unknown>):Promise<unknown>;subscribe(event:'changed'|'flush'|'identity',callback:(value:any)=>void):()=>void}
type Menu={key:string;anchor:HTMLElement}
type Item={label:string;action:string;value?:string;detail?:string;icon?:string;disabled?:boolean}
type Ribbon='文件'|'开始'|'插入'|'数据'|'公式'|'视图'
const ribbons:Ribbon[]=['文件','开始','插入','数据','公式','视图']
const text=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const errorMessage=(e:unknown)=>String((e as Error)?.message??e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')
const button=(action:string,copy:string,options:{glyph?:string;label?:string;value?:string;className?:string;disabled?:boolean;pressed?:boolean}={})=>{
 const {glyph,label=copy,value,className='',disabled,pressed}=options
 return '<button type="button" class="ew-sheet-button '+className+'" data-action="'+action+'"'+(value!==undefined?' data-value="'+text(value)+'"':'')+' aria-label="'+text(label)+'" title="'+text(label)+'"'+(action==='menu'?' aria-haspopup="menu" aria-expanded="false"':'')+(disabled?' disabled':'')+(pressed!==undefined?' aria-pressed="'+pressed+'"':'')+'>'+(glyph?icon(glyph):'')+text(copy)+'</button>'
}
const numeric=(s:string)=>/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):s

class SpreadsheetView{
 private record:WorkbookRecord={revision:0,workbook:null}
 private owner?:string
 private generation?:string
 private recent:Recent[]=[]
 private editable=false
 private ready=false
 private disposed=false
 private busy=false
 private writing=false
 private writingUser=false
 private dirty=false
 private calculationDirty=false
 private selection?:Selection
 private pointerSelection?:{pointerId:number;signature:string;engine:SheetEngine}
 private shiftSelection?:{signature:string;engine:SheetEngine}
 private summary=''
 private zoom=100
 private task:Promise<void>=Promise.resolve()
 private timer=0
 private updateTimer=0
 private engine?:SheetEngine
 private incoming?:WorkbookRecord
 private menu?:Menu
 private ribbon:Ribbon='开始'
 private modeToken=0
 private notice=''
 private error=false
 private active='A1'
 private formula=''
 private formulaDirty=false
 private count=1
 private findQuery=''
 private findIndex=0
 private headerActions?:HTMLElement
 private readonly root:HTMLElement
 private readonly doc:Document
 private readonly win:Window
 constructor(private host:HTMLElement,private sessionId:string,private bridge:Bridge){
  this.doc=host.ownerDocument;this.win=this.doc.defaultView!
  this.root=this.doc.createElement('div');this.root.className='ew-sheet';host.append(this.root)
  this.root.innerHTML='<div class="ew-sheet-chrome"></div><div class="ew-sheet-empty"></div><div class="ew-sheet-grid"></div><div class="ew-sheet-foot"></div><div class="ew-sheet-menu" hidden></div><div class="ew-sheet-dialog" hidden></div>'
  this.root.addEventListener('click',this.click)
  this.root.addEventListener('input',this.input)
  this.root.addEventListener('keydown',this.key)
  this.root.addEventListener('focusout',this.blur)
  this.doc.addEventListener('keydown',this.gridPaste,true)
  this.grid.addEventListener('pointerdown',this.selectionStart,true)
  this.win.addEventListener('pointerup',this.selectionEnd,true)
  this.win.addEventListener('pointercancel',this.selectionCancel,true)
  this.win.addEventListener('blur',this.selectionReset)
  this.doc.addEventListener('keydown',this.selectionKeyDown,true)
  this.doc.addEventListener('keyup',this.selectionKeyUp,true)
  this.root.addEventListener('ew-sheet-engine-error',event=>this.say((event as CustomEvent).detail,true))
  this.doc.addEventListener('pointerdown',this.outside,true)
  this.win.addEventListener('resize',this.place)
  this.paint()
  void this.load()
 }
 private get chrome(){return this.root.querySelector<HTMLElement>('.ew-sheet-chrome')!}
 private get grid(){return this.root.querySelector<HTMLElement>('.ew-sheet-grid')!}
 private get empty(){return this.root.querySelector<HTMLElement>('.ew-sheet-empty')!}
 private get foot(){return this.root.querySelector<HTMLElement>('.ew-sheet-foot')!}
 private get pop(){return this.root.querySelector<HTMLElement>('.ew-sheet-menu')!}
 private get modal(){return this.root.querySelector<HTMLElement>('.ew-sheet-dialog')!}
 private current(){return this.engine?.model.getActiveSheet()}
 private selected(){return this.current()?.getActiveRange()??this.current()?.getRange('A1')}
 private nativeCell(){return this.current()?.getRange(this.active)}
 private request(method:string,fields:Record<string,unknown>={}){return this.bridge.request(method,{sessionId:this.sessionId,owner:this.owner,generation:this.generation,...fields})}
 private async load(){
  this.say('')
  for(let i=0;i<12&&!this.disposed;i++){
   try{
    const state=await this.request('load')
    if(this.disposed)return
    this.owner=state.owner;this.generation=state.generation;this.editable=state.editable;this.recent=state.recent;this.ready=true
    if(this.host.isConnected)this.doc.body.dataset.eworkSpreadsheetSession=this.sessionId
    await this.install(state.record)
    return
   }catch(error){
    if(this.disposed)return
    if(i===11||!errorMessage(error).includes('视图尚未就绪')){
     this.say(errorMessage(error),true);this.paint();return
    }
    await new Promise(r=>this.win.setTimeout(r,60))
   }
  }
 }
 async admit(instruction:string,references:unknown){
  if(this.disposed||!this.ready||!this.host.isConnected)throw Error('表格正在加载，请稍后再发送。')
  await this.flush(true)
  await this.request('admit',{instruction,bookId:this.record.workbook?.id??null,references})
 }
 syncHeader(){
  const next=this.host.closest('[data-odyssey-page=spreadsheet]')?.querySelector<HTMLElement>('[data-ework-spreadsheet-actions]')??undefined
  if(next===this.headerActions)return
  this.headerActions?.removeEventListener('click',this.click)
  this.headerActions?.removeEventListener('keydown',this.key)
  this.headerActions=next
  next?.addEventListener('click',this.click)
  next?.addEventListener('keydown',this.key)
  this.paintHeader()
 }
 private paintHeader(){
  const header=this.headerActions
  if(!header)return
  header.hidden=!this.record.workbook
  if(!this.record.workbook){header.replaceChildren();return}
  if(header.childElementCount===0)header.innerHTML=button('menu','',{glyph:'more',label:'更多表格操作',value:'book'})
 }
 private paint(){
  if(this.disposed)return
  this.syncHeader();this.paintHeader()
  const book=this.record.workbook
  this.chrome.hidden=!book;this.grid.hidden=!book;this.foot.hidden=!book;this.empty.hidden=!!book
  if(!book){
   const recent=this.recent.slice(0,6)
   this.empty.innerHTML=!this.ready?
    '<div class="ew-sheet-empty-inner"><p role="status">'+text(this.notice||'正在打开表格…')+'</p>'+(this.error?button('reload','重试'):'')+'</div>':
    '<div class="ew-sheet-empty-inner"><div class="ew-sheet-empty-icon">'+icon('grid',36)+'</div><h1>把分析，放进表格。</h1><p>从 Excel 继续工作，或让 AI 帮你搭起第一张分析表。</p><div class="ew-sheet-empty-actions">'+button('new','新建空白工作簿',{glyph:'plus',className:'primary',disabled:!this.editable||this.busy})+button('import','导入 Excel / CSV',{glyph:'upload',className:'outlined',disabled:!this.editable||this.busy})+'</div>'+(this.record.canRedoAI?'<div class="ew-sheet-empty-actions">'+button('redo-ai','重新应用 AI 修改',{glyph:'redo',className:'outlined',disabled:!this.editable||this.busy})+'</div>':'')+(recent.length?'<div class="ew-sheet-recent"><div>最近在此会话中使用</div>'+recent.map(b=>'<button data-action="activate" data-value="'+text(b.id)+'"'+(!this.editable||this.busy?' disabled':'')+'>'+icon('grid')+'<span><strong>'+text(b.name)+'</strong><small>'+b.sheetCount+' 个工作表</small></span>'+icon('link',14)+'</button>').join('')+'</div>':'')+'<p class="ew-sheet-empty-notice" role="status" data-error="'+this.error+'">'+text(this.notice)+'</p></div>'
   return
  }
  const current=this.current()
  this.chrome.innerHTML='<div class="ew-sheet-ribbon-tabs" role="tablist" aria-label="表格工具栏">'+ribbons.map(r=>'<button role="tab" aria-selected="'+(r===this.ribbon)+'" data-action="ribbon" data-value="'+r+'">'+r+'</button>').join('')+'</div><div class="ew-sheet-ribbon" role="toolbar" aria-label="'+this.ribbon+'">'+this.toolbar()+'</div><div class="ew-sheet-formula"><div class="ew-sheet-name"><input data-field="address" aria-label="单元格地址" autocomplete="off" spellcheck="false" value="'+text(this.active)+'">'+button('menu','',{glyph:'down',value:'ranges',label:'前往单元格'})+'</div><span class="ew-sheet-fx" aria-hidden="true">fx</span><input data-field="formula" aria-label="公式栏" autocomplete="off" spellcheck="false" '+(!this.editable?'readonly ':'')+'value="'+text(this.formula)+'"></div>'
  this.foot.innerHTML='<div class="ew-sheet-tabs"><div class="ew-sheet-tab-controls">'+button('menu','',{glyph:'grid',label:'工作表列表',value:'sheets'})+'</div><div class="ew-sheet-tab-list" role="tablist" aria-label="工作表">'+book.sheetOrder.map(id=>{
   const sheet=book.sheets[id]!,active=(current?.getSheetId()??this.selection?.sheetId??book.sheetOrder[0])===id
   return '<div class="ew-sheet-tab" data-current="'+active+'"><button type="button" role="tab" aria-selected="'+active+'" data-action="sheet" data-value="'+text(id)+'">'+text(sheet.name)+'</button>'+(active?button('menu','',{glyph:'down',label:'工作表选项',value:'sheet'}):'')+'</div>'
  }).join('')+'</div>'+button('add-sheet','',{glyph:'plus',label:'新增工作表',disabled:!this.editable||book.sheetOrder.length>=MAX_SHEETS})+'<span class="ew-sheet-sheet-count">'+book.sheetOrder.length+' 个工作表</span></div><div class="ew-sheet-status"><span class="ew-sheet-status-text" role="status"></span><div><span class="ew-sheet-selection-count">计数：'+this.count+'</span>'+button('zoom-minus','',{glyph:'minus',label:'缩小表格'})+button('zoom-reset',this.zoom+'%',{label:'重置表格缩放'})+button('zoom-plus','',{glyph:'plus',label:'放大表格'})+'</div></div>'
  this.refreshFields()
 }
 private toolbar(){
  const edit=(action:string,copy:string,opts:Parameters<typeof button>[2]={})=>button(action,copy,{...opts,disabled:!this.editable})
  const menu=(key:string,copy:string,glyph?:string,disabled=false)=>button('menu',copy,{value:key,glyph,disabled,className:'dropdown'})
  const divider='<span class="ew-sheet-toolbar-divider" aria-hidden="true"></span>'
  const end='<div class="ew-sheet-toolbar-spacer"></div><div class="ew-sheet-ribbon-end">'+edit('menu','Σ',{value:'functions',label:'插入函数'})+button('search','',{glyph:'search',label:'查找'})+button('focus','',{glyph:'focus',label:'专注表格'})+'</div>'
  switch(this.ribbon){
   case '文件':return edit('new','新建',{glyph:'plus'})+edit('rename-book','重命名')+end
   case '插入':return edit('add-sheet','工作表',{glyph:'plus'})+edit('row','插入行')+edit('column','插入列')+edit('merge','合并单元格')+button('chart','图表预览',{glyph:'chart'})+end
   case '数据':return edit('filter','筛选',{glyph:'filter'})+menu('sort','排序','sort',!this.editable)+edit('duplicates','去重')+end
   case '公式':return menu('functions','插入函数',undefined,!this.editable)+button('recalc','重新计算')+end
   case '视图':return menu('freeze','冻结','freeze',!this.editable)+edit('gridlines','网格线')+menu('zoom','缩放')+end
   default:return edit('undo','',{glyph:'undo',label:'撤销'})+edit('redo','',{glyph:'redo',label:'重做'})+divider+menu('font','默认字体',undefined,!this.editable)+menu('font-size','11',undefined,!this.editable)+divider+
    edit('bold','B',{label:'加粗',className:'bold'})+edit('italic','I',{label:'斜体',className:'italic'})+menu('color','A',undefined,!this.editable)+menu('border','','border',!this.editable)+menu('align','','align',!this.editable)+divider+
    menu('number','常规',undefined,!this.editable)+edit('number-format','¥',{label:'人民币',value:'"¥"#,##0.00'})+edit('number-format','%',{label:'百分比',value:'0.00%'})+edit('number-format','.00',{label:'两位小数',value:'#,##0.00'})+divider+edit('filter','筛选',{glyph:'filter'})+menu('freeze','冻结','freeze',!this.editable)+end
  }
 }
 private refreshFields(){
  if(this.disposed)return
  const status=this.foot.querySelector<HTMLElement>('.ew-sheet-status-text')
  if(status){status.textContent=this.notice||(this.busy?'正在处理…':this.dirty||this.writing?'正在保存…':this.editable?'就绪':'只读');status.dataset.error=String(this.error);status.title=status.textContent}
  this.paintHeader()
  const name=this.chrome.querySelector<HTMLInputElement>('[data-field=address]'),formula=this.chrome.querySelector<HTMLInputElement>('[data-field=formula]')
  if(name&&this.doc.activeElement!==name)name.value=this.active
  if(formula&&(!this.formulaDirty||this.doc.activeElement!==formula))formula.value=this.formula
  const count=this.foot.querySelector('.ew-sheet-selection-count')
  if(count)count.textContent=this.summary||'计数：'+this.count
  const zoom=this.foot.querySelector('[data-action=zoom-reset]')
  if(zoom)zoom.textContent=this.zoom+'%'
  this.refreshRibbonValues()
 }
 private refreshRibbonValues(){
  const cell=this.nativeCell()
  if(!cell||this.ribbon!=='开始')return
  const set=(id:string,value:string)=>{const node=this.chrome.querySelector('[data-value="'+id+'"]');if(node&&node.textContent!==value)node.textContent=value}
  const style=cell.getCellStyleData()
  const font=style?.ff
  set('font',font||'默认字体');set('font-size',String(style?.fs??11))
  const pattern=cell.getNumberFormat()
  set('number',pattern==='0.00%'?'百分比':pattern?.includes('¥')?'货币':pattern&&pattern!=='General'?'数值':'常规')
  for(const [action,pressed] of [['bold',style?.bl===1],['italic',style?.it===1]] as const)this.chrome.querySelector('[data-action='+action+']')?.setAttribute('aria-pressed',String(pressed))
 }
 private say(copy:string,error=false){
  this.notice=copy;this.error=error
  if(this.record.workbook)this.refreshFields()
  else this.paint()
 }
 private async install(record:WorkbookRecord){
  if(this.disposed)return
  this.closeMenu()
  const same=this.record.workbook?.id===record.workbook?.id
  const previous=same?this.selection:undefined
  let viewport
  // A canvas may still be mounting when a second revision arrives.
  try{if(previous)viewport=this.current()?.getScrollState()}catch{}
  this.modeToken++;const token=this.modeToken
  this.engine?.dispose();this.engine=undefined;this.grid.replaceChildren()
  this.record=record;this.dirty=false;this.calculationDirty=false;this.formulaDirty=false
  this.selection=undefined;this.summary='';this.active='A1';this.formula='';this.zoom=100;this.count=1
  this.paint()
  if(!record.workbook)return
  try{
   const {createSheetEngine}=await import('./engine')
   if(this.disposed||token!==this.modeToken)return
   this.engine=createSheetEngine(this.grid,record.workbook,this.editable,derived=>this.changed(derived),()=>this.readSelection())
   const book=this.engine.model
   if(previous&&book.getSheetBySheetId(previous.sheetId)){
    const sheet=book.setActiveSheet(previous.sheetId)
    try{sheet.getRange(previous.range).activate()}catch{}
    const scroll=viewport
    if(scroll)this.win.requestAnimationFrame(()=>{
     if(this.disposed||token!==this.modeToken||this.current()?.getSheetId()!==previous.sheetId)return
     try{sheet.scrollToCell(scroll.sheetViewStartRow,scroll.sheetViewStartColumn)}catch{}
    })
   }
   this.paint();this.readSelection()
  }catch(error){this.say('表格引擎无法启动：'+errorMessage(error),true)}
 }
 private readSelection(){
  if(!this.engine||this.disposed)return
  const sheet=this.current(),range=this.selected()
  if(!sheet||!range)return
  const r=range.getRow(),c=range.getColumn()
  this.active=address(r,c)
  const cell=sheet.getRange(this.active)
  this.formula=cell.getFormula()||String(cell.getRawValue()??'')
  this.count=(range.getLastRow()-range.getRow()+1)*(range.getLastColumn()-range.getColumn()+1)
  this.zoom=Math.round(sheet.getZoom()*100)
  const now={sheetId:sheet.getSheetId(),range:range.getA1Notation()}
  const previous=this.selection
  this.selection=now
  const values=this.count<=10000?range.getRawValues().flat():[]
  const used=values.filter(v=>v!==null&&v!==undefined&&v!=='')
  const numbers=used.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v))
  const decimal=new Intl.NumberFormat(undefined,{maximumFractionDigits:4})
  const sum=numbers.reduce((a,b)=>a+b,0)
  this.summary=this.count>10000?'已选 '+decimal.format(this.count)+' 格':this.count>1&&numbers.length?
   '平均值：'+decimal.format(sum/numbers.length)+'　计数：'+used.length+'　求和：'+decimal.format(sum):'计数：'+used.length
  if(previous&&previous.sheetId!==now.sheetId)this.paint()
  this.refreshFields()
 }
 private selectionSignature(){return this.selection?this.selection.sheetId+'!'+this.selection.range:''}
 private referenceSelection(explicit=false){
  const selection=this.selection,workbook=this.record.workbook,sheet=this.current()
  if(!selection||!workbook||!sheet||sheet.getSheetId()!==selection.sheetId||!this.host.isConnected)return
  try{
   const bounds=parseRange(selection.range)
   if(!explicit&&bounds.r0===bounds.r1&&bounds.c0===bounds.c1)return
   if(bounds.r1>=sheet.getMaxRows()||bounds.c1>=sheet.getMaxColumns())return
  }catch(error){if(explicit)this.say(errorMessage(error),true);return}
  this.win.dispatchEvent(new CustomEvent('sherlock:spreadsheet-range',{detail:{sessionId:this.sessionId,bookId:workbook.id,sheetName:sheet.getSheetName(),...selection,explicit}}))
 }
 private finishSelection(gesture:{signature:string;engine:SheetEngine}){
  this.win.requestAnimationFrame(()=>{
   if(this.disposed||this.engine!==gesture.engine||gesture.engine.model.isCellEditing())return
   this.readSelection()
   if(this.selectionSignature()!==gesture.signature)this.referenceSelection()
  })
 }
 private selectionStart=(event:PointerEvent)=>{
  if(event.button!==0||!this.engine||!(event.target instanceof HTMLCanvasElement)||this.engine.model.isCellEditing())return
  this.pointerSelection={pointerId:event.pointerId,signature:this.selectionSignature(),engine:this.engine}
 }
 private selectionEnd=(event:PointerEvent)=>{
  const gesture=this.pointerSelection
  if(!gesture||gesture.pointerId!==event.pointerId)return
  this.pointerSelection=undefined
  this.finishSelection(gesture)
 }
 private selectionCancel=()=>{this.pointerSelection=undefined}
 private selectionReset=()=>{this.selectionCancel();this.shiftSelection=undefined}
 private selectionKeyDown=(event:KeyboardEvent)=>{
  if(!event.shiftKey||!event.key.startsWith('Arrow')||!this.engine||this.engine.model.isCellEditing())return
  const control=event.target as HTMLElement
  if(control?.closest('input,textarea,[contenteditable=true],button')||!(this.grid.contains(control)||this.grid.contains(this.doc.activeElement)))return
  this.shiftSelection??={signature:this.selectionSignature(),engine:this.engine}
 }
 private selectionKeyUp=(event:KeyboardEvent)=>{
  if(event.key!=='Shift'||!this.shiftSelection)return
  const gesture=this.shiftSelection;this.shiftSelection=undefined;this.finishSelection(gesture)
 }
 private changed(derived=false){
  if(this.disposed||!this.engine||!this.editable)return
  if(derived)this.calculationDirty=true;else this.dirty=true
  this.refreshFields()
  this.win.clearTimeout(this.timer)
  this.timer=this.win.setTimeout(()=>void this.flush(false).catch(()=>{}),140)
  if(this.updateTimer)return
  this.updateTimer=this.win.setTimeout(()=>{this.updateTimer=0;this.readSelection()},32)
 }
 async flush(commit=true,settleFormulas=false){
  const enqueue=async()=>{
   if(!this.engine||!this.editable)return
   if(commit&&this.formulaDirty)this.commitFormula()
   if(commit&&this.engine.model.isCellEditing())await this.engine.model.endEditingAsync(true)
   if(settleFormulas){
    const engine=this.engine
    // A tool can read immediately after an AI edit; wait for the current
    // calculation session so the saved formula caches describe those cells.
    try{await engine.api.getFormula().onCalculationResultApplied(1400)}catch{}
    if(this.engine!==engine||this.disposed)return
    this.calculationDirty=true
   }
   this.win.clearTimeout(this.timer)
   const dirty=this.dirty,calculated=this.calculationDirty
   if(!dirty&&!calculated)return
   this.dirty=false;this.calculationDirty=false;this.writing=true;this.writingUser=dirty;this.refreshFields()
   const token=this.modeToken
   try{
    const workbook=this.engine.snapshot()
    const row=await this.request(dirty?'save':'refresh-calculations',{revision:this.record.revision,workbook}) as WorkbookRecord
    if(this.modeToken===token&&!this.disposed){this.record=row;this.error=false;if(this.notice==='保存失败，请重试')this.notice=''}
   }catch(error){if(dirty){if(this.modeToken===token&&!this.disposed){this.dirty=true;this.say(errorMessage(error),true)}throw error}}
   finally{this.writing=false;this.writingUser=false;this.refreshFields()}
  }
  const job=this.task.catch(()=>{}).then(enqueue)
  this.task=job
  await job
 }
 async external(row:WorkbookRecord){
  if(this.disposed||row.revision<=this.record.revision)return
  if(this.dirty||this.writingUser||this.formulaDirty||this.engine?.model.isCellEditing()){
   this.incoming=row
   this.say('工作簿有新版本，当前编辑仍保留。可通过工作簿选项载入最新版本。',true)
   return
  }
  await this.install(row)
  this.say(row.lastAction?'AI 修改已保存':'工作簿已更新')
 }
 private async run(action:string,fields:Record<string,unknown>={},message?:string){
  if(this.busy)return
  this.busy=true;this.say('')
  try{
   await this.flush(true)
   if(this.disposed)return
   const row=await this.request(action,{revision:this.record.revision,...fields})
   if(this.disposed||!row)return
   if(action==='export'){this.say('已导出 '+row.name);return}
   this.recent=await this.request('recent')
   await this.install(row)
   if(message)this.say(message)
  }catch(error){this.say(errorMessage(error),true)}
  finally{this.busy=false;this.refreshFields();if(!this.record.workbook)this.paint()}
 }
 private jump(value:string,reference=false){
  const sheet=this.current();if(!sheet)return
  const r=parseRange(value.trim())
  if(r.r1>=sheet.getMaxRows()||r.c1>=sheet.getMaxColumns())throw Error('区域超出当前工作表。')
  sheet.getRange(value.trim().toUpperCase()).activate()
  try{sheet.scrollToCell(r.r0,r.c0)}catch(error){
   if(!errorMessage(error).includes('SheetsScrollRenderController'))throw error
   this.win.requestAnimationFrame(()=>{try{if(this.current()?.getSheetId()===sheet.getSheetId())sheet.scrollToCell(r.r0,r.c0)}catch{}})
  }
  this.readSelection()
  if(reference)this.referenceSelection()
 }
 private commitFormula(){
  if(!this.formulaDirty)return
  const field=this.chrome.querySelector<HTMLInputElement>('[data-field=formula]'),cell=this.nativeCell()
  if(!field||!cell||!this.editable)return
  const value=field.value
  if(value.startsWith('='))cell.setFormula(safeFormula(value))
  else if(!value)cell.clearContent()
  else if(value.startsWith("'"))cell.setValue({v:value.slice(1),t:1})
  else cell.setValue(numeric(value))
  this.formulaDirty=false
  this.changed();this.readSelection()
 }
 private items(key:string):Item[]{
  const items=(values:string[],action:string)=>values.map(value=>({label:value,action,value}))
  const sheet=this.current()
  switch(key){
   case 'export':return [
    {label:'Excel 工作簿 (.xlsx)',detail:'全部 '+this.record.workbook!.sheetOrder.length+' 个工作表 · 保留公式与常用格式',action:'export-format',value:'xlsx',icon:'grid'},
    {label:'CSV 文件 (.csv)',detail:'仅当前工作表 · 不包含公式与格式',action:'export-format',value:'csv',icon:'grid'}
   ]
   case 'book':return [
    {label:'导入 Excel / CSV…',action:'import',icon:'upload',disabled:!this.editable||this.busy},
    {label:'导出工作簿',action:'menu',value:'export',icon:'download',disabled:this.busy},
    {label:'重命名工作簿',action:'rename-book',disabled:!this.editable},{label:'新建空白工作簿',action:'new',disabled:!this.editable},
    ...this.record.canRedoAI?[{label:'重新应用 AI 修改',action:'redo-ai',disabled:!this.editable}]:[],
    ...this.record.lastAction?[{label:'撤销最近的 AI 修改',action:'undo-ai',disabled:!this.editable}]:[],
    ...this.incoming?[{label:'载入最新版本',action:'load-incoming'}]:[],
    {label:'打开最近工作簿',action:'menu',value:'workbooks'}
   ]
   case 'workbooks':return [{label:'重命名工作簿',action:'rename-book',disabled:!this.editable},...this.recent.map(b=>({label:b.name,action:'activate',value:b.id,icon:'grid',disabled:!this.editable||this.record.workbook?.id===b.id}))]
   case 'sheets':return this.record.workbook!.sheetOrder.map(id=>({label:this.record.workbook!.sheets[id]!.name,action:'sheet',value:id,icon:'grid'}))
   case 'sheet':return [{label:'重命名工作表',action:'rename-sheet',disabled:!this.editable},{label:'删除工作表…',action:'delete-sheet',disabled:!this.editable||this.record.workbook!.sheetOrder.length===1}]
   case 'font':return [{label:'默认字体',action:'font',value:'Arial'},...items(['Arial','Menlo','Georgia','PingFang SC','Microsoft YaHei'],'font')]
   case 'font-size':return items(['9','10','11','12','14','16','18','20','24','32'],'font-size')
   case 'color':return [{label:'默认文字颜色',action:'text-color',value:''},{label:'白色',action:'text-color',value:'#ffffff'},{label:'深灰色',action:'text-color',value:'#27272a'},{label:'蓝色',action:'text-color',value:'#85b3ff'},{label:'红色',action:'text-color',value:'#ef6269'},{label:'绿色',action:'text-color',value:'#3bb878'},{label:'浅灰填充',action:'fill',value:'#343a43'},{label:'清除填充',action:'fill',value:''}]
   case 'border':return [{label:'所有边框',action:'border',value:'all'},{label:'外边框',action:'border',value:'outside'},{label:'下边框',action:'border',value:'bottom'},{label:'清除边框',action:'border',value:'none'}]
   case 'align':return [{label:'左对齐',action:'align',value:'left'},{label:'居中',action:'align',value:'center'},{label:'右对齐',action:'align',value:'right'}]
   case 'number':return [{label:'常规',action:'number-format',value:'General'},{label:'数值 · 1,234.00',action:'number-format',value:'#,##0.00'},{label:'人民币 · ¥1,234.00',action:'number-format',value:'"¥"#,##0.00'},{label:'百分比 · 12.34%',action:'number-format',value:'0.00%'},{label:'日期 · 年-月-日',action:'number-format',value:'yyyy-mm-dd'}]
   case 'freeze':return [{label:'冻结首行',action:'freeze',value:'row'},{label:'冻结首列',action:'freeze',value:'col'},{label:'冻结选区上方及左侧',action:'freeze',value:'selection'},{label:'取消冻结',action:'freeze',value:'none'}]
   case 'sort':return [{label:'按选区首列升序',action:'sort',value:'asc'},{label:'按选区首列降序',action:'sort',value:'desc'}]
   case 'functions':return items(['SUM','AVERAGE','MIN','MAX','COUNT','IF','IFERROR','NPV','IRR','XIRR'],'function')
   case 'zoom':return items(['50%','75%','100%','125%','150%','200%'],'zoom')
   case 'ranges':return [{label:'引用当前选区到对话',action:'reference-selection'},{label:'前往 A1',action:'jump',value:'A1'},{label:'输入单元格地址…',action:'address-dialog'},...sheet?[{label:'前往当前选区 '+this.selection?.range,action:'jump',value:this.selection?.range}]:[]]
  }
  return []
 }
 private openMenu(key:string,anchor:HTMLElement){
  if(this.menu?.key===key&&this.menu.anchor===anchor){this.closeMenu();return}
  this.menu?.anchor.setAttribute('aria-expanded','false')
  const options=this.items(key)
  this.menu={key,anchor}
  anchor.setAttribute('aria-expanded','true')
  this.pop.hidden=false
  this.pop.dataset.menu=key
  this.pop.setAttribute('role','menu')
  this.pop.setAttribute('aria-label',key==='export'?'导出工作簿':anchor.getAttribute('aria-label')||anchor.textContent||'表格菜单')
  this.pop.innerHTML=(key==='export'?'<div class="ew-sheet-menu-title">导出工作簿</div>':'')+options.map(item=>'<button role="menuitem" data-action="'+item.action+'"'+(item.value!==undefined?' data-value="'+text(item.value)+'"':'')+(item.disabled?' disabled':'')+(item.action==='menu'?' aria-haspopup="menu"':'')+'>'+(item.icon?icon(item.icon):'')+'<span>'+text(item.label)+(item.detail?'<small>'+text(item.detail)+'</small>':'')+'</span>'+(item.action==='menu'?icon('right',12):'')+'</button>').join('')+(key==='export'?'<p>导出到本机后，可直接在 Excel 中继续编辑。</p>':'')
  this.place()
  if(this.headerActions?.contains(anchor))this.pop.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true})
 }
 private place=()=>{
  if(!this.menu)return
  const {anchor,key}=this.menu
  if(!anchor.isConnected){this.closeMenu();return}
  const parent=this.root.getBoundingClientRect(),ref=anchor.getBoundingClientRect(),width=this.pop.offsetWidth,height=this.pop.offsetHeight
  const fromHeader=this.headerActions?.contains(anchor)
  const preferred=fromHeader||key==='export'?ref.right-parent.left-width:ref.left-parent.left
  const left=Math.max(10,Math.min(preferred,parent.width-width-10))
  const below=Math.max(fromHeader?4:0,ref.bottom-parent.top+8)
  const top=below+height>parent.height-8?Math.max(8,ref.top-parent.top-height-8):below
  this.pop.style.left=left+'px';this.pop.style.top=top+'px'
 }
 private closeMenu(){this.menu?.anchor.setAttribute('aria-expanded','false');this.menu=undefined;this.pop.hidden=true}
 private outside=(event:PointerEvent)=>{if(this.menu&&!this.pop.contains(event.target as Node)&&!this.menu.anchor.contains(event.target as Node))this.closeMenu()}
 private dialog(title:string,body:string,action:string,copy='确定'){
  this.closeMenu()
  this.modal.hidden=false
  this.modal.innerHTML='<section role="dialog" aria-modal="true" aria-label="'+text(title)+'"><header><h2>'+text(title)+'</h2>'+button('close-dialog','',{glyph:'close',label:'关闭'})+'</header><div class="ew-sheet-dialog-body">'+body+'</div><footer>'+button('close-dialog','取消',{className:'outlined'})+button(action,copy,{className:'primary'})+'</footer></section>'
  const input=this.modal.querySelector('input');if(input){input.focus();input.select()}else this.modal.querySelector('button')?.focus()
 }
 private closeDialog(){this.modal.hidden=true;this.modal.replaceChildren()}
 private chart(){
  const range=this.selected()
  if(!range)return
  if((range.getLastRow()-range.getRow()+1)*(range.getLastColumn()-range.getColumn()+1)>500)throw Error('请选中不超过 500 格的图表数据。')
  const values=range.getValues().flatMap((row,i)=>{
   const number=[...row].reverse().find(v=>typeof v==='number')
   return typeof number==='number'?[{label:typeof row[0]==='string'?row[0]:String(range.getRow()+i+1),number}]:[]
  }).slice(0,24)
  if(!values.length)throw Error('请选中包含数值的区域。')
  const scale=Math.max(...values.map(v=>Math.abs(v.number)),1)
  this.dialog('选区图表预览','<p>数据来源：'+text(this.current()!.getSheetName()+'!'+range.getA1Notation())+'</p><div class="ew-sheet-chart">'+values.map(v=>'<div><span>'+text(v.label)+'</span><i style="width:'+Math.max(1,Math.round(Math.abs(v.number)/scale*100))+'%;--bar:'+(v.number<0?'#df7376':'#82aaff')+'"></i><strong>'+text(v.number)+'</strong></div>').join('')+'</div>','close-dialog','完成')
 }
 private search(){
  const sheet=this.current();if(!sheet)return
  const query=(this.modal.querySelector<HTMLInputElement>('input')?.value||'').trim().toLocaleLowerCase()
  if(!query)return
  if(this.findQuery!==query){this.findQuery=query;this.findIndex=0}
  const data=this.engine?.snapshot().sheets[sheet.getSheetId()]?.cellData??{}
  const matches=Object.entries(data).flatMap(([r,row])=>Object.entries(row).filter(([,c])=>String(c.v??'').toLocaleLowerCase().includes(query)||c.f?.toLocaleLowerCase().includes(query)).map(([c])=>address(Number(r),Number(c))))
  const result=this.modal.querySelector('.ew-sheet-find-result')
  if(!matches.length){if(result)result.textContent='没有找到匹配内容';return}
  const index=this.findIndex++%matches.length
  this.jump(matches[index]!)
  if(result)result.textContent=matches[index]+' · '+(index+1)+' / '+matches.length
 }
 private async handle(action:string,value:string,trigger:HTMLElement){
  if(this.busy&&['undo','redo','undo-ai','redo-ai'].includes(action))return
  const sheet=this.current(),range=this.selected(),api=this.engine?.api,model=this.engine?.model
  if(action==='menu'){this.openMenu(value,trigger.closest('.ew-sheet-menu')?this.menu?.anchor??trigger:trigger);return}
  this.closeMenu()
  switch(action){
   case 'reload':await this.load();return
   case 'ribbon':if(this.formulaDirty)this.commitFormula();this.ribbon=value as Ribbon;this.paint();return
   case 'new':await this.run('create',{},'空白工作簿已创建');return
   case 'import':await this.run('import',{},'工作簿已导入');return
   case 'activate':await this.run('activate',{id:value});return
   case 'export-format':if(sheet){if(api){const calculated=api.getFormula().onCalculationResultApplied(1200).catch(()=>{});api.getFormula().executeCalculation();await calculated}await this.run('export',{format:value,sheetId:sheet.getSheetId()})}return
   case 'redo-ai':if(this.record.canRedoAI)await this.run('redo',{},'已重新应用 AI 修改');return
   case 'undo-ai':if(this.record.lastAction)await this.run('undo',{actionId:this.record.lastAction},'已撤销 AI 修改');return
   case 'load-incoming':if(this.incoming){this.dialog('载入最新版本','<p>当前还未保存的编辑会丢失。</p>','accept-incoming','载入');}return
   case 'accept-incoming':if(this.incoming){const row=this.incoming;this.incoming=undefined;this.closeDialog();await this.install(row);this.say('已载入最新版本')}return
   case 'sheet':if(this.formulaDirty)this.commitFormula();model?.setActiveSheet(value);this.readSelection();this.paint();return
   case 'jump':this.jump(value);return
   case 'address-dialog':this.dialog('前往单元格','<input aria-label="地址" value="'+text(this.active)+'" placeholder="例如 A1 或 A1:D8">','address-apply','前往');return
   case 'address-apply':this.jump(this.modal.querySelector('input')?.value??'',true);this.closeDialog();return
   case 'reference-selection':this.referenceSelection(true);return
   case 'search':this.dialog('查找','<input aria-label="搜索内容" placeholder="在当前工作表中查找"><p class="ew-sheet-find-result" role="status"></p>','find-next','查找下一个');return
   case 'find-next':this.search();return
   case 'chart':this.chart();return
   case 'close-dialog':this.closeDialog();return
   case 'focus':this.doc.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry="right"]')?.click();return
   case 'zoom-minus':case 'zoom-plus':case 'zoom-reset':case 'zoom':{
    const value2=action==='zoom-reset'?100:action==='zoom'?Number(value.replace('%','')):this.zoom+(action==='zoom-plus'?10:-10)
    this.zoom=Math.min(200,Math.max(50,value2));sheet?.zoom(this.zoom/100);this.refreshFields();return
   }
   case 'recalc':api?.getFormula().executeCalculation();this.say('正在重新计算公式');return
  }
  if(!model||!sheet||!range||!this.editable)return
  switch(action){
   case 'rename-book':this.dialog('重命名工作簿','<input aria-label="工作簿名" maxlength="120" value="'+text(this.record.workbook?.name)+'">','rename-book-apply','保存');return
   case 'rename-book-apply':model.setName(label(this.modal.querySelector('input')?.value));this.closeDialog();break
   case 'rename-sheet':this.dialog('重命名工作表','<input aria-label="工作表名" maxlength="31" value="'+text(sheet.getSheetName())+'">','rename-sheet-apply','保存');return
   case 'rename-sheet-apply':{
    const name=sheetName(this.modal.querySelector('input')?.value)
    if(model.getSheets().some(s=>s.getSheetId()!==sheet.getSheetId()&&s.getSheetName().toLowerCase()===name.toLowerCase()))throw Error('工作表名称已存在。')
    sheet.setName(name);this.closeDialog();break
   }
   case 'delete-sheet':this.dialog('删除工作表','<p>删除「'+text(sheet.getSheetName())+'」及其中的单元格？</p>','delete-sheet-apply','删除');return
   case 'delete-sheet-apply':if(model.getSheets().length>1)model.deleteSheet(sheet);this.closeDialog();break
   case 'add-sheet':{
    if(model.getSheets().length>=MAX_SHEETS)throw Error('工作表数量已达上限。')
    const names=new Set(model.getSheets().map(s=>s.getSheetName().toLowerCase()));let i=1;while(names.has('sheet'+i))i++
    const next=model.insertSheet('Sheet'+i,{sheet:{rowCount:1000,columnCount:50,defaultRowHeight:30,defaultColumnWidth:100}})
    if(next)model.setActiveSheet(next);break
   }
   case 'undo':if(this.record.lastAction&&!this.dirty&&!this.writingUser){await this.run('undo',{actionId:this.record.lastAction},'已撤销 AI 修改');return}await api!.undo();break
   case 'redo':if(this.record.canRedoAI&&!this.dirty&&!this.writingUser){await this.run('redo',{},'已重新应用 AI 修改');return}await api!.redo();break
   case 'bold':range.setFontWeight(this.nativeCell()?.getCellStyleData()?.bl===1?'normal':'bold');break
   case 'italic':range.setFontStyle(this.nativeCell()?.getCellStyleData()?.it===1?'normal':'italic');break
   case 'font':range.setFontFamily(value);break
   case 'font-size':range.setFontSize(Number(value));break
   case 'text-color':range.setFontColor(value||null);break
   case 'fill':if(value)range.setBackground(value);else await this.engine!.clearFill();break
   case 'number-format':range.setNumberFormat(value);break
   case 'align':await this.engine!.align(value);break
   case 'border':{
    const type={all:api!.Enum.BorderType.ALL,outside:api!.Enum.BorderType.OUTSIDE,bottom:api!.Enum.BorderType.BOTTOM,none:api!.Enum.BorderType.NONE}[value]
    if(type)range.setBorder(type,api!.Enum.BorderStyleTypes.THIN,'#7a8799')
    break
   }
   case 'filter':{
    const existing=sheet.getFilter()
    if(existing)existing.remove()
    else if((range.getLastRow()-range.getRow()+1)>1)range.createFilter()
    else throw Error('请选中包含表头和数据行的区域。')
    break
   }
   case 'sort':if((range.getLastRow()-range.getRow()+1)<2)throw Error('请选中至少两行数据。');else range.sort({column:0,ascending:value==='asc'});break
   case 'freeze':{
    const x=value==='col'?1:value==='selection'?range.getColumn():0,y=value==='row'?1:value==='selection'?range.getRow():0
    sheet.setFreeze({xSplit:x,ySplit:y,startColumn:x||-1,startRow:y||-1});break
   }
   case 'gridlines':sheet.setHiddenGridlines(!sheet.hasHiddenGridLines());break
   case 'row':if(sheet.getMaxRows()>=MAX_ROWS)throw Error('行数已达上限。');sheet.insertRows(range.getRow(),1);break
   case 'column':if(sheet.getMaxColumns()>=MAX_COLUMNS)throw Error('列数已达上限。');sheet.insertColumns(range.getColumn(),1);break
   case 'merge':{
    if((range.getLastRow()-range.getRow()+1)*(range.getLastColumn()-range.getColumn()+1)<2)throw Error('请选中至少两个单元格。')
    if(range.getCellDatas().flat().slice(1).some(c=>c?.v!==undefined&&c.v!==null||c?.f))throw Error('选区含多个有值单元格，请先整理内容。')
    range.merge();break
   }
   case 'duplicates':this.dialog('去除重复行','<p>在选区中逐行比较单元格值和公式，保留第一次出现的行。请先选中不含表头的数据。</p>','dedupe-apply','去重');return
   case 'dedupe-apply':{
    const data=range.getCellDatas()
    if(data.length<2||(range.getLastColumn()-range.getColumn()+1)*data.length>10000)throw Error('请选择 2 行以上且不超过 10000 格的数据。')
    const seen=new Set<string>(),unique=data.filter(row=>{const key=JSON.stringify(row.map(cell=>[cell?.f??'',cell?.v??null]));if(seen.has(key))return false;seen.add(key);return true})
    const removed=data.length-unique.length
    this.closeDialog()
    if(!removed){this.say('选区没有重复行');return}
    const blank=Array.from({length:(range.getLastColumn()-range.getColumn()+1)},()=>({v:null,f:null,t:null,p:null}))
    range.setValues([...unique.map(row=>row.map(c=>c??{v:null,f:null,t:null,p:null})),...Array.from({length:removed},()=>blank)])
    this.say('已去除 '+removed+' 行重复数据');break
   }
   case 'function':{
    const target=this.chrome.querySelector<HTMLInputElement>('[data-field=formula]')!
    target.value='='+value+'()';target.focus();target.setSelectionRange(value.length+2,value.length+2);this.formulaDirty=true;return
   }
   default:return
  }
  this.changed()
  if(['rename-book-apply','rename-sheet-apply','delete-sheet-apply','add-sheet'].includes(action)){
   this.record={...this.record,workbook:this.engine!.snapshot()};this.paint()
  }
  this.readSelection()
 }
 private click=(event:Event)=>{
  const trigger=(event.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if(!trigger||!this.root.contains(trigger)&&!this.headerActions?.contains(trigger))return
  void this.handle(trigger.dataset.action!,trigger.dataset.value??'',trigger).catch(error=>this.say(errorMessage(error),true))
 }
 private input=(event:Event)=>{if((event.target as HTMLElement).dataset.field==='formula')this.formulaDirty=true}
 private blur=(event:FocusEvent)=>{
  if((event.target as HTMLElement).dataset.field!=='formula'||!this.formulaDirty)return
  try{this.commitFormula()}catch(error){this.say(errorMessage(error),true)}
 }
 private gridPaste=(event:KeyboardEvent)=>{
  const control=event.target as HTMLElement,engine=this.engine
  if(!event.isTrusted||!engine||!this.editable||!(event.metaKey||event.ctrlKey)||event.shiftKey||event.altKey||event.key.toLowerCase()!=='v')return
  const gridFocus=this.grid.contains(control)||control?.id.startsWith('__editor___INTERNAL_EDITOR__DOCS_NORMAL')
  if(!gridFocus||engine.model.isCellEditing()||control instanceof HTMLInputElement||control instanceof HTMLTextAreaElement)return
  const target=engine.capturePasteTarget()
  if(!target)return
  event.preventDefault();event.stopImmediatePropagation()
  void this.request('clipboard-text').then(async source=>{
   if(this.disposed||this.engine!==engine||!source)return
   if(!await engine.pasteText(source,target))this.say('无法将剪贴板内容粘贴到当前选区。',true)
  }).catch(error=>this.say(errorMessage(error),true))
 }
 private key=(event:KeyboardEvent)=>{
  const control=event.target as HTMLElement,field=control.dataset.field
  if(control instanceof HTMLInputElement&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'){
   event.preventDefault();event.stopPropagation();control.select();return
  }
  try{
   if(event.key==='Escape'){
    if(this.menu){const anchor=this.menu.anchor;this.closeMenu();anchor.focus();event.stopPropagation()}
    else if(!this.modal.hidden){this.closeDialog();event.stopPropagation()}
    else if(field==='formula'){this.formulaDirty=false;(event.target as HTMLInputElement).value=this.formula}
    return
   }
   if(this.headerActions?.contains(control)&&control.dataset.value==='book'&&['ArrowDown','ArrowUp'].includes(event.key)&&!this.menu){
    event.preventDefault();this.openMenu('book',control);return
   }
   if(this.menu&&event.key==='ArrowLeft'&&this.menu.key==='export'&&this.headerActions?.contains(this.menu.anchor)){
    event.preventDefault();this.openMenu('book',this.menu.anchor)
    this.pop.querySelector<HTMLButtonElement>('[data-value=export]')?.focus({preventScroll:true});return
   }
   if(this.menu?.key==='book'&&event.key==='ArrowRight'&&control.dataset.action==='menu'&&this.pop.contains(control)){
    event.preventDefault();control.click();return
   }
   if(this.menu&&['ArrowDown','ArrowUp'].includes(event.key)&&((event.target as Node)===this.menu.anchor||this.pop.contains(event.target as Node))){
    const items=Array.from(this.pop.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if(items.length){const i=items.indexOf(this.doc.activeElement as HTMLButtonElement);items[(i<0?event.key==='ArrowDown'?0:items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length)]?.focus()}
    event.preventDefault();return
   }
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopPropagation();void this.handle('search','',this.root);return}
   if(event.key!=='Enter')return
   if(field==='formula'){event.preventDefault();this.commitFormula();(event.target as HTMLInputElement).blur()}
   else if(field==='address'){event.preventDefault();this.jump((event.target as HTMLInputElement).value,true);(event.target as HTMLInputElement).blur()}
   else if(!this.modal.hidden&&(event.target as HTMLElement).tagName==='INPUT'){event.preventDefault();this.modal.querySelector<HTMLButtonElement>('footer button:last-child')?.click()}
  }catch(error){this.say(errorMessage(error),true)}
 }
 belongs(value:{owner?:string;sessionId?:string}){return !this.disposed&&this.ready&&value.owner===this.owner&&value.sessionId===this.sessionId}
 dispose(){
  if(this.disposed)return
  this.disposed=true;this.win.clearTimeout(this.timer);this.win.clearTimeout(this.updateTimer)
  this.doc.removeEventListener('keydown',this.gridPaste,true);this.doc.removeEventListener('pointerdown',this.outside,true);this.win.removeEventListener('resize',this.place)
  this.win.removeEventListener('pointerup',this.selectionEnd,true);this.win.removeEventListener('pointercancel',this.selectionCancel,true)
  this.win.removeEventListener('blur',this.selectionReset)
  this.doc.removeEventListener('keydown',this.selectionKeyDown,true);this.doc.removeEventListener('keyup',this.selectionKeyUp,true)
  this.headerActions?.removeEventListener('click',this.click)
  this.headerActions?.removeEventListener('keydown',this.key)
  this.headerActions?.replaceChildren()
  this.engine?.dispose();this.root.remove()
  if(this.doc.body.dataset.eworkSpreadsheetSession===this.sessionId)delete this.doc.body.dataset.eworkSpreadsheetSession
 }
}

export function mountSpreadsheet(doc:Document,bridge:Bridge){
 let view:SpreadsheetView|undefined,anchor:HTMLElement|undefined,queued=false,disposed=false
 const style=doc.createElement('style');style.id='ework-spreadsheet-style';style.textContent=css;doc.head.append(style)
 const scan=()=>{
  queued=false;if(disposed)return
  const next=!doc.body.dataset.workspaceSurface?doc.querySelector<HTMLElement>('[data-odyssey-page=spreadsheet] [data-ework-spreadsheet-view]')??undefined:undefined
  if(next===anchor){view?.syncHeader();return}
  view?.dispose();anchor=next
  view=next?.dataset.eworkSpreadsheetView?new SpreadsheetView(next,next.dataset.eworkSpreadsheetView,bridge):undefined
  if(view)doc.body.dataset.eworkSpreadsheetMode='true';else delete doc.body.dataset.eworkSpreadsheetMode
  doc.defaultView?.dispatchEvent(new CustomEvent('sherlock:spreadsheet-mode',{detail:{active:!!view}}))
 }
 const schedule=()=>{if(!queued){queued=true;queueMicrotask(scan)}}
 const observer=new MutationObserver(schedule)
 observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-odyssey-page','data-workspace-surface','data-ework-spreadsheet-view']})
 const off=[
  bridge.subscribe('changed',value=>{if(view?.belongs(value))void view.external(value.record)}),
  bridge.subscribe('flush',value=>{const current=view;if(!current?.belongs(value))return;void current.flush(true,true).then(()=>bridge.flushResult({...value,ok:true}),()=>bridge.flushResult({...value,ok:false})).catch(()=>{})}),
  bridge.subscribe('identity',()=>{view?.dispose();view=undefined;anchor=undefined;schedule()})
 ]
 scan()
 return {admit:(id:string,prompt:string,references:unknown)=>{
  if(doc.body.dataset.eworkSpreadsheetSession!==id||!view)throw Error('当前表格已切换。')
  return view.admit(prompt,references)
 },
  flush:(id:string)=>doc.body.dataset.eworkSpreadsheetSession===id&&view?view.flush():Promise.resolve(),
  dispose:()=>{disposed=true;delete doc.body.dataset.eworkSpreadsheetMode;observer.disconnect();off.forEach(fn=>fn());view?.dispose();style.remove()}}
}
