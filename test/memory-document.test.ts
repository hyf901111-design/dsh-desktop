import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,rm,stat,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const roots:string[]=[]
afterEach(async()=>{for(const p of roots.splice(0))await rm(p,{recursive:true,force:true})})
it('stores a readable owner-isolated memory.md with lossless content and editable records',async()=>{
 const m=await import('../src/main/memory/document').catch(()=>({MemoryDocument:undefined}));expect(m.MemoryDocument).toBeTypeOf('function')
 const root=await mkdtemp(join(tmpdir(),'memory-document-'));roots.push(root);const doc=new m.MemoryDocument!(root)
 const rows=[{id:'one',revision:1,title:'验证偏好',content:'每次开发只做聚焦验证。\n### 正文内的标题\n不运行全功能单元测试。',kind:'preference' as const,scope:'global' as const,status:'active' as const,pinned:false}]
 doc.write('a',rows,[],'signature-a')
 const stored=await readFile(doc.location('a').file,'utf8');expect(stored).toContain('# 记忆');expect(stored).toContain('每次开发只做聚焦验证。')
 const parsed=doc.read('a');expect(parsed!.signature).toBe('signature-a');expect(parsed!.entries[0]!.content).toBe(rows[0]!.content)
 expect(doc.location('a').directory).not.toBe(doc.location('b').directory)
 expect((await stat(doc.location('a').file)).mode&0o777).toBe(0o600)
 expect((await stat(doc.location('a').directory)).mode&0o777).toBe(0o700)
})
it('rejects mismatched owner and symbolic links without overwriting original files',async()=>{
 const m=await import('../src/main/memory/document').catch(()=>({MemoryDocument:undefined}));expect(m.MemoryDocument).toBeTypeOf('function')
 const root=await mkdtemp(join(tmpdir(),'memory-document-'));roots.push(root);const doc=new m.MemoryDocument!(root)
 doc.write('a',[],[],'empty');doc.write('b',[],[],'empty')
 const file=doc.location('a').file;await rm(file);await symlink(doc.location('b').file,file)
 expect(()=>doc.read('a')).toThrow(/符号链接|读取/)
 expect(()=>doc.write('a',[],[],'empty')).toThrow(/符号链接|读取/)
 expect(await readFile(doc.location('b').file,'utf8')).toContain('# 记忆')
})
