import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {eworkBindWorkspaceDraft,eworkRestoreWorkspaceDraft,eworkWorkspaceDraftImages,eworkWorkspaceDraftRevision} from '../scripts/lib/workspace-draft-state.mjs'

const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const start=source.indexOf('var InputMachine = class {')
const end=source.indexOf('//#endregion',start)
const InputMachine=new Function('EMPTY_QUEUE$1','LOG_LIMIT',source.slice(start,end)+'\nreturn InputMachine;')([],100)

function fixture(legacy){
 const saved={}
 const createCore=()=>new InputMachine()
 const shell={
  core:createCore(),imageIds:[],researchContextOptOut:false,researchContextOptionRev:0,
  notices:{set(){}},dismissPopup(){},
  get snapshot(){return {...this.core.state,imageIds:this.imageIds}},
  publish(){if(this.lastDraft!==this.core.state.draft){this.lastDraft=this.core.state.draft;this.mirror?.()}},
  bindMirror(write){this.mirror=write;return()=>{if(this.mirror===write)this.mirror=undefined}},
  restoreDraftState(draft){this.core.dispatch({type:'restore-draft',...draft});this.publish()},
  restoreImages(ids){this.imageIds=[...new Set([...ids,...this.imageIds])]}
 }
 let unbind
 return {shell,saved,mode(view){
  unbind?.()
  unbind=eworkBindWorkspaceDraft(shell,view,legacy,saved,(text,mode)=>{saved[mode]=text},createCore)
 },edit(text,occurrences=[]){shell.restoreDraftState({draft:text,occurrences})}}
}

describe('independent resident workspace drafts',()=>{
 it('keeps the legacy draft in chat and restores the original content, references, images and scope after switching',()=>{
  const f=fixture('旧版共享输入'),{shell}=f
  f.mode('research')
  expect(shell.snapshot.draft).toBe('')
  f.edit('搭建行业研究看板\uFFFC',[{offset:8,occurrenceId:1,clipboardText:'行业资料'}])
  shell.imageIds=['research-image']
  shell.researchContextOptOut=true
  const research= shell.snapshot

  f.mode('spreadsheet')
  expect(shell.snapshot).toMatchObject({draft:'',occurrences:[],imageIds:[]})
  f.edit('检查表格')
  shell.imageIds=['sheet-image']
  f.mode('notes')
  expect(shell.snapshot.draft).toBe('')
  f.mode('chat')
  expect(shell.snapshot.draft).toBe('旧版共享输入')
  expect(shell.snapshot.imageIds).toEqual([])

  f.mode('research')
  expect(shell.snapshot).toMatchObject({draft:research.draft,occurrences:research.occurrences,imageIds:research.imageIds})
  expect(shell.researchContextOptOut).toBe(true)
  expect(shell.snapshot.draftRev).toBeGreaterThan(research.draftRev)
  expect([...eworkWorkspaceDraftImages(shell)].sort()).toEqual(['research-image','sheet-image'])
  f.mode('spreadsheet')
  expect(shell.snapshot.draft).toBe('检查表格')
  expect(shell.researchContextOptOut).toBe(false)
  expect(Object.keys(f.saved).sort()).toEqual(['research','spreadsheet'])
  expect(f.saved.research).toBe('搭建行业研究看板行业资料')
 })

 it('recovers a failed send in the originating mode without replacing a newer draft in another mode',()=>{
  const f=fixture(''),{shell}=f
  f.mode('research')
  f.edit('发送的研究问题')
  const original=shell.core
  const admitted=shell.snapshot
  f.edit('')
  const committed=eworkWorkspaceDraftRevision(original)
  f.mode('chat')
  f.edit('新对话草稿')

  expect(eworkRestoreWorkspaceDraft(shell,original,committed,admitted,['pending-image'])).toBe(false)
  expect(shell.snapshot).toMatchObject({draft:'新对话草稿',imageIds:[]})
  f.mode('research')
  expect(shell.snapshot).toMatchObject({draft:'发送的研究问题',imageIds:['pending-image']})
  f.edit('更新后的研究草稿')
  expect(eworkRestoreWorkspaceDraft(shell,original,committed,admitted,[])).toBe(false)
  expect(shell.snapshot.draft).toBe('更新后的研究草稿')
 })
})
