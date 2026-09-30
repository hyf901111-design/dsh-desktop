import vm from 'node:vm'
import {Window} from 'happy-dom'
import {describe,it,expect,vi} from 'vitest'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'

function run(html,configure) {
 const window=new Window({settings:{disableJavaScriptEvaluation:true}})
 window.document.write(html)
 const frame=window.document.getElementById('preview');let innerHtml=''
 if(frame){Object.defineProperty(frame,'srcdoc',{get:()=>innerHtml,set:v=>{innerHtml=v}});Object.defineProperty(frame,'contentWindow',{value:{postMessage:vi.fn()}})}
 const messages=[],parent={postMessage:data=>messages.push(data)}
 configure?.(window)
 const context=vm.createContext({window,document:window.document,parent,Blob:window.Blob,crypto:window.crypto,setInterval:vi.fn(),clearInterval:vi.fn(),setTimeout:vi.fn(),clearTimeout:vi.fn(),trustedTypes:{isHTML:()=>true},matchMedia:()=>({matches:false,addEventListener:vi.fn()}),MutationObserver:window.MutationObserver,MouseEvent:window.MouseEvent,Event:window.Event,CustomEvent:window.CustomEvent,location:window.location,navigator:window.navigator,getComputedStyle:window.getComputedStyle.bind(window),addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)})
 for(const script of window.document.querySelectorAll('script'))vm.runInContext(script.textContent,context)
 window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
 return {window,messages,innerHtml}
}

describe('financial series intrinsic reading size',()=>{
 it('counts the closed data summary and flex gaps without measuring its hidden rows or old viewport',()=>{
  const html='<body data-sherlock-market="price-performance" style="padding:8px"><section class="financial-profile" style="display:flex;flex-direction:column;gap:4px;row-gap:4px"><p>来源期间</p><canvas></canvas><details style="margin-top:6px"><summary>完整数据</summary><table><tr><td>隐藏的第366行</td></tr></table></details></section><footer class="market-footer" style="margin-top:5px"><span>来源与时点</span></footer></body>'
  const outer=run(buildResearchHtmlPreview(html,'价格表现','dark',{workbench:true})),measured=[]
  try{
   for(const viewport of [160,720]){
    const inner=run(outer.innerHtml,win=>{
     Object.defineProperty(win.document.documentElement,'clientWidth',{value:480});Object.defineProperty(win.document.documentElement,'clientHeight',{value:viewport})
     const box=(top,height)=>({left:8,right:472,top,bottom:top+height,width:464,height})
     for(const [selector,top,height] of [['p',8,16],['canvas',28,240],['details',278,33],['summary',278,33],['table',311,12000],['td',12000,100],['footer span',316,17]])win.document.querySelector(selector).getBoundingClientRect=()=>box(top,height)
    })
    try{measured.push(inner.messages.find(m=>m.type==='sherlock-workbench-content-size'))}finally{inner.window.happyDOM.abort()}
   }
   expect(measured[0]).toEqual(measured[1]);expect(measured[0]).toEqual({type:'sherlock-workbench-content-size',width:480,height:341})
  }finally{outer.window.happyDOM.abort()}
 })
})
