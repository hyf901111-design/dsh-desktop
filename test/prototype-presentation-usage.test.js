import {expect,it} from 'vitest'
import {prototypePresentationUsageIssue} from '../packages/dsh-research-task-runtime/prototype-presentation-usage.js'
import {resolvePrototypeHtmlSnapshot} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'

const slot='<script id="sherlock-source-products" type="application/json"></script>'
const ids=new Set(['sherlock-source-products'])
const source='const data=JSON.parse(document.getElementById("sherlock-source-products").textContent);'
const paint='document.body.append(document.createTextNode(data.rows[0].name));'
const script=code=>'<script>'+code+'</script>'
it.each([
 ['only source slots',slot],
 ['empty containers',slot+'<main></main>'],
 ['status prose',slot+'<aside>待补齐</aside>'],
 ['a no-op script',slot+script('function x(){}')],
 ['reading without rendering',slot+script(source)],
 ['rendering without reading',slot+script('document.body.append("稍后读取");')],
 ['a different slot',slot+script(source.replace('source-products','source-invented')+paint)],
 ['script strings',slot+script('const instructions='+JSON.stringify(source+paint)+';')],
 ['comments',slot+script('/* '+source+paint+' */')],
 ['an inert template',slot+'<template>'+script(source+paint)+'</template>'],
 ['inert JSON posing as code',slot+'<script type="application/json">'+JSON.stringify(source+paint)+'</script>']
])('rejects %s as source presentation',(_name,html)=>{
 expect(prototypePresentationUsageIssue(html,ids)).toContain('尚未使用已注入来源呈现内容')
})
it.each([
 source+paint,
 source+'document.querySelector("main").textContent=data.rows[0].name;',
 'const key="products";const data=JSON.parse(document.getElementById("sherlock-source-"+key).textContent);'+paint,
 'const key="products";const data=JSON.parse(document.querySelector(`#sherlock-source-${key}`).textContent);'+paint,
 'const data=JSON.parse(document.querySelector("#sherlock-source-products").textContent);'+paint,
 'const data=JSON.parse(document.querySelectorAll(\'[id^="sherlock-source-"]\')[0].textContent);'+paint,
 source+'const label=document.createElementNS("http://www.w3.org/2000/svg","text");label.textContent=data.rows[0].name;document.querySelector("svg").appendChild(label);',
 source+'document.querySelector("canvas").getContext("2d").fillText(data.rows[0].name,0,20);'
])('retains a custom DOM, SVG or canvas presentation without prescribing its layout: %s',code=>{
 expect(prototypePresentationUsageIssue(slot+script(code),ids)).toBeNull()
})
it('parses without executing source, leaves syntax diagnostics to the existing gate, and accepts module presentation',()=>{
 expect(prototypePresentationUsageIssue(slot+script('globalThis.mustNeverExecute=true;'+source+paint),ids)).toBeNull()
 expect(globalThis.mustNeverExecute).toBeUndefined()
 expect(prototypePresentationUsageIssue(slot+script('const broken = ;'),ids)).toBeNull()
 expect(prototypePresentationUsageIssue(slot+'<script type="module">'+source+paint+'</script>',ids)).toBeNull()
})
it('does not mistake injected records, provenance or a model note for a finished interface',()=>{
 const args={file_path:'/fixture/original.html',section:'DATA.products',limit:500}
 const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:1,rows:[{name:'占位符文字属于原始资料，不按关键词拦截'}]}}
 const candidate={version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'占位',html:slot,note:'待补齐'}}
 let issue
 expect(resolvePrototypeHtmlSnapshot(candidate,[record],{onPrototypeViewIssue:value=>{issue=value}})).toBeNull()
 expect(issue).toContain('数据槽、来源备注或占位文字')
 candidate.mapping.html=slot+script(source+paint)
 const result=resolvePrototypeHtmlSnapshot(candidate,[record]);expect(result).toBeTruthy()
 expect(result.data.html).toContain(record.response.rows[0].name)
})
it.each([
 'function readRows(id){var t=document.getElementById(id).textContent;return JSON.parse(t).rows}var rows=readRows("sherlock-source-products");document.body.append(String(rows.length));',
 'const id="sherlock-source-products";const rows=JSON.parse(document.getElementById(id).textContent).rows;document.body.append(String(rows.length));',
 'const read=id=>JSON.parse(document.querySelector(id).textContent);const data=read("#sherlock-source-products");'+paint,
 'function read(id){return JSON.parse(document.getElementById(id).textContent)}function rows(id){return read(id)}const data=rows("sherlock-source-products");'+paint,
 'function read(id){if(true){var sourceId=id}return JSON.parse(document.getElementById(sourceId).textContent)}const data=read("sherlock-source-products");'+paint
])('accepts real local source aliases and helper wrappers without executing them: %s',code=>{
 expect(prototypePresentationUsageIssue(slot+script(code),ids)).toBeNull()
})
it.each([
 'function read(id){return document.getElementById(id).textContent}document.body.append("没有调用读取函数");',
 'function read(id){return document.getElementById(id).textContent}read("different-slot");document.body.append("没有读取来源");',
 'const id="sherlock-source-products";function read(id){document.body.append(document.getElementById(id).textContent)}read("different-slot");',
 'let id="sherlock-source-products";id="different-slot";document.body.append(document.getElementById(id).textContent);',
 'const id="sherlock-source-products";{const id="different-slot";document.body.append(document.getElementById(id).textContent)}',
 'function read(id){return document.getElementById(id).textContent}function other(){const read=id=>id;read("sherlock-source-products")}other();document.body.append("不是读取调用");',
 'function recursive(id){return document.getElementById(recursive(id)).textContent}document.body.append("不可解析的递归");'
])('does not infer a source read from unused, shadowed, changed or recursive aliases: %s',code=>{
 expect(prototypePresentationUsageIssue(slot+script(code),ids)).toContain('尚未使用已注入来源呈现内容')
})
it.each([
 [slot.replace('></script>','>{"rows":[]}</script>'),'必须留空'],
 [slot+slot,'重复'],
 [slot.replace('source-products','source-invented'),'没有对应'],
 [slot.replace('type="application/json"','type="application/json" src="data.json"'),'不要放入 template 或添加 src'],
 ['<template>'+slot+'</template>','不要放入 template 或添加 src'],
 ['', '缺少来源槽']
])('reports the exact source slot problem before inspecting its reader: %s', (slots,detail)=>{
 const args={file_path:'/fixture/original.html',section:'DATA.products',limit:500}
 const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:1,rows:[{name:'真实记录'}]}}
 const candidate={version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'明细',html:slots+script(source+paint)}}
 let issue
 expect(resolvePrototypeHtmlSnapshot(candidate,[record],{onPrototypeViewIssue:value=>{issue=value}})).toBeNull()
 expect(issue).toContain(detail);expect(issue).toContain(slots.includes('source-invented')?'source-invented':'source-products')
 expect(issue).not.toContain(args.file_path)
})
it('bounds ambiguous recursive helper inspection instead of expanding its call graph indefinitely',()=>{
 const recursive=Array.from({length:40},()=> 'read(id);').join('')
 const code='function read(id){'+recursive+'return document.getElementById(id).textContent}read("unknown");document.body.append("unknown");'
 expect(prototypePresentationUsageIssue(slot+script(code),ids)).toContain('尚未使用已注入来源呈现内容')
})
const wrappedResponse={section:'PROV',value:{confidence:{recon:'222/240'}}}
const wrapped=new Map([['sherlock-source-products',JSON.stringify(wrappedResponse)]])
it.each([
 ['value',source+'document.body.append(data.value.confidence.recon);'],
 ['envelope fallback',source+'const payload=data.value??data;document.body.append(payload.confidence.recon);'],
 ['field fallback',source+'document.body.append((data.confidence||data.value.confidence).recon);'],
 ['independent fallback',source+'const backup={recon:"待核实"};document.body.append((data.confidence??backup).recon);'],
 ['destructured fallback',source+'const {value}=data;document.body.append((data.confidence??value.confidence).recon);'],
 ['dynamic keys',source+'function get(o,k){return o[k]}document.body.append((data.confidence||get(data,"value").confidence).recon);'],
 ['unknown write',source+'let payload=data;payload=window.normalize(payload);document.body.append(payload.confidence.recon);'],
 ['row data',source+paint],
 ['top level metadata',source+'document.body.append(data.section);']
])('does not reject a valid or uncertain source read: %s',(name,code)=>{
 const sources=name==='row data'?new Map([['sherlock-source-products',JSON.stringify({section:'DATA.products',rows:[{name:'产品'}]})]]):wrapped
 expect(prototypePresentationUsageIssue(slot+script(code),sources)).toBeNull()
})
it('reports a direct helper response when a rendered property only exists in its nested value',()=>{
 const code='const read=id=>JSON.parse(document.getElementById(id).textContent);const data=read("sherlock-source-products");document.body.append(data["confidence"].recon);'
 const issue=prototypePresentationUsageIssue(slot+script(code),wrapped)
 expect(issue).toContain('sherlock-source-products');expect(issue).toContain('value.confidence')
})
it.each(['||','??'])('reports a wrapped response behind an empty %s fallback and a try/catch cache',operator=>{
 const code='const raw=document.getElementById("sherlock-source-products").textContent;var data={};try{data=JSON.parse(raw)'+operator+'{}}catch{data={}}document.body.append((data.confidence||{}).recon);'
 expect(prototypePresentationUsageIssue(slot+script(code),wrapped)).toContain('value.confidence')
 // Reading the actual value, or supplying a real independent fallback, remains valid.
 expect(prototypePresentationUsageIssue(slot+script(code.replace('JSON.parse(raw)','JSON.parse(raw).value')),wrapped)).toBeNull()
 expect(prototypePresentationUsageIssue(slot+script(code.replace(operator+'{}',operator+'window.replacement')),wrapped)).toBeNull()
})
