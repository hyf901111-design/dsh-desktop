import {expect,it} from 'vitest'
import {JSDOM} from 'jsdom'
import {SHARED_PANEL_USAGE} from '../packages/dsh-research-task-runtime/shared-component-contract.js'
import {sharedComponentRuntime} from '../packages/dsh-research-task-runtime/shared-component-runtime.js'
import {sharedComponentIssue} from '../packages/dsh-research-task-runtime/shared-component-validation.js'

const body='<span id="value">未选择</span><button id="choose">选择</button>'
const example=SHARED_PANEL_USAGE.split('范式：')[1]
const html=script=>body+'<script>'+script+'</script>'
function mount(saved){
 const dom=new JSDOM(body,{runScripts:'outside-only'}),win=dom.window
 win.TextEncoder=TextEncoder
 win.eval('('+sharedComponentRuntime.toString()+')()')
 win.eval(example)
 const context={type:'sherlock-component-context',shared:false,online:true,readOnly:false,...saved?{saved}:{} }
 win.dispatchEvent(new win.MessageEvent('message',{source:win,data:context}))
 return{win,document:win.document,context,close:()=>win.close()}
}

it('the advertised example works with immediate production render, user actions and saved-state reopening',()=>{
 expect(sharedComponentIssue(html(example),{required:true})).toBeUndefined()
 const b=mount();let saved
 try{
  expect(b.document.getElementById('choose').disabled).toBe(false)
  expect(b.document.getElementById('value').textContent).toBe('未选择')
  b.document.getElementById('choose').click()
  expect(b.document.getElementById('value').textContent).toBe('a')
  const {state,revision}=b.win.sherlockShared.inspect();saved={state,revision}
  expect(state).toEqual({selected:'a'});expect(revision).toBe(1)
 }finally{b.close()}
 const reopened=mount(saved)
 try{expect(reopened.document.getElementById('value').textContent).toBe('a');expect(reopened.win.sherlockShared.inspect().revision).toBe(1)}finally{reopened.close()}
})

it('the example disables user actions when the production host becomes read-only',()=>{
 const b=mount()
 try{
  b.win.dispatchEvent(new b.win.MessageEvent('message',{source:b.win,data:{...b.context,readOnly:true}}))
  const button=b.document.getElementById('choose');expect(button.disabled).toBe(true)
  button.click();expect(b.document.getElementById('value').textContent).toBe('未选择')
 }finally{b.close()}
})

it.each([
 ['calling the returned handle','const dispatch=window.sherlockShared.register({initialState:{},reduce:s=>s,render(){}});document.getElementById("choose").onclick=()=>dispatch({type:"select"});'],
 ['calling render context as dispatch','window.sherlockShared.register({initialState:{},reduce:s=>s,render(state,dispatch){document.getElementById("choose").onclick=()=>dispatch({type:"select"});}});']
])('rejects %s with actionable feedback instead of accepting broken interaction',(_name,script)=>{
 const issue=sharedComponentIssue(html(script),{required:true})
 expect(issue).toContain('空注册');expect(issue).toContain('shared.dispatch(action)')
 expect(issue).toContain('第二参数是权限/连接上下文，不是 dispatch')
})
