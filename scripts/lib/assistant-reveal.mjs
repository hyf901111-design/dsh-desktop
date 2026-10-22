/** Presentation only: paint text which has already reached the existing renderer.
 * No text nodes, Markdown input, model state, tool receipts or scroll positions change. */
export function createAssistantRevealLedger(){
 const owners=new WeakMap();let sequence=0
 return{observe(owner,openState,order,nodes){
  if(!owner||!['object','function'].includes(typeof owner))return
  let state=owners.get(owner);if(!state){state={id:++sequence,ready:false,high:-1,records:new Map()};owners.set(owner,state)}
  const first=openState!=='open'||!state.ready
  for(const key of order){const node=nodes.get(key);if(node?.kind!=='assistant-step')continue
   let record=state.records.get(key)
   if(!record){record={fresh:!first&&node.anchorSeq>state.high,live:false,initialized:false,text:''};state.records.set(key,record)}
   if(first){record.fresh=false;record.live=false;record.initialized=false}
   if(node.data?.status==='running')record.live=true
  }
  for(const key of order){const node=nodes.get(key);if(node?.kind==='assistant-step')state.high=Math.max(state.high,node.anchorSeq)}
  state.ready=openState==='open'
 },suspend(owner){const state=owners.get(owner);if(state)state.ready=false},record(owner,node){return owners.get(owner)?.records.get(node?.key)}}
}

export function createAssistantTextPaint(root,record){
 if(!root||!record)return{update(){},dispose(){}}
 const doc=root.ownerDocument,view=doc.defaultView,media=view?.matchMedia?.('(prefers-reduced-motion: reduce)'),registry=view?.CSS?.highlights
 let frame=0,style,batches=[],names=[],disposed=false,selecting=false,quietUntil=0
 const palettes=new Map()
 const prefix='ework-ai-reveal-'+Math.random().toString(36).slice(2)
 const clear=()=>{view?.cancelAnimationFrame(frame);frame=0;batches=[];for(const name of names)registry?.delete(name);delete root.dataset.aiRevealing}
 const visible=()=>doc.visibilityState!=='hidden'&&root.getClientRects().length>0&&!root.closest('[hidden],[inert],[aria-hidden="true"]')
 const finish=()=>clear()
 const background=()=>{record.skipNext=true;finish()},preference=()=>{if(media?.matches)finish()},visibility=()=>{if(!visible())background()}
 media?.addEventListener?.('change',preference);doc.addEventListener('visibilitychange',visibility);view?.addEventListener('blur',background);doc.addEventListener('sherlock:workspace-surface-change',visibility)
 const interact=event=>{if(event.type==='pointerdown')selecting=true;quietUntil=view.performance.now()+180;finish()},release=()=>{selecting=false}
 for(const type of ['pointerdown','keydown','copy','wheel'])root.addEventListener(type,interact,true)
 doc.addEventListener('pointerup',release,true);doc.addEventListener('pointercancel',release,true)
 const hasSelection=()=>{const selected=doc.getSelection?.();if(!selected||selected.isCollapsed||!selected.rangeCount)return false;try{return selected.getRangeAt(0).intersectsNode(root)}catch{return false}}
 const selection=()=>{if(hasSelection())finish()}
 doc.addEventListener('selectionchange',selection)
 const collect=()=>{const nodes=[],walker=doc.createTreeWalker(root,4,{acceptNode(node){return node.parentElement?.closest('button,svg,style,script,[aria-hidden="true"],.katex-mathml')?2:1}});let node,text='';while(node=walker.nextNode()){nodes.push({node,start:text.length,end:text.length+node.data.length});text+=node.data}return{nodes,text}}
 const paint=now=>{
  frame=0;if(disposed||media?.matches||!visible()||!root.isConnected){finish();return}
  for(const name of names)registry.delete(name)
  const groups=new Map();batches=batches.filter(batch=>now<batch.start+batch.delay+240&&root.contains(batch.range.startContainer)&&root.contains(batch.range.endContainer))
  for(const batch of batches){const progress=Math.max(0,Math.min(1,(now-batch.start-batch.delay)/240)),bucket=Math.min(9,Math.floor(progress*10)),name=batch.palette.names[bucket];let ranges=groups.get(name);if(!ranges)groups.set(name,ranges=[]);ranges.push(batch.range)}
  for(const[name,ranges]of groups)registry.set(name,new view.Highlight(...ranges))
  if(batches.length)frame=view.requestAnimationFrame(paint);else delete root.dataset.aiRevealing
 }
 return{update(){
  const{nodes,text}=collect(),previous=record.text,initial=!record.initialized,skip=record.skipNext;record.initialized=true;record.text=text;record.skipNext=false
  if(disposed||skip||media?.matches||!visible()||!(record.fresh||record.live)||initial&&!record.fresh||text===previous){if(media?.matches||!visible())finish();return}
  // A grammar/layout rewrite is shown immediately; never replay an old prefix.
  if(!text.startsWith(previous)){finish();return}
  if(selecting||hasSelection()||view.performance.now()<quietUntil){finish();return}
  const start=previous.length;if(start===text.length)return
  if(!registry||!view.Highlight){finish();return}
  if(!style){style=doc.createElement('style');style.dataset.assistantReveal='';doc.head.append(style)}
  const paletteFor=node=>{const color=view.getComputedStyle(node.parentElement).color;let palette=palettes.get(color);if(palette)return palette;if(palettes.size>=32)return;palette={color,names:Array.from({length:10},(_,i)=>prefix+'-'+palettes.size+'-'+i)};palettes.set(color,palette);names.push(...palette.names);style.textContent=[...palettes.values()].map(p=>p.names.map((name,i)=>'::highlight('+name+'){color:color-mix(in srgb,'+p.color+' '+i*10+'%,transparent)}').join('')).join('')+'@media(prefers-reduced-motion:reduce){'+[...palettes.values()].map(p=>p.names.map(name=>'::highlight('+name+'){color:'+p.color+'}').join('')).join('')+'}';return palette}
  const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text.slice(start))].map(part=>start+part.index):Array.from(text.slice(start)).reduce((list,part)=>{list.push((list.at(-1)??start)+part.length);return list},[start]).slice(0,-1)
  segments.push(text.length);const stride=Math.max(12,Math.ceil((segments.length-1)/20)),count=Math.ceil((segments.length-1)/stride),clock=view.performance.now()
  for(let i=0;i<segments.length-1;i+=stride){const from=segments[i],to=segments[Math.min(i+stride,segments.length-1)],delay=Math.min(420,(i/stride)*Math.min(28,420/Math.max(1,count-1)));for(const part of nodes){if(part.end<=from||part.start>=to)continue;const palette=paletteFor(part.node);if(!palette)continue;const range=doc.createRange();range.setStart(part.node,Math.max(from,part.start)-part.start);range.setEnd(part.node,Math.min(to,part.end)-part.start);batches.push({range,palette,start:clock,delay})}}
  // Bound work even when a provider sends very small fragments for a long time.
  if(batches.length>80)batches=batches.slice(-80)
  root.dataset.aiRevealing='';if(!frame)paint(clock)
 },dispose(){if(record.initialized&&record.text)record.skipNext=true;disposed=true;clear();style?.remove();media?.removeEventListener?.('change',preference);doc.removeEventListener('visibilitychange',visibility);view?.removeEventListener('blur',background);doc.removeEventListener('sherlock:workspace-surface-change',visibility);doc.removeEventListener('selectionchange',selection);doc.removeEventListener('pointerup',release,true);doc.removeEventListener('pointercancel',release,true);for(const type of ['pointerdown','keydown','copy','wheel'])root.removeEventListener(type,interact,true)}}
}
export function useAssistantTextPaint(react,record,content){
 const root=react.useRef(null),paint=react.useRef()
 react.useLayoutEffect(()=>()=>{paint.current?.dispose();paint.current=undefined},[record])
 react.useLayoutEffect(()=>{if(!paint.current||paint.current.root!==root.current){paint.current?.dispose();paint.current={root:root.current,...createAssistantTextPaint(root.current,record)}}paint.current.update()},[record,content])
 return root
}

export function patchAssistantReveal(source){
 const marker='/* ework:assistant-reveal:v1 */'
 if(source.includes(marker))return source
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Assistant reveal anchor drifted: '+before.slice(0,90));source=source.replace(before,after)}
 const anchor='const AssistantMarkdown = (0, react.memo)(function AssistantMarkdown({ blocks, streaming, interrupted, loadImage, mentions, openFile, t }) {'
 replace(anchor,`${marker}\n${[createAssistantRevealLedger,createAssistantTextPaint,useAssistantTextPaint].map(fn=>fn.toString()).join('\n')}\nconst eworkAssistantRevealLedger=createAssistantRevealLedger();\n`+anchor.replace('openFile, t','openFile, t, reveal')+'\nconst revealRef=useAssistantTextPaint(react,interrupted?undefined:reveal,blocks);')
 replace('className: AssistantMarkdown_module_css_default.root,','ref:revealRef,\nclassName: AssistantMarkdown_module_css_default.root,')
 const viewStart=source.indexOf('function ChatView('),viewEnd=source.indexOf('//#endregion',viewStart),viewPart=source.slice(viewStart,viewEnd),open='const openState = useSession((s) => s.openState);';if(viewPart.split(open).length!==2)throw Error('Assistant reveal ChatView boundary drifted');source=source.slice(0,viewStart)+viewPart.replace(open,open+'\neworkAssistantRevealLedger.observe(useSession,openState,order,nodeStore);\nreact.useEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession),[useSession]);')+source.slice(viewEnd)
 replace('const routedOwner = {\n\t\t\t\t...owner,','const routedOwner = {\n\t\t\t\teworkRevealOwner:useSession,\n\t\t\t\t...owner,')
 replace('function AssistantNodeView({ node, useTurnData, openFile, loadImage, fileMentions, t }) {','function AssistantNodeView({ node, useTurnData, openFile, loadImage, fileMentions, t, eworkRevealOwner }) {')
 const content='const content = (0, react_jsx_runtime.jsx)(AssistantMarkdown, {\n\t\t\t\tblocks: visibleBlocks,'
 replace(content,content+'\nreveal:eworkAssistantRevealLedger.record(eworkRevealOwner,node),')
 // Keep this keyed subtree mounted when a running message gains its final ID.
 replace('return messageId === void 0 ? content : (0, react_jsx_runtime.jsx)("div", {','return (0, react_jsx_runtime.jsx)("div", {')
 return source
}
