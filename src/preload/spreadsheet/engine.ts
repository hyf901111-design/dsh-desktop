import {createUniver,defaultTheme,mergeLocales,LocaleType} from '@univerjs/presets'
import {UniverSheetsCorePreset} from '@univerjs/preset-sheets-core'
import {UniverSheetsFilterPreset} from '@univerjs/preset-sheets-filter'
import {UniverSheetsSortPreset} from '@univerjs/preset-sheets-sort'
import coreZh from '@univerjs/preset-sheets-core/locales/zh-CN'
import filterZh from '@univerjs/preset-sheets-filter/locales/zh-CN'
import sortZh from '@univerjs/preset-sheets-sort/locales/zh-CN'
import coreEn from '@univerjs/preset-sheets-core/locales/en-US'
import filterEn from '@univerjs/preset-sheets-filter/locales/en-US'
import sortEn from '@univerjs/preset-sheets-sort/locales/en-US'
import {ThemeService,CommandType,Inject,Injector,Plugin,InterceptorEffectEnum,HorizontalAlign,VerticalAlign,type IWorkbookData} from '@univerjs/core'
import {ResetBackgroundColorCommand,SetHorizontalTextAlignCommand,SheetInterceptorService,INTERCEPTOR_POINT} from '@univerjs/sheets'
import {IRenderManagerService,ICanvasColorService,CanvasColorService,type IRender} from '@univerjs/engine-render'
import {SHEET_VIEW_KEY,SheetPasteShortKeyCommand,ISheetClipboardService} from '@univerjs/sheets-ui'
import coreCss from '@univerjs/preset-sheets-core/lib/index.css?raw'
import filterCss from '@univerjs/preset-sheets-filter/lib/index.css?raw'
import sortCss from '@univerjs/preset-sheets-sort/lib/index.css?raw'
import {safeFormula,type Workbook} from '../../shared/spreadsheet/workbook'

const editorStyles=[coreCss,filterCss,sortCss].map(css=>css.replace(/^\*\s*\{\s*scrollbar-color: initial;\s*scrollbar-width: initial;\s*\}/m,'')).join('\n')

export function createSheetEngine(host:HTMLElement,workbook:Workbook,editable:boolean,change:(derived?:boolean)=>void,selection:()=>void){
 const doc=host.ownerDocument,win=doc.defaultView!
 const style=doc.createElement('style');style.textContent=editorStyles;doc.head.append(style)
 const originalDark=doc.documentElement.classList.contains('univer-dark')
 const dark=()=>doc.body.hasAttribute('data-ds-dark-theme')
 const palette=()=>dark()?{text:'#dedede',header:'#242424',grid:'#303030',canvas:'#1b1b1b'}:{text:'#333438',header:'#f4f5f6',grid:'#e4e5e8',canvas:'#fff'}
 const scroll=()=>{
  const track=palette().header
  return {barSize:9,barBorder:0,thumbMargin:2,trackBackgroundColor:track,trackBorderColor:track,
   thumbBackgroundColor:dark()?'#595b60':'#b1b4ba',thumbHoverBackgroundColor:dark()?'#767981':'#92969f',
   thumbActiveBackgroundColor:dark()?'#9397a0':'#777c86'}
 }
 const theme=()=>({...defaultTheme,primary:{...defaultTheme.primary,500:'#7faaf8',600:'#5c8eeb'},gray:{...defaultTheme.gray,...dark()?{300:'#525a67',400:'#aaaaaa',800:'#242424',900:'#1b1b1b'}:{}}})
 let renderingSheet=false
 class SpreadsheetCanvasColors extends Plugin {
  static override pluginName='ework-spreadsheet-canvas-colors'
  constructor(_config:undefined,protected override _injector:Injector){super()}
  override onStarting(){
   const native=new CanvasColorService(this._injector.get(ThemeService))
   this.disposeWithMe(native)
   this._injector.replace([ICanvasColorService,{useValue:{getRenderColor:(color:string)=>renderingSheet?color:native.getRenderColor(color)}}])
  }
 }
 Inject(Injector)(SpreadsheetCanvasColors,undefined,1)
 const {univer,univerAPI:api}=createUniver({
  locale:doc.documentElement.dataset.odysseyLocale==='en'?LocaleType.EN_US:LocaleType.ZH_CN,
  locales:{[LocaleType.ZH_CN]:mergeLocales(coreZh,filterZh,sortZh),[LocaleType.EN_US]:mergeLocales(coreEn,filterEn,sortEn)},
  darkMode:dark(),theme:theme(),plugins:[SpreadsheetCanvasColors],
  presets:[UniverSheetsCorePreset({container:host,header:false,toolbar:false,formulaBar:false,footer:false,contextMenu:true,disableAutoFocus:true,sheets:{freezeSync:true,scrollConfig:scroll()}}),UniverSheetsFilterPreset(),UniverSheetsSortPreset()]
 })
 let disposed=false
 try{
 const model=api.createWorkbook(structuredClone(workbook) as unknown as IWorkbookData)
 if(!editable)model.setEditable(false)
 const injector=univer.__getInjector()
 const renders=injector.get(IRenderManagerService)
 const watched=new Map<string,{unsubscribe():void}[]>()
 const freezeObjects=[
  ['ySplit','__SpreadsheetFreezeRowHeaderName__','__SpreadsheetFreezeRowMainName__'],
  ['xSplit','__SpreadsheetFreezeColumnHeaderName__','__SpreadsheetFreezeColumnMainName__']
 ] as const
 // Univer's clipboard rectangle starts white and its fill handle uses the
 // theme's white endpoint. Keep these transient guides distinct from borders.
 const guideColors=(render:IRender)=>{
  for(const object of render.scene.getObjectsByLayer(1)){
   if(!object.oKey.startsWith('__SpreadsheetSelectionShape__'))continue
   for(const shape of object.getObjects()){
    if(!('setProps' in shape)||typeof shape.setProps!=='function')continue
    const stroke=shape.oKey.startsWith('__SpreadsheetDragDashControl__')?'#7898c8':
     shape.oKey.startsWith('__SpreadsheetSelectionFillControl__')?palette().canvas:undefined
    if(stroke&&(!('stroke' in shape)||shape.stroke!==stroke))shape.setProps({stroke})
   }
  }
 }
 const bindRender=(render:IRender)=>{
  if(watched.has(render.unitId))return
  const spreadsheet=render.unitId===model.getId()
  const on=[render.scene.beforeRender$.subscribe(canvas=>{
   if(!canvas)return
   renderingSheet=spreadsheet
   if(!spreadsheet)return
   guideColors(render)
   const freeze=model.getActiveSheet()?.getFreeze()
   for(const [axis,...names] of freezeObjects)if(!freeze?.[axis])for(const name of names){
    const handle=render.scene.getObject(name)
    if(handle?.visible){handle.hide();handle.evented=false}
   }
   for(const item of [canvas,...render.scene.getViewports().map(view=>view.canvas)])if(item)Object.assign(item.getContext().renderConfig,{gridlinesColor:palette().grid})
  }),render.scene.afterRender$.subscribe(()=>{renderingSheet=false})]
  watched.set(render.unitId,on)
 }
 const styleInterceptor=injector.get(SheetInterceptorService).intercept(INTERCEPTOR_POINT.CELL_CONTENT,{
  effect:InterceptorEffectEnum.Style,priority:0,
  handler(cell,position,next){
   if(!cell)return next(cell)
   const {worksheet,row,col}=position
   const inherited=worksheet.getComposedCellStyleByCellData(row,col,cell)
   const own=position.workbook.getStyles().getStyleByCell(cell)??{}
   const s={...own}
   if(!inherited.cl&&!inherited.bg&&!cell.p)s.cl={rgb:palette().text}
   if(!inherited.ht&&cell.t===1&&!cell.f)s.ht=HorizontalAlign.LEFT
   if(!inherited.vt){
    const merge=worksheet.getCellInfoInMergeData(row,col)
    const defaultHeight=worksheet.getConfig().defaultRowHeight
    const actual=worksheet.getRowHeight(row)
    s.vt=actual>defaultHeight+1||(merge.isMerged&&merge.endRow>merge.startRow)?VerticalAlign.TOP:VerticalAlign.MIDDLE
   }
   return next({...cell,s})
  }
 })

 const applyTheme=()=>{
  if(disposed)return
  const colors=palette()
  injector.get(ThemeService).setTheme(theme())
  api.toggleDarkMode(dark())
  const render=renders.getRenderUnitById(model.getId())
  if(!render?.components.has(SHEET_VIEW_KEY.COLUMN)||!render.components.has(SHEET_VIEW_KEY.ROW))return
  model.customizeColumnHeader({headerStyle:{backgroundColor:colors.header,borderColor:colors.grid,fontColor:colors.text}})
  model.customizeRowHeader({headerStyle:{backgroundColor:colors.header,borderColor:colors.grid,fontColor:colors.text}})
  const corner=render.components.get(SHEET_VIEW_KEY.LEFT_TOP)
  if(corner&&'setProps' in corner&&typeof corner.setProps==='function')corner.setProps({fill:colors.header,stroke:colors.grid})
  for(const viewport of render.scene.getViewports()){
   const bar=viewport.getScrollBar()
   if(!bar)continue
   const props=scroll()
   bar.setProps(props)
   for(const track of [bar.horizonScrollTrack,bar.verticalScrollTrack,bar.placeholderBarRect])track?.setProps({fill:props.trackBackgroundColor,stroke:props.trackBorderColor})
   for(const thumb of [bar.horizonThumbRect,bar.verticalThumbRect])thumb?.setProps({fill:props.thumbBackgroundColor})
  }
  const canvas=render.engine.getCanvasElement()
  if(canvas.parentElement)canvas.parentElement.style.background=colors.canvas
  model.getActiveSheet()?.refreshCanvas()
 }
 const observer=new win.MutationObserver(applyTheme)
 observer.observe(doc.body,{attributes:true,attributeFilter:['data-ds-dark-theme']})
 const renderSub=renders.created$.subscribe(render=>{if(render){bindRender(render);if(render.unitId===model.getId())requestAnimationFrame(applyTheme)}})
 for(const render of renders.getRenderAll().values())bindRender(render)
 const resize=new win.ResizeObserver(()=>{
  const render=renders.getRenderUnitById(model.getId())
  if(render&&host.clientWidth>0&&host.clientHeight>0)render.engine.resizeBySize(host.clientWidth,host.clientHeight)
 })
 resize.observe(host)
 const subs=[
  api.getFormula().calculationResultApplied(()=>{if(!disposed)change(true)}),
  api.addEvent(api.Event.BeforeCommandExecute,event=>{
   if(event.id!=='sheet.mutation.set-range-values')return
   const values=(event.params as {cellValue?:unknown})?.cellValue
   if(!values||typeof values!=='object')return
   try{
    for(const row of Object.values(values))if(row&&typeof row==='object')for(const cell of Object.values(row))if(cell&&typeof cell==='object'&&'f' in cell&&cell.f)safeFormula(cell.f)
   }catch(error){event.cancel=true;host.dispatchEvent(new CustomEvent('ew-sheet-engine-error',{detail:(error as Error).message}))}
  }),
  api.addEvent(api.Event.CommandExecuted,event=>{
   if(event.options?.fromFormula===true||event.options?.applyFormulaCalculationResult===true){if(event.id==='sheet.mutation.set-range-values')change(true)}
   else if(event.id.startsWith('sheet.')&&(event.type===CommandType.MUTATION||/zoom|hide-grid|freeze/.test(event.id)))change()
   if(/selection|activate-sheet|range-values|numfmt/.test(event.id))selection()
  }),
  api.addEvent(api.Event.SelectionChanged,selection),
 ]
 requestAnimationFrame(()=>{if(!disposed){applyTheme();selection()}})
 return {api,model,capturePasteTarget:()=>injector.get(ISheetClipboardService).capturePasteTarget(),pasteText:(textContent:string,target:ReturnType<ISheetClipboardService['capturePasteTarget']>)=>api.executeCommand(SheetPasteShortKeyCommand.id,{textContent,target}),clearFill:()=>api.executeCommand(ResetBackgroundColorCommand.id),align:(value:string)=>api.executeCommand(SetHorizontalTextAlignCommand.id,{value:{left:1,center:2,right:3}[value]}),snapshot:()=>structuredClone(model.save()) as unknown as Workbook,dispose:()=>{
  if(disposed)return
  disposed=true
  observer.disconnect();resize.disconnect();renderSub.unsubscribe();styleInterceptor.dispose();for(const subs of watched.values())subs.forEach(s=>s.unsubscribe());subs.forEach(s=>s.dispose())
  try{univer.dispose()}finally{style.remove();doc.documentElement.classList.toggle('univer-dark',originalDark)}
 }}
 }catch(error){univer.dispose();style.remove();throw error}
}

export type SheetEngine=ReturnType<typeof createSheetEngine>
