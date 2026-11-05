import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {expect, it, vi} from 'vitest'
import {acceptComposerImageFiles, patchConversationImageIntake} from '../scripts/lib/conversation-image-intake.mjs'
import {patchDshFileDropClientSource} from '../src/main/state/dsh-file-drop-compat'

function fixture() {
  const image = {name:'reference.png',type:'image/png',size:42}
  const shell = {snapshot:{phase:'plain'},addImages:vi.fn(()=>true)}
  const conversation = {createDraftImages:vi.fn(files=>files.map((file,index)=>({id:'image-'+index,file}))),releaseDraftImages:vi.fn()}
  return {image,shell,conversation}
}

it('registers the actual browser File on its owning draft, never a path string',()=>{
  const {image,shell,conversation}=fixture()
  expect(acceptComposerImageFiles(shell,conversation,[image])).toBeNull()
  expect(conversation.createDraftImages).toHaveBeenCalledWith([image])
  expect(shell.addImages).toHaveBeenCalledWith(['image-0'])
  expect(conversation.releaseDraftImages).not.toHaveBeenCalled()
})

it('keeps admission locked and releases rejected image previews',()=>{
  const {image,shell,conversation}=fixture()
  shell.snapshot.phase='submitting'
  expect(acceptComposerImageFiles(shell,conversation,[image])).toContain('正在提交')
  expect(conversation.createDraftImages).not.toHaveBeenCalled()
  shell.snapshot.phase='plain';shell.addImages.mockReturnValue(false)
  expect(acceptComposerImageFiles(shell,conversation,[image])).toContain('正在提交')
  expect(conversation.releaseDraftImages).toHaveBeenCalledWith([{id:'image-0',file:image}])
})

function picker() {
  let descriptor
  const source=patchDshFileDropClientSource(readFileSync(new URL('./fixtures/dsh-file-drop-1.0.0-client.js',import.meta.url),'utf8'))
  expect(source).toBeTypeOf('string')
  runInNewContext(source.replace('exports.inject = inject','exports.processFiles = processFiles; exports.inject = inject'),{
    window:{__ModuleLoader__:{load:value=>descriptor=value},dshDesktop:{getPathForFile:file=>'/tmp/'+file.name}},
    setTimeout:()=>1,clearTimeout:()=>{}
  })
  return descriptor.factory(()=>({})).processFiles
}

it('routes picker images to vision while preserving ordinary file references',async()=>{
  const {image,shell,conversation}=fixture(),paths=[]
  const actions={addImageFiles:files=>acceptComposerImageFiles(shell,conversation,files),insertFilePaths:files=>paths.push(...files)}
  await picker()([image,{name:'report.pdf',type:'application/pdf'}],{inputActions:actions,getDraft:()=>''})
  expect(conversation.createDraftImages).toHaveBeenCalledWith([image])
  expect(paths).toEqual(['/tmp/report.pdf'])
})

it('does not silently replace a rejected image with a path-only reference',async()=>{
  const {image}=fixture(),insertFilePaths=vi.fn()
  await picker()([image],{inputActions:{addImageFiles:()=> '不支持的图片格式',insertFilePaths},getDraft:()=>''})
  expect(insertFilePaths).not.toHaveBeenCalled()
})

it('patches the resident shell and keeps native note shells on the inherited image owner',()=>{
  const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
  const patched=patchConversationImageIntake(source)
  expect(()=>new Function(patched)).not.toThrow()
  expect(patchConversationImageIntake(patched)).toBe(patched)
  expect(patched).toContain('new SessionInputShell({...ordinary.deps,')
  expect(patched).toContain('imageConversation: () => this.rootCtx.get("conversation")')
})
