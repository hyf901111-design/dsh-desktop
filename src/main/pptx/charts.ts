import {XMLSerializer,type Element,type Document} from '@xmldom/xmldom'
import path from 'node:path'
import {PptxArchive} from './archive'
import {xml,children,elements} from './content'
const C='http://schemas.openxmlformats.org/drawingml/2006/chart',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',REL='http://schemas.openxmlformats.org/package/2006/relationships',S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
export type PptxChart={part:string;title:string;legend:boolean;categories:string[];series:Array<{name:string;values:Array<number|null>;color?:string}>}
const child=(e:Element,name:string)=>children(e).find(c=>c.localName===name)
const sequences:Record<string,string[]>={ser:['idx','order','tx','spPr','invertIfNegative','pictureOptions','marker','dPt','dLbls','trendline','errBars','cat','xVal','val','yVal','bubbleSize','smooth','shape','extLst'],spPr:['xfrm','prstGeom','custGeom','noFill','solidFill','gradFill','blipFill','pattFill','grpFill','ln','effectLst','effectDag','scene3d','sp3d','extLst']}
function ensure(e:Element,ns:string,name:string){let n=child(e,name);if(!n){n=e.ownerDocument!.createElementNS(ns,`${ns===C?'c':ns===A?'a':''}${ns===S?'':':'}${name}`);const sequence=sequences[e.localName??'']??[],index=sequence.indexOf(name),before=index<0?undefined:children(e).find(c=>sequence.indexOf(c.localName??'')>index);e.insertBefore(n,before??null)}return n}
const serialize=(d:Document)=>Buffer.from(new XMLSerializer().serializeToString(d))
function related(archive:PptxArchive,part:string,id:string):string|undefined{
 const rels=path.posix.join(path.posix.dirname(part),'_rels',path.posix.basename(part)+'.rels')
 const relation=elements(xml(archive.read(rels)),REL,'Relationship').find(r=>r.getAttribute('Id')===id)
 if(!relation||relation.getAttribute('TargetMode')==='External')return
 const target=relation.getAttribute('Target');if(!target)return
 const name=path.posix.normalize(target.startsWith('/')?target.slice(1):path.posix.join(path.posix.dirname(part),target))
 if(name.startsWith('../')||name.includes('\\'))throw Error('图表部件路径无效。')
 return name
}
function cache(e:Element|undefined):Array<string|null>{
 if(!e)return[]
 const source=elements(e,C,'strCache')[0]??elements(e,C,'numCache')[0]??elements(e,C,'strLit')[0]??elements(e,C,'numLit')[0]
 if(!source)return elements(e,C,'v').map(v=>v.textContent)
 const count=Number(child(source,'ptCount')?.getAttribute('val')??0)
 if(!Number.isSafeInteger(count)||count<0||count>1000)throw Error('图表数据点过多或无效。')
 const values:Array<string|null>=Array(count).fill(null)
 for(const p of children(source).filter(c=>c.localName==='pt')){const i=Number(p.getAttribute('idx'));if(i>=0&&i<count)values[i]=child(p,'v')?.textContent??null}
 return values
}
export function readChart(archive:PptxArchive,slide:string,element:Element):PptxChart|undefined{
 const id=element.getAttributeNS(R,'id');if(!id)return
 const part=related(archive,slide,id);if(!part||!/^ppt\/charts\/[^/]+\.xml$/.test(part))return
 const document=xml(archive.read(part)),series=elements(document,C,'ser');if(!series.length||series.length>128)return
 const categories=cache(child(series[0]!,'cat')??child(series[0]!,'xVal')).map(v=>v??'')
 const title=elements(document,C,'title')[0]
 return{part,title:title?(elements(title,A,'t').map(t=>t.textContent).join('')||cache(child(title,'tx'))[0]||''): '',legend:elements(document,C,'legend').length>0,categories,series:series.map((s,i)=>({name:cache(child(s,'tx'))[0]??`系列 ${i+1}`,values:cache(child(s,'val')??child(s,'yVal')).map(v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):null),color:child(s,'spPr')&&elements(child(s,'spPr')!,A,'srgbClr')[0]?.getAttribute('val')||undefined}))}
}
const validText=(v:unknown):v is string=>typeof v==='string'&&v.length<=8192&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(v)&&Buffer.from(v).toString()===v
function replaceCache(container:Element,values:Array<string|number|null>,numeric:boolean){
 const ref=child(container,numeric?'numRef':'strRef')
 const target=ref?ensure(ref,C,numeric?'numCache':'strCache'):ensure(container,C,numeric?'numLit':'strLit')
 for(const old of children(target).filter(c=>c.localName==='pt'||c.localName==='ptCount'))target.removeChild(old)
 ensure(target,C,'ptCount').setAttribute('val',String(values.length))
 values.forEach((v,i)=>{if(v===null)return;const p=target.ownerDocument!.createElementNS(C,'c:pt');p.setAttribute('idx',String(i));ensure(p,C,'v').textContent=String(v);target.appendChild(p)})
 return ref&&child(ref,'f')
}
function reference(formula:string){
 const match=/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(formula)
 if(!match||match[2]?.includes('['))throw Error('暂不支持此图表工作簿引用格式。')
 return{sheet:(match[1]?.replace(/''/g,"'")??match[2])!,column:match[3]!,row:Number(match[4]),endColumn:match[5]??match[3]!,endRow:Number(match[6]??match[4])}
}
function columnNumber(value:string){let n=0;for(const c of value)n=n*26+c.charCodeAt(0)-64;return n}
function columnName(value:number){let s='';while(value>0){value--;s=String.fromCharCode(65+value%26)+s;value=Math.floor(value/26)}return s}
function workbookUpdater(archive:PptxArchive,document:Document,part:string){
 const external=elements(document,C,'externalData')[0],id=external?.getAttributeNS(R,'id'),workbookPart=id?related(archive,part,id):undefined
 if(!external)return null
 const auto=ensure(external,C,'autoUpdate');auto.setAttribute('val','0')
 if(!workbookPart)return null
 if(!/^ppt\/embeddings\/[^/]+\.xlsx$/.test(workbookPart))throw Error('图表内嵌工作簿类型不可编辑。')
 const workbook=new PptxArchive(archive.read(workbookPart),'xlsx'),root=xml(workbook.read('xl/workbook.xml')),rels=xml(workbook.read('xl/_rels/workbook.xml.rels')),parts=new Map<string,Buffer>(),sheets=new Map<string,{part:string;document:Document}>()
 const update=(formula:Element|undefined,values:Array<string|number|null>,previous?:Array<string|number|null>)=>{
  if(!formula)return
  const ref=reference(formula.textContent||''),sheet=elements(root,S,'sheet').find(s=>s.getAttribute('name')===ref.sheet),rid=sheet?.getAttributeNS(R,'id')
  const relation=elements(rels,REL,'Relationship').find(r=>r.getAttribute('Id')===rid)
  if(!relation||relation.getAttribute('TargetMode')==='External')throw Error('图表数据工作表不可编辑。')
  const target=relation.getAttribute('Target')!,sheetPart=path.posix.normalize(target.startsWith('/')?target.slice(1):'xl/'+target)
  if(!/^xl\/worksheets\/[^/]+\.xml$/.test(sheetPart))throw Error('图表工作表路径无效。')
  let entry=sheets.get(sheetPart);if(!entry){entry={part:sheetPart,document:xml(workbook.read(sheetPart))};sheets.set(sheetPart,entry)}
  const sheetData=elements(entry.document,S,'sheetData')[0];if(!sheetData)throw Error('图表工作表缺少数据。')
  const horizontal=ref.row===ref.endRow&&ref.column!==ref.endColumn
  if(ref.row!==ref.endRow&&ref.column!==ref.endColumn)throw Error('暂不支持二维图表数据范围。')
  const column=columnNumber(ref.column)
  values.forEach((value,i)=>{
   if(previous&&i<previous.length&&value===previous[i])return
   const rowIndex=ref.row+(horizontal?0:i),columnIndex=column+(horizontal?i:0),address=columnName(columnIndex)+rowIndex
   let row=children(sheetData).find(r=>Number(r.getAttribute('r'))===rowIndex)
   if(!row){row=entry!.document.createElementNS(S,'row');row.setAttribute('r',String(rowIndex));sheetData.insertBefore(row,children(sheetData).find(r=>Number(r.getAttribute('r'))>rowIndex)??null)}
   let cell=children(row).find(c=>c.getAttribute('r')===address)
   if(!cell){cell=entry!.document.createElementNS(S,'c');cell.setAttribute('r',address);row.insertBefore(cell,children(row).find(c=>columnNumber(c.getAttribute('r')!.replace(/\d/g,''))>columnIndex)??null)}
   for(const old of children(cell).filter(c=>['v','is','f'].includes(c.localName??'')))cell.removeChild(old)
   if(typeof value==='string'){cell.setAttribute('t','inlineStr');ensure(ensure(cell,S,'is'),S,'t').textContent=value}else{cell.removeAttribute('t');if(value!==null)ensure(cell,S,'v').textContent=String(value)}
  })
  if(values.length>1){const sheetPrefix=(formula.textContent||'').slice(0,(formula.textContent||'').lastIndexOf('!')+1);formula.textContent=sheetPrefix+'$'+ref.column+'$'+ref.row+':$'+columnName(column+(horizontal?values.length-1:0))+'$'+(ref.row+(horizontal?0:values.length-1))}
 }
 return{update,finish:()=>{for(const entry of sheets.values())parts.set(entry.part,serialize(entry.document));return{part:workbookPart,bytes:workbook.replace(parts)}}}
}
export function editChart(archive:PptxArchive,original:PptxChart,changed:PptxChart,parts:Map<string,Buffer>):void{
 if(changed.part!==original.part||!validText(changed.title)||typeof changed.legend!=='boolean'||!Array.isArray(changed.categories)||!changed.categories.length||changed.categories.length>1000||!changed.categories.every(validText)||!Array.isArray(changed.series)||changed.series.length!==original.series.length)throw Error('图表编辑数据无效。')
 for(const series of changed.series)if(!validText(series.name)||!Array.isArray(series.values)||series.values.length!==changed.categories.length||!series.values.every(v=>v===null||typeof v==='number'&&Number.isFinite(v))||series.color!==undefined&&!/^[A-Fa-f0-9]{6}$/.test(series.color))throw Error('图表系列数据无效。')
 const categoriesChanged=JSON.stringify(changed.categories)!==JSON.stringify(original.categories),dataChanged=categoriesChanged||changed.series.some((s,i)=>s.name!==original.series[i]!.name||JSON.stringify(s.values)!==JSON.stringify(original.series[i]!.values))
 const document=xml(parts.get(original.part)??archive.read(original.part)),root=elements(document,C,'chart')[0],series=elements(document,C,'ser'),workbook=dataChanged?workbookUpdater(archive,document,original.part):null
 if(!root||series.length!==changed.series.length)throw Error('图表结构已变化。')
 changed.series.forEach((value,i)=>{
  const node=series[i]!,name=ensure(node,C,'tx'),cat=child(node,'cat')??child(node,'xVal'),val=child(node,'val')??child(node,'yVal')
  if(!cat||!val)throw Error('此类图表数据暂不可编辑。')
  if(value.name!==original.series[i]!.name){if(child(name,'strRef')){const formula=replaceCache(name,[value.name],false);workbook?.update(formula,[value.name],[original.series[i]!.name]);}else{for(const old of children(name))name.removeChild(old);ensure(name,C,'v').textContent=value.name}}
  const numeric=!!child(cat,'numRef')||!!child(cat,'numLit'),categories=numeric?changed.categories.map(v=>Number(v)):changed.categories
  if(numeric&&categories.some(v=>!Number.isFinite(v)))throw Error('此图表的横轴需要数值。')
  if(categoriesChanged){const formula=replaceCache(cat,categories,numeric);workbook?.update(formula,categories,numeric?original.categories.map(Number):original.categories)}
  if(JSON.stringify(value.values)!==JSON.stringify(original.series[i]!.values)){const formula=replaceCache(val,value.values,true);workbook?.update(formula,value.values,original.series[i]!.values)}
  if(value.color&&value.color.toUpperCase()!==original.series[i]!.color?.toUpperCase()){const props=ensure(node,C,'spPr');for(const old of children(props).filter(c=>['solidFill','gradFill','noFill'].includes(c.localName??'')))props.removeChild(old);ensure(ensure(props,A,'solidFill'),A,'srgbClr').setAttribute('val',value.color.toUpperCase())}
 })
 let title=child(root,'title')
 if(changed.title!==original.title&&changed.title){if(!title){title=document.createElementNS(C,'c:title');root.insertBefore(title,root.firstChild)};const tx=ensure(title,C,'tx'),text=elements(tx,A,'t');if(text.length){text[0]!.textContent=changed.title;for(const extra of text.slice(1))extra.textContent=''}else{for(const old of children(tx))tx.removeChild(old);const rich=ensure(tx,C,'rich');ensure(rich,A,'bodyPr');ensure(rich,A,'lstStyle');ensure(ensure(ensure(rich,A,'p'),A,'r'),A,'t').textContent=changed.title}}else if(!changed.title&&title)root.removeChild(title)
 const legend=child(root,'legend')
 if(!changed.legend&&legend)root.removeChild(legend)
 else if(changed.legend&&!legend){const created=document.createElementNS(C,'c:legend');ensure(created,C,'legendPos').setAttribute('val','b');root.insertBefore(created,child(root,'plotArea')?.nextSibling??null)}
 if(workbook){const edited=workbook.finish();parts.set(edited.part,edited.bytes)}
 parts.set(original.part,serialize(document))
}
