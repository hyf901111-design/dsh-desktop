import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, cp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const cli=resolve('skills/ework-equity-research/scripts/research.mjs'),temp=[]
afterEach(async()=>{await Promise.all(temp.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
const invoke=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:15000})
async function fixture(){const root=await mkdtemp(join(tmpdir(),'equity-cli-'));temp.push(root);await cp(resolve('skills/ework-equity-research/examples/synthetic'),join(root,'input'),{recursive:true});return {root,input:join(root,'input/packet.json')}}
describe('bundled research command workflow',()=>{
 it('initializes safely and reports its real runtime without external dependencies',async()=>{
  const root=await mkdtemp(join(tmpdir(),'equity-init-'));temp.push(root);const out=join(root,'packet.json')
  expect(invoke('doctor').status).toBe(0)
  expect(invoke('init','--company','示例','--ticker','SYNTHETIC','--as-of','2026-10-23','--out',out).status).toBe(0)
  const bytes=await readFile(out,'utf8');expect(JSON.parse(bytes).sources).toEqual([]);expect(JSON.parse(bytes).schemaVersion).toBe(2);expect(JSON.parse(bytes).valuationAsOf).toBe('');expect(JSON.parse(bytes).report.profile).toBe('full');expect(JSON.parse(bytes).report.publication).toEqual({reportType:'公司深度研究与DCF情景估值报告'})
  expect(invoke('init','--out',out).status).not.toBe(0);expect(await readFile(out,'utf8')).toBe(bytes)
 })
 it('produces a repeatable offline report, evidence and independently checkable output hashes',async()=>{
  const f=await fixture();const a=join(f.root,'a'),b=join(f.root,'b')
  const first=invoke('run','--format','html','--input',f.input,'--out',a);expect(first.status,first.stderr+first.stdout).toBe(0)
  const second=invoke('run','--format','html','--input',f.input,'--out',b);expect(second.status,second.stderr+second.stdout).toBe(0)
  const stdout=JSON.parse(first.stdout),htmlName='虚构算术演示公司（SYNTHETIC-NOT-A-SECURITY）2025年报公司研究简报_2026-10-23.html'
  for(const name of [htmlName,'evidence.json','calculations.json','validation.json','run.json'])expect(await readdir(a)).toContain(name)
  expect(await readFile(join(a,'calculations.json'),'utf8')).toBe(await readFile(join(b,'calculations.json'),'utf8'))
  const manifest=JSON.parse(await readFile(join(a,'run.json'),'utf8'))
  expect(manifest.artifacts).toEqual({html:htmlName,manifest:'run.json',validation:'validation.json',evidence:'evidence.json',calculations:'calculations.json',quality:'report-quality.json'})
  expect(stdout.artifacts).toEqual(manifest.artifacts)
  expect(await readdir(a)).not.toContain('report.html')
  for(const [name,sha] of Object.entries(manifest.outputs))expect(createHash('sha256').update(await readFile(join(a,name))).digest('hex')).toBe(sha)
  expect(invoke('run','--format','html','--input',f.input,'--out',a).status).not.toBe(0)
 })
 it('blocks a tampered source and keeps a diagnostic instead of rendering success',async()=>{
  const f=await fixture();await writeFile(join(f.root,'input/source.txt'),'changed source')
  const out=join(f.root,'bad'),result=invoke('run','--format','html','--input',f.input,'--out',out)
  expect(result.status).not.toBe(0);expect((await readdir(out)).some(name=>/\.(?:html|pdf)$/.test(name))).toBe(false)
  expect(JSON.parse(await readFile(join(out,'validation.json'),'utf8')).ok).toBe(false)
 })
 it('names reports from publication metadata while keeping the opinion title independent',async()=>{
  const f=await fixture(),p=JSON.parse(await readFile(f.input,'utf8'))
  p.report.publication={companyShortName:'示例公司',reportType:'财报点评报告',industry:'食品饮料'};await writeFile(f.input,JSON.stringify(p))
  const out=join(f.root,'named'),result=invoke('run','--format','html','--input',f.input,'--out',out)
  expect(result.status,result.stderr+result.stdout).toBe(0)
  const manifest=JSON.parse(await readFile(join(out,'run.json'),'utf8'))
  expect(manifest.artifacts.html).toBe('示例公司（SYNTHETIC-NOT-A-SECURITY）2025年报财报点评报告_2026-10-23.html')
  expect(await readFile(join(out,manifest.artifacts.html),'utf8')).toContain(p.report.title)
 })
 it('blocks free financial prose and rejects ambiguous CLI options',async()=>{
  const f=await fixture();const p=JSON.parse(await readFile(f.input,'utf8'));p.report={summary:[{text:'收入 9999 亿元。'}]};await writeFile(f.input,JSON.stringify(p))
  const out=join(f.root,'bad');expect(invoke('run','--format','html','--input',f.input,'--out',out).status).not.toBe(0)
  const v=JSON.parse(await readFile(join(out,'validation.json'),'utf8'));expect(v.diagnostics.some(x=>x.code==='UNTEMPLATED_NUMBER')).toBe(true)
  expect(invoke('run','--format','html','--input',f.input,'--ot',out).status).not.toBe(0)
 })
})
