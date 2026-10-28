import {parse as parseHtml} from 'parse5'
import {parse as parseScript} from '@babel/parser'
import {chartDataIssue} from './chart-template-contract.js'
import {cartesianChartSvg} from './cartesian-chart-artifact.js'

const attr=(node,name)=>node.attrs?.find(a=>a.name.toLowerCase()===name.toLowerCase())?.value
const children=node=>(node.childNodes??[]).filter(n=>n.tagName)
const text=node=>(node.childNodes??[]).map(n=>n.nodeName==='#text'?n.value:'').join('')
const number=value=>typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.replaceAll(',','').trim())?Number(value.replaceAll(',','')):NaN
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6
function walk(node,visit,parent){if(!node||typeof node!=='object')return;if(node.type)visit(node,parent);for(const [key,value]of Object.entries(node)){if(['loc','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(n=>walk(n,visit,node));else if(value&&typeof value==='object')walk(value,visit,node)}}
// Decode literal data only. Never execute expressions, getters, calls or spreads.
function literal(node){
 if(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(node?.type))return node.type==='NullLiteral'?null:node.value
 if(node?.type==='UnaryExpression'&&['-','+'].includes(node.operator)&&node.argument?.type==='NumericLiteral')return node.operator==='-'?-node.argument.value:node.argument.value
 if(node?.type==='ArrayExpression'){const result=node.elements.map(literal);if(result.some(v=>v===undefined))return;return result}
 if(node?.type==='ObjectExpression'){const result=Object.create(null);for(const p of node.properties){const key=p.key?.type==='Identifier'&&!p.computed?p.key.name:p.key?.type==='StringLiteral'?p.key.value:undefined;if(p.type!=='ObjectProperty'||p.method||key===undefined||Object.hasOwn(result,key)||['__proto__','constructor','prototype'].includes(key))return;const value=literal(p.value);if(value===undefined)return;result[key]=value}return result}
}
const rootName=node=>node?.type==='Identifier'?node.name:['MemberExpression','OptionalMemberExpression'].includes(node?.type)?rootName(node.object):['CallExpression','OptionalCallExpression'].includes(node?.type)?rootName(node.callee?.object):undefined
const property=node=>node?.computed&&node.property?.type==='StringLiteral'?node.property.value:!node?.computed?node?.property?.name:undefined
const primitiveMap=node=>property(node?.callee)==='map'&&node.arguments?.length===1&&['FunctionExpression','ArrowFunctionExpression'].includes(node.arguments[0]?.type)&&literal(node.arguments[0].body?.type==='BlockStatement'&&node.arguments[0].body.body.length===1&&node.arguments[0].body.body[0].type==='ReturnStatement'?node.arguments[0].body.body[0].argument:node.arguments[0].body)!==undefined
const callbackWrites=fn=>{let writes=false;walk(fn,n=>{if(['AssignmentExpression','UpdateExpression','CallExpression','OptionalCallExpression'].includes(n.type))writes=true});return writes}
const dynamicMethods=new Set(['push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin'])
const modelKeys=new Set(['version','type','variant','title','labels','series','asOf','unit','subtitle','note'])

// This recognizes the existing fixed-chart HTML layout, not arbitrary SVG.
// It runs at new-artifact acceptance only; stored HTML/state is never migrated.
export function generatedChartGeometry(html,{includeModel=false}={}){
 const unchanged={html},document=parseHtml(html,{sourceCodeLocationInfo:true}),elements=[],scripts=[]
 const collect=node=>{if(node.tagName)elements.push(node);if(node.tagName==='script'&&(!attr(node,'type')||/^(?:module|(?:text|application)\/(?:javascript|ecmascript))$/iu.test(attr(node,'type'))))scripts.push(text(node));for(const child of node.childNodes??[])collect(child)};collect(document)
 const nodes=[],candidates=[]
 try{for(const script of scripts)walk(parseScript(script,{sourceType:'unambiguous'}),(node,parent)=>{nodes.push(node);if(node.type!=='ObjectExpression')return;const value=literal(node);if(value&&Array.isArray(value.labels)&&Array.isArray(value.series)&&Object.keys(value).every(k=>modelKeys.has(k))){const name=parent?.type==='VariableDeclarator'&&parent.id?.type==='Identifier'?parent.id.name:parent?.type==='CallExpression'&&parent.callee?.type==='FunctionExpression'?parent.callee.params[parent.arguments.indexOf(node)]?.name:undefined;if(name)candidates.push({value,name})}})}catch{return unchanged}
 if(candidates.length!==1||elements.filter(n=>n.tagName==='style').some(n=>/(?:^|[;{])\s*(?:transform|translate|rotate|scale|clip-path|cx|cy|d)\s*:/iu.test(text(n))))return unchanged
 const {value,name}=candidates[0]
 if(value.type!==undefined&&value.type!=='chart'||value.version!==undefined&&value.version!==1||value.title!==undefined&&typeof value.title!=='string'||value.series.some(s=>s&&typeof s==='object'&&Object.keys(s).some(k=>!['name','values','kind'].includes(k))))return unchanged
 // Data/geometry updated by script is not a static chart. Do not guess its
 // future state or rewrite custom rendering code, even if the first paint differs.
 if(nodes.some(n=>(n.type==='AssignmentExpression'||n.type==='UpdateExpression')&&name&&rootName(n.left??n.argument)===name||['CallExpression','OptionalCallExpression'].includes(n.type)&&((name&&rootName(n.callee?.object)===name&&dynamicMethods.has(property(n.callee)))||(n.callee?.property?.name==='setAttribute'&&['y','y1','y2','cy','height','points','d','viewBox'].includes(n.arguments?.[0]?.value)))))return unchanged
 // A referenced array/object can be changed through an alias or an unknown
 // callee. Treat those programs as dynamic instead of trying to prove JS purity.
 const reference=node=>!['CallExpression','OptionalCallExpression'].includes(node?.type)&&rootName(node)===name
 if(nodes.some(n=>n.type==='VariableDeclarator'&&reference(n.init)||n.type==='AssignmentExpression'&&reference(n.right)||n.type==='ReturnStatement'&&reference(n.argument)||['CallExpression','OptionalCallExpression'].includes(n.type)&&n.arguments.some(a=>rootName(a.type==='SpreadElement'?a.argument:a)===name&&!primitiveMap(a))||n.type==='VariableDeclarator'&&['CallExpression','OptionalCallExpression'].includes(n.init?.type)&&rootName(n.init.callee?.object)===name&&!primitiveMap(n.init)||['ForOfStatement','ForInStatement'].includes(n.type)&&reference(n.right)||['CallExpression','OptionalCallExpression'].includes(n.type)&&rootName(n.callee?.object)===name&&(property(n.callee)===undefined||n.arguments.some(a=>['FunctionExpression','ArrowFunctionExpression'].includes(a?.type)&&callbackWrites(a)))))return unchanged
 const svgs=elements.filter(n=>n.tagName==='svg'&&children(n).some(g=>g.tagName==='g'&&attr(g,'data-series-group')!==undefined))
 if(svgs.length!==1)return unchanged
 const svg=svgs[0],parts=children(svg),groups=parts.filter(n=>n.tagName==='g')
 if(parts.some(n=>!['g','line','text'].includes(n.tagName))||groups.some(g=>attr(g,'data-series-group')===undefined)||elements.some(n=>(n===svg||isInside(n,svg))&&(attr(n,'transform')!==undefined||attr(n,'clip-path')!==undefined||/(?:^|;)\s*(?:transform|translate|rotate|scale|clip-path|cx|cy|d)\s*:/iu.test(attr(n,'style')??''))))return unchanged
 const kind=groups.every(g=>children(g).some(n=>n.tagName==='polyline'))?'line':groups.every(g=>children(g).every(n=>n.tagName==='rect'))?'bar':undefined
 if(!kind||value.variant!==undefined&&value.variant!==kind)return unchanged
 const spec={version:1,type:'chart',variant:kind,title:'Chart',labels:[...value.labels],series:value.series.map(s=>s&&typeof s==='object'?{name:s.name,values:Array.isArray(s.values)?[...s.values]:s.values,...Object.hasOwn(s,'kind')?{kind:s.kind}:{}}:s),...Object.fromEntries(['unit','asOf','subtitle','note'].filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]))}
 if(chartDataIssue(spec))return unchanged
 const issue=message=>({html,snapshot:{model:spec,context:chartContext(html)},issue:'标准图表几何与声明数据不一致：'+message+'。保留全部数据、自定义内容与交互，使用同一线性domain生成刻度和图形；不要手算不一致坐标。'})
 if(groups.length!==spec.series.length||groups.some((g,i)=>attr(g,'data-series-group')!==String(i)))return issue('系列标记不唯一或缺失')
 const grids=parts.filter(n=>n.tagName==='line'&&attr(n,'class')!=='chart-cursor'&&close(number(attr(n,'y1')),number(attr(n,'y2'))))
 if(grids.length!==5)return unchanged
 const axes=grids.map(grid=>({grid,y:number(attr(grid,'y1')),left:number(attr(grid,'x1')),right:number(attr(grid,'x2'))})).sort((a,b)=>b.y-a.y)
 if(axes.some(a=>!Number.isFinite(a.y)||!Number.isFinite(a.left)||!Number.isFinite(a.right)||a.right<=a.left||!close(a.left,axes[0].left)||!close(a.right,axes[0].right)))return unchanged
 const bottom=axes[0].y,top=axes[4].y;if(!(bottom>top)||axes.some((a,i)=>!close(a.y,bottom-(bottom-top)*i/4)))return unchanged
 const texts=parts.filter(n=>n.tagName==='text'&&children(n).length===0)
 for(const axis of axes){const labels=texts.filter(n=>attr(n,'text-anchor')==='end'&&number(attr(n,'x'))<axis.left&&number(attr(n,'y'))-axis.y>=0&&number(attr(n,'y'))-axis.y<=10&&Number.isFinite(number(text(n))));if(labels.length!==1)return unchanged;axis.label=labels[0];axis.value=number(text(labels[0]));axis.precision=precision(text(labels[0]))}
 const dates=texts.filter(n=>attr(n,'text-anchor')==='middle'),first=children(groups[0]).filter(n=>n.tagName===(kind==='line'?'circle':'rect'))
 if(first.length!==spec.labels.length||dates.length<Math.min(2,spec.labels.length)||text(dates[0])!==spec.labels[0]||text(dates.at(-1))!==spec.labels.at(-1))return unchanged
 const centers=first.map(n=>kind==='line'?number(attr(n,'cx')):number(attr(n,'x'))+number(attr(n,'width'))/2),offset=number(attr(dates[0],'x'))-centers[0],xs=centers.map(x=>x+offset)
 if(kind==='line'&&!close(offset,0)||xs.some((x,i)=>!Number.isFinite(x)||x<axes[0].left||x>axes[0].right||i>0&&x<=xs[i-1]))return unchanged
 if(dates.some(n=>{const i=xs.findIndex(x=>close(x,number(attr(n,'x'))));return i<0||text(n)!==spec.labels[i]}))return unchanged
 const marks=[]
 for(const [si,g]of groups.entries()){
  const all=children(g),points=all.filter(n=>n.tagName===(kind==='line'?'circle':'rect')),lines=all.filter(n=>n.tagName==='polyline')
  if(all.some(n=>!['circle','polyline','rect'].includes(n.tagName))||points.length!==spec.labels.length||kind==='line'&&lines.length!==1||kind==='bar'&&lines.length)return unchanged
  for(const [i,p]of points.entries()){
   const titles=children(p);if(titles.length!==1||titles[0].tagName!=='title'||!['：',': '].some(sep=>text(titles[0])===spec.labels[i]+' · '+spec.series[si].name+sep+spec.series[si].values[i]))return unchanged
   if(kind==='line'&&(!close(number(attr(p,'cx')),xs[i])||!Number.isFinite(number(attr(p,'cy')))))return unchanged
   if(kind==='bar'&&(!Number.isFinite(number(attr(p,'y')))||!Number.isFinite(number(attr(p,'height')))||number(attr(p,'height'))<0))return unchanged
  }
  if(kind==='line'){
   const parsed=(attr(lines[0],'points')??'').trim().split(/\s+/u).map(p=>p.split(',').map(Number))
   if(parsed.length!==points.length||parsed.some((p,i)=>p.length!==2||!close(p[0],number(attr(points[i],'cx')))||!close(p[1],number(attr(points[i],'cy')))))return issue('线与数据点不一致')
  }
  marks.push({points,line:lines[0]})
 }
 // Preserve correct custom domains rather than always fitting observed values.
 const low=axes[0].value,high=axes[4].value,quantum=Math.min(...axes.map(a=>a.precision)),tolerance=.75+(high>low?quantum*.5/(high-low)*(bottom-top):0)
 const y=v=>bottom-(v-low)/(high-low)*(bottom-top)
 let valid=high>low&&axes.every(a=>Math.abs(a.y-y(a.value))<=tolerance)
 for(const [si,group]of marks.entries())for(const [i,p]of group.points.entries()){
  const v=spec.series[si].values[i]
  valid&&=kind==='line'?Math.abs(number(attr(p,'cy'))-y(v))<=tolerance:Math.abs(number(attr(p,'y'))-Math.min(y(v),y(0)))<=tolerance&&Math.abs(number(attr(p,'height'))-Math.abs(y(v)-y(0)))<=Math.max(1,tolerance)
 }
 if(valid)return includeModel?{html,model:spec,snapshot:{model:spec,context:chartContext(html)}}:unchanged
 const geometry=cartesianChartSvg(spec),hostAxes=geometry.elements.filter(n=>n.tag==='line'&&n.attributes.class==='grid'),hostTop=Math.min(...hostAxes.map(n=>n.attributes.y1)),hostBottom=Math.max(...hostAxes.map(n=>n.attributes.y1)),project=v=>clean(top+(v-hostTop)/(hostBottom-hostTop)*(bottom-top)),hostLabels=geometry.elements.filter(n=>n.tag==='text'&&n.children.length===1&&typeof n.children[0]==='string').slice(0,5),hostGroups=geometry.elements.filter(n=>n.tag==='g'&&n.attributes['data-series']!==undefined),edits=[]
 const set=(node,key,value)=>{const loc=node.sourceCodeLocation?.attrs?.[key.toLowerCase()];if(!loc)throw Error('missing geometry attribute');edits.push({start:loc.startOffset,end:loc.endOffset,value:key+'="'+value+'"'})}
 try{
  for(const [i,axis]of axes.entries()){const node=axis.label.childNodes[0],loc=node?.sourceCodeLocation;if(!loc||axis.label.childNodes.length!==1)throw Error('ambiguous tick');edits.push({start:loc.startOffset,end:loc.endOffset,value:hostLabels[i].children[0]})}
  for(const [si,group]of marks.entries()){
   const host=hostGroups[si].children.filter(n=>n.tag===(kind==='line'?'circle':'rect'))
   if(host.length!==group.points.length)throw Error('ambiguous marks')
   for(const [i,p]of group.points.entries()){set(p,kind==='line'?'cy':'y',project(host[i].attributes[kind==='line'?'cy':'y']));if(kind==='bar')set(p,'height',clean(host[i].attributes.height/(hostBottom-hostTop)*(bottom-top)))}
   if(kind==='line')set(group.line,'points',host.map((p,i)=>xs[i]+','+project(p.attributes.cy)).join(' '))
  }
 }catch{return issue('缺少可安全投影的几何位置')}
 edits.sort((a,b)=>b.start-a.start);let output=html,last=html.length
 for(const edit of edits){if(edit.end>last)return issue('几何位置有歧义');output=output.slice(0,edit.start)+edit.value+output.slice(edit.end);last=edit.start}
 return{html:output,...includeModel?{model:spec,snapshot:{model:spec,context:chartContext(output)}}:{}}
}
function precision(value){const plain=value.replaceAll(',','').trim(),match=plain.match(/\.(\d+)(?:e([+-]?\d+))?$/iu);return match?10**((Number(match[2])||0)-match[1].length):/e([+-]?\d+)$/iu.test(plain)?10**Number(plain.match(/e([+-]?\d+)$/iu)[1]):1}
const clean=value=>Number(value.toPrecision(14))
function isInside(node,parent){for(let p=node.parentNode;p;p=p.parentNode)if(p===parent)return true;return false}

// A geometry repair may change the drawing implementation, not its business
// values or the surrounding editable/disclosure content.
function contentText(node){if(['svg','script','style'].includes(node.tagName))return '';return node.nodeName==='#text'?node.value:(node.childNodes??[]).map(contentText).join('')}
function selectOptions(node){return children(node).flatMap(n=>n.tagName==='option'?[[attr(n,'value')??contentText(n),contentText(n),attr(n,'selected')!==undefined,attr(n,'disabled')!==undefined]]:selectOptions(n))}
function chartContext(html){
 const texts=[],controls=[]
 const flags=node=>{let hidden=false,disabled=false,pointerBlocked=false;for(let p=node;p?.tagName;p=p.parentNode){const style=attr(p,'style')??'';hidden||=attr(p,'hidden')!==undefined||attr(p,'aria-hidden')==='true'||/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/iu.test(style);disabled||=attr(p,'inert')!==undefined||p.tagName==='fieldset'&&attr(p,'disabled')!==undefined;pointerBlocked||=/(?:^|;)\s*pointer-events\s*:\s*none(?:\s*!important)?\s*(?:;|$)/iu.test(style)}return{hidden,disabled:disabled||attr(node,'disabled')!==undefined||attr(node,'aria-disabled')==='true',pointerBlocked}}
 const visit=node=>{
  if(['svg','script','style','head'].includes(node.tagName))return
  if(['details','summary','button','input','textarea','select'].includes(node.tagName)){
   const type=['input','button'].includes(node.tagName)?(attr(node,'type')??(node.tagName==='input'?'text':'submit')).toLowerCase():node.tagName
   controls.push({tag:node.tagName,type,...flags(node),readOnly:attr(node,'readonly')!==undefined,name:attr(node,'name')??'',label:attr(node,'aria-label')??(['button','summary'].includes(node.tagName)?contentText(node).replace(/\s+/gu,' ').trim().replace(attr(node,'data-chart-series')!==undefined?/^[●•]\s*/u:/^$/u,''):''),value:node.tagName==='textarea'?text(node):attr(node,'value')??(['checkbox','radio'].includes(type)?'on':''),checked:attr(node,'checked')!==undefined,required:attr(node,'required')!==undefined,expanded:attr(node,'aria-expanded')??'',pressed:attr(node,'aria-pressed')??'',multiple:attr(node,'multiple')!==undefined,open:attr(node,'open')!==undefined,options:node.tagName==='select'?selectOptions(node):[]})
  }
  if(node.nodeName==='#text'&&node.value.trim())texts.push(node.value.replace(/\s+/gu,' ').trim())
  for(const child of node.childNodes??[])visit(child)
 }
 visit(parseHtml(html));return{controls,texts:[...new Set(texts)]}
}
export function chartGeometryRepairIssue(snapshot,html){
 if(!snapshot)return
 const result=generatedChartGeometry(html,{includeModel:true})
 if(result.issue)return result.issue
 if(!result.model||JSON.stringify(result.model)!==JSON.stringify(snapshot.model))return '图表几何修复必须保留原声明数据与标准图表，不能丢弃图形或改变业务数值。'
 const next=chartContext(html),content=next.texts.join(' ')
 const available=next.controls.map(value=>JSON.stringify(value)),lost=snapshot.context.controls.some(value=>{const i=available.indexOf(JSON.stringify(value));if(i<0)return true;available.splice(i,1);return false})
 if(lost||snapshot.context.texts.some(value=>!content.includes(value)))return '图表几何修复必须保留原HTML的备注、明细与业务内容，不能删减控件或说明。'
}
