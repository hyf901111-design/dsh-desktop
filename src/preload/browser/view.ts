import type {BrowserQuestionState,BrowserRegionOverlayEvent,BrowserRegionRect} from '../../shared/browser-region'
import type {BrowserBridge,BrowserSnapshot,BrowserTab,BrowserLink,BrowserDownload} from '../../shared/browser-app'
import {BrowserBookmarkManager} from './bookmark-manager'
import {BrowserActivityPage} from './activity-page'
import {downloadDetails,downloadIndicator} from './download-details'
import type {WorkspaceSurfaceHost} from '../workspace-surface-host'
import {clipWorkspaceTabs,mountWorkspaceTopbarStyles,reserveWorkspaceRightControl,revealWorkspaceTab,workspaceBackButton} from '../workspace-topbar'
import {workspaceViews, workspaceViewButton, WorkspaceViewHover} from '../workspace-view-shortcuts'
import {browserIcons} from './icons'
import css from './style.css?inline'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const icon=(name:keyof typeof browserIcons)=>`<i class="eb-icon" aria-hidden="true" style="--eb-icon:url('${browserIcons[name].replaceAll("'",'%27').replaceAll('\"','%22')}')"></i>`
const button=(action:string,label:string,name?:keyof typeof browserIcons,disabled=false)=>`<button type="button" class="eb-icon-button" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${disabled?'disabled':''}>${name?icon(name):esc(label)}</button>`
const menuItem=(action:string,label:string,name:keyof typeof browserIcons,key='',disabled=false)=>`<button type="button" role="menuitem" class="eb-menu-item" data-action="${action}" ${disabled?'disabled':''}>${icon(name)}<span>${label}</span><kbd>${key}</kbd></button>`
const hostname=(url:string)=>{try{return new URL(url).hostname}catch{return url}}
// The shared Figma rules own the board menu's material, type and row geometry.
// These structural rules also work before the research module mounts its CSS.
const pageContextCss='[data-browser-page-context-menu]{position:fixed;z-index:3000;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}[data-browser-page-context-menu]>button{display:flex;align-items:center;gap:20px;box-sizing:border-box;width:100%;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer}[data-browser-page-context-menu]>button:disabled{opacity:.45;cursor:default}[data-browser-page-context-menu]>[role=separator]{height:1px;margin:5px;background:var(--odyssey-menu-border)}'
type PageContextMenu={element:HTMLElement;contextToken:string;tabId:string;url:string;ownerSessionId:string;x:number;y:number;loading:boolean}
export class BrowserAppView {
 readonly root:HTMLElement
 private startSection='';private startQuery='';private siteCookieCount=0;private composing=false;private editingBookmark?:BrowserLink;private state?:BrowserSnapshot;private sessionId='';private panel='';private folder='';private query='';private recent=false;private findFocus=0;private findOpen=false;private findText='';private suggestions=false;private suggestionIndex=0;private suggestionRows:BrowserLink[]=[];private settings=false;private image='';private notice='';private noticeError=false;private noticeTimer?:ReturnType<typeof setTimeout>;private disposed=false;private frame=0;private lastLayout='';private epoch=0;private lastTab='';private unsubscribe:()=>void;private observer?:MutationObserver;private resize?:ResizeObserver;private returningFocus?:HTMLElement
 private managingBookmarks=false;private bookmarkManager?:BrowserBookmarkManager;private draggingTab='';private draggingBefore?:string;private pointerInTabStrip=false;private frozenTabs?:Map<string,number>;private closingTab='';private holdTabWidths=false;private tabMotionUntil=0;private tabAnimations=new Set<Animation>()
 private activityPages=new Map<string,BrowserActivityPage>()
 private downloadButtonShown=false
 private downloadActionsInFlight=new Set<string>()
 private workspaceHover:WorkspaceViewHover;private workspaceMotionUntil=0
 private pointerTabDrag?:{id:string;pointerId:number;x:number;y:number;active:boolean};private ignoreTabClickUntil=0;private tabDragScrollFrame=0;private tabDragPoint?:{x:number;y:number}
 private panelPresented=false;private layoutAck=Promise.resolve(false)
 private addressBlurred=false;private bookmarkBusy=false;private addressPress?:{x:number;y:number;select:boolean}
 private bookmarkAnchorBar=false;private panelOpenedAt=0
 private pendingFocusRestore?:()=>void
 private question?:{pendingHandoff?:string;ticket:string;operationId?:string;rect?:BrowserRegionRect;state:BrowserQuestionState;tabId:string;url:string;contextToken:string}
 private questionUnsubscribe?:()=>void
 private questionStarting=false
 private questionEpoch=0
 private pageContext?:PageContextMenu
 constructor(private document:Document,private bridge:BrowserBridge,private host:WorkspaceSurfaceHost){
  mountWorkspaceTopbarStyles(document)
  const style=document.createElement('style');style.textContent=css+pageContextCss;style.id='browser-app-style';if(!document.getElementById(style.id))document.head.append(style)
  this.root=document.createElement('section');this.root.className='eb-root';this.root.setAttribute('aria-label','浏览器');this.root.dataset.browserApp='';this.root.hidden=true
  host.register('browser',this.root)
  this.workspaceHover=new WorkspaceViewHover(this.root,()=>this.root.querySelector('.eb-tabs'),()=>this.onWorkspaceExpansion(),bridge.workspacePointerInBar)
  this.questionUnsubscribe=bridge.subscribeQuestion?.(update=>{const question=this.question;if(!question||question.ticket!==update.ticket)return;const owner=update.state.ownerSessionId,ownHandoff=question.state.ownerSessionId===null&&typeof owner==='string'&&!!owner&&update.state.busy;if(owner!==question.state.ownerSessionId&&!ownHandoff||owner===question.state.ownerSessionId&&update.state.draftRev<question.state.draftRev)return;if(ownHandoff)question.pendingHandoff=owner!;question.state=update.state;if(update.state.sent||!update.state.active){this.cancelQuestion();return}if(!this.questionValid(question)){this.cancelQuestion();return}void this.presentQuestion().catch(error=>this.toast(error.message,true))})
  this.unsubscribe=bridge.subscribe(state=>{if(this.disposed)return;const previous=this.state;this.state=state;if(previous?.activeId===state.activeId&&state.translation&&state.translation.state!=='translating'&&(previous.translation?.state==='translating'||!!state.translation.error&&previous.translation?.error!==state.translation.error)){const status=state.translation;if(status.state==='translated')this.toast('网页已翻译为中文。');else if(status.state==='partial'||status.state==='error')this.toast(status.error||'部分网页内容未能翻译，可右键还原已修改的文字。',status.state==='error')}this.render()})
  this.root.addEventListener('pointerdown',this.tabPointerDown);this.root.addEventListener('pointerup',this.tabPointerUp);this.root.addEventListener('pointercancel',this.tabPointerCancel);this.root.addEventListener('lostpointercapture',this.tabPointerCancel);this.root.addEventListener('pointermove',this.tabPointerMove);this.root.addEventListener('pointerleave',this.releaseTabWidths);this.root.addEventListener('pointerdown',this.addressPointer);this.root.addEventListener('click',this.click);this.root.addEventListener('error',this.faviconError,true);this.root.addEventListener('keydown',this.key);this.root.addEventListener('input',this.input);this.root.addEventListener('change',this.change);this.root.addEventListener('contextmenu',this.contextMenu);this.root.addEventListener('compositionstart',this.compositionStart);this.root.addEventListener('compositionend',this.compositionEnd);this.root.addEventListener('auxclick',this.middleClick);this.root.addEventListener('scroll',this.clipTabs,true)
  document.addEventListener('keydown',this.shortcut);document.addEventListener('pointerdown',this.outside,true);document.addEventListener('sherlock:browser-overlay-prepare',this.prepareExternalOverlay);document.addEventListener('sherlock:browser-native-menu-dismiss',this.nativeMenuDismiss);document.addEventListener('sherlock:browser-open',this.onOpen);document.addEventListener('sherlock:browser-close',this.onClose);document.addEventListener('sherlock:browser-context',this.onContext);document.addEventListener('sherlock:workspace-surface-change',this.surface)
  const win=document.defaultView!;win.addEventListener('blur',this.addressBlur);win.addEventListener('resize',this.schedule);win.addEventListener('sherlock:browser-shortcut',this.nativeShortcut)
  if(win.MutationObserver){this.observer=new win.MutationObserver(records=>{if(records.some(r=>r.type!=='attributes'||r.attributeName!=='style'||!this.root.contains(r.target)))this.schedule()});this.observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-dsh-sidebar-wide','data-ds-dark-theme','data-theme','data-odyssey-panel-right','data-odyssey-panel-bottom','data-home-guide-entry-run','aria-expanded','style','hidden','aria-hidden','inert']});this.observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']})}
  if(win.ResizeObserver){this.resize=new win.ResizeObserver(this.schedule);this.resize.observe(this.root)}
 }
 async open(sessionId='',url?:string){
  this.closePageContextMenu();this.sessionId=sessionId;const epoch=++this.epoch
  this.host.open('browser')
  this.root.hidden=false
  this.render();this.schedule()
  let snapshot: BrowserSnapshot
  try{snapshot=await this.bridge.request('snapshot')}
  catch(error){if(this.disposed||epoch!==this.epoch)return;if(!this.state)this.host.close('browser');throw error}
  if(this.disposed||epoch!==this.epoch)return
  this.state=snapshot;this.render()
  if(url)await this.run('new',{url});else if(this.tab()?.url)await this.run('select',{id:this.state!.activeId})
  this.schedule()
 }
 close(sessionId?:string){if(sessionId&&sessionId!==this.sessionId)return;this.closePageContextMenu();this.cancelQuestion();this.cancelFocusRestore();this.clearTabDrag();this.workspaceHover.reset();this.managingBookmarks=false;this.epoch++;this.sessionId='';this.panel='';this.panelPresented=false;this.image='';this.lastLayout='';this.host.close('browser');this.root.hidden=true;void this.bridge.request('layout',{active:false,visible:false}).catch(()=>{})}
 private onOpen=(event:Event)=>{const d=(event as CustomEvent).detail;void this.open(typeof d?.sessionId==='string'?d.sessionId:'',d?.url).catch(error=>this.toast(error.message,true))}
 private onContext=(event:Event)=>{const id=(event as CustomEvent).detail?.sessionId;const next=typeof id==='string'?id:'';if(next!==this.sessionId){const q=this.question;if(q?.pendingHandoff){if(next===q.pendingHandoff)q.pendingHandoff=undefined;else this.cancelQuestion()}this.sessionId=next;this.render()}this.schedule()}
 private onClose=(event:Event)=>this.close((event as CustomEvent).detail?.sessionId)
 private surface=()=>{if(this.host.current()?.surface!=='browser'){this.epoch++;this.closePageContextMenu();this.cancelQuestion();this.cancelFocusRestore();this.clearTabDrag();this.workspaceHover.reset();this.managingBookmarks=false;this.root.hidden=true;this.panel='';this.panelPresented=false;this.suggestions=false;this.image='';}this.schedule()}
 private tabIcon(tab:BrowserTab){if(tab.page)return icon(tab.page==='history'?'history':'download');if(tab.loading)return `<span class="eb-tab-loading" aria-hidden="true">${icon('ring')}</span>`;const source=tab.favicon;return tab.url&&typeof source==='string'&&source.length<=32768&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source)?`<span class="eb-tab-site-icon" aria-hidden="true"><img class="eb-tab-favicon" src="${source}" alt="" draggable="false" referrerpolicy="no-referrer">${icon('globe')}</span>`:icon(tab.private?'moon':'globe')}
 private faviconError=(event:Event)=>{const image=event.target as HTMLImageElement;if(image.matches?.('img.eb-tab-favicon')){image.hidden=true;image.parentElement!.dataset.faviconFailed='true'}}
 private tab(){return this.state?.tabs.find(t=>t.id===this.state?.activeId)}
 private pageContextValid(menu:PageContextMenu){const tab=this.tab();return !this.disposed&&!this.root.hidden&&this.host.current()?.surface==='browser'&&this.pageContext===menu&&menu.tabId===tab?.id&&menu.url===tab.url&&menu.ownerSessionId===this.sessionId&&menu.loading===!!tab.loading&&!tab.page&&!tab.error&&!this.settings&&!this.managingBookmarks}
 private closePageContextMenu(){const menu=this.pageContext;this.pageContext=undefined;menu?.element.remove()}
 private positionPageContextMenu(){
  const menu=this.pageContext;if(!menu)return;const win=this.document.defaultView!,element=menu.element,box=element.getBoundingClientRect(),left=Math.max(12,Math.min(menu.x,win.innerWidth-box.width-12)),top=Math.max(12,Math.min(menu.y,win.innerHeight-box.height-12))
  if(element.style.left!==left+'px')element.style.left=left+'px';if(element.style.top!==top+'px')element.style.top=top+'px'
 }
 pageContextMenu(value:any){
  const tab=this.tab();if(this.disposed||this.root.hidden||this.host.current()?.surface!=='browser'||!tab?.url||tab.page||tab.error||this.settings||this.managingBookmarks||!value||value.tabId!==tab.id||value.url!==tab.url||value.ownerSessionId!==this.sessionId||typeof value.contextToken!=='string'||!value.contextToken||!Number.isFinite(value.x)||!Number.isFinite(value.y)||!Array.isArray(value.items)||!value.items.length||value.items.length>80)return
  this.closePageContextMenu();this.cancelFocusRestore();this.dismiss(false)
  const element=this.document.createElement('div');element.className='rScV5Q_contextMenu ew-grid-context-menu';element.dataset.browserPageContextMenu='';element.setAttribute('role','menu');element.setAttribute('aria-label','网页操作')
  const ids=new Set<string>()
  for(const item of value.items){
   if(!item||typeof item.id!=='string'||!/^[-\w:]{1,80}$/.test(item.id)||ids.has(item.id))continue;ids.add(item.id)
   if(item.separator===true){const line=this.document.createElement('div');line.setAttribute('role','separator');element.append(line);continue}
   if(typeof item.label!=='string'||!item.label||item.label.length>512)continue
   const row=this.document.createElement('button');row.type='button';row.setAttribute('role','menuitem');row.dataset.browserContextId=item.id;row.disabled=item.enabled===false;row.append(item.label)
   if(typeof item.shortcut==='string'&&item.shortcut.length<=80){const key=this.document.createElement('span');key.className='rScV5Q_contextMenuShortcut';key.textContent=item.shortcut;key.setAttribute('aria-hidden','true');row.append(key)}element.append(row)
  }
  if(!element.querySelector('button'))return
  const menu:PageContextMenu={element,contextToken:value.contextToken,tabId:value.tabId,url:value.url,ownerSessionId:value.ownerSessionId,x:value.x,y:value.y,loading:!!tab.loading};this.pageContext=menu
  element.addEventListener('click',event=>{const row=(event.target as Element).closest<HTMLButtonElement>('button[data-browser-context-id]');if(!row||row.disabled||!this.pageContextValid(menu))return;event.stopPropagation();this.closePageContextMenu();void this.bridge.request('context-command',{contextToken:menu.contextToken,itemId:row.dataset.browserContextId}).catch(error=>{if(!this.disposed&&!this.root.hidden&&this.tab()?.id===menu.tabId&&this.tab()?.url===menu.url&&this.sessionId===menu.ownerSessionId)this.toast(error instanceof Error?error.message:String(error),true)})})
  element.addEventListener('keydown',event=>{if(event.isComposing||!this.pageContextValid(menu))return;const rows=[...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],at=rows.indexOf(this.document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closePageContextMenu()}else if(['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)){event.preventDefault();event.stopPropagation();const index=event.key==='Home'?0:event.key==='End'?rows.length-1:(at+(event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey?-1:1)+rows.length)%rows.length;rows[index]?.focus({preventScroll:true});rows[index]?.scrollIntoView({block:'nearest'})}})
  this.document.body.append(element);this.positionPageContextMenu()
  // A real native popup will focus its own first row. Never take the source
  // document's focus from the live webpage just to prepare the projection.
  if(!this.state?.nativeMenus&&this.document.hasFocus())element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true})
 }
 private cancelQuestion(deleteImage=false){this.questionEpoch++;const question=this.question;this.question=undefined;if(!question)return;void this.bridge.request('region-cancel',{operationId:question.operationId}).catch(()=>{});void this.bridge.question?.(question.state.ownerSessionId,{kind:deleteImage?'delete':'close',ticket:question.ticket}).catch(()=>{})}
 private questionValid(q:NonNullable<BrowserAppView['question']>){return !this.disposed&&!this.root.hidden&&this.host.current()?.surface==='browser'&&this.question===q&&this.tab()?.id===q.tabId&&this.tab()?.url===q.url&&((this.sessionId||null)===q.state.ownerSessionId||!this.sessionId&&q.pendingHandoff===q.state.ownerSessionId)}
 private presentQuestion(first=false){const q=this.question;if(!q?.operationId||!q.rect||!this.questionValid(q))return Promise.resolve();return this.bridge.request('region-question',{operationId:q.operationId,...(first?{rect:q.rect}:{}),state:q.state}).then(()=>{})}
 async contextAction(value:any){
  if(this.disposed||this.root.hidden||this.host.current()?.surface!=='browser'||!value||value.tabId!==this.tab()?.id||value.url!==this.tab()?.url||value.ownerSessionId!==this.sessionId||typeof value.contextToken!=='string')return
  try{
   await this.bridge.request('context-authorize',{contextToken:value.contextToken});if(this.root.hidden||this.host.current()?.surface!=='browser'||value.tabId!==this.tab()?.id||value.url!==this.tab()?.url||value.ownerSessionId!==this.sessionId)return;this.dismiss(false)
   if(value.action==='translate'){const selection=await this.bridge.translationModel?.(this.sessionId||null);await this.run('translation-start',{contextToken:value.contextToken,selection});return}
   if(value.action==='translation-restore'||value.action==='translation-stop'){const result=await this.run(value.action,{contextToken:value.contextToken});if(value.action==='translation-restore')this.toast(result?.translation?.error||'已还原页面语言。',!!result?.translation?.error);return}
   if(value.action==='ask-ework'){await this.askRegion(value);return}
   if(['save-page','save-image','print','reload'].includes(value.action)){const method=value.action==='save-page'?'save':value.action;const result=await this.run(method,{id:value.tabId,contextToken:value.contextToken});if(method==='save'&&result.saved)this.toast('网页已保存')}
  }catch(error){this.toast(error instanceof Error?error.message:String(error),true)}
 }
 private async askRegion(value:any){
  if(this.questionStarting||!this.bridge.question||!this.state?.nativeRegion)return;this.questionStarting=true;this.cancelQuestion();const generation=this.questionEpoch,owner=this.sessionId||null
  try{
   const state=await this.bridge.question(owner,{kind:'prepare'});if(generation!==this.questionEpoch||this.root.hidden||this.host.current()?.surface!=='browser'||(this.sessionId||null)!==owner||state.ownerSessionId!==owner){void this.bridge.question(owner,{kind:'close',ticket:state.ticket}).catch(()=>{});return}this.question={ticket:state.ticket,state,tabId:value.tabId,url:value.url,contextToken:value.contextToken}
   // Expanding the resident conversation changes the page viewport. Wait for its
   // final native bounds before starting selection, never crop a pre-expansion rect.
   let previous='',stable=0
   for(let i=0;i<36;i++){await new Promise<void>(resolve=>this.document.defaultView!.requestAnimationFrame(()=>resolve()));await this.layout();const box=this.root.querySelector('[data-browser-viewport]')?.getBoundingClientRect(),next=box?JSON.stringify([box.x,box.y,box.width,box.height]):'';stable=next===previous?stable+1:0;previous=next;if(i>=3&&stable>=3)break}
   if(!this.question||generation!==this.questionEpoch||!this.questionValid(this.question))throw Error('当前网页已变化，请重新框选。')
   const capture=await this.bridge.request('region-start',{contextToken:value.contextToken,dark:this.root.dataset.dark==='true'})
   const q=this.question;if(!capture||!q||generation!==this.questionEpoch||!this.questionValid(q)){if(capture?.operationId)void this.bridge.request('region-cancel',{operationId:capture.operationId}).catch(()=>{});if(generation===this.questionEpoch)this.cancelQuestion();return}q.operationId=capture.operationId;q.rect=capture.rect
   const attached=await this.bridge.question(q.state.ownerSessionId,{kind:'attach',ticket:q.ticket,png:capture.png,name:capture.name});if(attached.ownerSessionId===q.state.ownerSessionId&&attached.draftRev>=q.state.draftRev)q.state=attached;if(this.question===q&&generation===this.questionEpoch&&this.questionValid(q))await this.presentQuestion(true)
  }catch(error){if(generation===this.questionEpoch)this.cancelQuestion();throw error}finally{this.questionStarting=false}
 }
 async regionEvent(value:BrowserRegionOverlayEvent){
  const q=this.question;if(!q||!q.operationId||value.operationId!==q.operationId||!this.questionValid(q))return
  if(value.kind==='close'||value.kind==='delete'){this.cancelQuestion(value.kind==='delete');return}
  if(!['draft','send','undo','redo'].includes(value.kind))return
  try{
   const state=await this.bridge.question?.(q.state.ownerSessionId,value.kind==='draft'?{kind:'edit',ticket:q.ticket,draft:value.draft,draftRev:value.draftRev,sequence:value.sequence,syncVersion:value.syncVersion}:value.kind==='send'?{kind:'send',ticket:q.ticket,draftRev:q.state.draftRev}:{kind:value.kind as 'undo'|'redo',ticket:q.ticket})
   if(!state||this.question!==q||state.ownerSessionId===q.state.ownerSessionId&&state.draftRev<q.state.draftRev)return;q.state=state;if(state.sent||!state.active)this.cancelQuestion();else await this.presentQuestion()
  }catch(error){if(this.question===q){q.state={...q.state,busy:false,error:error instanceof Error?error.message:String(error)};await this.presentQuestion().catch(()=>{})}}
 }
 private prepareExternalOverlay=()=>{this.closePageContextMenu();if(!this.root.hidden&&(this.panel||this.suggestions||this.findOpen))this.dismiss(false)}
 private nativeMenuDismiss=()=>{this.closePageContextMenu();if(!this.root.hidden&&(this.panel||this.suggestions||this.findOpen))this.dismiss()}
 private schedule=()=>{if(this.disposed||this.frame)return;this.frame=this.document.defaultView!.requestAnimationFrame(()=>{this.frame=0;this.layout()})}
 private layout(){
  this.positionPageContextMenu()
  const center=this.document.querySelector<HTMLElement>('.pI_x6G_centerCol'),box=center?.getBoundingClientRect()
  if(box){const win=this.document.defaultView!,bottom=box.bottom>win.innerHeight?win.innerHeight-10:box.bottom;
   // The resident bottom pane owns this reserved strip, including live drag sizes.
   const reserved=Math.max(0,parseFloat(win.getComputedStyle(this.document.documentElement).getPropertyValue('--dsh-sidebar-height'))||0)
   this.root.style.left=box.left+'px';this.root.style.top=box.top+'px';this.root.style.width=box.width+'px';this.root.style.height=Math.max(0,bottom-box.top-reserved)+'px';this.root.dataset.dark=String(this.document.body.hasAttribute('data-ds-dark-theme')||this.document.documentElement.dataset.theme==='dark'||this.document.documentElement.classList.contains('dark'));if(center)this.resize?.observe(center)}
  const header=this.root.querySelector<HTMLElement>('.eb-tabs');if(header)reserveWorkspaceRightControl(header)
  if(this.panel==='bookmarks')this.positionBookmarks();if(this.panel==='tab-list')this.positionTabList()
  if(this.panel==='recent-downloads')this.positionDownloads()
  this.revealActiveTab();if(this.workspaceMotionUntil>this.document.defaultView!.performance.now())this.schedule()
  const bounds=this.root.querySelector('[data-browser-viewport]')?.getBoundingClientRect(),tab=this.tab()
  // Sample the exposed gutter inside the actual rounded corner, after height clamping.
  let cornerColor=this.root.dataset.dark==='true'?[17,17,17]:[236,236,236]
  const rounded=this.root.getBoundingClientRect(),layers=(this.document.elementsFromPoint?.(rounded.left+.5,rounded.bottom-.5)??[]).filter(layer=>!this.root.contains(layer)).reverse()
  if(!layers.length){let backdrop:Element|null=this.document.body;while(backdrop){layers.unshift(backdrop);backdrop=backdrop.parentElement}}
  for(const layer of layers){const color=this.document.defaultView!.getComputedStyle(layer).backgroundColor;if(!/^rgba?\(/.test(color))continue;const channels=color.match(/[\d.]+/g)?.map(Number);if(channels&&channels.length>=3){const alpha=channels[3]??1;cornerColor=cornerColor.map((c,i)=>Math.round((channels[i]??c)*alpha+c*(1-alpha)))}}
  // Keep the webpage behind the shell while Explore's owned pointer uses the
  // real sidebar controls. A WebContentsView would place the menu in an inset.
  const guideEntry=this.document.body.hasAttribute('data-home-guide-entry-run')
  const value={cornerColor,active:this.host.current()?.surface==='browser'&&!this.root.hidden&&!this.managingBookmarks&&!this.settings&&!this.document.querySelector('.VOzbGW_overlay'),sessionId:this.sessionId||undefined,visible:!guideEntry&&this.host.current()?.surface==='browser'&&!this.root.hidden&&!this.managingBookmarks&&!this.settings&&!!tab?.url&&!tab.error&&!this.document.querySelector('dialog[open],.VOzbGW_overlay,[data-ework-web-link-error]'),...(bounds?{bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}}:{})}
  this.root.dataset.nativePage=String(value.visible)
  if(this.findOpen&&this.state?.nativeFind&&box){const width=Math.min(468,box.width-32);Object.assign(value,{find:{focusToken:this.findFocus,tabId:this.state.activeId,text:this.findText,dark:this.root.dataset.dark==='true',icons:{up:browserIcons.up,chevron:browserIcons.chevron,close:browserIcons.close},bounds:{x:box.right-16-width,y:(bounds?.y??box.top+92)+2,width,height:58}}})}
  const signature=JSON.stringify(value);if(signature!==this.lastLayout){this.lastLayout=signature;this.layoutAck=this.bridge.request('layout',value).then(()=>true,()=>{if(signature===this.lastLayout)this.lastLayout='';return false})}
  return this.layoutAck
 }
 private async run(method:string,input:Record<string,unknown>={}){const result=await this.bridge.request(method,input);if(result?.tabs){this.state=result;this.render()}return result}
 private toast(message:string,error=false){this.notice=message;this.noticeError=error;clearTimeout(this.noticeTimer);this.render();this.noticeTimer=setTimeout(()=>{this.notice='';this.render()},5000)}
 private async show(panel:string){
  this.closePageContextMenu()
  if(this.panel===panel){this.dismiss();return}this.cancelFocusRestore();this.returningFocus=this.document.activeElement as HTMLElement
  if(panel==='tabs'){const box=this.root.querySelector('[aria-selected=true].eb-tab')?.getBoundingClientRect(),root=this.root.getBoundingClientRect();this.root.style.setProperty('--eb-tab-menu-x',Math.max(8,Math.min(root.width-316,(box?.left??root.left)-root.left))+'px')}
  if(panel==='tab-list')this.positionTabList();if(panel==='bookmarks'){this.bookmarkAnchorBar=!!this.returningFocus?.closest('.eb-bookmarks-bar');this.positionBookmarks()}
  if(panel==='recent-downloads')this.positionDownloads()
  this.panelPresented=true;this.panelOpenedAt=this.document.defaultView!.performance.now();this.suggestions=false;this.query='';this.panel=panel;this.render();this.schedule()
  if(panel==='print'){try{this.image=await this.bridge.request('capture',{id:this.tab()?.id});if(this.panel===panel)this.render()}catch{}}
  if(this.panel!==panel||!this.panelPresented)return
  if(panel==='zoom')this.focusZoom()
  else if(panel==='recent-downloads')this.root.querySelector<HTMLElement>('#eb-recent-downloads h2 button')?.focus({preventScroll:true})
  else this.root.querySelector<HTMLInputElement>('.eb-popover input')?.focus()
 }
 private positionTabList(){const root=this.root.getBoundingClientRect(),anchor=this.root.querySelector('.eb-tab-switcher')?.getBoundingClientRect();if(anchor)this.root.style.setProperty('--eb-tab-list-x',Math.max(8,Math.min(root.width-316,anchor.left-root.left))+'px')}
 private positionBookmarks(){const root=this.root.getBoundingClientRect(),anchor=this.root.querySelector(this.bookmarkAnchorBar?'.eb-bookmarks-bar [data-action=bookmarks]':'.eb-toolbar [data-action=bookmarks]')?.getBoundingClientRect();if(!anchor)return;const width=Math.min(380,root.width-32),right=Math.min(Math.max(12,root.right-anchor.right),Math.max(12,root.width-width-12));this.root.style.setProperty('--eb-bookmarks-top',Math.max(8,anchor.bottom-root.top+6)+'px');this.root.style.setProperty('--eb-bookmarks-right',right+'px')}
 private focusZoom(){(this.root.querySelector<HTMLElement>('[data-browser-panel] .eb-zoom-controls button:not(:disabled)')??this.root.querySelector<HTMLElement>('[data-browser-panel=zoom] h2 button'))?.focus({preventScroll:true})}
 private positionDownloads(){
  const root=this.root.getBoundingClientRect()
  const anchor=this.root.querySelector('.eb-toolbar [data-action=recent-downloads]')?.getBoundingClientRect()
  if(!anchor)return
  const right=Math.min(Math.max(12,root.right-anchor.right),Math.max(12,root.width-344-12))
  this.root.style.setProperty('--eb-downloads-top',Math.max(8,anchor.bottom-root.top+6)+'px')
  this.root.style.setProperty('--eb-downloads-right',right+'px')
 }
 private dismiss(restoreFocus=true){this.closePageContextMenu();this.panel='';this.panelPresented=false;this.suggestions=false;this.findOpen=false;this.query='';this.render();if(restoreFocus)this.restoreFocus();this.schedule();if(this.tab()?.url)void this.bridge.request('find',{id:this.tab()?.id,text:''}).catch(()=>{})}
 private cancelFocusRestore(){if(this.pendingFocusRestore)this.document.defaultView?.removeEventListener('focus',this.pendingFocusRestore);this.pendingFocusRestore=undefined}
 private restoreFocus(){
  // Closing a native surface returns keyboard ownership asynchronously.
  this.cancelFocusRestore();const saved=this.returningFocus;if(!saved)return
  const restore=()=>{if(!this.document.hasFocus())return;this.cancelFocusRestore();if(this.disposed||this.root.hidden)return;const field=saved.dataset.field,action=saved.dataset.action,id=saved.dataset.id,target=saved.isConnected?saved:field?[...this.root.querySelectorAll<HTMLElement>('[data-field]')].find(el=>el.dataset.field===field):[...this.root.querySelectorAll<HTMLElement>('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.id===id);target?.focus({preventScroll:true})}
  if(this.document.hasFocus())restore();else{this.pendingFocusRestore=restore;this.document.defaultView?.addEventListener('focus',restore)}
 }
 private onWorkspaceExpansion(){
  this.frozenTabs=undefined
  this.holdTabWidths=false
  this.workspaceMotionUntil=this.document.defaultView!.performance.now()+200
  this.tabMotionUntil=0
  this.render()
 }
 private navigateWorkspace(view:string){
  if(!workspaceViews.some(([id])=>id===view))return
  if(!this.sessionId){if(view==='chat')this.host.revealConversation();return}
  const owner=this.sessionId
  const find=()=>workspaceViewButton(this.document,owner,view)
  const tab=find();if(!tab?.isConnected||tab.disabled){this.toast('此会话视图暂不可用，请先打开对应会话。',true);return}
  // Reveal the resident native session before invoking its existing view action.
  // Clearing owned overlays preserves browser documents and creates no session.
  this.host.revealConversation();const current=find();if(current?.isConnected&&!current.disabled)current.click()
 }
 private row(row:BrowserLink,action='open-url',history=false){return `<button type="button" class="eb-list-row" data-action="${action}" data-url="${esc(row.url)}" data-row-id="${esc(row.id)}">${icon('globe')}<span class="eb-row-text"><strong>${esc(row.title)}</strong><small>${history?esc(new Date(row.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+' · '+esc(hostname(row.url)):esc(hostname(row.url))+(row.at?' · '+esc(new Date(row.at).toLocaleDateString()):'')}</small></span></button>`}
 private render(){
  if(this.pageContext&&!this.pageContextValid(this.pageContext))this.closePageContextMenu()
  if(this.draggingTab)return;
  if(!this.state||this.disposed||this.composing||this.closingTab)return
  const t=this.tab()!;if(!t)return
  this.root.dataset.nativeMenus=String(this.state.nativeMenus===true);this.root.dataset.nativePage=String(!!t.url&&!t.page&&!t.error&&!this.settings&&!this.managingBookmarks&&!this.document.querySelector('dialog[open],.VOzbGW_overlay,[data-ework-web-link-error]'));this.root.dataset.tabId=t.id;this.root.dataset.url=t.url;this.root.dataset.sessionId=this.sessionId
  for(const [id,page]of this.activityPages){if(!this.state.tabs.some(tab=>tab.id===id&&tab.page===page.page)){page.dispose();this.activityPages.delete(id)}else page.preserve()}
  const activity=t.page?this.activityPage(t):undefined;activity?.update(this.state)
  // Native menus and webpages can own focus while this document retains an activeElement.
  const ownsFocus=this.document.hasFocus()
  if(this.managingBookmarks)this.bookmarkManager?.update(this.state);const managerFocus=ownsFocus&&this.managingBookmarks&&this.bookmarkManager?.root.contains(this.document.activeElement)?this.document.activeElement as HTMLElement:undefined;
  const previousWorkspace=this.root.querySelector<HTMLElement>('.eb-workspace-tabs'),workspaceFrom=previousWorkspace?{width:previousWorkspace.getBoundingClientRect().width,opacity:this.document.defaultView!.getComputedStyle(previousWorkspace).opacity}:undefined;
  const previousTabWidths=new Map([...this.root.querySelectorAll<HTMLElement>('.eb-tab')].map(el=>[el.dataset.id!,el.getBoundingClientRect().width]));
  const focused=this.root.contains(this.document.activeElement)?this.document.activeElement as HTMLInputElement:undefined,key=focused?.dataset.field,selection=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:undefined,values=new Map<string,string|boolean>(),same=this.lastTab===t.id
  if(same)for(const input of this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]')){if(input.dataset.field==='start-query'||input.dataset.field==='address'&&input!==focused)continue;values.set(input.dataset.field!,input instanceof this.document.defaultView!.HTMLInputElement&&input.type==='checkbox'?input.checked:input.value)}
  const scrolls=[...this.root.querySelectorAll<HTMLElement>('.eb-start,.eb-settings,.eb-popover,.eb-tab-scroll,.eb-recent-download-list')].map(el=>({selector:'.'+el.className.split(' ')[0],top:el.scrollTop,left:el.scrollLeft}));
  this.lastTab=t.id;this.root.dataset.pageEdited=String(!!this.state.pageEdited);this.root.dataset.currentPageTitle=t.title;this.root.dataset.currentPageUrl=t.url;this.root.dataset.currentPageLoading=String(t.loading)
  const close=button('dismiss','关闭','close'),bookmark=this.state.bookmarks.some(b=>b.url===t.url)
  this.root.innerHTML=`<div class="eb-tabs workspace-app-topbar" data-crowded="${this.state.tabs.length>6}">${workspaceBackButton('','exit')}<div class="eb-app-label workspace-app-title">${icon('globe')}<span>浏览器</span></div><div class="eb-workspace-controls"><button type="button" class="eb-icon-button eb-workspace-toggle" data-action="workspace-tabs" aria-label="${this.workspaceHover.expanded?'收起':'展开'}工作区页签" title="${this.workspaceHover.expanded?'收起':'展开'}工作区页签：对话、研究、笔记、表格" aria-expanded="${this.workspaceHover.expanded}" aria-controls="eb-workspace-tabs">${icon('workspace')}</button><nav id="eb-workspace-tabs" class="eb-workspace-tabs" aria-label="工作区视图" aria-hidden="${!this.workspaceHover.expanded}" ${!this.workspaceHover.expanded?'inert':''}>${workspaceViews.map(([view,label])=>`<button type="button" data-action="workspace-view" data-view="${view}" aria-label="切换到${label}" title="${!this.sessionId&&view!=='chat'?'选择会话后可打开'+label:label}" ${!this.sessionId&&view!=='chat'?'disabled':''}>${label}</button>`).join('')}</nav></div><span class="eb-app-divider"></span><button class="eb-icon-button eb-tab-switcher" type="button" data-action="tab-list" aria-label="已打开的页签" title="已打开的页签" aria-haspopup="menu" aria-expanded="${this.panel==='tab-list'}">${icon('chevron')}</button><div class="eb-tab-scroll" role="tablist" aria-label="网页标签页" style="--eb-tab-count:${this.state.tabs.length};--eb-tabs-max:${this.state.tabs.reduce((width,tab)=>width+(tab.pinned?42:240),0)+Math.max(0,this.state.tabs.length-1)*(this.state.tabs.length>6?2:8)}px">${this.state.tabs.map(tab=>`<div role="tab" draggable="false" tabindex="${tab.id===t.id?0:-1}" aria-selected="${tab.id===t.id}" class="eb-tab" data-action="select" data-id="${tab.id}" data-pinned="${tab.pinned}" title="${esc(tab.title)}${tab.private?' · 隐私浏览':''}">${this.tabIcon(tab)}${tab.pinned?'':`<span class="eb-tab-title">${esc(tab.title)}</span><button type="button" class="eb-tab-close" tabindex="-1" aria-label="关闭 ${esc(tab.title)}" data-action="close" data-id="${tab.id}">${icon('close')}</button>`}</div>`).join('')}</div>${button('new','新标签页','plus')}</div>
  <div class="eb-toolbar">${button('back','后退','back',!t.canBack)}${button('forward','前进','forward',!t.canForward)}${button(t.loading?'stop':'reload',t.loading?'停止加载':'重新加载',t.loading?'close':'refresh',!t.url)}${button('home','主页','home')}<div class="eb-address-wrap">${button('site',t.url?'站点信息':'搜索',''+(t.url?(t.url.startsWith('https:')?'lock':'shield'):'search') as keyof typeof browserIcons,!t.url)}<input data-address data-field="address" aria-label="搜索或输入网址" role="combobox" aria-autocomplete="list" aria-expanded="${this.suggestions}" value="${esc(t.page?'odyssey://'+t.page:t.url)}" placeholder="搜索或输入网址" autocomplete="off" spellcheck="false">${this.downloadButton(t)}<button type="button" class="eb-icon-button" data-action="toggle-bookmark" aria-label="${bookmark?'取消收藏':'添加收藏'}" title="${bookmark?'取消收藏':'添加收藏'}" aria-pressed="${bookmark}" ${!t.url?'disabled':''}>${icon(bookmark?'star':'starOutline')}</button></div>${this.state.translation&&this.state.translation.state!=='idle'?`<button class="eb-translation-status" type="button" data-action="translation-progress" title="${esc(this.state.translation.state!=='translating'&&(this.state.translation.canRestore||['translated','partial'].includes(this.state.translation.state))?'点击还原原文':this.state.translation.error||'正在翻译网页')}" aria-label="${esc(this.state.translation.error||'网页翻译状态')}">${this.state.translation.state==='translating'?'翻译中 '+this.state.translation.completed+'/'+this.state.translation.total:this.state.translation.state==='translated'?'已翻译':this.state.translation.state==='partial'?'部分翻译':'翻译未完成'}</button>`:''}${button('bookmarks','收藏夹','book')}${button('menu','更多浏览器操作','more')}</div>
  ${this.state.settings.bookmarksBar&&!t.url&&!t.page&&!this.managingBookmarks&&!this.settings?`<div class="eb-bookmarks-bar">${this.state.folders.slice(0,5).map(f=>`<button data-action="folder-open" data-folder="${esc(f)}">${icon('folder')}<span class="eb-bookmark-title">${esc(f)}</span></button>`).join('')}${this.state.bookmarks.filter(b=>!b.folder).slice(0,5).map(b=>`<button data-action="open-url" data-url="${esc(b.url)}">${icon('globe')}<span class="eb-bookmark-title">${esc(b.title)}</span></button>`).join('')}<span class="eb-spacer"></span><button data-action="bookmarks">全部收藏</button></div>`:''}
  <div class="eb-content"><div class="eb-viewport" data-browser-viewport></div>${this.managingBookmarks?'<div data-bookmark-manager-host></div>':this.settings?this.settingsHTML():t.page?'<div data-browser-activity-host></div>':t.error?`<div class="eb-start eb-error"><h1>暂时无法打开这个网页</h1><p>请检查网络连接或网址是否正确，稍后再试。</p><small class="eb-muted">${esc(hostname(t.url))}</small><div class="eb-error-buttons"><button class="eb-primary" data-action="reload">重新加载</button><button data-action="external">在系统浏览器中打开</button><button data-action="back" ${!t.canBack?'disabled':''}>返回上一页</button></div><small class="eb-muted">${esc(t.error)}</small></div>`:!t.url?this.startHTML(t):''}</div>

  <div class="eb-overlay-layer">${this.panel?`<div data-browser-panel="${this.panel}" ${this.panel==='recent-downloads'?'id="eb-recent-downloads"':''} ${!this.panelPresented?'inert aria-hidden="true" style="visibility:hidden;pointer-events:none;animation:none"':''} class="eb-popover ${['menu','tabs','tab-list'].includes(this.panel)?'eb-menu':''} ${['save','clear','folder','print','add-link'].includes(this.panel)?'eb-dialog':''} ${this.panel==='print'?'eb-print':''}" role="${['menu','tabs','tab-list'].includes(this.panel)?'menu':'dialog'}" aria-label="${esc(this.panelTitle())}" ${['save','clear','folder','print','add-link'].includes(this.panel)?'aria-modal="true"':''}>${!['menu','tabs','tab-list'].includes(this.panel)?`<h2>${esc(this.panelTitle())}${close}</h2>`:''}${this.panelHTML(t)}</div>`:''}
  ${this.findOpen&&!this.state.nativeFind?`<div class="eb-popover eb-find" role="search" aria-label="页内查找"><input data-field="find" placeholder="在页面中查找" aria-label="查找内容" value="${esc(this.findText)}"><small>${t.find?.activeMatchOrdinal??0} / ${t.find?.matches??0}</small>${button('find-prev','上一个匹配','up')}${button('find-next','下一个匹配','chevron')}${close}</div>`:''}
  ${this.suggestions?`<div class="eb-popover eb-suggestions" role="listbox" aria-label="网址建议">${this.suggestionsHTML()}</div>`:''}</div>
  ${this.notice?`<div class="eb-toast" role="${this.noticeError?'alert':'status'}" data-error="${this.noticeError}">${icon(this.noticeError?'shield':'check')}${esc(this.notice)}</div>`:''}`

  if(this.managingBookmarks&&this.bookmarkManager){this.root.querySelector('[data-bookmark-manager-host]')?.append(this.bookmarkManager.root);managerFocus?.focus({preventScroll:true})}
  const activityHost=this.root.querySelector<HTMLElement>('[data-browser-activity-host]');if(activity&&activityHost)activity.mount(activityHost)
  this.applyFrozenTabs();this.animateTabWidths(previousTabWidths);const nav=this.root.querySelector<HTMLElement>('.eb-workspace-tabs'),motion=this.workspaceMotionUntil-this.document.defaultView!.performance.now();if(nav&&workspaceFrom&&motion>0&&!this.reducedMotion()){const width=nav.getBoundingClientRect().width,opacity=this.workspaceHover.expanded?'1':'0',animation=this.trackAnimation(nav,[{width:workspaceFrom.width+'px',flexBasis:workspaceFrom.width+'px',opacity:workspaceFrom.opacity},{width:width+'px',flexBasis:width+'px',opacity}],motion);void animation.finished.then(()=>animation.cancel()).catch(()=>{})}
  const bookmarkPanel=this.root.querySelector<HTMLElement>('[data-browser-panel=bookmarks]');if(bookmarkPanel&&this.panelPresented)bookmarkPanel.style.animationDelay=-Math.min(140,Math.max(0,this.document.defaultView!.performance.now()-this.panelOpenedAt))+'ms'
  for(const input of this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]')){const value=values.get(input.dataset.field!);if(value!==undefined){if(typeof value==='boolean'&&'checked'in input)input.checked=value;else input.value=String(value)}}
  if(same)for(const scroll of scrolls){const el=this.root.querySelector<HTMLElement>(scroll.selector);if(el){el.scrollTop=scroll.top;el.scrollLeft=scroll.left}}
  if(ownsFocus&&focused&&!key){const action=focused.dataset.action,id=focused.dataset.id;const target=[...this.root.querySelectorAll<HTMLElement>('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.id===id&&el.dataset.view===focused.dataset.view);target?.focus({preventScroll:true})}
  if(key&&same){const target=[...this.root.querySelectorAll<HTMLInputElement>('[data-field]')].find(el=>el.dataset.field===key);if(target){if(ownsFocus)target.focus({preventScroll:true});if(selection)try{target.setSelectionRange(selection[0]!,selection[1]!)}catch{}}}
  this.schedule()
 }
 private startHTML(t:BrowserTab){if(this.startSection&&!t.private)return this.startLibraryHTML();return `<div class="eb-start ${t.private?'eb-private':''}"><h1>${t.private?'隐私浏览':'从这里，打开一个新视野。'}</h1><p>${t.private?'关闭全部隐私标签页后，不保留本次浏览历史、Cookie 和站点数据。':'搜索网页，或直接输入网址。'}</p>${t.private?'<p>下载的文件和主动保存的收藏仍会保留。</p>':''}<div class="eb-search-form">${icon('search')}<input data-field="start-search" data-address aria-label="起始页搜索或输入网址" placeholder="搜索或输入网址"><kbd>⌘ L</kbd></div>${t.private?'<p>隐私模式不会隐藏你对网站或网络服务提供者的访问。</p>':`<div class="eb-shortcuts">${[['start-frequent','常用网站','globe'],['downloads','下载记录','download'],['start-bookmarks','我的收藏','book'],['history','最近访问','history']].map(([a,label,i])=>`<button data-action="${a}"><span class="eb-shortcut-icon">${icon(i as keyof typeof browserIcons)}</span>${label}</button>`).join('')}</div><div class="eb-section-title"><span>继续浏览</span><button data-action="history">查看全部</button></div>${this.state!.history.slice(0,3).map(row=>this.row(row)).join('')||'<p class="eb-empty">还没有浏览记录，打开网页后可在这里继续浏览。</p>'}`}</div>`}
 private startLibraryHTML(){
  const kind=this.startSection,s=this.state!,labels:Record<string,string>={frequent:'常用网站',research:'研究资料',bookmarks:'我的收藏',history:'最近访问'},description:Record<string,string>={frequent:'按实际访问次数排列的网站。',research:'保存在“研究资料”分类中的网页。',bookmarks:'你保存的全部网页和分类。',history:'按时间排列的浏览记录。'}
  let rows=kind==='history'?s.history:kind==='research'?s.bookmarks.filter(row=>row.folder==='研究资料'):s.bookmarks
  if(kind==='frequent'){const sites=new Map<string,{row:BrowserLink;count:number}>();for(const row of s.history){const host=hostname(row.url),item=sites.get(host);if(item)item.count++;else sites.set(host,{row,count:1})}rows=[...sites.values()].sort((a,b)=>b.count-a.count||b.row.at-a.row.at).slice(0,24).map(item=>item.row)}
  rows=rows.filter(row=>!this.startQuery||(row.title+' '+row.url+' '+(row.folder??'')).toLowerCase().includes(this.startQuery.toLowerCase()))
  const empty=this.startQuery?'没有匹配的结果':kind==='research'?'还没有研究资料，添加网址或将已有收藏移到“研究资料”分类。':kind==='bookmarks'?'还没有收藏，添加网址或在浏览网页时点击地址栏的收藏按钮。':'还没有浏览记录，访问网页后会显示在这里。'
  return `<div class="eb-start eb-start-library"><button class="eb-library-back" data-action="start-home">${icon('back')}返回首页</button><div class="eb-library-heading"><h1>${labels[kind]}</h1><span class="eb-spacer"></span>${['research','bookmarks'].includes(kind)?'<button class="eb-primary" data-action="add-link">添加网址</button>':''}</div><p>${description[kind]}</p><div class="eb-panel-search">${icon('search')}<input data-field="start-query" aria-label="搜索${labels[kind]}" placeholder="搜索${labels[kind]}" value="${esc(this.startQuery)}"></div><div class="eb-library-list">${rows.slice(0,200).map(row=>`<div class="eb-library-row">${this.row(row,'open-url',kind==='history')}${['research','bookmarks'].includes(kind)?`<small>${esc(row.folder||'全部收藏')}</small><button class="eb-icon-button" data-action="edit-bookmark" data-row-id="${esc(row.id)}" aria-label="编辑 ${esc(row.title)}">${icon('more')}</button>`:''}</div>`).join('')||`<p class="eb-empty">${empty}</p>`}</div></div>`
 }
 private panelTitle(){return ({bookmarks:'收藏夹',history:'历史记录',downloads:'下载','recent-downloads':'近期的下载记录',save:'添加到收藏夹',site:'站点信息',clear:'清除浏览数据',folder:'新建文件夹',print:'打印与导出 PDF','add-link':'添加网址',cookies:'Cookie 与站点数据',zoom:'页面缩放'} as Record<string,string>)[this.panel]??'浏览器菜单'}
 private toolbarDownloads(t:BrowserTab):BrowserDownload[]{
  return this.state!.downloads.filter(row=>!row.private||t.private)
 }
 private downloadButton(t:BrowserTab):string{
  const rows=this.toolbarDownloads(t)
  if(rows.some(row=>!row.private))this.downloadButtonShown=true
  if(!this.downloadButtonShown&&!rows.length)return ''
  const progress=downloadIndicator(rows)
  const label=progress?`查看下载 · ${progress.label}`:'查看下载'
  const indeterminate=!!progress&&progress.percent===undefined
  const phase=indeterminate&&!progress.paused?`style="animation-delay:-${this.document.defaultView!.performance.now()%1000}ms"`:''
  const glyph=progress?`<svg class="eb-download-ring" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
   <circle class="eb-download-ring-track" cx="10" cy="10" r="8.5"/>
   <circle class="eb-download-ring-fill" ${phase} cx="10" cy="10" r="8.5" pathLength="100" stroke-dasharray="${progress.percent??27} 100" transform="rotate(-90 10 10)"/>
   <path d="M10 5.5v8.5m-3-3 3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`:icon('download')
  const state=progress?.paused?'paused':progress?'progressing':'idle'
  return `<button type="button" class="eb-icon-button eb-download-entry" data-action="recent-downloads" data-state="${state}" ${indeterminate?'data-indeterminate':''} title="${label}" aria-label="查看下载" ${progress?`aria-description="${progress.label}"`:''} aria-haspopup="dialog" aria-expanded="${this.panel==='recent-downloads'}" aria-controls="eb-recent-downloads">${glyph}</button>`
 }
 private recentDownloads(t:BrowserTab):string{
  const rows=this.toolbarDownloads(t).slice(0,5)
  const records=rows.map(row=>{
   const {active,percent,detail,commands}=downloadDetails(row)
   const id=esc(row.id),name=esc(row.name||'未命名文件')
   const filename=row.state==='completed'
    ? `<button type="button" class="eb-recent-download-name" data-action="download-open" data-id="${id}" title="${name}" aria-label="打开 ${name}">${name}</button>`
    : `<strong class="eb-recent-download-name" title="${name}">${name}</strong>`
   const actions=commands.filter(([action])=>action!=='open').map(([action,label,glyph])=>
    `<button type="button" class="eb-icon-button" data-action="download-${action}" data-id="${id}" title="${label}" aria-label="${label} ${name}">${icon(glyph)}</button>`
   ).join('')
   const bar=active?`<div class="eb-recent-download-progress" role="progressbar" aria-label="${name}下载进度" ${percent===undefined?'':`aria-valuenow="${percent}"`}><span style="width:${percent??25}%"></span></div>`:''
   return `<article class="eb-recent-download-row" data-state="${row.state}">${icon('file')}<div class="eb-recent-download-copy">
    ${filename}<div class="eb-recent-download-meta"><small title="${esc(detail)}">${esc(detail)}</small><div class="eb-recent-download-actions">${actions}</div></div>${bar}
   </div></article>`
  }).join('')
  return `<div class="eb-recent-download-list">${records||'<p class="eb-empty">还没有下载内容</p>'}</div>
   <footer><button type="button" data-action="downloads">完整的下载记录${icon('external')}</button></footer>`
 }
 private zoomHTML(t:BrowserTab){return `<div class="eb-zoom">缩放<div class="eb-zoom-controls"><button type="button" data-action="zoom-out" aria-label="缩小" ${!t.url||t.zoom<=.25?'disabled':''}>−</button><button type="button" data-action="zoom-reset" aria-label="恢复 100%" title="恢复 100%" class="eb-zoom-reset" ${!t.url||t.zoom===1?'disabled':''}>${Math.round(t.zoom*100)}%</button><button type="button" data-action="zoom-in" aria-label="放大" ${!t.url||t.zoom>=3?'disabled':''}>+</button></div></div>`}
 private panelHTML(t:BrowserTab):string {
  const s=this.state!,footer=(inner:string)=>`<footer>${inner}</footer>`,search=(label:string)=>`<div class="eb-panel-search">${icon('search')}<input data-field="panel-query" aria-label="${label}" placeholder="${label}" value="${esc(this.query)}"></div>`
  if(this.panel==='menu')return `${menuItem('new','新标签页','plus','⌘T')}${menuItem('private','新建隐私标签页','moon','⇧⌘N')}${menuItem('restore','重新打开关闭的标签页','history','⇧⌘T',!s.closed.length)}<hr>${menuItem('bookmarks','收藏夹','book','⌥⌘B')}${menuItem('history','历史记录','history','⌘Y')}${menuItem('downloads','下载内容','download','⌥⌘J')}<hr>${this.zoomHTML(t)}${menuItem('find','在页面中查找','search','⌘F',!t.url)}${menuItem('save-page','另存网页…','file','⌘S',!t.url)}${menuItem('print','打印 / 导出 PDF…','print','⌘P',!t.url)}${menuItem('external','在系统浏览器中打开','external','',!t.url)}<hr>${menuItem('send','发送到对话','chat','',!t.url)}${menuItem('material','加入工作材料','folder','',!t.url)}${menuItem('copy','复制页面链接','copy','',!t.url)}<hr>${s.pageEdited?menuItem('undo-page','撤销网页修改','history'):''}${menuItem('settings','浏览器设置','settings')}${menuItem('clear','清除浏览数据…','shield')}`
  if(this.panel==='zoom')return this.zoomHTML(t)+(!t.url?'<small>打开网页后可调整缩放。</small>':'')
  if(this.panel==='recent-downloads')return this.recentDownloads(t)
  if(this.panel==='tab-list')return `<div class="eb-tab-heading"><span>已打开的页签</span><span>${s.tabs.length}</span></div><hr><div class="eb-tab-options">${s.tabs.map(tab=>`<button type="button" class="eb-tab-option" role="menuitemradio" aria-checked="${tab.id===s.activeId}" data-action="switch-tab" data-id="${tab.id}">${this.tabIcon(tab)}<span>${esc(tab.title)}</span>${tab.id===s.activeId?icon('check'):''}</button>`).join('')}</div>`
  if(this.panel==='tabs')return `${menuItem('reload','重新加载','refresh','⌘R',!t.url)}${menuItem('duplicate','复制标签页','copy')}${menuItem('pin',t.pinned?'取消固定标签页':'固定标签页','pin')}${menuItem('mute',t.muted?'取消标签页静音':'静音此标签页','pause')}${menuItem('close','关闭标签页','close','⌘W')}${menuItem('close-others','关闭其他标签页','close','',s.tabs.length<2)}${menuItem('restore','重新打开关闭的标签页','history','⇧⌘T',!s.closed.length)}`
  if(this.panel==='bookmarks'){
   const rows=s.bookmarks.filter(b=>(!this.folder||b.folder===this.folder)&&(!this.query||(b.title+' '+b.url).toLowerCase().includes(this.query.toLowerCase())))
   return `${search('搜索收藏')}<div class="eb-folder-heading"><button class="eb-folder-create" data-action="folder">${icon('folderPlus')}<span>新建文件夹</span></button><span class="eb-spacer"></span>${this.folder?`<button data-action="folder-all">全部收藏</button>`:''}</div>${!this.query&&!this.folder?s.folders.map(f=>`<button class="eb-list-row" data-action="folder-open" data-folder="${esc(f)}">${icon('folder')}<span class="eb-row-text"><strong>${esc(f)}</strong><small>${s.bookmarks.filter(b=>b.folder===f).length} 个网页</small></span></button>`).join(''):''}<small>${esc(this.folder||'最近收藏')}</small>${rows.map(b=>`<div class="eb-folder-heading">${this.row(b)}<button data-action="edit-bookmark" data-row-id="${esc(b.id)}" aria-label="编辑 ${esc(b.title)}">${icon('more')}</button></div>`).join('')||'<p class="eb-empty">没有匹配的收藏</p>'}${footer(`<button data-action="import">导入收藏</button><span class="eb-spacer"></span>${this.folder?`<button data-action="folder-rename">重命名</button><button data-action="folder-remove">移除文件夹</button>`:'<button data-action="manage-bookmarks">管理收藏</button>'}`)}`
  }
  if(this.panel==='add-link')return `<label>名称<input class="eb-field" data-field="link-title" maxlength="1024" placeholder="网页名称（可选）"></label><label>网址<input class="eb-field" data-field="link-url" placeholder="https://" type="url" required></label><small>保存到${this.startSection==='research'?'研究资料':'全部收藏'}</small>${footer('<span class="eb-spacer"></span><button data-action="dismiss">取消</button><button class="eb-primary" data-action="add-link-save">添加</button>')}`
  if(this.panel==='save'){const b=this.editingBookmark??s.bookmarks.find(b=>b.url===t.url);return `<label>名称<input class="eb-field" data-field="bookmark-title" value="${esc(b?.title??t.title)}" maxlength="1024"></label><label>文件夹<span class="eb-select eb-folder-select">${icon('folder')}<select class="eb-field" data-field="bookmark-folder"><option value="">全部收藏</option>${s.folders.map(f=>`<option ${f===b?.folder?'selected':''}>${esc(f)}</option>`).join('')}</select>${icon('chevron')}</span></label><div class="eb-bookmark-url">${icon('globe')}<small title="${esc(b?.url??t.url)}">${esc(hostname(b?.url??t.url))}</small></div>${footer(`${b?'<button data-action="bookmark-remove">移除</button>':''}<span class="eb-spacer"></span><button data-action="dismiss">取消</button><button class="eb-primary" data-action="bookmark-save">完成</button>`)}`}
  if(this.panel==='folder')return `<label>文件夹名称<input class="eb-field" data-field="folder-name" maxlength="100" value="${esc(this.folder)}"></label>${footer('<span class="eb-spacer"></span><button data-action="dismiss">取消</button><button class="eb-primary" data-action="folder-save">完成</button>')}`
  if(this.panel==='site')return `<div class="eb-site-security">${icon(t.url.startsWith('https:')?'lock':'shield')}<strong>${esc(hostname(t.url))}</strong></div><p class="eb-site-description">${t.url.startsWith('https:')?'连接安全 · 网站身份已验证':'连接未加密，请勿输入敏感信息'}</p><hr>${[['geolocation','位置','globe'],['camera','摄像头','shield'],['microphone','麦克风','chat'],['downloads','自动下载','download'],['popups','弹出窗口','more']].map(([p,label,glyph])=>{const value=s.sitePermissions?.[p!]??(p==='popups'?'block':p==='downloads'?'allow':'ask');return `<div class="eb-site-permission">${icon(glyph as keyof typeof browserIcons)}<span>${label}</span><span class="eb-select"><select data-permission="${p}" aria-label="${label}">${[['ask','询问'],['allow','允许'],['block','阻止']].filter(([v])=>!['downloads','popups'].includes(p!)||v!=='ask').map(([v,label])=>`<option value="${v}" ${value===v?'selected':''}>${label}</option>`).join('')}</select>${icon('chevron')}</span></div>`}).join('')}<button class="eb-site-link" data-action="site-cookies">${icon('settings')}<span>Cookie 与站点数据</span>${icon('forward')}</button><button class="eb-site-link" data-action="settings"><span>站点设置</span>${icon('external')}</button>`
  if(this.panel==='cookies')return `<p class="eb-site-description">${esc(hostname(t.url))}</p><p>此网站当前保存了 ${this.siteCookieCount} 个 Cookie。</p><small>清理后可能需要重新登录，此网站的本地存储也会清除。</small>${footer('<span class="eb-spacer"></span><button data-action="dismiss">取消</button><button class="eb-primary" data-action="site-clear">清除站点数据</button>')}`
  if(this.panel==='clear')return `<p>仅清理客户端内浏览器的数据。</p><label>时间范围<select class="eb-field" data-field="clear-range"><option value="week">最近 7 天</option><option value="hour">最近 1 小时</option><option value="day">最近 24 小时</option><option value="all">所有时间</option></select></label>${[['history','浏览历史记录','访问过的网址与最近关闭的标签页'],['cookies','Cookie 与站点数据','将清理所选时间访问站点的数据，可能需要重新登录'],['cache','缓存的图片和文件','清理所有时间缓存，释放本地空间']].map(([name,label,description])=>`<div class="eb-option"><label><input type="checkbox" data-field="clear-${name}" ${name==='history'?'checked':''}><span>${label}<small style="display:block">${description}</small></span></label></div>`).join('')}<small>已保存的收藏、下载文件和工作材料会保留。</small>${footer('<span class="eb-spacer"></span><button data-action="dismiss">取消</button><button class="eb-primary" data-action="clear-confirm">清除数据</button>')}`
  if(this.panel==='print')return `<div class="eb-print-body">${this.image?`<img class="eb-print-preview" src="${esc(this.image)}" alt="当前网页预览">`:'<div class="eb-print-preview"></div>'}<div class="eb-print-options"><label>目标<span class="eb-select"><select data-field="print-target"><option value="pdf">另存为 PDF</option><option value="printer">系统打印机</option></select>${icon('chevron')}</span></label><label>页面<input data-field="print-pages" aria-label="打印页码" placeholder="全部（或 1-3,5）"></label><label>布局<span class="eb-select"><select data-field="print-layout"><option value="portrait">纵向</option><option value="landscape">横向</option></select>${icon('chevron')}</span></label><label>纸张<span class="eb-select"><select data-field="print-paper"><option>A4</option><option>Letter</option></select>${icon('chevron')}</span></label><label>边距<span class="eb-select"><select data-field="print-margins"><option value="default">默认</option><option value="none">无</option></select>${icon('chevron')}</span></label><label>缩放<span class="eb-select"><select data-field="print-scale"><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="1.25">125%</option></select>${icon('chevron')}</span></label></div></div>${footer(`<small>预览当前网页，分页以导出结果为准</small><span class="eb-spacer"></span><button data-action="dismiss">取消</button><button data-action="print-confirm" class="eb-primary">${icon('download')}<span data-print-label>保存 PDF</span></button>`)}`
  return ''
 }
 private activityPage(tab:BrowserTab){
  let page=this.activityPages.get(tab.id);if(page)return page
  page=new BrowserActivityPage(this.document,tab.page!,{request:async(method,input={})=>{if(method==='download'&&input.action==='material'&&!this.sessionId)throw Error('请先选择一个对话，再加入工作材料。');return this.run(method,method==='download'?{...input,sessionId:this.sessionId}:input)},openUrl:url=>{this.startSection='';this.dismiss();this.settings=false;this.managingBookmarks=false;this.image='';void this.run('new',{url}).catch(error=>this.toast(error.message,true))},clearHistory:()=>{void this.show('clear').catch(error=>this.toast(error.message,true))},notify:(message,error)=>this.toast(message,error)});this.activityPages.set(tab.id,page);return page
 }
 private async openInternal(page:'history'|'downloads'){this.managingBookmarks=false;this.settings=false;this.startSection='';this.findOpen=false;this.dismiss();this.image='';await this.run('internal-page',{page});const tab=this.tab();if(tab?.page)this.activityPage(tab).focusSearch()}
 private async openAddress(value:string){const page=/^odyssey:\/\/(history|downloads)\/?$/i.exec(value.trim())?.[1]?.toLowerCase();if(page==='history'||page==='downloads'){await this.openInternal(page);return}this.dismiss();this.image='';this.settings=false;this.managingBookmarks=false;await this.run('navigate',{id:this.tab()?.id,url:value})}
 private settingsHTML(){const s=this.state!.settings;return `<div class="eb-settings"><h1>浏览器设置</h1><p>设置只作用于客户端内的浏览器。</p><h3>常规</h3><label class="eb-setting"><span>默认搜索引擎</span><select data-setting="engine" aria-label="默认搜索引擎">${['Google','Bing','百度'].map(v=>`<option ${v===s.engine?'selected':''}>${v}</option>`).join('')}</select></label><label class="eb-setting"><span>启动时</span><select data-setting="startup" aria-label="启动时"><option value="restore" ${s.startup==='restore'?'selected':''}>继续上次浏览</option><option value="new" ${s.startup==='new'?'selected':''}>新标签页</option></select></label><label class="eb-setting"><span>显示收藏栏</span><select data-setting="bookmarksBar" aria-label="显示收藏栏"><option value="true" ${s.bookmarksBar?'selected':''}>开启</option><option value="false" ${!s.bookmarksBar?'selected':''}>关闭</option></select></label><h3>下载</h3><button class="eb-setting" data-action="download-location">下载位置<span class="eb-spacer"></span><small>${esc(s.downloadPath||'下载文件夹')}</small>${icon('forward')}</button><label class="eb-setting"><span>每次下载前询问保存位置</span><select data-setting="askDownload" aria-label="每次下载前询问保存位置"><option value="false" ${!s.askDownload?'selected':''}>关闭</option><option value="true" ${s.askDownload?'selected':''}>开启</option></select></label><h3>隐私与安全</h3><button class="eb-setting" data-action="site" ${!this.tab()?.url?'disabled':''}><span>站点权限<small>按站点管理位置、摄像头、麦克风等权限</small></span><span class="eb-spacer"></span><small>管理</small>${icon('forward')}</button><button class="eb-setting" data-action="clear"><span>清除浏览数据<small>历史记录、Cookie、缓存可以单独清理</small></span><span class="eb-spacer"></span><small>选择数据…</small>${icon('forward')}</button><button data-action="settings-close">返回浏览器</button></div>`}
 private suggestionsHTML(){const q=this.root.querySelector<HTMLInputElement>('[data-field=address]')?.value??this.query;this.suggestionRows=[{id:'search',url:q,title:`搜索「${q}」`,at:0},...this.state!.history.concat(this.state!.bookmarks).filter((r,i,all)=>all.findIndex(x=>x.url===r.url)===i&&(r.title+' '+r.url).toLowerCase().includes(q.toLowerCase())).slice(0,5)];return this.suggestionRows.map((r,i)=>`<button class="eb-list-row" role="option" aria-selected="${i===this.suggestionIndex}" data-action="suggestion" data-index="${i}">${icon(i?'history':'search')}<span class="eb-row-text"><strong>${esc(r.title)}</strong>${i?`<small>${esc(r.url)}</small>`:''}</span></button>`).join('')}
 private field(name:string){return this.root.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-field="${name}"]`)?.value??''}
 private addressBlur=()=>{this.addressBlurred=true;this.tabPointerCancel()}
 private addressPointer=(event:PointerEvent)=>{this.tabPointerMove(event);const input=(event.target as Element).closest<HTMLInputElement>('[data-field=address]');this.addressPress=input&&event.button===0?{x:event.clientX,y:event.clientY,select:this.addressBlurred||this.document.activeElement!==input}:undefined;this.addressBlurred=false}
 private click=(event:MouseEvent)=>{const ignore=this.document.defaultView!.performance.now()<this.ignoreTabClickUntil;this.ignoreTabClickUntil=0;if(ignore&&event.detail>0&&(event.target as Element).closest('.eb-tab')){event.preventDefault();event.stopPropagation();return}const address=(event.target as Element).closest<HTMLInputElement>('[data-field=address]');if(address){const press=this.addressPress;this.addressPress=undefined;if(press?.select&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<4){event.preventDefault();address.select()}return}const target=(event.target as Element).closest<HTMLElement>('[data-action]');if(!target||target.hasAttribute('disabled'))return;event.preventDefault();event.stopPropagation();void this.action(target.dataset.action!,target).catch(error=>this.toast(error instanceof Error?error.message:String(error),true))}
 private async action(action:string,target?:HTMLElement){
  this.closePageContextMenu()
  const t=this.tab();if(!t)return
  if(['select','new','private','open-url','suggestion','home','settings','reload','back','forward','close'].includes(action))this.managingBookmarks=false
  if(action==='translation-progress'){const status=this.state?.translation;if(status&&status.state!=='translating'&&(status.canRestore||['translated','partial'].includes(status.state))){await this.run('translation-restore');return}this.toast(status?.error||(status?.state==='translating'?'网页正在翻译，可通过右键菜单停止。':'当前页面没有可还原的翻译。'),status?.state==='error');return}
  if(action==='workspace-tabs'){this.workspaceHover.setExpanded(!this.workspaceHover.expanded);return}
  if(action==='workspace-view'){this.navigateWorkspace(target?.dataset.view??'');return}
  if(['send','material','download-material'].includes(action)&&!this.sessionId){this.dismiss();this.toast('请先选择一个对话，再添加网页来源或工作材料。',true);return}
  if(action==='history'||action==='downloads'){await this.openInternal(action);return}
  if(action.startsWith('start-')){this.startSection=action==='start-home'?'':action.slice(6);this.startQuery='';this.dismiss();this.render();return}
  if(action==='add-link'){await this.show('add-link');return}
  if(action==='add-link-save'){const url=this.field('link-url').trim();if(!/^https?:\/\/[^\s]+$/i.test(url)&&!(/^[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/.test(url))){this.toast('请输入有效的网址。',true);return}await this.run('bookmark',{url,title:this.field('link-title'),folder:this.startSection==='research'?'研究资料':''});this.dismiss();this.toast('网址已添加');return}
  if(action==='home')this.startSection=''
  if(action==='exit'){this.host.back();return}
  if(action==='dismiss'){this.dismiss();return}
  if(action==='toggle-bookmark'){if(!t.url||this.bookmarkBusy)return;this.bookmarkBusy=true;try{await this.run('bookmark',{url:t.url,title:t.title,remove:this.state!.bookmarks.some(b=>b.url===t.url)})}finally{this.bookmarkBusy=false}return}
  if(action==='save')this.editingBookmark=undefined;
  if(['menu','tabs','tab-list','bookmarks','recent-downloads','save','clear','print','folder','zoom'].includes(action)){if(action==='folder')this.folder='';await this.show(action);return}
  if(action==='switch-tab'){await this.run('select',{id:target?.dataset.id});this.dismiss();this.root.querySelector<HTMLElement>('[data-action=tab-list]')?.focus();return}
  if(action==='close'){await this.closeAnimated(target?.dataset.id??t.id);return}
  if(action==='select'){this.settings=false;this.image='';this.panel='';await this.run('select',{id:target?.dataset.id});this.focusTab();return}
  if(action==='new'||action==='private'){this.startSection='';this.startQuery='';this.dismiss();this.settings=false;this.image='';await this.run('new',{private:action==='private'});this.root.querySelector<HTMLInputElement>('[data-field=address]')?.focus();return}
  if(action==='open-url'||action==='suggestion'){const url=action==='suggestion'?this.suggestionRows[Number(target?.dataset.index)]?.url:target?.dataset.url;if(url)await this.openAddress(url);return}
  if(action==='folder-open'){this.folder=target?.dataset.folder??'';if(this.panel==='bookmarks'){this.render();this.schedule()}else await this.show('bookmarks');return}
  if(action==='folder-all'){this.folder='';this.render();return}
  if(action==='folder-rename'){this.panel='folder';this.render();return}
  if(action==='folder-remove'){await this.run('folder-remove',{name:this.folder});this.folder='';this.render();return}
  if(action==='folder-save'){await this.run(this.folder?'folder-rename':'folder',{name:this.field('folder-name'),previous:this.folder});this.panel='bookmarks';this.folder='';this.render();return}
  if(action==='manage-bookmarks'){
   this.bookmarkManager??=new BrowserBookmarkManager(this.document,{request:(method,input)=>this.run(method,input),close:()=>{this.managingBookmarks=false;this.render();this.schedule()},openUrl:url=>{this.managingBookmarks=false;this.settings=false;this.dismiss();void this.run('navigate',{id:this.tab()?.id,url}).catch(error=>this.toast(error.message,true))},notify:(message,error)=>this.toast(message,error)});this.managingBookmarks=true;this.settings=false;this.dismiss();return
  }
  if(action==='edit-bookmark'){const b=this.state!.bookmarks.find(b=>b.id===target?.dataset.rowId);if(b){this.editingBookmark=b;await this.show('save')}return}
  if(action==='bookmark-save'||action==='bookmark-remove'){await this.run('bookmark',{url:this.editingBookmark?.url??t.url,title:this.field('bookmark-title'),folder:this.field('bookmark-folder'),remove:action==='bookmark-remove'});this.dismiss();this.toast(action==='bookmark-save'?'已保存到收藏夹':'已移除收藏');return}
  if(action==='history-all'||action==='history-closed'){this.recent=action==='history-closed';this.render();return}
  if(action==='download-location'){await this.run('settings',{chooseDirectory:true});return}
  if(action.startsWith('download-')){
   const id=target?.dataset.id
   if(!id||this.downloadActionsInFlight.has(id))return
   this.downloadActionsInFlight.add(id)
   try{
    await this.run('download',{id,action:action.slice(9),sessionId:this.sessionId})
    if(action==='download-material')this.toast('下载文件已加入工作材料')
   }finally{this.downloadActionsInFlight.delete(id)}
   return
  }
  if(action==='site-cookies'){const data=await this.bridge.request('site-data',{id:t.id});this.siteCookieCount=data.cookies;await this.show('cookies');return}
  if(action==='site-clear'){await this.run('site-clear',{id:t.id});this.dismiss();this.toast('已清除当前网站的 Cookie 与站点数据');return}
  if(action==='settings'){this.panel='';this.settings=true;this.render();return}
  if(action==='settings-close'){this.settings=false;this.render();return}
  if(action==='clear-confirm'){const checked=(name:string)=>this.root.querySelector<HTMLInputElement>(`[data-field="clear-${name}"]`)?.checked===true;await this.run('clear',{range:this.field('clear-range'),history:checked('history'),cookies:checked('cookies'),cache:checked('cache')});this.dismiss();this.toast('已清除所选浏览数据');return}
  if(action==='site'){await this.show('site');const site=await this.bridge.request('site',{id:t.id});if(this.state){this.state.sitePermissions=site.permissions??{};this.render()}return}
  if(action==='find'&&t.page){this.findOpen=false;this.activityPage(t).focusSearch();this.schedule();return}
  if(action==='find'){this.findFocus++;this.panel='';this.findOpen=true;this.suggestions=false;if(this.state?.nativeFind){this.image='';this.render();this.schedule();return}this.render();this.root.querySelector<HTMLInputElement>('[data-field=find]')?.focus();return}
  if(action==='find-next'||action==='find-prev'){await this.run('find',{id:t.id,text:this.findText,next:true,forward:action==='find-next'});return}
  if(action==='print-confirm'){const method=this.field('print-target')==='printer'?'print':'pdf',result=await this.run(method,{id:t.id,landscape:this.field('print-layout')==='landscape',paper:this.field('print-paper'),pages:this.field('print-pages'),scale:Number(this.field('print-scale')),margins:this.field('print-margins')});if(result?.saved||method==='print'){this.dismiss();this.toast(method==='pdf'?'PDF 已保存':'已发送到打印机')}return}
  if(action==='send'){const source={title:t.title,url:t.url,at:Date.now()},owner=this.sessionId;await this.bridge.source(owner,source);if(this.sessionId===owner){this.dismiss();this.toast('已附带网页来源，请在对话中输入你的问题。')}return}
  if(action==='material'){const owner=this.sessionId;await this.run('material',{id:t.id,sessionId:owner});if(owner===this.sessionId){this.dismiss();this.toast('网页来源已加入工作材料')}return}
  if(action==='import'){await this.run('import');this.toast('收藏已导入');return}
  if(action==='save-page'){const result=await this.run('save',{id:t.id});if(result.saved){this.dismiss();this.toast('网页已保存')}return}
  if(action.startsWith('zoom-')){if(!t.url)return;const value=action==='zoom-reset'?1:Math.max(.25,Math.min(3,Math.round((t.zoom+(action==='zoom-in'?.1:-.1))*100)/100));if(value===t.zoom)return;const panel=this.panel;await this.run('zoom',{id:t.id,value});if(['zoom','menu'].includes(this.panel)&&(!this.root.contains(this.document.activeElement)||(this.document.activeElement as HTMLButtonElement)?.disabled))this.focusZoom();return}
  this.image='';this.settings=false;this.panel='';await this.run(action,{id:target?.dataset.id??t.id});if(action==='copy')this.toast('已复制页面链接')
 }
 private compositionStart=()=>{this.composing=true}
 private compositionEnd=(event:Event)=>{this.composing=false;this.input(event);this.render()}
 private input=(event:Event)=>{if(this.composing||(event as InputEvent).isComposing)return;const input=event.target as HTMLInputElement;if(input.dataset.field==='start-query'){this.startQuery=input.value;this.render()}else if(input.dataset.field==='panel-query'){this.query=input.value;this.render()}else if(input.dataset.field==='address'){this.panel='';this.panelPresented=false;this.findOpen=false;this.query=input.value;this.suggestions=!!input.value;this.suggestionIndex=0;this.render()}else if(input.dataset.field==='find'){this.findText=input.value;void this.run('find',{id:this.tab()?.id,text:this.findText}).catch(()=>{})}}
 private change=(event:Event)=>{const el=event.target as HTMLSelectElement;if(el.dataset.field==='print-target'){const label=this.root.querySelector('[data-print-label]');if(label)label.textContent=el.value==='pdf'?'保存 PDF':'打印'};if(el.dataset.setting)void this.run('settings',{[el.dataset.setting]:['bookmarksBar','askDownload'].includes(el.dataset.setting)?el.value==='true':el.value}).catch(error=>this.toast(error.message,true));if(el.dataset.permission)void this.run('permission',{id:this.tab()?.id,permission:el.dataset.permission,value:el.value}).catch(error=>this.toast(error.message,true))}
 private focusTab(){this.root.querySelector<HTMLElement>('.eb-tab[aria-selected=true]')?.focus({preventScroll:true})}
 private reducedMotion(){return this.document.defaultView!.matchMedia('(prefers-reduced-motion: reduce)').matches}
 private applyFrozenTabs(){if(this.frozenTabs)for(const el of this.root.querySelectorAll<HTMLElement>('.eb-tab')){const width=this.frozenTabs.get(el.dataset.id!)??112;el.style.flex='0 0 '+width+'px';el.style.width=width+'px';el.style.minWidth='0';el.style.maxWidth='none'}}
 private trackAnimation(el:HTMLElement,frames:Keyframe[],duration:number){const animation=el.animate(frames,{duration,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});this.tabAnimations.add(animation);void animation.finished.catch(()=>{}).then(()=>this.tabAnimations.delete(animation));return animation}
 private animateTabWidths(previous:Map<string,number>){const duration=this.tabMotionUntil-this.document.defaultView!.performance.now();if(duration<=0||this.reducedMotion()||this.frozenTabs)return;const tabs=[...this.root.querySelectorAll<HTMLElement>('.eb-tab')].map(el=>({el,from:previous.get(el.dataset.id!),to:el.getBoundingClientRect().width}));for(const {el,from,to}of tabs)if(from&&Math.abs(from-to)>.5){const animation=this.trackAnimation(el,[{flexGrow:0,flexShrink:0,flexBasis:from+'px',width:from+'px',minWidth:'0px',maxWidth:'none'},{flexGrow:0,flexShrink:0,flexBasis:to+'px',width:to+'px',minWidth:'0px',maxWidth:'none'}],duration);void animation.finished.then(()=>animation.cancel()).catch(()=>{})}}
 private releaseTabWidths=(event?:PointerEvent)=>{if(event){const r=this.root.querySelector('.eb-tabs')?.getBoundingClientRect();if(r&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)return}this.pointerInTabStrip=false;this.holdTabWidths=false;if(this.closingTab||!this.frozenTabs)return;this.frozenTabs=undefined;this.tabMotionUntil=this.document.defaultView!.performance.now()+180;this.render()}
 private tabPointerMove=(event:PointerEvent)=>{
  const drag=this.pointerTabDrag
  if(drag&&drag.pointerId===event.pointerId){
   if(!(event.buttons&1))this.tabPointerCancel()
   else{
    if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>=6){const tab=[...this.root.querySelectorAll<HTMLElement>('.eb-tab')].find(el=>el.dataset.id===drag.id);if(!tab||this.closingTab){this.tabPointerCancel();return}drag.active=true;this.draggingTab=drag.id;tab.dataset.tabDragging='true';try{this.root.setPointerCapture(event.pointerId)}catch{}}
    if(drag.active){event.preventDefault();this.tabDragPoint={x:event.clientX,y:event.clientY};this.updateTabDrop(event.clientX,event.clientY);this.scrollDraggedTab()}
   }
  }
  const r=this.root.querySelector('.eb-tabs')?.getBoundingClientRect();this.pointerInTabStrip=!!r&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;if(!this.pointerInTabStrip)this.releaseTabWidths()
 }
 private async closeAnimated(id:string){
  if(this.closingTab)return;const tabs=this.state!.tabs,index=tabs.findIndex(tab=>tab.id===id),node=[...this.root.querySelectorAll<HTMLElement>('.eb-tab')].find(el=>el.dataset.id===id);if(index<0||!node)return;
  this.holdTabWidths=this.pointerInTabStrip;this.frozenTabs??=new Map([...this.root.querySelectorAll<HTMLElement>('.eb-tab')].map(el=>[el.dataset.id!,el.getBoundingClientRect().width]));const original=new Map(this.frozenTabs),width=node.getBoundingClientRect().width,next=tabs[index+1]??tabs[index-1];this.applyFrozenTabs();let closing:Animation|undefined,growing:Animation|undefined;
  if(this.holdTabWidths&&id===this.state!.activeId&&next&&!tabs[index]!.pinned&&!next.pinned)this.frozenTabs.set(next.id,width);
  this.closingTab=id;
  if(!this.reducedMotion()&&typeof node.animate==='function'){const slot=this.document.createElement('div');slot.className='eb-tab-closing-slot';slot.style.flex='0 0 '+width+'px';node.replaceWith(slot);slot.append(node);Object.assign(node.style,{position:'absolute',left:'0',top:'0',width:width+'px',pointerEvents:'none'});const gap=parseFloat(this.document.defaultView!.getComputedStyle(slot.parentElement!).columnGap)||0;closing=this.trackAnimation(slot,[{width:width+'px',flexBasis:width+'px',opacity:1,marginRight:'0px'},{width:'0px',flexBasis:'0px',opacity:0,marginRight:-gap+'px'}],150);if(next&&this.frozenTabs.get(next.id)!==original.get(next.id)){const sibling=[...this.root.querySelectorAll<HTMLElement>('.eb-tab')].find(el=>el.dataset.id===next.id);if(sibling)growing=this.trackAnimation(sibling,[{width:original.get(next.id)+'px',flexBasis:original.get(next.id)+'px'},{width:width+'px',flexBasis:width+'px'}],150)}await closing.finished.catch(()=>{})}
  this.closingTab='';if(this.disposed)return;if(!this.holdTabWidths){this.frozenTabs=undefined;this.tabMotionUntil=this.document.defaultView!.performance.now()+180}
  try{if(this.state!.tabs.some(tab=>tab.id===id))await this.run('close',{id});else this.render();this.focusTab()}catch(error){this.frozenTabs=this.holdTabWidths?original:undefined;this.render();throw error}finally{closing?.cancel();growing?.cancel()}
 }
 private revealActiveTab(){const list=this.root.querySelector<HTMLElement>('.eb-tab-scroll');if(list)revealWorkspaceTab(list)}
 private clipTabs=()=>{const list=this.root.querySelector<HTMLElement>('.eb-tab-scroll');if(list)clipWorkspaceTabs(list)}
 private middleClick=(event:MouseEvent)=>{const tab=(event.target as Element).closest<HTMLElement>('.eb-tab');if(event.button!==1||!tab)return;event.preventDefault();void this.action('close',tab).catch(error=>this.toast(error.message,true))}
 private key=(event:KeyboardEvent)=>{
  if(event.isComposing||this.composing)return
  const el=event.target as HTMLInputElement
  const tab=el.closest<HTMLElement>('.eb-tab');if(tab&&el===tab){const tabs=this.state!.tabs,index=tabs.findIndex(t=>t.id===tab.dataset.id);if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;const target=[...this.root.querySelectorAll<HTMLElement>('.eb-tab')].find(el=>el.dataset.id===tabs[next]!.id);void this.action('select',target);return}if(event.key==='Enter'||event.key===' '){event.preventDefault();void this.action('select',tab);return}}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(this.pointerTabDrag){this.tabPointerCancel();return}if(this.panel||this.suggestions||this.findOpen){this.dismiss();return}if(this.workspaceHover.expanded){this.workspaceHover.setExpanded(false);this.root.querySelector<HTMLElement>('.eb-workspace-toggle')?.focus({preventScroll:true});return}this.dismiss();return}
  if(el.hasAttribute('data-address')&&event.key==='Enter'){event.preventDefault();event.stopPropagation();const value=this.suggestions&&this.suggestionIndex>0?this.suggestionRows[this.suggestionIndex]?.url:el.value;if(value)void this.openAddress(value).catch(error=>this.toast(error.message,true));return}
  if(el.dataset.field==='address'&&this.suggestions&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();this.suggestionIndex=(this.suggestionIndex+(event.key==='ArrowDown'?1:-1)+this.suggestionRows.length)%this.suggestionRows.length;this.render();return}
  if(el.dataset.field==='find'&&event.key==='Enter'){event.preventDefault();void this.action(event.shiftKey?'find-prev':'find-next');return}
  const modal=this.root.querySelector('[aria-modal=true]:not([inert])');if(modal&&event.key==='Tab'){const controls=[...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input,select')];if(!controls.length)return;const index=controls.indexOf(this.document.activeElement as HTMLElement);if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus()}else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0]?.focus()}}
 }
 private clearTabDrag(){this.document.defaultView!.cancelAnimationFrame(this.tabDragScrollFrame);this.tabDragScrollFrame=0;this.tabDragPoint=undefined;const pointer=this.pointerTabDrag;this.pointerTabDrag=undefined;if(pointer&&this.root.hasPointerCapture(pointer.pointerId)){try{this.root.releasePointerCapture(pointer.pointerId)}catch{}}this.draggingTab='';this.draggingBefore=undefined;for(const el of this.root.querySelectorAll<HTMLElement>('.eb-tab')){delete el.dataset.dropEdge;delete el.dataset.tabDragging}}
 private tabPointerDown=(event:PointerEvent)=>{if(event.button!==0||this.pointerTabDrag||this.closingTab)return;const target=event.target as Element,tab=target.closest<HTMLElement>('.eb-tab');if(!tab||target.closest('.eb-tab-close'))return;this.pointerTabDrag={id:tab.dataset.id!,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false}}
 private updateTabDrop(x:number,y:number){
  const scroll=this.root.querySelector<HTMLElement>('.eb-tab-scroll');for(const el of this.root.querySelectorAll<HTMLElement>('.eb-tab'))delete el.dataset.dropEdge
  if(!scroll)return false;const rect=scroll.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return false
  if(x<rect.left+24)scroll.scrollLeft-=12;else if(x>rect.right-24)scroll.scrollLeft+=12
  const hit=this.document.elementFromPoint(x,y),target=hit?.closest<HTMLElement>('.eb-tab')??scroll.querySelector<HTMLElement>('.eb-tab:last-child');if(!target||!scroll.contains(target))return false
  const box=target.getBoundingClientRect(),after=x>box.left+box.width/2,index=this.state!.tabs.findIndex(t=>t.id===target.dataset.id);if(index<0)return false;this.draggingBefore=after?this.state!.tabs[index+1]?.id:target.dataset.id;if(target.dataset.id!==this.draggingTab)target.dataset.dropEdge=after?'after':'before';return true
 }
 private scrollDraggedTab=()=>{if(this.tabDragScrollFrame||!this.pointerTabDrag?.active||!this.tabDragPoint)return;this.tabDragScrollFrame=this.document.defaultView!.requestAnimationFrame(()=>{this.tabDragScrollFrame=0;const point=this.tabDragPoint,scroll=this.root.querySelector<HTMLElement>('.eb-tab-scroll');if(!point||!scroll||!this.pointerTabDrag?.active)return;const before=scroll.scrollLeft;this.updateTabDrop(point.x,point.y);if(scroll.scrollLeft!==before)this.scrollDraggedTab()})}
 private tabPointerUp=(event:PointerEvent)=>{const drag=this.pointerTabDrag;if(!drag||drag.pointerId!==event.pointerId)return;const valid=drag.active&&this.updateTabDrop(event.clientX,event.clientY),beforeId=this.draggingBefore;if(drag.active){event.preventDefault();this.ignoreTabClickUntil=this.document.defaultView!.performance.now()+80}this.clearTabDrag();if(!drag.active)return;if(valid&&this.state?.tabs.some(t=>t.id===drag.id))void this.run('reorder',{id:drag.id,beforeId}).then(()=>this.focusTab()).catch(error=>this.toast(error.message,true));else this.render()}
 private tabPointerCancel=()=>{const drag=this.pointerTabDrag;if(!drag)return;if(drag.active)this.ignoreTabClickUntil=this.document.defaultView!.performance.now()+80;this.clearTabDrag();if(drag.active)this.render()}
 private shortcut=(event:KeyboardEvent)=>{if(this.root.hidden||this.host.current()?.surface!=='browser'||event.isComposing||this.composing||!(event.metaKey||event.ctrlKey))return;if(this.pointerTabDrag)this.tabPointerCancel();const key=event.key.toLowerCase();if(this.managingBookmarks&&key==='f'){event.preventDefault();event.stopPropagation();this.bookmarkManager?.root.querySelector<HTMLInputElement>('[data-bm-field=search]')?.focus();return}const action=key==='t'?(event.shiftKey?'restore':'new'):key==='w'?'close':key==='r'?'reload':key==='f'?'find':key==='d'?'save':key==='p'?'print':key==='s'?'save-page':key==='y'?'history':key==='j'?'downloads':key==='n'&&event.shiftKey?'private':'';if(key==='l'){event.preventDefault();event.stopPropagation();const address=this.root.querySelector<HTMLInputElement>('[data-field=address]');address?.focus();address?.select()}else if(action){event.preventDefault();event.stopPropagation();void this.action(action).catch(error=>this.toast(error.message,true))}}
 private nativeShortcut=(event:Event)=>{const key=(event as CustomEvent).detail;if(key?.key==='Escape'){this.returningFocus=undefined;this.dismiss();return}if(typeof key?.key==='string')this.shortcut(new this.document.defaultView!.KeyboardEvent('keydown',key))}
 private contextMenu=(event:Event)=>{const tab=(event.target as Element).closest<HTMLElement>('.eb-tab');if(!tab)return;event.preventDefault();void this.run('select',{id:tab.dataset.id}).then(()=>this.show('tabs'))}
 private outside=(event:Event)=>{
  const target=event.target as Element
  if(this.pageContext&&!this.pageContext.element.contains(target))this.closePageContextMenu()
  if(!this.root.hidden&&(this.panel||this.suggestions||this.findOpen)&&
     !this.root.querySelector('.eb-overlay-layer')?.contains(target)&&
     !target.closest?.('.eb-toolbar,.eb-tabs button,.eb-tabs .eb-tab-scroll,.eb-tabs .eb-workspace-controls'))this.dismiss()
 }
 dispose(){this.cancelQuestion();this.questionUnsubscribe?.();for(const page of this.activityPages.values())page.dispose();this.activityPages.clear();this.bookmarkManager?.dispose();this.disposed=true;this.workspaceHover.dispose();for(const animation of this.tabAnimations)animation.cancel();this.tabAnimations.clear();this.close();this.unsubscribe();clearTimeout(this.noticeTimer);this.observer?.disconnect();this.resize?.disconnect();this.document.defaultView?.cancelAnimationFrame(this.frame);this.document.defaultView?.removeEventListener('blur',this.addressBlur);this.document.defaultView?.removeEventListener('resize',this.schedule);this.document.defaultView?.removeEventListener('sherlock:browser-shortcut',this.nativeShortcut);this.document.removeEventListener('sherlock:browser-overlay-prepare',this.prepareExternalOverlay);this.document.removeEventListener('sherlock:browser-native-menu-dismiss',this.nativeMenuDismiss);this.document.removeEventListener('keydown',this.shortcut);this.document.removeEventListener('pointerdown',this.outside,true);this.document.removeEventListener('sherlock:browser-open',this.onOpen);this.document.removeEventListener('sherlock:browser-close',this.onClose);this.document.removeEventListener('sherlock:browser-context',this.onContext);this.document.removeEventListener('sherlock:workspace-surface-change',this.surface);this.root.remove()}
}
