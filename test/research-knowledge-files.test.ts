import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { admitKnowledgeResearchFile } from '../src/main/state/research-knowledge-files'
import { ResearchFilePreviewRegistry } from '../src/main/state/research-file-preview'
import type { KnowledgeDocument } from '../src/shared/knowledge-library'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive:true, force:true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'research-knowledge-test-')); roots.push(root)
  const board = join(root,'board'), original = join(root,'library-storage-name.md')
  const registry = new ResearchFilePreviewRegistry({storage:{load:()=>[],save:()=>true}})
  const name = '研究材料.md', data = Buffer.from('# 研究材料\n原始资料\n')
  await writeFile(original,data)
  const document: Pick<KnowledgeDocument,'name'|'source'> = {name,source:'upload'}
  const read = vi.fn(async (id: string) => id.length === 32 ? {document,data} : {document,path:original})
  let allowed = true
  return {root,original,board,data,name,registry,revoke:()=>{allowed=false},options:{read,registry,directory:async()=>board,
    guard:()=>()=>{if(!allowed)throw Error('权限已变化。')}}}
}
const sessionId='research-session', nodeId='board-node', local='12345678-1111-1234-8888-0123456789ab', received='a'.repeat(32)

it.each([local,received])('admits original bytes as a distinct, restorable canvas file for %s',async fileId=>{
  const f=await fixture()
  const result=await admitKnowledgeResearchFile({fileId,sessionId,nodeId},f.options)
  expect(result.name).toBe(f.name); expect(basename(result.path)).toBe(f.name)
  expect(await readFile(result.path)).toEqual(f.data)
  expect(await f.registry.resolveExportSource({sessionId,nodeId,authorizationId:result.authorizationId})).toMatchObject({path:result.path})
  await writeFile(result.path,'changed on board')
  expect(await readFile(f.original)).toEqual(f.data)
  expect(f.data.toString()).toContain('原始资料')
})
it('removes just the granted copy when board ownership changes during admission',async()=>{
  const f=await fixture()
  const first=await admitKnowledgeResearchFile({fileId:local,sessionId,nodeId},f.options)
  const admit=f.registry.admitFinder.bind(f.registry)
  vi.spyOn(f.registry,'admitFinder').mockImplementation(async (...args)=>{const grant=await admit(...args);f.revoke();return grant})
  await expect(admitKnowledgeResearchFile({fileId:received,sessionId,nodeId:'second-node'},f.options)).rejects.toThrow('权限')
  expect(await readdir(f.board)).toEqual([first.name]);expect(await readFile(first.path)).toEqual(f.data)
})
it('denies a received read-only session, foreign IDs and revoked access before copying files',async()=>{
  const f=await fixture()
  f.options.read.mockResolvedValue({document:{name:'只读.ework-session-research',source:'generated'},data:f.data})
  await expect(admitKnowledgeResearchFile({fileId:received,sessionId,nodeId},f.options)).rejects.toThrow('只读')
  await expect(admitKnowledgeResearchFile({fileId:'../invalid',sessionId,nodeId},f.options)).rejects.toThrow('标识')
  await expect(admitKnowledgeResearchFile({fileId:received,sessionId:'knowledge-view:readonly',nodeId},f.options)).rejects.toThrow('标识')
  f.revoke()
  await expect(admitKnowledgeResearchFile({fileId:local,sessionId,nodeId},f.options)).rejects.toThrow('权限')
  expect(f.options.read).toHaveBeenCalledTimes(1);expect(await readdir(f.root)).toEqual([basename(f.original)])
})
