import { englishUiCopy } from './ui-copy'
import { integrationUiCopy } from './integration-ui-copy'
import { translateSpreadsheetCopy } from './spreadsheet/ui-copy'

// Preload UI and portaled plugin controls share the application's selected locale,
// rather than navigator.language. Never replace elements or translate user content.
const spreadsheetSurface = '.ew-sheet,.ew-sheet-welcome,[data-ework-spreadsheet-actions]'
const surfaces = spreadsheetSurface + ',.odyssey-data-settings,.ig-root,.ig-overlay,.st-root,.st-detail,.st-dialog,.st-menu,.srb-bubble,.srb-notification,.dsh-paperclip-tip,.rScV5Q_previewPlaceholder,.odyssey-subagent-panel-error,button,[role="tab"],[role="menu"],[role="tooltip"],.sherlock-account-page,.sherlock-account-menu,.sherlock-auth-signature,.srb-dialog,.srb-popover,.srb-notifications,.srb-section,[data-research-empty-state],.sRp_emptyState,.rScV5Q_containerDraft,.rScV5Q_generationFailure,.rScV5Q_voiceFeedback,[data-research-global-toolbar],[data-research-create-popover],[data-research-generation-description],.ew-financial-widget,.ew-financial-connections,.ew-grid-menu,.ew-financial-suggestions,[data-ui-system-title]'
const financialContent = '.ew-watch-name,.ew-news-title,.ew-news-summary,.ew-news-source,.ew-financial-suggestions [role="option"]'
const preserved = '.ig-market-card h2,.ig-market-card>p,.ig-detail-identity h2,.ig-capability strong,.ig-capability span,.ig-preview,.ig-skill-preview>h2,.ig-skill-preview>p,.ig-skill-preview li,.ig-api-tool strong,.ig-api-tool p,.rScV5Q_voiceAccessible,script,style,textarea,input,[contenteditable],[data-ui-preserve],.odyssey-nav-title,.wSkVaW_crumb,.rScV5Q_nodeTitleText,.srb-member-identity strong,.srb-member-avatar,.srb-board-name,.sherlock-account-profile strong,.sherlock-account-menu-identity strong,.sherlock-account-label,[data-research-artifact-content]:not(:has(.rScV5Q_containerDraft,.rScV5Q_generationFailure,.rScV5Q_previewPlaceholder,.ew-financial-widget)),'+financialContent
export function translateUiCopy(value: string, context?: Element): string {
 const key=value.trim(), translated=(context?.closest(spreadsheetSurface)?translateSpreadsheetCopy(key):undefined)??(context?.closest('.ig-root,.ig-overlay')?integrationUiCopy[key]:undefined)??englishUiCopy[key]
 if(translated)return value.replace(key,translated)
 if(key.endsWith(' · 备用'))return value.replace(key,translateUiCopy(key.slice(0,-' · 备用'.length),context)+' · Backup')
 if(key.includes(' / ')&&/(?:腾讯财经|新浪财经|东方财富)/.test(key))return value.replace(key,key.split(' / ').map(part=>translateUiCopy(part,context)).join(' / '))
 if(key.includes('\n'))return value.replace(key,key.split('\n').map(part=>translateUiCopy(part,context)).join('\n'))
 if(key.includes(' · ')&&/(?:行情|资讯|公告|来源：|时刻|每60秒刷新)/.test(key))return value.replace(key,key.split(' · ').map(part=>translateUiCopy(part,context)).join(' · '))
 if(/^(?:成交量 |VOL(?:\([^)]*\))?\s|MA(?:5|10)\s)/.test(key)){
  const result=key.replace(/^成交量 /,'Volume ').replace(/([\d,.]+)\s*(亿|万)?(手|股|张|枚|原始单位)/g,(_m,n:string,scale:string,unit:string)=>{
   const amount=Number(n.replaceAll(',',''))*(scale==='亿'?1e8:scale==='万'?1e4:1),factor=amount>=1e9?1e9:amount>=1e6?1e6:amount>=1e3?1e3:1
   return (amount/factor).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+({1e9:'B',1e6:'M',1e3:'K',1:''} as Record<number,string>)[factor]+' '+({手:'lots',股:'shares',张:'contracts',枚:'coins',原始单位:'units'} as Record<string,string>)[unit]
  })
  if(result!==key)return value.replace(key,result)
 }
 if(key.endsWith(' · 专属对话')) return value.replace(key,key.slice(0,-' · 专属对话'.length)+' · Dedicated conversation')
 if(key.includes(' · ') && /^(下次运行|每天|工作日|每周[日一二三四五六]|\d{4}-\d{2}-\d{2}|北京时间|香港时间|东京时间|纽约时间|伦敦时间|UTC|[A-Za-z_]+\/)/.test(key))
  return value.replace(key,key.split(' · ').map(part=>translateUiCopy(part,context)).join(' · '))
 if(context?.closest('.ig-root,.ig-overlay')){
  const displayName=(name:string)=>context.closest('[data-row-id^="builtin:"],[data-integration-entity^="builtin:"]')?translateUiCopy(name,context):name
  const integrationPatterns: Array<[RegExp,(...args:string[])=>string]> = [
  [/^EWork 内置 · (.+)$/,(_m,detail)=>`Built into EWork · ${translateUiCopy(detail,context)}`],
  [/^已选择 (\d+) 个工作区$/,(_m,n)=>`${n} ${n==='1'?'workspace':'workspaces'} selected`],
  [/^上次检查：(.+)$/,(_m,time)=>`Last checked: ${time}`],
  [/^(\d+) 项 · (\d+) 项已启用$/,(_m,n,enabled)=>`${n} ${n==='1'?'item':'items'} · ${enabled} enabled`],
  [/^(\d+) 个工具$/,(_m,n)=>`${n} ${n==='1'?'tool':'tools'}`],
  [/^包含 (\d+) 个文件$/,(_m,n)=>`Includes ${n} ${n==='1'?'file':'files'}`],
  [/^版本 (.+)$/,(_m,v)=>`Version ${v}`],
  [/^(.*) · 版本 (.+?)( · 已安装)?$/,(_m,name,v,installed)=>`${name} · Version ${v}${installed?' · Installed':''}`],
  [/^(.+)的更多操作$/,(_m,name)=>`${displayName(name)}: more actions`],
  [/^(启用|停用)(.+)$/,(_m,action,name)=>`${action==='启用'?'Enable':'Disable'} ${displayName(name)}`],
  [/^移除工具 (.+)$/,(_m,name)=>`Remove tool ${name}`],
  [/^查看(.+)$/,(_m,name)=>`View ${name.trim()}`],
  [/^(断开|删除|卸载)“(.+)”？$/,(_m,action,name)=>`${({断开:'Disconnect',删除:'Delete',卸载:'Uninstall'} as Record<string,string>)[action]} “${name}”?`],
  [/^回退“(.+)”的上一版本？$/,(_m,name)=>`Restore the previous version of “${name}”?`],

  ]
  for(const [pattern,render] of integrationPatterns)if(pattern.test(key))return value.replace(key,key.replace(pattern,render))
 }
 const patterns: Array<[RegExp,(...args:string[])=>string]> = [
  [/^用户 ID[：:]\s*(\d{10})$/,(_m,id)=>`User ID: ${id}`],
  [/^我的自选 · (\d+)$/,(_m,n)=>`My watchlist · ${n}`],
  [/^已选 (\d+)$/,(_m,n)=>`Selected ${n}`],
  [/^(\d+) 项$/,(_m,n)=>`${n} ${n==='1'?'item':'items'}`],
  [/^(\d+) 个标的未取得行情$/,(_m,n)=>`Quotes unavailable for ${n} ${n==='1'?'symbol':'symbols'}`],
  [/^获取 (\d{1,2}:\d{2})$/,(_m,t)=>`Fetched ${t}`],
  [/^最近获取：(.*)$/,(_m,t)=>`Last fetched: ${t}`],
  [/^上次刷新：(.*)$/,(_m,t)=>`Last refreshed: ${translateUiCopy(t)}`],
  [/^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(.*)$/,(_m,y,month,d,t)=>`${y}-${month.padStart(2,'0')}-${d.padStart(2,'0')}${t?' '+t:''}`],
  [/^(行情|资讯|公告) (.*)$/,(_m,label,t)=>`${({行情:'Quotes',资讯:'News',公告:'Announcements'} as Record<string,string>)[label]} ${translateUiCopy(t)}`],
  [/^(图表来源|走势来源)：(.*)$/,(_m,label,t)=>`${label==='图表来源'?'Chart source':'Trend source'}: ${translateUiCopy(t)}`],
  [/^开 ([\d,.—-]+)\s+高 ([\d,.—-]+)\s+低 ([\d,.—-]+)\s+收 ([\d,.—-]+)$/,(_m,o,h,l,c)=>`O ${o}  H ${h}  L ${l}  C ${c}`],
  [/^时间 (\S+)\s+现价 (\S+)$/,(_m,t,p)=>`Time ${t}  Last ${p}`],
  [/^(.+)；右键移除，拖动排序$/,(_m,name)=>`${name}; right-click to remove, drag to reorder`],
  [/^(上移|下移)(.+)$/,(_m,d,name)=>`Move ${englishUiCopy[name]??name} ${d==='上移'?'up':'down'}`],
  [/^已整理 (\d+) 个组件$/,(_m,n)=>`Arranged ${n} ${n==='1'?'component':'components'}`],
  [/^(\d+) (秒|分钟|小时|天)前$/,(_m,n,u)=>`${n} ${{秒:'second',分钟:'minute',小时:'hour',天:'day'}[u]}${n==='1'?'':'s'} ago`],
  [/^展开其余 (\d+) 个看板$/,(_m,n)=>`Show ${n} more ${n==='1'?'board':'boards'}`],
  [/^每 (\d+) (分钟|小时)(刷新)?$/,(_m,n,u,refresh)=>`${refresh?'Refresh every':'Every'} ${n} ${u==='分钟'?'minute':'hour'}${n==='1'?'':'s'}`],
  [/^(每天|工作日) (\d{1,2}:\d{2})$/,(_m,f,t)=>`${f==='每天'?'Daily':'Weekdays'} ${t}`],
  [/^每周([日一二三四五六]) (\d{1,2}:\d{2})$/,(_m,d,t)=>`Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']['日一二三四五六'.indexOf(d)]} ${t}`],
  [/^星期([日一二三四五六])$/,(_m,d)=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']['日一二三四五六'.indexOf(d)]!],
  [/^下次运行 (\d+) (分钟|小时|天)后$/,(_m,n,u)=>`Next run in ${n} ${{分钟:'minute',小时:'hour',天:'day'}[u]}${n==='1'?'':'s'}`],
  [/^下次运行[： ](.+)$/,(_m,t)=>`Next run ${t}`],
  [/^运行记录（(\d+)）$/,(_m,n)=>`Run history (${n})`],
  [/^「(.+)」将不再按计划执行。$/,(_m,t)=>`“${t}” will no longer run on schedule.`],
  [/^(暂停|继续)任务 (.+)$/,(_m,a,t)=>`${a==='暂停'?'Pause':'Resume'} task ${t}`],
  [/^查看 (.+)$/,(_m,t)=>`View ${t}`],
  [/^(.+) 更多操作$/,(_m,t)=>`${t} more actions`],
  [/^(选择|组件|链接|连线|连接|语音|框选) ?([（(].+[）)])$/,(_m,a,k)=>`${({选择:'Select',组件:'Component',链接:'Link',连线:'Connect',连接:'Connect',语音:'Voice',框选:'Frame'} as Record<string,string>)[a]} ${k}`],
  [/^(\d+) 个会话$/,(_m,n)=>`${n} ${n==='1'?'session':'sessions'}`],
  [/^你已(接受|拒绝|处理)邀请$/,(_m,v)=>`You ${v==='接受'?'accepted':v==='拒绝'?'declined':'responded to'} the invitation`],
  [/^(.+)(接受|拒绝|处理)了你的邀请$/,(_m,name,v)=>`${name} ${v==='接受'?'accepted':v==='拒绝'?'declined':'responded to'} your invitation`],
  [/^(.+) 邀请你加入 · (.+)$/,(_m,name,role)=>`${name} invited you · ${englishUiCopy[role]??role}`],
  [/^版本更新 · (.+)$/,(_m,v)=>`Update · ${v}`],
  [/^未读 (\d+)$/,(_m,n)=>`Unread ${n}`],
  [/^还有 (\d+) 条协作邀请$/,(_m,n)=>`${n} more collaboration invitations`],
  [/^(?:查看 )?(\d+) 位协作成员$/,(_m,n)=>`${n} collaborators`],
  [/^另外 (\d+) 位协作成员$/,(_m,n)=>`${n} more collaborators`],
  [/^成员 · (\d+)$/,(_m,n)=>`Members · ${n}`],
  [/^待处理邀请 · (\d+)$/,(_m,n)=>`Pending invitations · ${n}`],
  [/^等待接受 · ID (.+)$/,(_m,id)=>`Pending · ID ${id}`],
  [/^之前的执行记录（(\d+)）$/,(_m,n)=>`Previous runs (${n})`],
  [/^正在下载更新[ ·]*(\d+)%$/,(_m,n)=>`Downloading update · ${n}%`],
  [/^发现新版本[ ]*(.+?)(?:，可下载更新)?$/,(_m,v)=>`Update available: ${v}`],
  [/^已更新至[ ]*(.+?)(?:，当前已是最新版本。)?$/,(_m,v)=>`Updated to ${v}`],
  [/^(\d+) 个组件$/,(_m,n)=>`${n} ${n==='1'?'component':'components'}`],
  [/^(\d+) 条已保存对话$/,(_m,n)=>`${n} saved ${n==='1'?'conversation':'conversations'}`],
  [/^([\d.]+\s*[KMG]?B) 资料$/,(_m,n)=>`${n} of files`],
  [/^协作成员 · (\d+)$/,(_m,n)=>`Collaborators · ${n}`],
  [/^(\d+) 位正在画板中$/,(_m,n)=>`${n} on this board`],
  [/^Use current canvas · (\d+) components$/,(_m,n)=>`Use current canvas · ${n} ${n==='1'?'component':'components'}`],
  [/^(?:参考当前画板资料|参考当前画板|使用当前画板)\s*·\s*(\d+)\s*个?\s*组件$/,(_m,n)=>`Use current canvas · ${n} ${n==='1'?'component':'components'}`],
  [/^(\d+)分钟$/,(_m,n)=>`${n}m`],[/^(\d+)小时$/,(_m,n)=>`${n}h`],[/^(\d+)天$/,(_m,n)=>`${n}d`],
  [/^(.+)，更多$/,(_m,name)=>`${name}, more`],[/^(.+)，打开账户菜单$/,(_m,name)=>`${englishUiCopy[name]??name}, open account menu`],
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
 let pending=false,disposed=false,frame=0,translated=false
 const update=()=>{
  pending=false;if(disposed)return
  const english=doc.documentElement.dataset.odysseyLocale==='en'
  if(!english&&!translated){roots.clear();return}
  translated=english
  const changed=[...roots].filter(root=>{
   if(!root.isConnected)return false
   for(let parent=root.parentElement;parent;parent=parent.parentElement)if(roots.has(parent))return false
   return true
  });roots.clear()
  for(const root of changed){
  const walker=doc.createTreeWalker(root,win.NodeFilter.SHOW_TEXT)
  while(walker.nextNode()){
   const text=walker.currentNode as Text,el=text.parentElement
   if(!el||!el.closest(surfaces)||el.closest(preserved))continue
   const previous=textState.get(text)
   const source=previous&&text.data===previous.rendered?previous.source:text.data
   const rendered=english?translateUiCopy(source,el):source
   if(text.data!==rendered)text.data=rendered
   if(source!==rendered||previous)textState.set(text,{source,rendered})
  }
  for(const el of [root,...root.querySelectorAll('[placeholder],[aria-label],[title],[data-tool-tooltip],[data-ui-system-value]')]){
   if(el.closest('[data-ui-preserve],iframe,[contenteditable],.odyssey-nav-title,.wSkVaW_crumb,.rScV5Q_nodeTitleText') && el.getAttribute('title')!=='双击修改会话标题')continue
   let saved=attrState.get(el);if(!saved){saved=new Map();attrState.set(el,saved)}
   for(const name of ['placeholder','aria-label','title','data-tool-tooltip',...(el.hasAttribute('data-ui-system-value')?['value']:[])]){
    const current=el.getAttribute(name);if(current===null)continue
    if(name==='title'&&el.closest(financialContent))continue
    const old=saved.get(name),source=old&&current===old.rendered?old.source:current
    const rendered=english?translateUiCopy(source,el):source
    if(current!==rendered)el.setAttribute(name,rendered)
    saved.set(name,{source,rendered})
   }
  }
  }
 }
 const schedule=()=>{if(!pending&&!disposed){pending=true;frame=win.requestAnimationFrame(update)}}
 const observer=new win.MutationObserver(records=>{
  for(const record of records){
   const target=record.target.nodeType===1?record.target as Element:record.target.parentElement
   if(record.attributeName==='data-odyssey-locale'){roots.clear();roots.add(doc.body);break}
   if(!target||target.closest('script,style,textarea,[contenteditable]'))continue
   // Only new subtrees need translation. A portal appended to body must not
   // rescan every existing message and canvas artifact.
   if(record.type==='childList'){
    for(const node of record.addedNodes){
     const added=node.nodeType===1?node as Element:node.parentElement
     if(added)roots.add(added)
    }
   }else if(record.type==='characterData'){
    const text=record.target as Text
    if(textState.get(text)?.rendered!==text.data)roots.add(target)
   }else{
    const name=record.attributeName!
    if(attrState.get(target)?.get(name)?.rendered!==target.getAttribute(name))roots.add(target)
   }
  }
  if(roots.size)schedule()
 })
 observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-odyssey-locale','placeholder','aria-label','title','data-tool-tooltip','data-ui-system-title','data-ui-preserve']})
 update()
 return()=>{disposed=true;win.cancelAnimationFrame(frame);observer.disconnect()}
}
