// Serialized into the trusted React bundle and shared by saved bindings and
// native library widgets. Provider requests remain in their owning host path.
export function ComponentDataSettingsPanel({title,binding,error='',busy=false,loading=false,onChange,onRefresh,onClose,trigger,theme,readOnly=false,surface='research'}){
 const {jsx,jsxs}=react_jsx_runtime,close=react.useRef(null),[dark,setDark]=react.useState(()=>document.body.hasAttribute('data-ds-dark-theme'))
 react.useEffect(()=>{
  const previous=trigger||document.activeElement,observer=new MutationObserver(()=>setDark(document.body.hasAttribute('data-ds-dark-theme')))
  observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});close.current?.focus({preventScroll:true})
  return()=>{observer.disconnect();if(previous?.isConnected)previous.focus?.({preventScroll:true})}
 },[])
 const format=t=>t&&Number.isFinite(new Date(t).getTime())?new Date(t).toLocaleString('zh-CN',{hour12:false}):'尚未刷新'
 const label={idle:'已就绪',paused:'已暂停',refreshing:'正在取数',success:'已更新',unchanged:'数据无变化',error:'更新失败，保留上次数据'}
 const key=e=>{
  e.stopPropagation()
  if(e.key==='Escape'){e.preventDefault();onClose();return}
  if(e.key==='Tab'){
   const items=[...e.currentTarget.querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]')],first=items[0],last=items.at(-1)
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 }
 const variants=binding?.sources||[],minutes=binding?.intervalMinutes??0,options=[...new Set([0,1,5,15,30,60,240,1440,minutes])].sort((a,b)=>a-b)
 const canConfigure=!readOnly&&typeof onChange==='function',canRefresh=!readOnly&&typeof onRefresh==='function',showConfigure=surface==='research'||canConfigure,showRefresh=surface==='research'||canRefresh,place=surface==='notes'?'笔记':surface==='conversation'?'对话':'看板'
 const configure=value=>canConfigure?onChange(value):false,refresh=()=>canRefresh?onRefresh():false
 return react_dom.createPortal(jsx('div',{className:'odyssey-data-backdrop',onPointerDown:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose()},children:jsxs('section',{className:'odyssey-data-settings','data-component-data-surface':surface,'data-financial-theme':theme==='openterminal'?'dark':theme|| (dark?'dark':'light'),role:'dialog','aria-modal':true,'aria-label':'组件数据与自动更新',onKeyDown:key,children:[
  jsxs('header',{children:[jsxs('div',{children:[jsx('h3',{children:'数据与自动更新'}),jsx('p',{'data-ui-preserve':true,children:title})]}),jsx('button',{ref:close,type:'button',className:'odyssey-data-close','aria-label':'关闭数据设置',onClick:onClose,children:'×'})]}),
  binding?jsxs('div',{children:[jsx('p',{className:'odyssey-data-status',role:'status',children:binding.viewPaused&&minutes>0?'离开'+place+'，已暂停自动更新':binding.status==='paused'&&minutes===0?'仅手动刷新':label[binding.status]||'已就绪'}),
   variants.length>1&&showConfigure?jsx('select',{className:'odyssey-data-source-select','aria-label':'数据源',value:binding.sourceId||'default',disabled:busy||!canConfigure,onChange:e=>void configure({sourceId:e.target.value}),children:variants.map(s=>jsx('option',{value:s.id,children:s.name},s.id))}):jsx('div',{className:'odyssey-data-sources',children:[...new Set([...(binding.requests||[]).map(r=>r.sourceName||r.toolId),variants.find(s=>s.id===(binding.sourceId||'default'))?.name].filter(Boolean))].map(name=>jsx('p',{children:name},name))}),
   showConfigure&&jsxs('label',{children:['更新频率',jsx('select',{'aria-label':'更新频率',value:minutes,disabled:busy||!canConfigure,onChange:e=>void configure({intervalMinutes:Number(e.target.value),enabled:Number(e.target.value)>0}),children:options.map(n=>jsx('option',{value:n,children:n===0?'仅手动':n>=60&&n%60===0?'每 '+n/60+' 小时':'每 '+n+' 分钟'},n))})]}),
   jsxs('dl',{children:[jsx('dt',{children:'数据时点'}),jsx('dd',{children:binding.dataAsOf||'见组件内来源说明'}),jsx('dt',{children:'上次成功'}),jsx('dd',{children:format(binding.lastSuccess)}),jsx('dt',{children:'下次更新'}),jsx('dd',{children:binding.enabled&&minutes>0?binding.nextRun?format(binding.nextRun):'等待下一次更新':'未启用'})]}),
   jsx('p',{className:'odyssey-data-help',children:'查看该'+place+'时按设置取数，离开后自动暂停。更新保留组件样式、布局和交互状态；取数失败时继续显示上次数据。'}),
   (showConfigure||showRefresh)&&jsxs('footer',{children:[showConfigure&&jsx('button',{type:'button',disabled:busy||!canConfigure||!minutes,onClick:()=>void configure({enabled:!binding.enabled}),children:binding.enabled?'暂停更新':'恢复更新'}),showRefresh&&jsx('button',{type:'button',disabled:busy||!canRefresh||binding.status==='refreshing',onClick:()=>void refresh(),children:busy||binding.status==='refreshing'?'取数中…':'立即更新'})]})
  ]}):jsx('p',{role:'status',children:loading?'正在读取数据设置…':error?'数据设置暂未载入。':'尚未绑定数据源。请在对话中说明需要持续更新的数据，助手会保存成功取数的接口和更新规则。'}),
  (error||binding?.error)&&jsx('p',{className:'odyssey-data-error',role:'alert',children:error||binding.error})
 ]})}),document.body)
}

export const componentDataSettingsCss=`
.odyssey-data-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#0005;padding:16px;box-sizing:border-box}
.odyssey-data-settings{--data-select-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23667085' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");box-sizing:border-box;width:min(480px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border-radius:16px;background:#fff;color:#252a33;box-shadow:0 16px 64px #0004;border:1px solid #8884;font:14px/1.6 system-ui;color-scheme:light}
.odyssey-data-settings[data-financial-theme=dark]{--data-select-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23c2c2c2' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background:#242424;color:#eee;color-scheme:dark}
.odyssey-data-settings header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.odyssey-data-settings header>div{min-width:0;flex:1}
.odyssey-data-settings button.odyssey-data-close{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;min-height:32px;padding:0;line-height:1;font-size:20px;border:0;background:transparent;border-radius:6px;align-self:flex-start}
.odyssey-data-settings :is(button,select):focus-visible{outline:2px solid #35a4ff;outline-offset:2px}.odyssey-data-settings h3{font-size:18px;margin:0}.odyssey-data-settings p{margin:8px 0;overflow-wrap:anywhere}
.odyssey-data-settings label{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:20px 0}.odyssey-data-settings button,.odyssey-data-settings select{box-sizing:border-box;background:#8882;color:inherit;border:1px solid #8884;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}
.odyssey-data-settings select{appearance:none;min-width:136px;max-width:100%;padding-right:40px;background-image:var(--data-select-chevron);background-repeat:no-repeat;background-position:right 14px center;background-size:12px 12px}.odyssey-data-settings select.odyssey-data-source-select{display:block;width:100%;padding:16px 40px 16px 14px;background-color:#8881}
.odyssey-data-settings button:disabled{opacity:.45;cursor:default}.odyssey-data-settings button:hover:not(:disabled){background:#8883}
.odyssey-data-settings dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 20px}.odyssey-data-settings dd{margin:0;text-align:right;overflow-wrap:anywhere}.odyssey-data-help,.odyssey-data-settings dt{color:#777}.odyssey-data-settings[data-financial-theme=dark] :is(.odyssey-data-help,dt){color:#999}
.odyssey-data-settings footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.odyssey-data-error{color:#d76a52}.odyssey-data-status{font-weight:600}.odyssey-data-sources{padding:10px 14px;border-radius:8px;background:#8881}
@media(max-width:400px){.odyssey-data-settings{padding:20px}.odyssey-data-settings dl{gap:8px 12px}}
`
