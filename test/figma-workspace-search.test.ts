import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'

it('filters real workspace IDs and retains the add-folder flow in a no-match result', async () => {
  const require=createRequire(import.meta.url), react=require('react'), jsx=require('react/jsx-runtime')
  const {createRoot}=require('react-dom/client'),win=new Window()
  for(const key of ['window','document','Node','HTMLElement','Event'] as const)vi.stubGlobal(key,key==='window'?win:win[key])
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8')
  const start=raw.indexOf('function WorkspacePickFlow('),end=raw.indexOf('\n\t\t/**',start)
  const primitives={Menu:({open,items,footer=[],onSelect}:any)=>open?jsx.jsxs('div',{children:[...items,...footer].map((item:any)=>item.type==='label'?jsx.jsx('div',{children:item.text},item.id):jsx.jsx('button',{'data-workspace':item.id,onClick:()=>onSelect(item.id),children:item.label},item.id))}):null,IconPlusOutline16:()=>null,Modal:()=>null,Button:()=>null}
  const Picker=new Function('react','react_jsx_runtime','_deepseek_ai_dsh_client_ui_primitives','WorkspacePicker_module_css_default','ADD_WORKSPACE',raw.slice(start,end)+'\nreturn WorkspacePickFlow;')(react,jsx,primitives,{},'add')
  const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host),onPick=vi.fn(),onClose=vi.fn()
  const props={open:true,anchorRef:{current:null},useWorkspaces:()=>({phase:'ready',items:[{workspaceId:'one',title:'黄金价格研究'},{workspaceId:'two',title:'行业资料'}]}),useDirectoryFlow:()=>true,createWorkspace:vi.fn(),renderDirectoryFlow:()=>null,onPick,onClose,t:(key:string)=>key==='menu.addWorkspace'?'添加工作区…':key}
  const input=async(value:string)=>react.act(async()=>{const n=win.document.querySelector('input')!;n.value=value;n.dispatchEvent(new win.Event('input',{bubbles:true}))})
  try{
    await react.act(async()=>root.render(jsx.jsx(Picker,props)))
    expect(win.document.querySelectorAll('button[data-workspace]')).toHaveLength(3)
    await input('黄金')
    expect(win.document.querySelector('[data-workspace=two]')).toBeNull()
    await react.act(async()=>win.document.querySelector('[data-workspace=one]')!.dispatchEvent(new win.MouseEvent('click',{bubbles:true})))
    expect(onPick).toHaveBeenCalledWith('one')
    await input('不存在的工作区')
    expect(win.document.body.textContent).toContain('没有匹配的工作区')
    expect(win.document.querySelector('[data-workspace=add]')).not.toBeNull()
    await react.act(async()=>win.document.querySelector('[data-workspace=add]')!.dispatchEvent(new win.MouseEvent('click',{bubbles:true})))
    expect(onClose).toHaveBeenCalledOnce()
    expect(props.createWorkspace).not.toHaveBeenCalled()
  }finally{await react.act(async()=>root.unmount());vi.unstubAllGlobals();await win.happyDOM.close()}
})
