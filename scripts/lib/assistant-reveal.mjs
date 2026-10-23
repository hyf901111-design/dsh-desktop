/** Presentation only: paint text which has already reached the existing renderer.
 * No text nodes, Markdown input, model state, tool receipts or scroll positions change. */
export function createAssistantRevealLedger(){
 const owners=new WeakMap();let sequence=0
 return{observe(owner,openState,order,nodes){
  if(!owner||!['object','function'].includes(typeof owner))return
  let state=owners.get(owner);if(!state){state={id:++sequence,ready:false,high:-1,epoch:0,records:new Map()};owners.set(owner,state)}
  const first=openState!=='open'||!state.ready;if(first)state.epoch++
  for(const key of order){const node=nodes.get(key);if(node?.kind!=='assistant-step')continue
   let record=state.records.get(key)
   if(!record){record={fresh:!first&&node.anchorSeq>state.high,live:false,initialized:false,text:'',epoch:state.epoch};state.records.set(key,record)}
   if(first){record.fresh=false;record.live=false;record.initialized=false;record.epoch=state.epoch;delete record.handoff}
   if(node.data?.status==='running')record.live=true
  }
  for(const key of order){const node=nodes.get(key);if(node?.kind==='assistant-step')state.high=Math.max(state.high,node.anchorSeq)}
  state.ready=openState==='open'
 },suspend(owner){const state=owners.get(owner);if(state){state.ready=false;state.epoch++;for(const record of state.records.values()){record.epoch=state.epoch;record.skipNext=true;delete record.handoff}}},record(owner,node){return owners.get(owner)?.records.get(node?.key)}}
}

export function createAssistantTextPaint(root,record,route){
 if(!root||!record)return{update(){},dispose(){}}
 const doc=root.ownerDocument,view=doc.defaultView,media=view?.matchMedia?.('(prefers-reduced-motion: reduce)'),registry=view?.CSS?.highlights
 const epoch=record.epoch,transferRoute=route==='progress'||route==='node'
 const fade=180,step=12,levels=32,maxTail=2200-fade,palettes=new Map(),prefix='ework-ai-reveal-'+Math.random().toString(36).slice(2)
 let frame=0,style,units=[],parts=[],names=[],disposed=false,selecting=false,quietUntil=0,lastStart,focused=doc.hasFocus?.()!==false
 const clear=()=>{view?.cancelAnimationFrame(frame);frame=0;units=[];for(const name of names)registry?.delete(name);delete root.dataset.aiRevealing;delete root.__eworkAssistantRevealEnd;delete record.handoff}
 const visible=()=>focused&&doc.visibilityState!=='hidden'&&root.getClientRects().length>0&&!root.closest('[hidden],[inert],[aria-hidden="true"]')
 // Only a different trusted seat in this same commit may resume these times.
 const inherited=record.handoff;delete record.handoff
 if(inherited&&transferRoute&&inherited.route!==route&&inherited.epoch===epoch&&(record.fresh||record.live)&&visible()&&!media?.matches){units=inherited.units;lastStart=inherited.lastStart;record.skipNext=false}
 const finish=()=>clear();root.__eworkAssistantRevealFinish=finish
 const suspend=()=>{record.skipNext=true;finish()},background=()=>{focused=false;suspend()},foreground=()=>{focused=true},preference=()=>{if(media?.matches)finish()},visibility=()=>{if(doc.visibilityState==='hidden')background();else if(!visible())suspend()}
 media?.addEventListener?.('change',preference);doc.addEventListener('visibilitychange',visibility);view?.addEventListener('blur',background);view?.addEventListener('focus',foreground);doc.addEventListener('sherlock:workspace-surface-change',visibility)
 const interact=event=>{if(event.type==='pointerdown')selecting=true;quietUntil=view.performance.now()+180;finish()},release=()=>{selecting=false}
 for(const type of ['pointerdown','keydown','copy','wheel'])root.addEventListener(type,interact,true)
 doc.addEventListener('pointerup',release,true);doc.addEventListener('pointercancel',release,true)
 const hasSelection=()=>{const selected=doc.getSelection?.();if(!selected||selected.isCollapsed||!selected.rangeCount)return false;try{return selected.getRangeAt(0).intersectsNode(root)}catch{return false}}
 const selection=()=>{if(hasSelection())finish()}
 doc.addEventListener('selectionchange',selection)
 const collect=()=>{const nodes=[],walker=doc.createTreeWalker(root,4,{acceptNode(node){return node.parentElement?.closest('button,svg,style,script,[aria-hidden="true"],.katex-mathml')?2:1}});let node,text='';while(node=walker.nextNode()){nodes.push({node,start:text.length,end:text.length+node.data.length});text+=node.data}return{nodes,text}}
 const upper=(time)=>{let lo=0,hi=units.length;while(lo<hi){const mid=(lo+hi)>>>1;if(units[mid].at<=time)lo=mid+1;else hi=mid}return lo}
 const paletteFor=node=>{const color=view.getComputedStyle(node.parentElement).color;let palette=palettes.get(color);if(palette)return palette;if(palettes.size>=32)return palettes.values().next().value;palette={color,names:Array.from({length:levels},(_,i)=>prefix+'-'+palettes.size+'-'+i)};palettes.set(color,palette);names.push(...palette.names);style.textContent=[...palettes.values()].map(p=>p.names.map((name,i)=>'::highlight('+name+'){color:color-mix(in srgb,'+p.color+' '+i*100/levels+'%,transparent)}').join('')).join('')+'@media(prefers-reduced-motion:reduce){'+[...palettes.values()].map(p=>p.names.map(name=>'::highlight('+name+'){color:'+p.color+'}').join('')).join('')+'}';return palette}
 const paint=now=>{
  frame=0;if(disposed||record.epoch!==epoch||media?.matches||!visible()||!root.isConnected){finish();return}
  for(const name of names)registry.delete(name)
  const groups=new Map(),done=upper(now-fade),pending=upper(now)
  // Each interval is split only at eligible TextNode boundaries, never per pending
  // character. Thirty-two alpha intervals keep paint ranges bounded on huge replies.
  const add=(from,to,bucket)=>{if(from>=to)return;let lo=0,hi=parts.length;while(lo<hi){const mid=(lo+hi)>>>1;if(parts[mid].end<=from)lo=mid+1;else hi=mid}for(let i=lo;i<parts.length&&parts[i].start<to;i++){const part=parts[i],palette=part.palette;if(!palette)continue;const range=doc.createRange();range.setStart(part.node,Math.max(from,part.start)-part.start);range.setEnd(part.node,Math.min(to,part.end)-part.start);const name=palette.names[bucket];let ranges=groups.get(name);if(!ranges)groups.set(name,ranges=[]);ranges.push(range)}}
  if(pending<units.length)add(units[pending].from,units.at(-1).to,0)
  for(let bucket=0;bucket<levels;bucket++){const first=Math.max(done,upper(now-(bucket+1)*fade/levels)),end=Math.min(pending,upper(now-bucket*fade/levels));if(first<end)add(units[first].from,units[end-1].to,bucket)}
  for(const[name,ranges]of groups)registry.set(name,new view.Highlight(...ranges))
  const frontier=units[Math.max(0,pending-1)];if(frontier){const part=parts.find(p=>p.end>=frontier.to);if(part){const range=doc.createRange();range.setStart(part.node,Math.max(0,Math.min(part.node.length,frontier.to-part.start-1)));range.setEnd(part.node,Math.max(0,Math.min(part.node.length,frontier.to-part.start)));root.__eworkAssistantRevealEnd=range}}
  if(done===units.length)units=[]
  root.dispatchEvent(new view.CustomEvent('sherlock:assistant-reveal-frame',{bubbles:true}))
  if(units.length)frame=view.requestAnimationFrame(paint);else{delete root.dataset.aiRevealing;delete root.__eworkAssistantRevealEnd;root.dispatchEvent(new view.CustomEvent('sherlock:assistant-reveal-frame',{bubbles:true}))}
 }
 const segment=(text,start)=>{const value=text.slice(start);if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(p=>({from:start+p.index,to:start+p.index+p.segment.length}));let offset=start;return Array.from(value,p=>{const from=offset;offset+=p.length;return{from,to:offset}})}
 return{update(){
  const{nodes,text}=collect(),previous=record.text,initial=!record.initialized,skip=record.skipNext,clock=view.performance.now();record.initialized=true;record.text=text;record.skipNext=false
  // React may replace every Markdown node while preserving its logical text.
  // Refresh these ranges even when the provider has not appended another character.
  parts=nodes
  // Reclaim completed graphemes on actual renderer updates, never per frame.
  if(units.length)units=units.slice(upper(clock-fade))
  if(disposed||record.epoch!==epoch||skip||media?.matches||!visible()||!(record.fresh||record.live)||initial&&!record.fresh){finish();lastStart=undefined;return}
  if(selecting||hasSelection()||clock<quietUntil||!registry||!view.Highlight){finish();return}
  if(!style){style=doc.createElement('style');style.dataset.assistantReveal='';doc.head.append(style)}
  for(const part of parts)part.palette=paletteFor(part.node)
  if(text!==previous){
   if(text.startsWith(previous)){
    // Re-segment the final old grapheme so emoji/combining marks split across
    // provider fragments retain one reveal time rather than flashing half a glyph.
    const start=Math.min(previous.length,lastStart??previous.length),old=units.find(u=>u.from===start),retained=units.filter(u=>u.to<=start),segments=segment(text,start)
    let at=Math.max(clock,(retained.at(-1)?.at??clock-step)+step)
    for(const part of segments){if(part.from<previous.length){if(old){retained.push({...part,at:old.at});at=old.at+step}continue}retained.push({...part,at});at+=step}
    units=retained;lastStart=segments.at(-1)?.from??start
   }else{
    // Grammar changes expose only the rewritten span; an unchanged suffix keeps
    // its original timeline and follows its new offsets instead of popping in.
    let left=0,right=0;while(left<previous.length&&left<text.length&&previous[left]===text[left])left++;while(right<previous.length-left&&right<text.length-left&&previous[previous.length-1-right]===text[text.length-1-right])right++
    const shift=text.length-previous.length;units=units.flatMap(u=>u.to<=left?[u]:u.from>=previous.length-right?[{...u,from:u.from+shift,to:u.to+shift}]:[]);lastStart=undefined
   }
   // Sustained real fragments share one monotonic frontier. Compress only its
   // future schedule when necessary; already fading characters never restart.
   const future=upper(clock),tail=units.at(-1)?.at;if(tail>clock+maxTail){const origin=units[future]?.at??clock,span=tail-origin,available=Math.max(0,clock+maxTail-origin);for(let i=future;i<units.length;i++)units[i].at=span?origin+(units[i].at-origin)*available/span:clock+maxTail}
  }
  if(units.length){root.dataset.aiRevealing='';if(frame)view.cancelAnimationFrame(frame);paint(clock)}else finish()
 },dispose(){
  const handoff=transferRoute&&units.length&&record.epoch===epoch&&!record.skipNext&&!media?.matches&&visible()&&!selecting&&!hasSelection()?{route,epoch,units,lastStart}:undefined
  if(record.initialized&&record.text)record.skipNext=true;disposed=true;clear()
  if(handoff){record.handoff=handoff;queueMicrotask(()=>{if(record.handoff===handoff)delete record.handoff})}
  delete root.__eworkAssistantRevealFinish;style?.remove();media?.removeEventListener?.('change',preference);doc.removeEventListener('visibilitychange',visibility);view?.removeEventListener('blur',background);view?.removeEventListener('focus',foreground);doc.removeEventListener('sherlock:workspace-surface-change',visibility);doc.removeEventListener('selectionchange',selection);doc.removeEventListener('pointerup',release,true);doc.removeEventListener('pointercancel',release,true);for(const type of ['pointerdown','keydown','copy','wheel'])root.removeEventListener(type,interact,true)}}
}
export function useAssistantTextPaint(react,record,content,route){
 const root=react.useRef(null),paint=react.useRef()
 react.useLayoutEffect(()=>()=>{paint.current?.dispose();paint.current=undefined},[record,route,record?.epoch])
 react.useLayoutEffect(()=>{if(!paint.current||paint.current.root!==root.current){paint.current?.dispose();paint.current={root:root.current,...createAssistantTextPaint(root.current,record,route)}}paint.current.update()})
 return root
}

/** Used only by the existing native at-bottom follower. It never scrolls itself. */
export function assistantRevealScrollTop(el){
 const active=[...el.querySelectorAll('[data-ai-revealing]')].at(-1),bottom=active?.__eworkAssistantRevealEnd?.getBoundingClientRect().bottom
 return Number.isFinite(bottom)?Math.max(0,Math.min(el.scrollHeight-el.clientHeight,el.scrollTop+bottom-el.getBoundingClientRect().top-el.clientHeight+32)):undefined
}
export function finishAssistantReveals(local){for(const root of local.querySelectorAll('[data-ai-revealing]'))root.__eworkAssistantRevealFinish?.()}
export function patchAssistantReveal(source){
 const marker='/* ework:assistant-reveal:v1 */',helpers=`${marker}\n${[createAssistantRevealLedger,createAssistantTextPaint,useAssistantTextPaint,assistantRevealScrollTop,finishAssistantReveals].map(fn=>fn.toString()).join('\n')}\nconst eworkAssistantRevealLedger=createAssistantRevealLedger();\n`
 if(source.includes(marker)){
  const start=source.indexOf(marker),end=source.indexOf('const AssistantMarkdown =',start)
  if(source.split(marker).length!==2||end<0||!source.slice(start,end).endsWith('const eworkAssistantRevealLedger=createAssistantRevealLedger();\n'))throw Error('Assistant reveal helper boundary drifted')
  source=source.slice(0,start)+helpers+source.slice(end)
 }else{
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Assistant reveal anchor drifted: '+before.slice(0,90));source=source.replace(before,after)}
 const anchor='const AssistantMarkdown = (0, react.memo)(function AssistantMarkdown({ blocks, streaming, interrupted, loadImage, mentions, openFile, t }) {'
 replace(anchor,helpers+anchor.replace('openFile, t','openFile, t, reveal, revealRoute')+'\nconst revealRef=useAssistantTextPaint(react,interrupted?undefined:reveal,blocks,revealRoute);')
 replace('className: AssistantMarkdown_module_css_default.root,','ref:revealRef,\nclassName: AssistantMarkdown_module_css_default.root,')
 const viewStart=source.indexOf('function ChatView('),viewEnd=source.indexOf('//#endregion',viewStart),viewPart=source.slice(viewStart,viewEnd),open='const openState = useSession((s) => s.openState);';if(viewPart.split(open).length!==2)throw Error('Assistant reveal ChatView boundary drifted');source=source.slice(0,viewStart)+viewPart.replace(open,open+'\neworkAssistantRevealLedger.observe(useSession,openState,order,nodeStore);\nreact.useLayoutEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession),[useSession]);')+source.slice(viewEnd)
 replace('const routedOwner = {\n\t\t\t\t...owner,','const routedOwner = {\n\t\t\t\teworkRevealOwner:useSession,\n\t\t\t\t...owner,')
 replace('function AssistantNodeView({ node, useTurnData, openFile, loadImage, fileMentions, t }) {','function AssistantNodeView({ node, useTurnData, openFile, loadImage, fileMentions, t, eworkRevealOwner }) {')
 const content='const content = (0, react_jsx_runtime.jsx)(AssistantMarkdown, {\n\t\t\t\tblocks: visibleBlocks,'
 replace(content,content+'\nreveal:eworkAssistantRevealLedger.record(eworkRevealOwner,node),revealRoute:"node",')
 // Keep this keyed subtree mounted when a running message gains its final ID.
 replace('return messageId === void 0 ? content : (0, react_jsx_runtime.jsx)("div", {','return (0, react_jsx_runtime.jsx)("div", {')
 }
 // Cancel a previously queued bottom settle if the reader stopped following.
 source=source.replace('settleConversationScrollBottom(el, requestAnimationFrame, () => {','settleConversationScrollBottom(el,callback=>requestAnimationFrame(()=>{if(atBottomRef.current)callback()}), () => {')
 // Existing packaged helpers already have the v1 wiring, so upgrade its seats too.
 source=source.replace('openFile, t, reveal })','openFile, t, reveal, revealRoute })').replace('useAssistantTextPaint(react,interrupted?undefined:reveal,blocks);','useAssistantTextPaint(react,interrupted?undefined:reveal,blocks,revealRoute);').replace('react.useEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession),','react.useLayoutEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession),')
 if(!source.includes('/* ework:assistant-reveal-seats:v1 */')){
  const progress='blocks: update.blocks,',node='reveal:eworkAssistantRevealLedger.record(eworkRevealOwner,node),'
  if(source.split(progress).length!==2||source.split(node).length!==2)throw Error('Assistant reveal live seats drifted')
  source=source.replace(progress,'/* ework:assistant-reveal-seats:v1 */ '+progress+'\nreveal:eworkAssistantRevealLedger.record(seatProps.useSession,activityNodes.find(node=>node.key===update.key)),revealRoute:"progress",')
  if(!source.includes(node+'revealRoute:"node",'))source=source.replace(node,node+'revealRoute:"node",')
 }
 // Upgrade previously patched local/package assets as well as fresh upstream files.
 if(!source.includes('/* ework:assistant-reveal-follow:v1 */')){
  const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Assistant reveal follow anchor drifted: '+before.slice(0,90));source=source.replace(before,after)}
  const settle='function settleConversationScrollBottom(el, schedule, onSettled = () => {}) {'
  replace(settle,'/* ework:assistant-reveal-follow:v1 */ '+settle)
  const begin=source.indexOf(settle),end=source.indexOf('function shouldFollowConversationBottom',begin)
  source=source.slice(0,begin)+source.slice(begin,end).replace('el.scrollTop = el.scrollHeight;','el.scrollTop = assistantRevealScrollTop(el) ?? el.scrollHeight;')+source.slice(end)
  const start=source.indexOf('followRef.current = () => {'),stop=source.indexOf('(0, react.useEffect)',start)
  if(start<0||stop<0||!source.slice(start,stop).includes('el.scrollTop = el.scrollHeight;'))throw Error('Assistant reveal native follow drifted')
  source=source.slice(0,start)+source.slice(start,stop).replace('el.scrollTop = el.scrollHeight;','el.scrollTop = assistantRevealScrollTop(el) ?? el.scrollHeight;')+source.slice(stop)
  replace('el.addEventListener("scroll", onScroll, { passive: true });','el.addEventListener("scroll", onScroll, { passive: true });\nconst revealFrame=()=>followRef.current?.();local.addEventListener("sherlock:assistant-reveal-frame",revealFrame);')
  replace('el.removeEventListener("scroll", onScroll); stopAnchoring();','el.removeEventListener("scroll", onScroll);local.removeEventListener("sherlock:assistant-reveal-frame",revealFrame); stopAnchoring();')
  replace('atBottomRef.current = isAtBottom;\n\t\t\t\tsetAtBottom(isAtBottom);','atBottomRef.current = isAtBottom;\n\t\t\t\tsetAtBottom(isAtBottom);\nif(movedByReader)finishAssistantReveals(local);')
 }
 return source
}
