import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { patchFigmaReadingConversation } from '../scripts/lib/figma-reading-client.mjs'
const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
it('renders todo-owned status and uses real user content when no goal exists', () => {
 const patched = patchFigmaReadingConversation(source)
 expect(patched.includes('OdysseyTaskStatus')).toBe(true)
 expect(patchFigmaReadingConversation(patched)).toBe(patched)
 const start=patched.indexOf('function odysseyTaskObjective('),end=patched.indexOf('function OdysseyTaskStatus(',start)
 const objective=runInNewContext(patched.slice(start,end)+';odysseyTaskObjective',{contentParts:(parts:any[])=>({text:parts.map(p=>p.text??'').join('')}),odysseyTaskVisibleText:(text:string)=>text.replace(/\s+/g,' ').trim() || undefined})
 const chat={order:['assistant','user','next'],nodes:new Map([['assistant',{kind:'assistant',data:{content:[{text:'不要用助手输出'}]}}],['user',{kind:'user',data:{content:[{text:'  对比季度收入\n与成本  '}]}}],['next',{kind:'user',data:{content:[{text:'继续'}]}}]])}
 expect(objective({chat,hasMore:false})).toBe('对比季度收入 与成本')
 expect(objective({chat,hasMore:true})).toBeUndefined()
 expect(objective({chat:{order:[],nodes:new Map()},hasMore:false})).toBeUndefined()
 expect(patched).toContain('todos.some(item=>item.status==="in_progress")')
 expect(patched).toContain('inert:folded')
 expect(patched).not.toContain('!folded && taskList')
})
it('integrates native CSS with 40px header, 22px rows and both theme states', async () => {
 const win=new Window(),doc=win.document
 const native=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m=>JSON.parse(m[1]!)).join('\n')
 const css=await Promise.all(['figma-final-shell','figma-panels','figma-refinements','figma-reading'].map(n=>readFile(`src/preload/${n}.css`,'utf8')))
 doc.head.innerHTML=`<style>${native}\n${css.join('\n')}</style>`
 doc.body.innerHTML='<section class="lXshSW_root" data-odyssey-task-collapsed="false"><div class="lXshSW_body"><button class="lXshSW_header"><span class="odyssey-task-objective">用户需求</span></button><div class="odyssey-task-reveal"><div><div class="odyssey-task-list-seat"><ul class="lXshSW_list"><li class="lXshSW_item" data-status="in_progress"><span class="lXshSW_content">检查数据</span></li></ul></div></div></div></div></section>'
 const style=(s:string)=>win.getComputedStyle(doc.querySelector(s)!)
 try {
  for(const dark of [false,true]) {
   doc.body.toggleAttribute('data-ds-dark-theme',dark)
   expect(style('.lXshSW_header').height).toBe('40px')
   expect(style('.lXshSW_header').padding).toBe('0px 12px')
   expect(style('.lXshSW_root').borderWidth).toBe('0px')
   expect(style('.lXshSW_list').maxHeight).toBe('168px')
   expect(style('.lXshSW_content').lineHeight).toBe('22px')
   expect(style('.odyssey-task-objective').fontSize).toBe('13px')
   expect(style('.lXshSW_item').backgroundColor).toBe(dark?'rgba(255, 255, 255, .04)':'rgba(0, 0, 0, .04)')
   expect(style('.lXshSW_content').color).toBe(dark?'#dbdbdb':'#333')
  }
  expect(style('.odyssey-task-reveal').transition).toBe('grid-template-rows 180ms ease-in-out')
  doc.body.innerHTML=doc.body.innerHTML.replace('data-odyssey-task-collapsed="false"','data-odyssey-task-collapsed="true"')
  expect(style('.odyssey-task-reveal').gridTemplateRows).toBe('0fr')
  expect(style('.odyssey-task-reveal').transitionDuration).toBe('160ms')
 } finally {await win.happyDOM.close()}
})
it('keeps the live list mounted through collapse and derives its header from todo status', () => {
 const patched=patchFigmaReadingConversation(source)
 const start=patched.indexOf('function TodoPanel('),end=patched.indexOf('function TodoDock(',start)
 const states:any[]=[];let index=0
 const react={useState:(initial:any)=>{const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef:(current:any)=>({current}),useEffect:()=>{}}
 const jsx=(type:any,props:any)=>({type,props})
 const panel=runInNewContext(patched.slice(start,end)+';TodoPanel',{react,react_jsx_runtime:{jsx,jsxs:jsx},useOdysseyCompactTasks:()=>false,TodoPanel_module_css_default:new Proxy({},{get:(_,key)=>String(key)}),OdysseyTaskStatus:'status',OdysseyTaskSheet:'sheet',_deepseek_ai_dsh_client_ui_primitives:{IconChevronDownOutline14:'chevron'}})
 const render=(todos:any[])=>{index=0;return panel({todos,objective:'对比季度收入与成本',t:(key:string)=>key})}
 const todos=[{status:'completed',content:'读取收入'},{status:'in_progress',content:'核对成本'}]
 let card=render(todos),children=card.props.children.props.children,header=children[0]
 expect(header.props.children[0].props.children.props.status).toBe('in_progress')
 expect(header.props['aria-expanded']).toBe(true)
 header.props.onClick()
 card=render(todos);children=card.props.children.props.children
 expect(card.props['data-odyssey-task-collapsed']).toBe(true)
 expect(children[1].props.inert).toBe(true)
 const list=children[1].props.children.props.children.props.children
 expect(list.props.children.map((row:any)=>row.props['data-status'])).toEqual(['completed','in_progress'])
 card=render(todos.map(item=>({...item,status:'completed'})))
 expect(card.props['data-odyssey-task-collapsed']).toBe(true)
 expect(card.props.children.props.children[0].props.children[0].props.children.props.status).toBe('completed')
})

it('shows up to expand and down to collapse only in the task planning header',async()=>{
 const win=new Window(),doc=win.document
 doc.head.innerHTML='<style>'+await readFile('src/preload/figma-reading.css','utf8')+'</style>'
 doc.body.innerHTML='<section class="lXshSW_root" data-odyssey-task-collapsed="true"><button class="lXshSW_header" aria-expanded="false"><span class="lXshSW_chevron"><svg viewBox="0 0 14 14"><path d="m3 5 4 4 4-4"/></svg></span></button></section><button><span class="unrelated-chevron" style="transform:rotate(0deg)">other</span></button>'
 try{
  const card=doc.querySelector('.lXshSW_root')!,arrow=doc.querySelector('.lXshSW_chevron')!
  expect(win.getComputedStyle(arrow).transform).toBe('rotate(180deg)')
  card.setAttribute('data-odyssey-task-collapsed','false');doc.querySelector('.lXshSW_header')!.setAttribute('aria-expanded','true')
  expect(win.getComputedStyle(arrow).transform).toBe('rotate(0deg)')
  expect(win.getComputedStyle(doc.querySelector('.unrelated-chevron')!).transform).toBe('rotate(0deg)')
 }finally{await win.happyDOM.close()}
})
