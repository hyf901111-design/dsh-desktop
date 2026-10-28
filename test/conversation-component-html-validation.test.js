import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {normalizeConversationComponentArtifact} from '../packages/dsh-research-task-runtime/conversation-component-contract.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
const normalize=html=>normalizeConversationComponentArtifact({artifact:{version:1,type:'html',title:'对话本地计数与备注',html}})
it('rejects raw HTML executable syntax errors with an actionable current-turn repair receipt',()=>{
 expect(()=>normalize('<button>增加计数</button><script>const =</script>')).toThrow(/脚本.*语法/)
 try{normalize('<button>增加计数</button><script>const =</script>')}catch(error){expect(error.message).toContain('当前对话');expect(error.message).toContain('新 requestId')}
})
it('reports actual shared-state and style failures together rather than saving an inert raw HTML component',()=>{
 const html='<button style="background:#ff0000;color:white" onclick="window.count++">增加</button>'
 let error;try{normalize(html)}catch(value){error=value}
 expect(error?.message).toContain('共享');expect(error?.message).toMatch(/控件|颜色|样式/)
})
it('accepts a real local shared counter and memo without changing its business HTML',()=>{
 const html=readFileSync(new URL('./fixtures/conversation-local-counter.html',import.meta.url),'utf8'),value=normalize(html)
 expect(value.containerSpec.html).toBe(html);expect(value.title).toBe('对话本地计数与备注')
})
it('preserves existing native and structured template creation without treating trusted renderer scripts as raw model HTML',()=>{
 const quote=financialWidgetDefaults('quote'),native=normalizeConversationComponentArtifact({artifact:quote})
 expect(native.containerSpec.widget).toBe('quote')
 const chart={version:1,type:'chart',variant:'line',title:'演示趋势',labels:['一','二'],series:[{name:'演示值',values:[10,20]}]}
 expect(readTemplateModel(normalizeConversationComponentArtifact({artifact:chart}).containerSpec)?.data).toEqual(chart)
 const table={version:1,type:'table',title:'演示表',columns:['项目','值'],rows:[['甲',0],['乙',-1]]}
 expect(readTemplateModel(normalizeConversationComponentArtifact({artifact:table}).containerSpec)?.data??normalizeConversationComponentArtifact({artifact:table}).containerSpec).toMatchObject(table)
})
it('recovers only an absent artifact title from a validated top-level title while preserving the actual artifact and caller input',()=>{
 const artifact={version:1,type:'html',html:'<p>业务正文保持不变</p>'},before=JSON.stringify(artifact),result=normalizeConversationComponentArtifact({artifact,title:'明确提供的组件标题'})
 expect(result.containerSpec).toEqual({...artifact,title:'明确提供的组件标题'});expect(JSON.stringify(artifact)).toBe(before)
 for(const title of ['',null,7])expect(()=>normalizeConversationComponentArtifact({artifact:{...artifact,title},title:'不得覆盖显式错误标题'})).toThrow(/title/)
})
it('describes missing metadata at the actual capability boundary without sending the model to inspect source',async()=>{
 const registry=createClientCapabilityRegistry({createConversationComponent:async()=>({status:'succeeded'})}),context={mode:'conversation',sessionId:'s',owner:'owner',editable:true}
 const descriptor=registry.catalog(context).find(item=>item.id==='conversation.components.create')
 expect(descriptor.parameters.properties.artifact.properties).toHaveProperty('version');expect(descriptor.parameters.properties.artifact.properties).toHaveProperty('title')
 await expect(registry.execute({capability:'conversation.components.create',arguments:{artifact:{type:'html',html:'<p>正文</p>'}}},context)).rejects.toThrow(/version/)
 await expect(registry.execute({capability:'conversation.components.create',arguments:{artifact:{version:1,type:'html',html:'<p>正文</p>'}}},context)).rejects.toThrow(/artifact.title/)
})
it('revalidates the final normalized HTML against the original byte limit instead of saving a card which cannot reopen',()=>{
 const prefix='<style>p{font-family:a}</style><p>',suffix='</p>',html=prefix+'x'.repeat(200000-Buffer.byteLength(prefix+suffix))+suffix
 expect(Buffer.byteLength(html)).toBe(200000)
 expect(()=>normalize(html)).toThrow(/归一化|长度|大小|上限/)
})
