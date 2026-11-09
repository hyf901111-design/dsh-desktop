const {ipcRenderer}=require('electron')
window.addEventListener('DOMContentLoaded',()=>{
 document.documentElement.lang='zh-CN'
 const style=document.createElement('style')
 style.textContent=`*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{padding:1px;font:13px/20px 'Noto Sans SC',sans-serif;color:#292b2e}body.dark{color:#dedede}section{height:100%;display:flex;align-items:center;gap:12px;padding:10px 16px;border:1px solid #dfe0e3;border-radius:12px;background:#fff}body.dark section{background:#292929;border-color:#484848}input,button{font:inherit;color:inherit;border:0;background:none;outline:none}input{flex:1;min-width:30px;width:100px;padding:0}small{white-space:nowrap;color:#8a8a8a;font-size:11px}button{width:28px;height:28px;flex:none;padding:5px;border-radius:6px;cursor:pointer}button:hover{background:#8882}button:focus-visible,input:focus-visible{outline:2px solid #498df4;outline-offset:1px}i{display:block;width:18px;height:18px;background:currentColor;mask-repeat:no-repeat;mask-size:contain;mask-position:center}`
 document.head.append(style)
 document.body.innerHTML='<section role="search" aria-label="页内查找"><input maxlength="500" aria-label="查找内容" placeholder="在页面中查找"><small aria-live="polite">0 / 0</small><button data-action="prev" aria-label="上一个匹配"><i data-icon="up"></i></button><button data-action="next" aria-label="下一个匹配"><i data-icon="chevron"></i></button><button data-action="close" aria-label="关闭"><i data-icon="close"></i></button></section>'
 const input=document.querySelector('input'),send=value=>ipcRenderer.send('browser-app:find-action',value)
 let composing=false
 const search=()=>{if(!composing)send({kind:'input',text:input.value})}
 input.addEventListener('compositionstart',()=>{composing=true});input.addEventListener('compositionend',()=>{composing=false;search()});input.addEventListener('input',search)
 document.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.action;if(action)send(action==='close'?{kind:'close'}:{kind:'next',text:input.value,forward:action==='next'})})
 document.addEventListener('keydown',event=>{if(event.isComposing||composing)return;if(event.key==='Escape'){event.preventDefault();send({kind:'close'})}else if(event.key==='Enter'){event.preventDefault();send({kind:'next',text:input.value,forward:!event.shiftKey})}else if(event.metaKey||event.ctrlKey){const key=event.key.toLowerCase();if(key==='f'){event.preventDefault();input.select()}else if(['l','t','w','r','d','p','s','y','n'].includes(key)){event.preventDefault();send({kind:'shortcut',key:event.key,metaKey:event.metaKey,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey})}}})
 ipcRenderer.on('browser-app:find-state',(_event,state)=>{document.body.classList.toggle('dark',state.dark);if(state.reset||document.activeElement!==input)input.value=state.text||'';document.querySelector('small').textContent=`${state.find?.activeMatchOrdinal||0} / ${state.find?.matches||0}`;for(const el of document.querySelectorAll('[data-icon]')){const url=state.icons?.[el.dataset.icon];if(typeof url==='string'&&url.startsWith('data:image/svg+xml'))el.style.maskImage=`url("${url.replaceAll('"','%22')}")`}})
 ipcRenderer.on('browser-app:find-focus',()=>{input.focus();input.select()})
 send({kind:'ready'})
})
