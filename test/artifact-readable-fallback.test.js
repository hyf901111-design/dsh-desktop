import {expect,it} from 'vitest'
import {artifactReadableFallback} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {researchHtmlText,MAX_RESEARCH_HTML_BYTES} from '../packages/dsh-research-task-runtime/html-artifact.js'

const fallback=data=>{
 const result=JSON.parse(artifactReadableFallback(JSON.stringify(data)))
 expect(parseResearchContainerSpec(result)).not.toBeNull()
 return {result,text:result.content??researchHtmlText(result.html,{maxCharacters:null})}
}

it('keeps short readable content in the existing markdown contract',()=>{
 const {result,text}=fallback({version:1,type:'markdown',title:'正文',content:'已取得的完整正文，内容足以直接供用户阅读和核实。'})
 expect(result.type).toBe('markdown');expect(text).toContain('交互视图暂未完成')
})

it('retains every long-table row, original label and provenance beyond the markdown limit',()=>{
 const rows=Array.from({length:1944},(_,i)=>['ROW-'+i,'原始内容'.repeat(12)+'-END-'+i])
 const label='原始字段'.repeat(40),data={version:1,type:'table',title:'完整来源',columns:[label,'正文'],rows,asOf:'2026-11-11',note:'原始单位与缺失均保留',sources:[{label:'来源原文',url:'https://example.com/original'}]}
 const before=structuredClone(data),{result,text}=fallback(data)
 expect(result.type).toBe('html');expect(text.length).toBeGreaterThan(32000)
 expect(text.match(/ROW-\d+/gu)).toHaveLength(1944)
 expect(text).toContain('END-1943');expect(text).toContain(label)
 for(const value of [data.asOf,data.note,data.sources[0].url])expect(text).toContain(value)
 expect(data).toEqual(before)
})

it('keeps the complete readable HTML body beyond the usual evidence-preview limit',()=>{
 const body='真实正文'.repeat(40000)+'最后一行原文',data={version:1,type:'html',title:'长正文',html:'<html><body><p>'+body+'</p><script>DO_NOT_EXECUTE()</script></body></html>'}
 const {result,text}=fallback(data)
 expect(result.type).toBe('html');expect(text).toContain(body);expect(text).not.toContain('DO_NOT_EXECUTE')
 expect(researchHtmlText(data.html)).toHaveLength(120000)
})

it('retains irregular row values and literal markup instead of dropping records',()=>{
 const {text}=fallback({version:1,type:'table',title:'待修复表格',columns:['原字段'],rows:[['甲原文内容'],['乙原文内容',false,null,{nested:'保留对象值'}],{original:'保留对象行'},['<script>原始文字不能执行</script>']]})
 for(const value of ['甲原文内容','乙原文内容','false','本次未取得','保留对象值','保留对象行','<script>原始文字不能执行</script>'])expect(text).toContain(value)
})

it('does not publish a truncated prefix when even the complete HTML exceeds the transfer budget',()=>{
 const data={version:1,type:'markdown',title:'超限正文',content:'文'.repeat(Math.ceil(MAX_RESEARCH_HTML_BYTES/3))+'最后一行'}
 expect(artifactReadableFallback(JSON.stringify(data))).toBeUndefined()
 expect(artifactReadableFallback('I should search for more records.')).toBeUndefined()
})
