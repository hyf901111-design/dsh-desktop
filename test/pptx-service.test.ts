import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fixture } from './fixtures/pptx'
import * as service from '../src/main/pptx/service'
import { readPptxContent } from '../src/main/pptx/content'
const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
async function setup(){const root=await mkdtemp(path.join(tmpdir(),'ppt-edit-'));dirs.push(root);const file=path.join(root,'deck.pptx');await writeFile(file,fixture());return{root,file}}
const source={sessionId:'session',path:'deck.pptx'}
describe('PPTX file service',()=>{
 it('saves content to disk and opens the resulting PPTX again',async()=>{
  expect(typeof service.PptxEditorService).toBe('function')
  const {root,file}=await setup(),editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:async()=>null})
  const opened=await editor.open(source);expect(opened.ok).toBe(true);if(!opened.ok)throw Error(opened.error)
  const saved=await editor.save({...source,version:opened.document.version,edits:[{id:opened.document.slides[0]!.fields[0]!.id,text:'新版年度报告'}]})
  expect(saved.ok).toBe(true);expect(readPptxContent(await readFile(file)).slides[0]!.fields[0]!.text).toBe('新版年度报告')
 })
 it('rejects external edits and a second editor saving the same old version',async()=>{
  const {root,file}=await setup(),editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:async()=>null})
  const opened=await editor.open(source);if(!opened.ok)throw Error(opened.error)
  const request={...source,version:opened.document.version,edits:[{id:opened.document.slides[0]!.fields[0]!.id,text:'A'}]}
  const results=await Promise.all([editor.save(request),editor.save({...request,edits:[{id:request.edits[0]!.id,text:'B'}]})])
  expect(results.filter(r=>r.ok)).toHaveLength(1);expect(results.find(r=>!r.ok)).toMatchObject({code:'conflict'})
  await writeFile(file,fixture());const current=await editor.open(source);if(!current.ok)throw Error(current.error)
  await writeFile(file,Buffer.from('external change'))
  expect(await editor.save({...request,version:current.document.version})).toMatchObject({ok:false,code:'conflict'})
  expect((await readFile(file)).toString()).toBe('external change')
 })
 it('edits admitted capability files, rejects revoked capability and workspace escapes',async()=>{
  const {root,file}=await setup(),outside=await setup();let allowed=true
  const editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:async value=>allowed&&value==='sherlock-preview://valid/'?{path:file,root}:null})
  const cap={sourceUrl:'sherlock-preview://valid/'}
  expect((await editor.open(cap)).ok).toBe(true)
  allowed=false;expect((await editor.open(cap)).ok).toBe(false)
  expect((await editor.open({sessionId:'session',path:outside.file})).ok).toBe(false)
  await symlink(outside.file,path.join(root,'escape.pptx'))
  expect((await editor.open({sessionId:'session',path:'escape.pptx'})).ok).toBe(false)
 })
})

it('enforces a live Research capability at save time and rejects subframe IPC callers',async()=>{
 const {ResearchFilePreviewRegistry}=await import('../src/main/state/research-file-preview')
 const {registerPptxEditorHandlers}=await import('../src/main/pptx/service')
 const {root,file}=await setup()
 let records:any[]=[]
 const registry=new ResearchFilePreviewRegistry({storage:{load:()=>records,save:value=>{records=[...value];return true}}})
 const descriptor=await registry.admitFinder({path:file,sessionId:'research',nodeId:'node'},true)
 expect(descriptor).toBeTruthy();if(!descriptor)throw Error('Admission failed')
 const editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:value=>registry.resolvePptxEditSource(value)})
 const opened=await editor.open({sourceUrl:descriptor.url});if(!opened.ok)throw Error(opened.error)
 registry.revokeNode('research','node')
 const before=await readFile(file)
 expect(await editor.save({sourceUrl:descriptor.url,version:opened.document.version,edits:[{id:opened.document.slides[0]!.fields[0]!.id,text:'denied'}]})).toMatchObject({ok:false})
 expect(await readFile(file)).toEqual(before)
 const handlers=new Map<string,any>(),webContents={mainFrame:{processId:1,routingId:1}},window={isDestroyed:()=>false,webContents}
 registerPptxEditorHandlers({service:editor,getMainWindow:()=>window,ipcMain:{removeHandler:channel=>{handlers.delete(channel)},handle:(channel,handler)=>{handlers.set(channel,handler)}}})
 expect(()=>handlers.get('pptx:editor:save')({sender:webContents,senderFrame:{processId:1,routingId:2}},source)).toThrow(/main EWork/)
 const allowed=await handlers.get('pptx:editor:open')({sender:webContents,senderFrame:webContents.mainFrame},source)
 expect(allowed.ok).toBe(true)
})

it('keeps an edit session usable after preview expiry but revokes it with its Research node',async()=>{
 const {ResearchFilePreviewRegistry}=await import('../src/main/state/research-file-preview')
 const {root,file}=await setup();let now=1000,records:any[]=[]
 const registry=new ResearchFilePreviewRegistry({now:()=>now,storage:{load:()=>records,save:value=>{records=[...value];return true}}})
 const descriptor=await registry.admitFinder({path:file,sessionId:'research',nodeId:'node'},true);if(!descriptor)throw Error('Admission failed')
 const editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:value=>registry.resolvePptxEditSource(value),resolveEditIdentity:value=>registry.resolvePptxEditIdentity(value),refreshPreview:async identity=>(await registry.restore(identity))?.url??null})
 const opened=await editor.open({sourceUrl:descriptor.url});if(!opened.ok)throw Error(opened.error)
 expect(opened.document.editToken).toMatch(/^[a-f0-9-]{36}$/)
 now+=16*60*1000
 expect(await registry.resolvePptxEditSource(descriptor.url)).toBeNull()
 expect((await registry.handle(new Request(descriptor.url))).status).toBe(403)
 const saved=await editor.save({editToken:opened.document.editToken,version:opened.document.version,edits:[{id:opened.document.slides[0]!.fields[0]!.id,text:'长时间编辑'}]})
 expect(saved.ok).toBe(true);if(!saved.ok)throw Error(saved.error)
 expect(saved.document.previewUrl).toMatch(/^sherlock-preview:/)
 expect((await registry.handle(new Request(saved.document.previewUrl!))).status).toBe(200)
 expect((await editor.open({editToken:saved.document.editToken})).ok).toBe(true)
 registry.revokeNode('research','node');const bytes=await readFile(file)
 expect(await editor.save({editToken:saved.document.editToken,version:saved.document.version,edits:[{id:saved.document.slides[0]!.fields[0]!.id,text:'revoked'}]})).toMatchObject({ok:false})
 expect(await readFile(file)).toEqual(bytes)
})

it('renders an authorized unsaved draft without writing the source file',async()=>{
 const {root,file}=await setup(),editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:async()=>null})
 const opened=await editor.open(source);if(!opened.ok)throw Error(opened.error)
 const before=await readFile(file),rendered=await editor.preview({...source,version:opened.document.version,edits:[{id:opened.document.slides[0]!.fields[0]!.id,text:'画面草稿'}],objects:[]})
 expect(rendered.ok).toBe(true);if(!rendered.ok)throw Error(rendered.error)
 expect(readPptxContent(rendered.bytes).slides[0]!.fields[0]!.text).toBe('画面草稿')
 expect(await readFile(file)).toEqual(before)
 await writeFile(file,fixture());await writeFile(file,'changed')
 expect(await editor.preview({...source,version:opened.document.version,edits:[],objects:[]})).toMatchObject({ok:false,code:'conflict'})
})

it('preserves the original OOXML baseline for undo and redo after automatic saves',async()=>{
 const {root,file}=await setup(),editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:async()=>null})
 const original=await readFile(file),opened=await editor.open(source);if(!opened.ok)throw Error(opened.error)
 expect(opened.document.basisToken).toBeTypeOf('string')
 const field=opened.document.slides[0]!.fields[0]!,object=opened.document.slides[0]!.nodes.find(n=>n.nodeId===field.nodeId)!
 const changes={edits:[{id:field.id,text:'自动保存后的标题'}],objects:[{id:object.id,fontSize:42,bold:true}]}
 const saved=await editor.save({...source,basisToken:opened.document.basisToken,version:opened.document.version,...changes});if(!saved.ok)throw Error(saved.error)
 const modified=await readFile(file);expect(modified).not.toEqual(original)
 expect(saved.document.slides[0]!.fields[0]!.text).toBe(field.text)
 const undone=await editor.save({...source,basisToken:opened.document.basisToken,version:saved.document.version,edits:[],objects:[]});if(!undone.ok)throw Error(undone.error)
 expect(await readFile(file)).toEqual(original)
 const redone=await editor.save({...source,basisToken:opened.document.basisToken,version:undone.document.version,...changes});if(!redone.ok)throw Error(redone.error)
 expect(await readFile(file)).toEqual(modified)
})

it('does not allow an editing baseline to target another PPTX or overwrite external changes',async()=>{
 const {root,file}=await setup(),other=path.join(root,'other.pptx');await writeFile(other,fixture())
 const editor=new service.PptxEditorService({resolveWorkspace:async()=>root,resolveCapability:async()=>null}),opened=await editor.open(source);if(!opened.ok)throw Error(opened.error)
 expect(opened.document.basisToken).toBeTypeOf('string')
 const request={...source,basisToken:opened.document.basisToken,version:opened.document.version,edits:[],objects:[]}
 const otherBefore=await readFile(other);expect(await editor.save({...request,path:'other.pptx'})).toMatchObject({ok:false});expect(await readFile(other)).toEqual(otherBefore)
 await writeFile(file,'external change');expect(await editor.save(request)).toMatchObject({ok:false,code:'conflict'});expect((await readFile(file)).toString()).toBe('external change')
})
