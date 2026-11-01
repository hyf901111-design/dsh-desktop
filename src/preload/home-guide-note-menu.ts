import {validateNoteMenu,noteMenuPresentation,noteMenuDocumentHtml} from '../shared/note-menu-presentation'
import type {NoteMenuState,NoteMenuEvent} from '../shared/notes-menu'
import {noteMenuBounds,noteSubmenuBounds} from '../shared/note-menu-geometry'
/** The original native menu renderer, hosted in this guide's top layer only.
 * NativeSlashMenu still owns every callback, revision and library admission. */
export function createHomeGuideNoteMenu(document:Document,options:{runId:string;sessionId:string;signal:AbortSignal;current():boolean}){
 const win=document.defaultView!,host=document.createElement('div'),ticket=crypto.randomUUID(),retired=new Set<string>()
 host.dataset.homeGuideNoteMenu=options.runId;host.dataset.eworkExpandedCommand='';host.setAttribute('popover','manual');host.style.cssText='position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:auto'
 const rawCss=noteMenuDocumentHtml.match(/<style>([\s\S]*?)<\/style>/)![1]!,css=rawCss.replace(/html,body/g,':scope').replace(/body\.dark/g,':scope.guide-menu-dark').replace(/body\.native-material/g,':scope.guide-native-material').replace(/\bbody\{/g,':scope{')
 let state:NoteMenuState|undefined,closed=false,revoked=false,rootScrollTop=0
 const moved=(records:MutationRecord[])=>{if(records.some(record=>record.attributeName==='data-home-guide-pointer-run'&&record.oldValue!==options.runId)||document.documentElement.dataset.homeGuidePointerRun!==options.runId)revoked=true}
 const observer=new MutationObserver(records=>{moved(records);if(revoked)dispose()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-home-guide-pointer-run'],attributeOldValue:true})
 const current=()=>{moved(observer.takeRecords());return !revoked&&!closed&&!options.signal.aborted&&options.current()&&document.documentElement.dataset.homeGuidePointerRun===options.runId}
 const emit=(value:Omit<NoteMenuEvent,'owner'|'sessionId'|'menuId'|'revision'>)=>{if(!state||!current())return;document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{...value,owner:'home-guide:'+options.runId,sessionId:options.sessionId,menuId:state.menuId,revision:state.revision}}))}
 const close=(menuId?:string,cancel=false)=>{if(!state||menuId&&state.menuId!==menuId)return;const previous=state;if(cancel)emit({action:'cancel'});retired.add(previous.menuId);state=undefined;if(host.matches(':popover-open'))host.hidePopover();host.remove();host.replaceChildren()}
 const route=(link:HTMLAnchorElement,hover=false)=>{
  if(!state||!current()||!host.contains(link))return
  let value:URL;try{value=new URL(link.href)}catch{return}
  const [,action,id]=value.pathname.split('/'),revision=Number(value.searchParams.get('revision')),parentId=value.searchParams.get('parent')||undefined
  if(value.protocol!=='ework-note-menu:'||value.hostname!==ticket||revision!==state.revision)return
  const parent=state.items.find(item=>item.id===parentId),item=parentId?parent?.children?.find(item=>item.id===id):state.items.find(item=>item.id===id)
  if(!item||parentId&&state.submenu?.parentId!==parentId||!['open','select'].includes(action!))return
  if(action==='open'&&item.children?.length&&!parentId){if(state.submenu?.parentId!==id)emit({action:'open',itemId:id});return}
  if(!hover&&action==='select'&&!item.children){const detail={owner:'home-guide:'+options.runId,sessionId:options.sessionId,menuId:state.menuId,revision:state.revision,action:'select',itemId:id,...parentId?{parentId}:{}};close(state.menuId);document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail}))}
 }
 host.addEventListener('pointerdown',event=>event.preventDefault())
 host.addEventListener('pointerover',event=>{const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-submenu]');if(link)route(link,true)})
 host.addEventListener('click',event=>{event.preventDefault();const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a');if(link)route(link)})
 host.addEventListener('scroll',event=>{const list=host.querySelector<HTMLElement>('.root-menu>[role=listbox]');if(event.target===list&&list&&list.scrollTop!==rootScrollTop){rootScrollTop=list.scrollTop;if(state?.submenu)emit({action:'back'})}},true)
 const outside=(event:Event)=>{if(state&&!host.contains(event.target as Node))close(undefined,true)}
 document.addEventListener('pointerdown',outside,true)
 const blur=()=>{if(!document.hasFocus())close(undefined,true)},surface=(event:Event)=>{if((event as CustomEvent).detail?.surface!=='notes')close(undefined,true)}
 win.addEventListener('blur',blur);document.addEventListener('sherlock:workspace-surface-change',surface)
 const dispose=()=>{if(closed)return;close(undefined,true);closed=true;observer.disconnect();document.removeEventListener('pointerdown',outside,true);win.removeEventListener('blur',blur);document.removeEventListener('sherlock:workspace-surface-change',surface);options.signal.removeEventListener('abort',dispose)}
 options.signal.addEventListener('abort',dispose,{once:true});if(options.signal.aborted)dispose()
 return{sync(input:NoteMenuState){validateNoteMenu(input);if(!current()||input.sessionId!==options.sessionId||retired.has(input.menuId))throw new DOMException('演示菜单已结束。','AbortError');if(state&&(state.menuId!==input.menuId||input.revision<state.revision))throw Error('组件库菜单已变化。')
   const previous=state,sameRows=(a:NoteMenuState['items']|undefined,b:NoteMenuState['items'])=>!!a&&a.map(item=>item.id).join(',')===b.map(item=>item.id).join(',')
   const rootScroll=sameRows(previous?.items,input.items)?host.querySelector<HTMLElement>('.root-menu>[role=listbox]')?.scrollTop||0:0
   const previousParent=previous?.items.find(item=>item.id===previous.submenu?.parentId),nextParent=input.items.find(item=>item.id===input.submenu?.parentId)
   const childScroll=previous?.submenu?.parentId===input.submenu?.parentId&&sameRows(previousParent?.children,nextParent?.children||[])?host.querySelector<HTMLElement>('.child-menu>[role=listbox]')?.scrollTop||0:0
   const restore=(selector:string,top:number,reveal:boolean)=>{const list=host.querySelector<HTMLElement>(selector+'>[role=listbox]');if(list){list.scrollTop=top;if(reveal)list.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({block:'nearest'})}}
   state=input
   const limits={height:win.innerHeight-24,width:win.innerWidth-24,shadowInset:0}
   const desired=noteMenuPresentation(input,ticket,limits)
   const work={x:0,y:0,width:win.innerWidth,height:win.innerHeight},rootBounds=noteMenuBounds(input.anchor,work,desired.root.height,1,desired.root.width,0)
   const presentation=noteMenuPresentation(input,ticket,{...limits,rootHeight:rootBounds.height})
   host.dataset.noteMenuId=input.menuId;host.dataset.noteMenuRevision=String(input.revision);host.className=(input.dark?'guide-menu-dark ':'')+'guide-native-material';host.innerHTML='<style>@scope ([data-home-guide-note-menu]){'+css+'}</style><main>'+presentation.root.html+(presentation.child?.html||'')+'</main>'
   // Match the native panels: opening a child must never reposition its root.
   const root=host.querySelector<HTMLElement>('.root-menu')!,child=host.querySelector<HTMLElement>('.child-menu')
   const place=(node:HTMLElement,x:number,y:number)=>{node.style.position='absolute';node.style.left=x+'px';node.style.top=y+'px';node.style.margin='0'}
   const bounds=(left:number,top:number,width:number,height:number)=>{for(const [key,value] of Object.entries({width:width+'px',height:height+'px',background:'transparent','box-shadow':'none','backdrop-filter':'none'}))host.style.setProperty(key,value,'important');host.style.left=left+'px';host.style.top=top+'px'}
   bounds(rootBounds.x,rootBounds.y,rootBounds.width,rootBounds.height);place(root,0,0)
   if(!host.isConnected)document.body.append(host);if(!host.matches(':popover-open'))host.showPopover()
   restore('.root-menu',rootScroll,!input.submenu&&previous?.selectedIndex!==input.selectedIndex);rootScrollTop=host.querySelector<HTMLElement>('.root-menu>[role=listbox]')?.scrollTop||0
   if(child&&presentation.child){
    const parentIndex=input.items.findIndex(item=>item.id===input.submenu?.parentId),parent=root.querySelector<HTMLElement>('#item-root-'+parentIndex)
    const row=parent?.getBoundingClientRect(),item=row&&row.width&&row.height?{x:row.x,y:row.y,width:row.width,height:row.height}:{x:rootBounds.x,y:rootBounds.y+6+Math.max(0,parentIndex)*32,width:rootBounds.width,height:32}
    const next=noteSubmenuBounds(rootBounds,item,work,presentation.child.height,presentation.child.width,1,0),left=Math.min(rootBounds.x,next.x),top=Math.min(rootBounds.y,next.y),right=Math.max(rootBounds.x+rootBounds.width,next.x+next.width),bottom=Math.max(rootBounds.y+rootBounds.height,next.y+next.height)
    bounds(left,top,right-left,bottom-top);place(root,rootBounds.x-left,rootBounds.y-top);place(child,next.x-left,next.y-top)
    restore('.child-menu',childScroll,input.submenu?.keyboardActive!==false&&(previous?.submenu?.parentId!==input.submenu?.parentId||previous?.submenu?.selectedIndex!==input.submenu?.selectedIndex||previous?.submenu?.keyboardActive===false))
   }

  },close,dispose,element:()=>state&&current()?host:undefined}
}
