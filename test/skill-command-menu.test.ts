import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {installSkillCommandBridge} from '../src/preload/integrations/skill-command-bridge'
import {installSkillCommand} from '../src/preload/integrations/skill-command'

const windows:Window[]=[]
afterEach(()=>{windows.splice(0).forEach(w=>w.happyDOM.abort())})
function fixture(){
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document
 let child=false
 const useSkill=vi.fn(async(_input:any)=>{})
 const skill={id:'builtin:finance',kind:'skill',tab:'skills',name:'基础金融分析逻辑',description:'分析公司、财报和估值',enabled:true,status:'已启用',source:'EWork 内置',revision:2,removable:false}
 const request=vi.fn(async()=>({type:'snapshot',snapshot:{revision:1,rows:[skill,{...skill,id:'off',enabled:false,status:'已停用'},{...skill,id:'plugin-off',status:'已停用'}]}}))
 const bridge=installSkillCommandBridge(doc,{request:request as any,useSkill})
 let command:any
 const dispose=installSkillCommand({document:doc,command:{register:(value:any)=>{command=value;return ()=>{}}},sessions:{subagentAddress:()=>child?{}:undefined}})
 return {w,command,useSkill,request,skill,bridge,dispose,setChild:()=>{child=true}}
}
it('adds a native popup command and lists only enabled skills with a name and description',async()=>{
 const f=fixture();expect(f.command).toMatchObject({name:'skills',ui:{kind:'popupSelect'}})
 const options=await f.command.ui.options({sessionId:'current'},new AbortController().signal)
 expect(options).toEqual([{id:f.skill.id,label:f.skill.name,detail:f.skill.description}])
 await f.command.ui.onSelect(options[0],{sessionId:'current',skillCommandSegment:{via:'enter',token:'/skills'}})
 expect(f.useSkill).toHaveBeenCalledWith(expect.objectContaining({id:f.skill.id,revision:2,sessionId:'current',commandSegment:{via:'enter',token:'/skills'}}))
 f.dispose();f.bridge.dispose()
})
it('does not offer the command in child sessions and drops aborted catalog loads',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort()
 await expect(f.command.ui.options({sessionId:'current'},controller.signal)).rejects.toThrow()
 f.setChild();expect(f.command.available({sessionId:'current'})).toBe(false)
 await expect(f.command.ui.options({sessionId:'current'},new AbortController().signal)).rejects.toThrow('主对话')
 expect(f.useSkill).not.toHaveBeenCalled();f.dispose();f.bridge.dispose()
})

it('rejects a late skill list after identity changes instead of publishing another account catalog',async()=>{
 const f=fixture();let release!:(value:any)=>void
 f.request.mockImplementationOnce(()=>new Promise<any>(resolve=>{release=resolve}))
 const loading=f.command.ui.options({sessionId:'current'},new AbortController().signal),rejected=expect(loading).rejects.toThrow('变化')
 f.bridge.reset();release({type:'snapshot',snapshot:{revision:2,rows:[f.skill]}})
 await rejected;expect(f.useSkill).not.toHaveBeenCalled();f.dispose();f.bridge.dispose()
})

it('cancels a pending selection when the native popup closes',async()=>{
 const f=fixture(),controller=new AbortController();let release!:()=>void,selectionSignal:AbortSignal|undefined
 f.useSkill.mockImplementationOnce(async(input:any)=>{selectionSignal=input.signal;await new Promise<void>(resolve=>{release=resolve})})
 const options=await f.command.ui.options({sessionId:'current'},controller.signal)
 const selecting=f.command.ui.onSelect(options[0],{sessionId:'current'}),rejected=expect(selecting).rejects.toThrow('变化')
 controller.abort();await rejected;expect(selectionSignal?.aborted).toBe(true)
 release();f.dispose();f.bridge.dispose()
})
