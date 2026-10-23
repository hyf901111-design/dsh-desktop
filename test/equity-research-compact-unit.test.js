import {afterEach,it,expect} from 'vitest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {validatePacket} from '../skills/ework-equity-research/scripts/lib/index.mjs'
const temp=[]
afterEach(async()=>{await Promise.all(temp.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function validate(header,unit='CNY',unitText='元'){
 const root=await mkdtemp(join(tmpdir(),'equity-unit-'));temp.push(root)
 const text=`合并利润表\n${header}\n指标\tFY2025\n营业收入\t10\n`;await writeFile(join(root,'source.txt'),text)
 const packet={schemaVersion:1,synthetic:true,company:{name:'虚构单位测试',ticker:'SYNTHETIC',currency:'CNY'},asOf:'2026-10-23',financialAsOf:'2025-12-31',sources:[{id:'source',title:'单位回归',publisher:'虚构',kind:'text-snapshot',textFile:'source.txt',sha256:createHash('sha256').update(text).digest('hex'),publishedAt:'2026-03-01',accessedAt:'2026-10-23'}],facts:[{id:'revenue',metric:'revenue',period:'FY2025',scope:'合并',unit,value:'10',sourceId:'source',evidence:{quote:text.trimEnd(),locator:{lineStart:1,lineEnd:4,valueLine:4,column:2},metricText:'营业收入',periodText:'FY2025',scopeText:'合并',unitText,valueText:'10'}}],calculations:[]}
 return validatePacket(packet,{root})
}
it.each(['单位:元币种:人民币','单位：元币种：人民币','单位:万元币种:人民币','单位：亿元币种：人民币'])('reads an explicit adjacent currency declaration without changing the snapshot: %s',async header=>{
 const unit=header.includes('万元')?'CNY_10K':header.includes('亿元')?'CNY_100M':'CNY',unitText=header.includes('万元')?'万元':header.includes('亿元')?'亿元':'元'
 const v=await validate(header,unit,unitText);expect(v.ok,v.diagnostics.map(d=>d.message).join(';')).toBe(true)
 expect(v.facts[0].normalizedValue).toBe(unit==='CNY_10K'?'100000':unit==='CNY_100M'?'1000000000':'10')
})
it.each(['单位:元币种:美元','每股元币种:人民币','单位:万元币种:人民币','单位:元币种:人民币 单位:万元币种:人民币'])('retains currency, embedding, magnitude and ambiguity guards: %s',async header=>{
 const v=await validate(header);expect(v.ok).toBe(false);expect(v.diagnostics.some(d=>d.code==='UNIT_MISMATCH'||d.code==='VALUE_MISMATCH')).toBe(true)
})
