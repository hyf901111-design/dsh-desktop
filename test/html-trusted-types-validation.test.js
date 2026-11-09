import {expect,it} from 'vitest'
import {sharedComponentIssue} from '../packages/dsh-research-task-runtime/shared-component-validation.js'
import {normalizeConversationComponentArtifact} from '../packages/dsh-research-task-runtime/conversation-component-contract.js'
const wrap=source=>'<div id="out">initial value</div><script>'+source+'</script>'
it.each([
 'var out=document.getElementById("out");out.innerHTML="<b>"+String(value)+"</b>";',
 'const out=document.querySelector("#out");out["outerHTML"]=`<p>${value}</p>`;',
 'const markup="<b>value</b>";document.body.innerHTML=markup;',
 'var markup="<thead>";markup+="<tr>row</tr>";markup+="</thead>";document.getElementById("out").innerHTML=markup;',
 'let markup;markup="<b>";markup+=String(value);document.body.insertAdjacentHTML("beforeend",markup);',
 'let markup="<b>";markup=markup+value;document.write(markup);',
 'document.getElementById("out").insertAdjacentHTML("beforeend","<b>value</b>");',
 'document.write("<b>value</b>");',
 'document.body.innerHTML += value;'
])('rejects a provable generated DOM string sink before a saved conversation receipt: %s',source=>{
 expect(sharedComponentIssue(wrap(source))).toMatch(/TrustedHTML.*textContent/)
 expect(()=>normalizeConversationComponentArtifact({artifact:{version:1,type:'html',title:'DOM compatibility',html:wrap(source)}})).toThrow(/TrustedHTML/)
})
it.each([
 'const out=document.getElementById("out");out.textContent=`<b>${value}</b>`;',
 'const data={innerHTML:"initial"};data.innerHTML="saved field";',
 'const markup=`<b>${value}</b>`;document.getElementById("out").textContent=markup;',
 'function f(document){document.body.innerHTML="ordinary object"}',
 'function f(String){document.body.innerHTML=String(value)}',
 'let out=document.getElementById("out");out={};out.innerHTML="ordinary object";',
 'const out=document.getElementById("out");out.innerHTML=unknownTrustedValue;',
 'const out=document.getElementById("out");const other={innerHTML:""};{const out=other;out.innerHTML="ordinary object"}'
 ,'let markup="<b>";markup+="x";const data={innerHTML:""};data.innerHTML=markup;'
 ,'var markup="<b>";markup+="x";function f(markup){document.body.innerHTML=markup}'
])('does not mistake safe text, template strings or unproven values for a forbidden sink: %s',source=>{
 expect(sharedComponentIssue(wrap(source))).toBeUndefined()
})
it('keeps source syntax diagnostics ahead of compatibility analysis',()=>{
 expect(sharedComponentIssue(wrap('document.body.innerHTML="unterminated'))).toMatch(/语法/)
})
it('provides sandbox-compatible authoring guidance to the actual Conversation parent hook',async()=>{
 const {registerConversationComponentsPolicy}=await import('../packages/dsh-research-task-runtime/conversation-components-policy.js')
 let prompt
 const dispose=registerConversationComponentsPolicy({systemPrompt:{context:value=>{prompt=value;return()=>{}}},tools:{guard:()=>()=>{}},on:()=>()=>{}})
 try{const text=prompt.text({agent:{session:{id:'s',header:{},events:[{type:'turn/start',data:{turn:'1'}},{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'做一张可交互的折线图组件'}]}}]}}});expect(text).toContain('Trusted Types');expect(text).toContain('textContent');expect(text).toContain('createElementNS');expect(text).toContain('conversation.components.create')}finally{dispose()}
})
it('rejects a fresh incompatible artifact without saving a component or altering an existing card',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os'),{ConversationComponentStore}=await import('../src/main/state/conversation-components')
 const directory=await mkdtemp(join(tmpdir(),'tt-reject-')),file=join(directory,'components.json'),store=new ConversationComponentStore(file)
 try{await store.load();const identity={ownerAccountId:'owner',sessionId:'s',turnId:'1',mode:'conversation',windowGeneration:'g',current:()=>true};await store.create({artifact:{version:1,type:'html',title:'Existing',html:'<p>保留原有内容</p>'}},identity,'first');const before=await readFile(file,'utf8')
  await expect(store.create({artifact:{version:1,type:'html',title:'Incompatible',html:wrap('document.getElementById("out").innerHTML="<b>new text</b>";')}},identity,'second')).rejects.toThrow(/TrustedHTML.*textContent/)
  expect(await readFile(file,'utf8')).toBe(before)
 }finally{await rm(directory,{recursive:true,force:true})}
})

it('repairs only empty clears of proven DOM nodes, retaining data, lexical scope and all other sinks',async()=>{
 const {normalizeGeneratedEmptyDomClears}=await import('../packages/dsh-research-task-runtime/shared-component-validation.js')
 const source='const out=document.getElementById("out");out.innerHTML="";out["innerHTML"]="";const data={innerHTML:"saved"};data.innerHTML="";function f(out){out.innerHTML=""}out.innerHTML="<b>original</b>";'
 const fixed=normalizeGeneratedEmptyDomClears(wrap(source))
 expect(fixed).toContain('out.textContent="";out["textContent"]=""')
 expect(fixed).toContain('data.innerHTML="";function f(out){out.innerHTML=""}')
 expect(fixed).toContain('out.innerHTML="<b>original</b>"')
 expect(sharedComponentIssue(fixed)).toMatch(/TrustedHTML/)
 expect(normalizeGeneratedEmptyDomClears(fixed)).toBe(fixed)
 for(const code of ['let out=document.body;out={};out.innerHTML=""','document.body.outerHTML=""','document.body.innerHTML += ""','function f(document){document.body.innerHTML=""}','document.body.innerHTML=maybeTrusted','const out=document.body;const value=(out.innerHTML="")'])expect(normalizeGeneratedEmptyDomClears(wrap(code))).toBe(wrap(code))
 const safe=normalizeGeneratedEmptyDomClears(wrap('document.body.innerHTML="";'))
 expect(sharedComponentIssue(safe)).toBeUndefined()
})

it('finishes a mechanically repairable research artifact without another model attempt',async()=>{
 const {ResearchTaskRuntime}=await import('../packages/dsh-research-task-runtime/index.js')
 let attempts=0
 const html='<p style="font-family:Arial;color:var(--sherlock-text-secondary,#666)">附件中的资料仍完整保留。</p>'+wrap('const out=document.getElementById("out");out.innerHTML="";out.textContent="就绪";')
 const runtime=new ResearchTaskRuntime({adapter:{async start(){attempts++;return{childSessionId:'mechanical',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'html',title:'资料呈现',html})}]}),async dispose(){}}}},storage:{async save(){}},createId:()=> 'mechanical'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'呈现提供的资料说明，使用HTML，不添加业务操作。'})
  await expect.poll(()=>runtime.inspect({parentSessionId:'parent',taskId:'mechanical'}).state).toBe('completed')
  const result=runtime.inspect({parentSessionId:'parent',taskId:'mechanical'})
  expect(attempts).toBe(1)
  expect(result.finalOutput).toContain('textContent')
  expect(result.finalOutput).toContain('var(--sherlock-font-sans)')
  expect(result.finalOutput).toContain('附件中的资料仍完整保留')
 }finally{await runtime.dispose()}
})
