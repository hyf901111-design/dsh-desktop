import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {afterEach,expect,it} from 'vitest'
import {ResearchCanvasStorage,researchCanvasStoragePath} from '../src/main/state/research-canvas-storage'
const {createResearchPreviewModeState}=createRequire(import.meta.url)('../scripts/lib/research-preview-mode.mjs')
const directories:string[]=[]
afterEach(()=>{directories.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true}))})
it('restores each board local mode after the desktop storage instance is recreated',()=>{
 const directory=mkdtempSync(join(tmpdir(),'preview-mode-storage-'));directories.push(directory)
 const first=new ResearchCanvasStorage(directory),state=createResearchPreviewModeState(first,'board-a')
 expect(state.get()).toBe(false);expect(state.set(true)).toBe(true)
 const restarted=new ResearchCanvasStorage(directory)
 expect(createResearchPreviewModeState(restarted,'board-a').get()).toBe(true)
 expect(createResearchPreviewModeState(restarted,'board-b').get()).toBe(false)
 expect(createResearchPreviewModeState(restarted,'board-a').set(false)).toBe(true)
 expect(createResearchPreviewModeState(new ResearchCanvasStorage(directory),'board-a').get()).toBe(false)
 const records=readFileSync(researchCanvasStoragePath(directory,'ework.research.preview.v1:board-a'),'utf8')
 expect(JSON.parse(records)).toEqual({key:'ework.research.preview.v1:board-a',value:'edit'})
})
it('rejects malformed on-disk values and arbitrary values for the preview preference',()=>{
 const directory=mkdtempSync(join(tmpdir(),'preview-mode-validation-'));directories.push(directory)
 const storage=new ResearchCanvasStorage(directory),key='ework.research.preview.v1:board-a'
 expect(storage.setItem(key,'preview')).toBe(true)
 for(const value of ['true','false','{}','preview\n','', 'x'.repeat(1000)])expect(storage.setItem(key,value)).toBe(false)
 writeFileSync(researchCanvasStoragePath(directory,key),JSON.stringify({key,value:'arbitrary'}))
 expect(new ResearchCanvasStorage(directory).getItem(key)).toBeNull()
})
it('cancels gestures before activating preview and keeps runtime state intact when saving fails',()=>{
 let fail=false
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{if(fail)return false;values.set(key,value);return true}}
 const state=createResearchPreviewModeState(storage,'board'),calls:string[]=[]
 state.cancel(()=>calls.push('cancel:'+state.get()));state.subscribe(()=>calls.push('publish:'+state.get()))
 fail=true;expect(()=>state.set(true)).toThrow(/模式未保存/);expect(state.get()).toBe(false);expect(calls).toEqual([])
 fail=false;expect(state.set(true)).toBe(true);expect(calls).toEqual(['cancel:false','publish:true'])
 expect(state.set(true)).toBe(false);expect(calls).toHaveLength(2)
 fail=true;expect(()=>state.set(false)).toThrow(/模式未保存/);expect(state.get()).toBe(true)
})
