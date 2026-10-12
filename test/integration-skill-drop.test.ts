import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {IntegrationView} from '../src/preload/integrations/view'
import type {IntegrationCommand} from '../src/shared/integration-ui'
const fixtures:Array<{view:IntegrationView;win:Window}>=[]
afterEach(async()=>{for(const f of fixtures.splice(0)){f.view.dispose();await f.win.happyDOM.close()}})
async function fixture(){
 const win=new Window(),doc=win.document as unknown as Document,calls:IntegrationCommand[]=[]
 doc.body.innerHTML='<main class="pI_x6G_centerCol"><textarea>对话草稿</textarea></main>'
 let release:(value:any)=>void=()=>{}
 const getPathForFile=vi.fn(()=>'/tmp/原技能目录'),request=vi.fn(async(command:IntegrationCommand)=>{calls.push(command);if(command.type==='snapshot')return{type:'snapshot',snapshot:{revision:1,rows:[]}};if(command.type==='preview-skill')return await new Promise(resolve=>{release=resolve});throw Error('Unexpected import')})
 const view=new IntegrationView(doc,{request:request as any,getPathForFile});fixtures.push({view,win});await view.open('integrations/skills')
 const file=new win.File([],'原技能目录'),event=(kind:string,files:any[]=[file])=>{const e=new win.Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:{types:['Files'],files,items:files.map(f=>({kind:'file',getAsFile:()=>f})),dropEffect:''}});doc.querySelector('.ig-root')!.dispatchEvent(e as unknown as Event);return e}
 const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
 return{doc,win,view,calls,getPathForFile,event,settle,release:(value:any)=>release(value)}
}
it('accepts a folder drop on the skill list and previews its native filesystem path without opening a picker or importing yet',async()=>{
 const f=await fixture();expect(f.event('dragover').defaultPrevented).toBe(true)
 expect(f.event('drop').defaultPrevented).toBe(true);await f.settle()
 expect(f.getPathForFile).toHaveBeenCalledTimes(1);expect(f.calls.at(-1)).toEqual({type:'preview-skill',path:'/tmp/原技能目录'})
 f.event('drop');await f.settle();expect(f.calls.filter(c=>c.type==='preview-skill')).toHaveLength(1)
 f.release({type:'preview',preview:{previewId:'review',name:'拖入的技能',description:'完整技能',content:'# 正文',files:['SKILL.md','references/doc.md'],warnings:[]}});await f.settle()
 expect(f.doc.querySelector('.ig-skill-preview h2')?.textContent).toBe('拖入的技能')
 expect(f.doc.querySelector('[data-action=import-skill]')).not.toBeNull();expect(f.calls.some(c=>c.type==='import-skill')).toBe(false)
})
it('does not invent a source path from a dropped filename',async()=>{
 const f=await fixture();f.getPathForFile.mockReturnValue('');f.event('drop');await f.settle()
 expect(f.calls.some(c=>c.type==='preview-skill')).toBe(false);expect(f.doc.querySelector('.ig-error')?.textContent).toContain('选择文件')
})
