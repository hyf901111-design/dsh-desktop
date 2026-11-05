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
 let source:any
 const dispose=installSkillCommand({document:doc,command:{register:(value:any)=>{command=value;return ()=>{}}},inputTriggers:{registerSource:(value:any)=>{source=value;return ()=>{}}},sessions:{subagentAddress:()=>child?{}:undefined}})
 return {w,command,source,useSkill,request,skill,bridge,dispose,setChild:()=>{child=true}}
}
it('adds a native popup command and lists only enabled skills with a name and description',async()=>{
 const f=fixture();expect(f.command).toMatchObject({name:'skills',ui:{kind:'popupSelect'}})
 const options=await f.command.ui.options({sessionId:'current'},new AbortController().signal)
 expect(options).toEqual([{id:f.skill.id,label:f.skill.name,detail:f.skill.description}])
 await f.command.ui.onSelect(options[0],{sessionId:'current',skillCommandSegment:{via:'enter',token:'/skills'}})
 expect(f.useSkill).toHaveBeenCalledWith(expect.objectContaining({id:f.skill.id,revision:2,sessionId:'current',commandSegment:{via:'enter',token:'/skills'}}))
 f.dispose();f.bridge.dispose()
})
it('prioritizes the two exact built-ins once while retaining the stable order and identity of every other enabled skill',async()=>{
 const f=fixture()
 const rows=[{...f.skill,id:'custom:first',name:'PPT制作助手'},{...f.skill,id:'builtin:other'},
  {...f.skill,id:'builtin:ework-equity-research',name:'研报写作'},
  {...f.skill,id:'custom:efund-ppt-maker'},
  {...f.skill,id:'builtin:efund-ppt-maker',name:'PPT制作助手'},
  {...f.skill,id:'custom:last'}]
 f.request.mockResolvedValueOnce({type:'snapshot',snapshot:{revision:1,rows}} as any)
 const options=await f.command.ui.options({sessionId:'current'},new AbortController().signal)
 expect(options.map((row:any)=>row.id)).toEqual(['builtin:efund-ppt-maker','builtin:ework-equity-research','custom:first','builtin:other','custom:efund-ppt-maker','custom:last'])
 expect(new Set(options.map((row:any)=>row.id)).size).toBe(rows.length)
 expect(options[1].detail).toMatch(/^按照易方达配色规范创建和制作研究报告/)
 expect(options[2].detail).toBe(f.skill.description)
 await f.command.ui.onSelect(options[1],{sessionId:'current'})
 expect(f.useSkill).toHaveBeenCalledWith(expect.objectContaining({id:'builtin:ework-equity-research',revision:2,sessionId:'current'}))
 f.dispose();f.bridge.dispose()
})
it('shows the English built-in skill names in the slash popup while preserving custom skill names and identities',async()=>{
 const f=fixture();f.w.document.documentElement.dataset.odysseyLocale='en'
 const names=['PPT制作助手','工作台组件生成','基础数据源','基础金融分析逻辑']
 const rows=names.map((name,index)=>({...f.skill,id:'builtin:skill-'+index,name}))
 const report={...f.skill,id:'builtin:ework-equity-research',name:'研报写作'}
 f.request.mockResolvedValueOnce({type:'snapshot',snapshot:{revision:1,rows:[...rows,report,{...f.skill,id:'custom:finance'}]}} as any)
 const options=await f.command.ui.options({sessionId:'current'},new AbortController().signal)
 expect(options.map((row:any)=>row.label)).toEqual(['Equity research writing','Presentation assistant','Workbench component builder','Core data sources','Core financial analysis','基础金融分析逻辑'])
 expect(options.map((row:any)=>row.id)).toEqual([report.id,...rows.map(row=>row.id),'custom:finance'])
 expect(options[0].detail).toMatch(/^Create research reports using E Fund/)
 await f.command.ui.onSelect(options[1],{sessionId:'current'})
 expect(f.useSkill).toHaveBeenCalledWith(expect.objectContaining({id:'builtin:skill-0',revision:2,sessionId:'current'}))
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

it('revalidates the installed skill before serializing its readable reference, rejecting a disabled or changed skill',async()=>{
 const f=fixture(),reference={id:f.skill.id,revision:2,invocationName:'ework-skill-0123456789abcdef',label:'ework-finance-analysis'},ref=JSON.stringify(reference)
 expect(f.source.codec.clipboardText(ref)).toBe('/ework-finance-analysis')
 f.request.mockResolvedValueOnce({type:'skill-detail',...reference,enabled:true} as any)
 await expect(f.source.codec.serialize(ref,new AbortController().signal)).resolves.toBe('/ework-skill-0123456789abcdef')
 expect(f.request).toHaveBeenLastCalledWith({type:'skill-detail',id:reference.id,revision:2})
 f.request.mockResolvedValueOnce({type:'skill-detail',...reference,enabled:false} as any)
 await expect(f.source.codec.serialize(ref,new AbortController().signal)).rejects.toThrow('启用')
 f.request.mockResolvedValueOnce({type:'skill-detail',...reference,enabled:true,revision:3} as any)
 await expect(f.source.codec.serialize(ref,new AbortController().signal)).rejects.toThrow('变化')
 f.dispose();f.bridge.dispose()
})
