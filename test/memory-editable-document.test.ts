import {expect,it} from 'vitest'
import {parseEditableMemory,renderEditableMemory} from '../src/main/memory/editable-document'
import type {DocumentEntry} from '../src/main/memory/document'
const entry=(input:Partial<DocumentEntry>={}):DocumentEntry=>({id:'r',revision:3,title:'验证偏好',content:'开发后只做聚焦测试。',kind:'preference',scope:'global',status:'active',pinned:false,...input})
const projects=[{id:'p',name:'项目甲',aliases:[],createdAt:0}]
it('roundtrips headings, code fences and literal dividers without exposing tracking metadata',()=>{
  const rows=[entry({content:'### 正文小标题\n\n---\n\\---\n  ---\n---  \n\n```md\n---\n## 代码内标题\n```'}),entry({id:'p',title:'标题\n下一行',kind:'progress',scope:'project',projectId:'p',expiresAt:123,status:'disabled',pinned:true})]
  const value=renderEditableMemory(rows,projects)
  expect(value).not.toMatch(/ework-memory|"revision"|"projectId"/)
  expect(parseEditableMemory(value,rows,projects)).toEqual(rows)
})
it('keeps duplicate titles, exact identity, candidate state, scope and expiry when only the body changes',()=>{
  const rows=[entry(),entry({id:'two',content:'第二项。',status:'candidate',scope:'project',projectId:'p',expiresAt:123}),entry({id:'three',content:'第三项。'})]
  const value=renderEditableMemory(rows,projects).replace('第二项。','修改后的第二项。')
  const edited=parseEditableMemory(value,rows,projects)
  expect(edited).toEqual([rows[0],{...rows[1],content:'修改后的第二项。'},rows[2]])
  expect(parseEditableMemory(renderEditableMemory(rows,projects).replace('## 验证偏好\n','## 新标题\n'),rows,projects)[0]).toMatchObject({id:'r',title:'新标题',revision:3})
})
it('adds ordinary Markdown and forgets removed blocks without inventing metadata',()=>{
  const rows=[entry()]
  const added=parseEditableMemory(renderEditableMemory(rows,projects)+'\n---\n\n## 回答方式\n\n先给结论。\n',rows,projects)
  expect(added).toHaveLength(2);expect(added[1]).toMatchObject({title:'回答方式',content:'先给结论。',scope:'global',status:'active'})
  expect(added[1]!.id).toBeUndefined()
  expect(parseEditableMemory('# 记忆\n\n',rows,projects)).toEqual([])
  expect(parseEditableMemory('直接记下的中文偏好。',rows,projects)[0]?.content).toBe('直接记下的中文偏好。')
})
it('rejects empty entries, oversized bodies and ambiguous new project assignments',()=>{
  expect(()=>parseEditableMemory('## 只有标题',[],[])).toThrow(/正文不能为空/)
  expect(()=>parseEditableMemory('x'.repeat(601),[],[])).toThrow(/过长/)
  expect(()=>parseEditableMemory('## 项目「项目甲」 · 新标题\n正文',[],[...projects,{...projects[0]!,id:'other'}])).toThrow(/不唯一/)
})

it('allows explicit lifecycle changes in Markdown while preserving the original identity and project',()=>{
  const rows=[entry({scope:'project',projectId:'p',status:'candidate'})]
  const confirmed=renderEditableMemory(rows,projects).replace('待确认 · ','')
  expect(parseEditableMemory(confirmed,rows,projects)[0]).toMatchObject({id:'r',scope:'project',projectId:'p',status:'active'})
  const disabled=confirmed.replace('## 项目','## 已停用 · 项目')
  expect(parseEditableMemory(disabled,rows,projects)[0]).toMatchObject({id:'r',scope:'project',projectId:'p',status:'disabled'})
})
