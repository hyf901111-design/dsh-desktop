import {expect,it} from 'vitest'
import {evidenceInput,selectEvidence,packMemoryEvidence} from '../packages/dsh-memory-runtime/evidence.js'
const entries=[{id:'a',revision:2,title:'离线',content:'可以离线阅读，不可以离线编辑。',reason:'候选'},{id:'b',revision:1,title:'负责人',content:'业务负责人为许禾。',reason:'候选'}]
it('accepts only existing IDs with exact quotes and retains complete negated source',()=>{
 const input=evidenceInput('断网能不能编辑？',entries)
 const selected=selectEvidence(JSON.stringify({supported:true,evidence:[{id:'a',quote:'不可以离线编辑'}]}),input)
 expect(selected).toEqual([entries[0]])
 expect(packMemoryEvidence(selected).block).toContain('可以离线阅读，不可以离线编辑。')
})
it('returns no evidence for unsupported questions even if a model lists adjacent memories',()=>{
 expect(selectEvidence(JSON.stringify({supported:false,evidence:[{id:'b',quote:'许禾'}]}),evidenceInput('许禾电话？',entries))).toEqual([])
})
it('rejects invented IDs, absent quotations, duplicate IDs and malformed answers',()=>{
 for(const evidence of [[{id:'missing',quote:'内容'}],[{id:'b',quote:'13900000000'}],[{id:'b',quote:'许禾'},{id:'b',quote:'许禾'}]])expect(()=>selectEvidence(JSON.stringify({supported:true,evidence}),evidenceInput('电话',entries))).toThrow()
 expect(()=>selectEvidence('{"supported":true}',evidenceInput('电话',entries))).toThrow()
})
it('whole evidence remains within the existing 1200 UTF-8 byte protocol',()=>{
 const packed=packMemoryEvidence(Array.from({length:8},(_,i)=>({...entries[0],id:String(i),content:'否定条件不要截断。'.repeat(20)})))
 expect(Buffer.byteLength(packed.block)).toBeLessThanOrEqual(1200)
 for(const row of packed.entries)expect(packed.block).toContain(row.content)
})
