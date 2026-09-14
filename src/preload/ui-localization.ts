import { englishUiCopy } from './ui-copy'

// Preload UI and portaled plugin controls share the application's selected locale,
// rather than navigator.language. Never replace elements or translate user content.
const surfaces = 'button,[role="tab"],[role="menu"],[role="tooltip"],.sherlock-account-page,.sherlock-account-menu,.sherlock-auth-signature,.srb-dialog,.srb-popover,.srb-notifications,.srb-section,[data-research-empty-state],.sRp_emptyState,.rScV5Q_containerDraft,.rScV5Q_generationFailure,.rScV5Q_voiceFeedback,[data-research-global-toolbar],[data-research-create-popover],[data-research-generation-description]'
const preserved = '.rScV5Q_voiceAccessible,script,style,textarea,input,[contenteditable],[data-ui-preserve],.odyssey-nav-title,.wSkVaW_crumb,.rScV5Q_nodeTitleText,.srb-member-identity strong,.srb-member-avatar,.srb-board-name,.sherlock-account-profile strong,.sherlock-account-menu-identity strong,.sherlock-account-label,[data-research-artifact-content]:not(:has(.rScV5Q_containerDraft,.rScV5Q_generationFailure))'
export function translateUiCopy(value: string): string {
 const key=value.trim(), translated=englishUiCopy[key]
 if(translated)return value.replace(key,translated)
 const patterns: Array<[RegExp,(...args:string[])=>string]> = [
  [/^(\d+) 个组件$/,(_m,n)=>`${n} ${n==='1'?'component':'components'}`],
  [/^(\d+) 条已保存对话$/,(_m,n)=>`${n} saved ${n==='1'?'conversation':'conversations'}`],
  [/^([\d.]+\s*[KMG]?B) 资料$/,(_m,n)=>`${n} of files`],
  [/^协作成员 · (\d+)$/,(_m,n)=>`Collaborators · ${n}`],
  [/^(\d+) 位正在画板中$/,(_m,n)=>`${n} on this board`],
  [/^Use current canvas · (\d+) components$/,(_m,n)=>`Use current canvas · ${n} ${n==='1'?'component':'components'}`],
  [/^(?:参考当前画板资料|参考当前画板|使用当前画板)\s*·\s*(\d+)\s*个?\s*组件$/,(_m,n)=>`Use current canvas · ${n} ${n==='1'?'component':'components'}`],
  [/^(\d+)分钟$/,(_m,n)=>`${n}m`],[/^(\d+)小时$/,(_m,n)=>`${n}h`],[/^(\d+)天$/,(_m,n)=>`${n}d`],
  [/^(.+)，更多$/,(_m,name)=>`${name}, more`],[/^(.+)，打开账户菜单$/,(_m,name)=>`${name}, open account menu`],
  [/^(.+)，查看账户信息$/,(_m,name)=>`${name}, view account`]
 ]
 for(const [pattern,render] of patterns)if(pattern.test(key))return value.replace(key,key.replace(pattern,render))
 return value
}
export function mountUiLocalization(doc:Document=document):()=>void {
 const win=doc.defaultView;if(!win)return()=>{}
 const textState=new WeakMap<Text,{source:string;rendered:string}>()
 const attrState=new WeakMap<Element,Map<string,{source:string;rendered:string}>>()
 const roots=new Set<Element>([doc.body])
 let pending=false,disposed=false
 const update=()=>{
  pending=false;if(disposed)return
  const english=doc.documentElement.dataset.odysseyLocale==='en'
  const changed=[...roots].filter(root=>root.isConnected);roots.clear()
  for(const root of changed){
  const walker=doc.createTreeWalker(root,win.NodeFilter.SHOW_TEXT)
  while(walker.nextNode()){
   const text=walker.currentNode as Text,el=text.parentElement
   if(!el||!el.closest(surfaces)||el.closest(preserved))continue
   const previous=textState.get(text)
   const source=previous&&text.data===previous.rendered?previous.source:text.data
   const rendered=english?translateUiCopy(source):source
   if(text.data!==rendered)text.data=rendered
   if(source!==rendered||previous)textState.set(text,{source,rendered})
  }
  for(const el of [root,...root.querySelectorAll('[placeholder],[aria-label],[title]')]){
   if(el.closest('[data-ui-preserve],iframe,[contenteditable],.odyssey-nav-title,.wSkVaW_crumb,.rScV5Q_nodeTitleText'))continue
   let saved=attrState.get(el);if(!saved){saved=new Map();attrState.set(el,saved)}
   for(const name of ['placeholder','aria-label','title']){
    const current=el.getAttribute(name);if(current===null)continue
    const old=saved.get(name),source=old&&current===old.rendered?old.source:current
    const rendered=english?translateUiCopy(source):source
    if(current!==rendered)el.setAttribute(name,rendered)
    saved.set(name,{source,rendered})
   }
  }
  }
 }
 const schedule=()=>{if(!pending&&!disposed){pending=true;win.queueMicrotask(update)}}
 const observer=new win.MutationObserver(records=>{
  for(const record of records){
   const target=record.target.nodeType===1?record.target as Element:record.target.parentElement
   if(record.attributeName==='data-odyssey-locale'){roots.clear();roots.add(doc.body);break}
   if(target&&!target.closest('script,style,textarea,[contenteditable]'))roots.add(target)
  }
  if(roots.size)schedule()
 })
 observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-odyssey-locale','placeholder','aria-label','title']})
 update()
 return()=>{disposed=true;observer.disconnect()}
}
