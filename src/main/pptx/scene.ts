import {XMLSerializer,type Element} from '@xmldom/xmldom'
import {PptxArchive} from './archive'
import {readPptxParts,children,elements,ancestor, type PptxField} from './content'
import {readChart,editChart,type PptxChart} from './charts'
const P='http://schemas.openxmlformats.org/presentationml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main'
export type Geometry={x:number;y:number;width:number;height:number;rotation:number}
export type PptxNode={id:string;nodeId:string;part:string;type:'shape'|'picture'|'group'|'table'|'chart';name:string;parentId?:string;geometry:Geometry|null;fill?:string;stroke?:string;strokeWidth?:number;preset?:string;fontSize?:number;bold?:boolean;color?:string;chart?:PptxChart;chartWarning?:string}
export type PptxScene={slides:Array<{index:number;part:string;fields:PptxField[];nodes:PptxNode[]}>}
export type PptxNodeChange={id:string;geometry?:Geometry;fill?:string;stroke?:string;strokeWidth?:number;preset?:string;fontSize?:number;bold?:boolean;color?:string;chart?:PptxChart}
const child=(e:Element,name:string)=>children(e).find(c=>c.localName===name)
function property(node:Element):Element|undefined{return child(node,node.localName==='grpSp'?'grpSpPr':'spPr')}
function transform(node:Element):Element|undefined{return node.localName==='graphicFrame'?child(node,'xfrm'):property(node)&&child(property(node)!,'xfrm')}
// Insert DrawingML children in schema order, including properties absent in source.
const order=['xfrm','prstGeom','custGeom','noFill','solidFill','gradFill','blipFill','pattFill','grpFill','ln','effectLst','effectDag','scene3d','sp3d','extLst']
const runOrder=['ln','noFill','solidFill','gradFill','blipFill','pattFill','grpFill','effectLst','effectDag','highlight','uLnTx','uLn','uFillTx','uFill','latin','ea','cs','sym','hlinkClick','hlinkMouseOver','rtl','extLst']
function ensure(e:Element,namespace:string,name:string){let node=child(e,name);if(!node){node=e.ownerDocument!.createElementNS(namespace,`${namespace===P?'p':'a'}:${name}`);const sequence=['rPr','endParaRPr','defRPr'].includes(e.localName??'')?runOrder:order,index=sequence.indexOf(name),before=index<0?undefined:children(e).find(c=>sequence.indexOf(c.localName??'')>index);if(name==='rPr')e.insertBefore(node,e.firstChild);else e.insertBefore(node,before??null)}return node}
function setColor(parent:Element,key:string,value:string){
 if(value!=='none'&&!/^[A-Fa-f0-9]{6}$/.test(value))throw Error('PPTX 颜色值无效。')
 for(const c of children(parent).filter(c=>['solidFill','gradFill','blipFill','pattFill','noFill','grpFill'].includes(c.localName??'')))parent.removeChild(c)
 if(value==='none'){ensure(parent,A,'noFill');return}
 const fill=ensure(parent,A,key);ensure(fill,A,'srgbClr').setAttribute('val',value.toUpperCase())
}
function collect(archive:PptxArchive){return readPptxParts(archive).map(slide=>{
 const nodes:Array<PptxNode&{element:Element}>=[]
 for(const element of elements(slide.document,P,'sp').concat(elements(slide.document,P,'cxnSp'),elements(slide.document,P,'pic'),elements(slide.document,P,'grpSp'),elements(slide.document,P,'graphicFrame'))){
  const nodeId=elements(element,P,'cNvPr')[0]?.getAttribute('id');if(!nodeId)continue
  const id=slide.part+'#node:'+nodeId,props=property(element),xfrm=transform(element),off=xfrm&&child(xfrm,'off'),ext=xfrm&&child(xfrm,'ext')
  const cellTable=elements(element,A,'tbl')[0],chart=elements(element,'http://schemas.openxmlformats.org/drawingml/2006/chart','chart')[0]
  const type=element.localName==='pic'?'picture':element.localName==='grpSp'?'group':chart?'chart':cellTable?'table':'shape'
  const geom=off&&ext?{x:Number(off.getAttribute('x'))/9525,y:Number(off.getAttribute('y'))/9525,width:Number(ext.getAttribute('cx'))/9525,height:Number(ext.getAttribute('cy'))/9525,rotation:Number(xfrm?.getAttribute('rot')??0)/60000}:null
  const fill=props&&child(props,'solidFill'),line=props&&child(props,'ln'),run=elements(element,A,'rPr')[0],parent=ancestor(element,'grpSp'),parentId=parent&&elements(parent,P,'cNvPr')[0]?.getAttribute('id')
  const value:PptxNode&{element:Element}={id,nodeId,part:slide.part,type,name:elements(element,P,'cNvPr')[0]?.getAttribute('name')||type,geometry:geom,element,
   ...(parentId?{parentId}:{}),...(fill?{fill:child(fill,'srgbClr')?.getAttribute('val')??undefined}:{}),...(line?{stroke:elements(line,A,'srgbClr')[0]?.getAttribute('val')??undefined,strokeWidth:Number(line.getAttribute('w')??0)/9525}:{}),...(props?{preset:child(props,'prstGeom')?.getAttribute('prst')??undefined}:{}),...(run?{fontSize:run.hasAttribute('sz')?Number(run.getAttribute('sz'))/100:undefined,bold:run.hasAttribute('b')?run.getAttribute('b')==='1':undefined,color:elements(run,A,'srgbClr')[0]?.getAttribute('val')??undefined}:{})}
  if(chart){try{value.chart=readChart(archive,slide.part,chart);if(!value.chart)value.chartWarning='此图表类型的内部数据暂不可编辑。'}catch(error){value.chartWarning=error instanceof Error?error.message:'此图表数据暂不可编辑。'}}
  nodes.push(value)
 }
 return {...slide,nodes}
})}
export function readPptxScene(bytes:Uint8Array):PptxScene{return{slides:collect(new PptxArchive(bytes)).map(({document:_,fields,nodes,...slide})=>({...slide,fields:fields.map(({paragraph:__,...f})=>f),nodes:nodes.map(({element:__,...n})=>n)}))}}
export function editPptxScene(bytes:Uint8Array,changes:PptxNodeChange[]):Uint8Array{
 if(!Array.isArray(changes)||changes.length>4096)throw Error('PPTX 对象编辑请求无效。')
 const archive=new PptxArchive(bytes),slides=collect(archive),nodes=new Map(slides.flatMap(s=>s.nodes.map(n=>[n.id,n] as const))),parts=new Map<string,Buffer>(),touched=new Set<string>(),seen=new Set<string>()
 for(const change of changes){
  const node=change&&nodes.get(change.id);if(!node||seen.has(change.id))throw Error('PPTX 对象身份无效。');seen.add(change.id)
  if(change.geometry){const g=change.geometry;if(![g.x,g.y,g.width,g.height,g.rotation].every(n=>Number.isFinite(n)&&Math.abs(n)<1000000)||g.width<=0||g.height<=0)throw Error('PPTX 对象尺寸无效。')
   const props=node.type==='group'?ensure(node.element,P,'grpSpPr'):node.element.localName==='graphicFrame'?node.element:ensure(node.element,P,'spPr'),t=ensure(props,node.element.localName==='graphicFrame'?P:A,'xfrm')
   const off=ensure(t,A,'off'),ext=ensure(t,A,'ext');off.setAttribute('x',String(Math.round(g.x*9525)));off.setAttribute('y',String(Math.round(g.y*9525)));ext.setAttribute('cx',String(Math.round(g.width*9525)));ext.setAttribute('cy',String(Math.round(g.height*9525)));t.setAttribute('rot',String(Math.round(((g.rotation%360)+360)%360*60000)))
  }
  const props=property(node.element)
  if(change.fill!==undefined){if(!props)throw Error('此对象不支持填充编辑。');setColor(props,'solidFill',change.fill)}
  if(change.stroke!==undefined||change.strokeWidth!==undefined){if(!props)throw Error('此对象不支持边框编辑。');const line=ensure(props,A,'ln');if(change.stroke!==undefined)setColor(line,'solidFill',change.stroke);if(change.strokeWidth!==undefined){if(!Number.isFinite(change.strokeWidth)||change.strokeWidth<0||change.strokeWidth>100)throw Error('边框宽度无效。');line.setAttribute('w',String(Math.round(change.strokeWidth*9525)))}}
  if(change.preset!==undefined){if(!props||!['rect','roundRect','ellipse','triangle','diamond','line','rightArrow','star5'].includes(change.preset))throw Error('图形类型无效。');child(props,'custGeom')?.parentNode?.removeChild(child(props,'custGeom')!);ensure(props,A,'prstGeom').setAttribute('prst',change.preset)}
  if(change.fontSize!==undefined||change.bold!==undefined||change.color!==undefined){
   if(change.fontSize!==undefined&&(!Number.isFinite(change.fontSize)||change.fontSize<1||change.fontSize>400))throw Error('字号无效。')
   for(const p of elements(node.element,A,'p')){
    const targets=children(p).filter(c=>['r','br'].includes(c.localName??''));const styles=targets.map(r=>ensure(r,A,'rPr'));styles.push(ensure(p,A,'endParaRPr'))
    for(const style of styles){if(change.fontSize!==undefined)style.setAttribute('sz',String(Math.round(change.fontSize*100)));if(change.bold!==undefined)style.setAttribute('b',change.bold?'1':'0');if(change.color!==undefined)setColor(style,'solidFill',change.color)}
   }
  }
  if(change.chart){if(!node.chart)throw Error('此对象不包含可编辑图表。');editChart(archive,node.chart,change.chart,parts)}
  touched.add(node.part)
 }
 for(const slide of slides)if(touched.has(slide.part))parts.set(slide.part,Buffer.from(new XMLSerializer().serializeToString(slide.document)))
 return archive.replace(parts)
}
