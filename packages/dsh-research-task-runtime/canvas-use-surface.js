// Serialized into generated sandboxes and isolated webpage worlds. No model code
// is evaluated: callers can only use this finite observation/interaction API.
export function createCanvasUseSurface(root = document.body, shared = () => null, dispatch = (el, event) => el.dispatchEvent(event), options = {}) {
  const refs = new Map(), ids = new WeakMap(); let sequence = 0, previous = ''
  const id = el => { if (!ids.has(el)) ids.set(el, 'e' + ++sequence); const key = ids.get(el); refs.set(key, el); return key }
  const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(36) }
  const box = el => el===document.body ? {x:0,y:0,width:innerWidth,height:innerHeight} : el.getBoundingClientRect()
  const rect = el => { const r = box(el), b = box(root); return { x: (r.x - b.x) / b.width, y: (r.y - b.y) / b.height, width: r.width / b.width, height: r.height / b.height } }
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[data-canvas-use-cursor]') && (!options.viewport || (r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth)) }
  const observe = (images=true) => {
    options.checkpoint?.()
    const state = shared()
    refs.clear()
    // Browser pages can supply a bounded traversal without changing the default
    // canvas API. Callbacks are host-authored and never taken from tool input.
    const elements = [...(options.candidates?.() ?? root.querySelectorAll('button,a,input,textarea,select,[role],[tabindex],canvas,svg,[contenteditable=true]'))].filter(el=>{options.checkpoint?.();return visible(el)}).slice(0,200).map(el => ({
      ref: id(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), label: (options.label ? options.label(el) : (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.textContent || '')).slice(0,240),
      ...(el.matches('input,textarea,select') ? {value: el.matches('[type=password]') ? '[redacted]' : String(el.value).slice(0,500)} : {}),
      ...(el.matches('input[type=checkbox],input[type=radio]') ? {checked:el.checked} : {}),
      ...(el.tagName==='SELECT' ? {options:[...el.options].slice(0,100).map(o=>({value:o.value,label:o.label,disabled:o.disabled}))} : {}),
      ...(el.hasAttribute('aria-checked')?{checked:el.getAttribute('aria-checked')}:{}),
      disabled: el.disabled === true, bounds: rect(el),
      ...(el.tagName === 'CANVAS' && (images || !state) ? {image: (()=>{try{return el.toDataURL('image/png')}catch{return null}})()} : {})
    }))
    const text = (options.text ? options.text() : (root.innerText || root.textContent || '')).slice(0,20000)
    const revision = hash(JSON.stringify({url:location.href,text,elements:state?elements.map(({image,...element})=>element):elements,state}))
    if(!images)for(const element of elements)delete element.image
    previous = revision
    return {revision,text,elements,state,size:{width:box(root).width,height:box(root).height},url:location.href}
  }
  return async function use(args) {
    if (args.op === 'observe') return observe(args.images!==false)
    const authority=shared();if(authority&&(!authority.connected||authority.readOnly))throw Error('组件未连接或为只读，无法操作。')
    if (!previous || args.revision !== previous || observe().revision !== args.revision) throw Error('组件状态已变化，请重新观察。')
    options.checkpoint?.()
    let el = args.ref ? refs.get(args.ref) : root
    if (!el || !el.isConnected || !visible(el) || el.disabled) throw Error('操作目标已不可用。')
    const space=el
    const point = (p, target = space) => { if (!p || ![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)) throw Error('坐标须位于目标范围内。'); const b=box(target);return {clientX:b.x+p.x*b.width,clientY:b.y+p.y*b.height} }
    if(!args.ref&&args.point){const p=point(args.point),hit=document.elementFromPoint(p.clientX,p.clientY);if(!hit||!root.contains(hit))throw Error('坐标未命中组件内容。');el=hit}
    if (el.matches('input[type=password],input[type=file]')) throw Error('此输入需要用户接管。')
    let marker
    const mark=p=>{
      const at=point(p)
      if(!marker){marker=document.createElement('div');marker.setAttribute('data-canvas-use-cursor','');marker.setAttribute('aria-hidden','true');marker.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;width:20px;height:24px;background:#0d99ff;clip-path:polygon(0 0,100% 60%,48% 68%,30% 100%);filter:drop-shadow(0 0 2px white)';document.body.append(marker);setTimeout(()=>marker.remove(),900)}
      marker.style.left=at.clientX+'px';marker.style.top=at.clientY+'px'
    }
    const pointer = (name, p, down=false) => {
      const opts={...point(p),bubbles:true,cancelable:true,view:window,button:0,buttons:down?1:0,pointerId:1,pointerType:'mouse',isPrimary:true}
      if(!args.externalCursor)mark(p)
      dispatch(el,new PointerEvent('pointer'+name,opts)); dispatch(el,new MouseEvent('mouse'+name,opts))
    }
    if (args.op === 'click' || args.op === 'drag') {
      const p=args.point || {x:.5,y:.5}; point(p); if(args.op==='drag')point(args.to)
      el.focus?.({preventScroll:true}); pointer('move',p); pointer('down',p,true)
      try { if(args.op==='drag')for(let i=1;i<=12;i++){pointer('move',{x:p.x+(args.to.x-p.x)*i/12,y:p.y+(args.to.y-p.y)*i/12},true);await new Promise(resolve=>setTimeout(resolve,12))} }
      finally { pointer('up',args.op==='drag'?args.to:p) }
      if(args.op==='click')dispatch(el,new MouseEvent('click',{...point(p),bubbles:true,cancelable:true,view:window,button:0}))
    } else if(args.op==='input') {
      if(typeof args.text!=='string'||args.text.length>10000||!el.matches('input,textarea,[contenteditable=true]'))throw Error('输入目标或文本无效。')
      el.focus({preventScroll:true})
      if(el.isContentEditable)el.textContent=args.text
      else Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,args.text)
      dispatch(el,new Event('input',{bubbles:true}));dispatch(el,new Event('change',{bubbles:true}))
    } else if(args.op==='select') {
      if(el.tagName!=='SELECT'||![...el.options].some(o=>o.value===args.value))throw Error('选项无效。')
      el.value=args.value;dispatch(el,new Event('input',{bubbles:true}));dispatch(el,new Event('change',{bubbles:true}))
    } else if(args.op==='scroll') {
      if(![args.x??0,args.y??0].every(n=>Number.isFinite(n)&&Math.abs(n)<=4000))throw Error('滚动距离无效。')
      let scrollTarget=el===document.body?window:el
      if(options.viewport){let candidate=el===document.body?document.elementFromPoint(innerWidth/2,innerHeight/2):el;while(candidate&&candidate!==document.body&&!(candidate.scrollHeight>candidate.clientHeight+8&&/auto|scroll/.test(getComputedStyle(candidate).overflowY)))candidate=candidate.parentElement;if(candidate&&candidate!==document.body)scrollTarget=candidate}
      scrollTarget.scrollBy({left:args.x||0,top:args.y||0,behavior:'instant'})
    } else if(args.op==='key') {
      if(typeof args.key!=='string'||!(/^[a-zA-Z0-9 ]$/.test(args.key)||['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Delete'].includes(args.key)))throw Error('按键无效。')
      el.focus?.({preventScroll:true});const opts={key:args.key,code:args.key.length===1?'Key'+args.key.toUpperCase():args.key,bubbles:true,cancelable:true}
      dispatch(el,new KeyboardEvent('keydown',opts));dispatch(el,new KeyboardEvent('keyup',opts))
    } else throw Error('不支持的交互。')
    previous=''
    return {status:'dispatched',message:'已发送交互；必须重新观察确认结果，不能据此宣称任务完成。'}
  }
}

export function installCanvasUseSurface(create, dispatch) {
  let use,changedTimer
  const changed=()=>{if(changedTimer)return;changedTimer=setTimeout(()=>{changedTimer=null;parent.postMessage({type:'sherlock-canvas-use-changed'},'*')},60)}
  // General form/DOM signals supplement shared-state and journal notifications.
  // Canvas-only/timer changes still have the scheduler's polling fallback.
  for(const type of ['input','change','click','keyup'])addEventListener(type,changed,true)
  const watch=()=>new MutationObserver(changed).observe(document.body,{subtree:true,childList:true,characterData:true})
  if(document.body)watch();else addEventListener('DOMContentLoaded',watch,{once:true})
  addEventListener('message',async event=>{
    const d=event.data
    if(event.source!==parent||d?.type!=='sherlock-canvas-use-request'||typeof d.id!=='string')return
    try {
      use??=create(document.body,()=>window.sherlockShared?.inspect?.()??null, dispatch)
      const result=await use(d.args)
      parent.postMessage({type:'sherlock-canvas-use-result',id:d.id,result},'*')
    } catch(error) {parent.postMessage({type:'sherlock-canvas-use-result',id:d.id,error:error.message},'*')}
  })
}
