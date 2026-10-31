import styles from './explore-menu.css?raw'
import {createExploreOrb} from './explore-orb'
import {HOME_OPERATIONS_COPY,type HomeOperationCard,type HomeOperationExample,type HomeOperationActionContext} from './home-operations'
import {OPERATIONS_ILLUSTRATIONS,OPERATIONS_CASE_GLOWS,OPERATIONS_TREND_UP} from './home-operations-assets'
import {createHomeOperationsCarousel} from './home-operations-carousel'
import {createHomeOperationsCaseTransition} from './home-operations-case-transition'
import {createHomeThemeGallery} from './home-theme-gallery'
import type {HomeThemeController} from './home-theme-controls'
import type {ExploreResult} from './explore-search'
import searchIcon from './explore-assets/search.svg?inline'
import settingsIcon from './explore-assets/settings.svg?inline'
import closeIcon from './explore-assets/close.svg?inline'
import chevronIcon from './explore-assets/chevron.svg?inline'
import boardIcon from './explore-assets/board.svg?inline'
import noteIcon from './explore-assets/notes.svg?inline'
import chatIcon from './explore-assets/chat.svg?inline'
import sunIcon from './explore-assets/sun.svg?inline'
import moonIcon from './explore-assets/moon.svg?inline'

type Options={themeController:HomeThemeController;onBeforeOpen?():void;onToggleAppearance():Promise<void>;onAction(card:HomeOperationCard,context:HomeOperationActionContext):Promise<void>;onExample(card:HomeOperationExample,context:HomeOperationActionContext):Promise<void>}
const cards:HomeOperationCard[]=['board','note','ppt','report'],examples:HomeOperationExample[]=[...cards,'workbench']
const mounted=new WeakMap<Document,()=>void>()
const homeAppearanceIcon=(dark:boolean)=>dark?sunIcon:moonIcon

/** A single global menu; existing native owners retain navigation and preferences. */
export function mountExploreMenu(doc:Document,options:Options){
  if(mounted.has(doc))return mounted.get(doc)!
  const win=doc.defaultView!,reduced=win.matchMedia('(prefers-reduced-motion: reduce)')
  const style=doc.createElement('style');style.dataset.exploreStyle='';style.textContent=styles;doc.head.append(style)
  const dialog=doc.createElement('dialog');dialog.className='odyssey-explore';dialog.dataset.exploreMenu='';dialog.setAttribute('aria-label','探索')
  const edge=doc.createElement('div');edge.className='odyssey-explore-edge';edge.setAttribute('aria-hidden','true')
  const system=doc.createElement('div');system.className='odyssey-explore-system'
  const body=doc.createElement('section');body.className='odyssey-explore-content'
  const header=doc.createElement('header');header.className='odyssey-explore-header'
  const brand=doc.createElement('div');brand.className='odyssey-explore-brand';const name=doc.createElement('span');brand.append(createExploreOrb(doc),name)
  const tools=doc.createElement('div');tools.className='odyssey-explore-tools'
  const image=(src:string,width=20,height=width)=>{const img=doc.createElement('img');img.src=src;img.alt='';img.width=width;img.height=height;img.draggable=false;return img}
  const button=(label:string,src:string,onClick:()=>void,width=20)=>{const node=doc.createElement('button');node.type='button';node.className='odyssey-explore-tool';node.setAttribute('aria-label',label);node.title=label;node.append(image(src,width));node.onclick=onClick;return node}
  let disposed=false,opened=false,closing:Promise<void>|undefined,caseIndex=0,tab:'quick'|'wallpapers'='quick',category='all',searching=false,busy=false,appearanceBusy=false
  let accountOwner:string|null|undefined;let focusBefore:HTMLElement|null=null,action:AbortController|undefined,requestId='',openRequest='',results:ExploreResult[]=[],activeResult=0
  let outgoingTab:HTMLElement|undefined,tabAnimations:Animation[]=[],tabMotion=0,ownedDemoClose=false
  const language=()=>doc.documentElement.dataset.odysseyLocale==='en'?'en':'zh',copy=()=>HOME_OPERATIONS_COPY[language()],english=()=>language()==='en'
  const text=(zh:string,en:string)=>english()?en:zh
  const account=doc.createElement('button');account.type='button';account.className='odyssey-explore-account';account.setAttribute('aria-haspopup','menu')
  account.onclick=()=>win.dispatchEvent(new win.CustomEvent('sherlock:account-menu-request',{detail:{anchor:account}}))
  const closeButton=button('关闭探索',closeIcon,()=>{void close(!ownedDemoClose,ownedDemoClose)},26);closeButton.dataset.exploreClose='';system.append(account,closeButton)
  const searchWrap=doc.createElement('div');searchWrap.className='odyssey-explore-search-control'
  const searchButton=button('搜索会话',searchIcon,()=>setSearch(true));searchButton.setAttribute('aria-expanded','false')
  const input=doc.createElement('input');input.type='search';input.autocomplete='off';input.setAttribute('aria-label','搜索会话');input.tabIndex=-1
  const collapseSearch=button('收起搜索',closeIcon,()=>setSearch(false),26);collapseSearch.tabIndex=-1
  searchWrap.append(searchButton,input,collapseSearch)
  const settings=button('设置',settingsIcon,()=>{void close(false).then(()=>win.dispatchEvent(new win.CustomEvent('sherlock:settings-open')))});tools.append(searchWrap,settings);header.append(brand,tools)
  const tabs=doc.createElement('div');tabs.className='odyssey-explore-tabs';tabs.role='tablist'
  const quickTab=doc.createElement('button'),wallpaperTab=doc.createElement('button')
  for(const [node,key]of [[quickTab,'quick'],[wallpaperTab,'wallpapers']] as const){node.type='button';node.role='tab';node.id='odyssey-explore-'+key+'-tab';node.setAttribute('aria-controls','odyssey-explore-'+key);node.onclick=()=>selectTab(key);node.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;event.preventDefault();const next=event.key==='Home'||event.key==='ArrowLeft'?quickTab:wallpaperTab;next.click();next.focus()};tabs.append(node)}
  const appearance=button('切换为浅色',homeAppearanceIcon(false),()=>{if(appearanceBusy)return;appearanceBusy=true;appearance.disabled=true;void options.onToggleAppearance().catch(showError).finally(()=>{appearanceBusy=false;appearance.disabled=false;labels()})});appearance.dataset.exploreAppearance=''
  const navigation=doc.createElement('nav');navigation.className='odyssey-explore-navigation';navigation.append(tabs);tools.prepend(appearance);tools.append(searchWrap)
  const viewport=doc.createElement('div');viewport.className='odyssey-explore-viewport'
  const quick=doc.createElement('div');quick.className='odyssey-explore-quick';quick.id='odyssey-explore-quick';quick.role='tabpanel';quick.setAttribute('aria-labelledby',quickTab.id)
  const showcase=doc.createElement('article');showcase.className='odyssey-explore-showcase'
  const example=doc.createElement('button');example.type='button';example.className='odyssey-explore-example';example.onclick=()=>{void run(examples[caseIndex]!,true)};showcase.append(example)
  const pages=doc.createElement('div');pages.className='odyssey-explore-pages';pages.setAttribute('aria-label','用例切换')
  const dots:HTMLButtonElement[]=[]
  for(let i=0;i<examples.length;i++){const dot=doc.createElement('button');dot.type='button';dot.setAttribute('aria-label','用例 '+(i+1));dot.onclick=()=>carousel.select(i);dot.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?4:(i+(event.key==='ArrowLeft'?-1:1)+5)%5;carousel.select(next);dots[next]!.focus()};dot.append(doc.createElement('i'));dots.push(dot);pages.append(dot)}
  showcase.append(pages)
  const quickCards=doc.createElement('div');quickCards.className='odyssey-explore-create-grid'
  const createButtons=cards.map((card,index)=>{const node=doc.createElement('button');node.type='button';node.className='odyssey-explore-create';node.dataset.exploreCard=card;const label=doc.createElement('span'),art=doc.createElement('div');art.className='odyssey-explore-illustration';art.append(image(OPERATIONS_ILLUSTRATIONS.dark.normal[card],222,153));node.append(label,art);node.onclick=()=>{void run(card,false)};node.onpointerenter=()=>{art.querySelector('img')!.src=OPERATIONS_ILLUSTRATIONS[dark()?'dark':'light'].hover[card]};node.onpointerleave=()=>{art.querySelector('img')!.src=OPERATIONS_ILLUSTRATIONS[dark()?'dark':'light'].normal[card]};quickCards.append(node);return node})
  quick.append(showcase,quickCards)
  const wallpapers=doc.createElement('div');wallpapers.className='odyssey-explore-wallpapers';wallpapers.id='odyssey-explore-wallpapers';wallpapers.role='tabpanel';wallpapers.setAttribute('aria-labelledby',wallpaperTab.id)
  const gallery=createHomeThemeGallery(doc,options.themeController);wallpapers.append(gallery.element)
  const searchPanel=doc.createElement('section');searchPanel.className='odyssey-explore-results';searchPanel.setAttribute('aria-label','搜索结果');searchPanel.hidden=true
  const categories=doc.createElement('div');categories.className='odyssey-explore-categories';categories.role='tablist'
  const categoryButtons=new Map<string,HTMLButtonElement>()
  for(const key of ['all','board','session','note']){const node=doc.createElement('button');node.type='button';node.role='tab';node.onclick=()=>{category=key;activeResult=0;renderResults()};node.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const nodes=[...categoryButtons.values()],index=nodes.indexOf(node),next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowLeft'?-1:1)+nodes.length)%nodes.length;nodes[next]?.click();nodes[next]?.focus()};categoryButtons.set(key,node);categories.append(node)}
  const list=doc.createElement('div');list.className='odyssey-explore-result-list';list.role='listbox';list.setAttribute('aria-label','会话搜索结果');searchPanel.append(categories,list)
  const feedback=doc.createElement('p');feedback.className='odyssey-explore-feedback';feedback.role='status';feedback.hidden=true
  viewport.append(quick,wallpapers,searchPanel);body.append(header,navigation,viewport,feedback);dialog.append(edge,system,body);doc.body.append(dialog)
  const dark=()=>doc.body.hasAttribute('data-ds-dark-theme')
  const makeCase=(index:number)=>{const layer=doc.createElement('div');layer.className='odyssey-explore-case';const glow=image(OPERATIONS_CASE_GLOWS[dark()?'dark':'light'][index]!,490,448);glow.className='odyssey-explore-case-glow';const title=doc.createElement('h2'),strong=doc.createElement('strong'),arrow=image(OPERATIONS_TREND_UP,28);strong.textContent=copy().cases[index]![0];title.append(strong,arrow);const subtitle=doc.createElement('p');subtitle.className='odyssey-explore-case-subtitle';subtitle.textContent=copy().cases[index]![1];const description=doc.createElement('p');description.className='odyssey-explore-case-description';description.textContent=copy().cases[index]![2];layer.append(glow,title,subtitle,description);return layer}
  const transition=createHomeOperationsCaseTransition({win,card:showcase,initialIndex:caseIndex,createLayer:makeCase,onCommit:index=>{caseIndex=index;labels()}})
  const carousel=createHomeOperationsCarousel({win,card:showcase,initialIndex:caseIndex,onChange:index=>{caseIndex=index;labels();transition.select(index)}})
  function showError(error:unknown){if(disposed)return;const message=error instanceof Error?error.message:text('暂时无法完成，请稍后重试。','Please try again.');if(opened){feedback.hidden=false;feedback.textContent=message}else{const toast=doc.createElement('p');toast.className='odyssey-explore-toast';toast.role='alert';toast.textContent=message;doc.body.append(toast);win.setTimeout(()=>toast.remove(),6000)}}
  function labels(){
    name.textContent=text('探索','Explore');dialog.setAttribute('aria-label',name.textContent);quickTab.textContent=copy().heading;wallpaperTab.textContent=copy().wallpapers
    input.hidden=!searching;collapseSearch.hidden=!searching
    for(const [node,label]of [[searchButton,text('搜索会话','Search conversations')],[settings,text('设置','Settings')],[closeButton,text('关闭探索','Close Explore')],[collapseSearch,text('收起搜索','Close search')]]as const){node.title=label;node.setAttribute('aria-label',label)}
    for(const [node,key]of [[quickTab,'quick'],[wallpaperTab,'wallpapers']] as const){node.setAttribute('aria-selected',String(tab===key));node.tabIndex=tab===key?0:-1}
    quick.hidden=tab!=='quick'&&outgoingTab!==quick;quick.inert=tab!=='quick'||searching;quick.setAttribute('aria-hidden',String(tab!=='quick'||searching));wallpapers.hidden=tab!=='wallpapers'&&outgoingTab!==wallpapers;wallpapers.inert=tab!=='wallpapers'||searching;wallpapers.setAttribute('aria-hidden',String(tab!=='wallpapers'||searching));gallery.setVisible(opened&&tab==='wallpapers'&&!searching)
    const appearanceLabel=dark()?copy().light:copy().dark;appearance.title=appearanceLabel;appearance.setAttribute('aria-label',appearanceLabel);appearance.querySelector('img')!.src=homeAppearanceIcon(dark())
    createButtons.forEach((node,index)=>{node.querySelector('span')!.textContent=copy().cards[index]!;node.querySelector('img')!.src=OPERATIONS_ILLUSTRATIONS[dark()?'dark':'light'].normal[cards[index]!]})
    for(const layer of showcase.querySelectorAll<HTMLElement>('[data-odyssey-operations-case-layer]')){const index=Number(layer.dataset.case),description=layer.querySelector<HTMLElement>('.odyssey-explore-case-description');layer.querySelector('strong')!.textContent=copy().cases[index]![0];layer.querySelector('.odyssey-explore-case-subtitle')!.textContent=copy().cases[index]![1];layer.querySelector<HTMLImageElement>('.odyssey-explore-case-glow')!.src=OPERATIONS_CASE_GLOWS[dark()?'dark':'light'][index]!;if(description&&!description.hasAttribute('data-explore-preparing'))description.textContent=copy().cases[index]![2]}
    dots.forEach((node,index)=>{node.setAttribute('aria-current',String(index===caseIndex));node.setAttribute('aria-label',copy().cases[index]![1])});example.setAttribute('aria-label',copy().cases[caseIndex]![1])
    input.placeholder=text('搜索会话…','Search conversations…');input.setAttribute('aria-label',text('搜索会话','Search conversations'));for(const [key,node]of categoryButtons){node.textContent=({all:text('全部','All'),board:text('看板','Boards'),session:text('会话','Chats'),note:text('笔记','Notes')}as Record<string,string>)[key]!}
    carousel.setVisible(opened&&tab==='quick'&&!searching&&!busy);transition.setVisible(opened&&tab==='quick'&&!searching)
    gallery.refresh()
  }
  function settleTabMotion(){tabMotion++;for(const animation of tabAnimations)animation.cancel();tabAnimations=[];outgoingTab=undefined}
  function selectTab(next:typeof tab){
    if(busy||next===tab)return
    settleTabMotion();const previous=tab==='quick'?quick:wallpapers,direction=next==='wallpapers'?1:-1
    tab=next;feedback.hidden=true;body.dataset.exploreTab=tab
    if(!reduced.matches&&opened&&!searching)outgoingTab=previous
    labels();layout()
    if(!outgoingTab)return
    const incoming=tab==='quick'?quick:wallpapers,epoch=tabMotion
    tabAnimations=[previous.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-10*direction}px)`}],{duration:240,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'}),incoming.animate([{opacity:0,transform:`translateX(${10*direction}px)`},{opacity:1,transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'})]
    void Promise.allSettled(tabAnimations.map(animation=>animation.finished)).then(()=>{if(epoch!==tabMotion)return;settleTabMotion();labels()})
  }
  function layout(){if(opened&&tab==='wallpapers')gallery.layout(viewport.clientWidth,Math.max(250,win.innerHeight-240));}
  function cancelOpenResult(){if(openRequest)doc.dispatchEvent(new win.CustomEvent('sherlock:explore-search-request',{detail:{requestId:openRequest,action:'cancel'}}));openRequest='';list.removeAttribute('aria-busy')}
  function setSearch(next:boolean,restoreFocus=true){if(!opened||busy)return;settleTabMotion();if(!next)cancelOpenResult();searching=next;body.dataset.exploreSearching=String(next);searchPanel.hidden=!next;searchButton.setAttribute('aria-expanded',String(next));input.tabIndex=next?0:-1;collapseSearch.tabIndex=next?0:-1;brand.hidden=next;settings.inert=next;appearance.inert=next;navigation.inert=next;feedback.hidden=true;labels();if(next){input.focus({preventScroll:true});query()}else{input.value='';results=[];requestId='';if(restoreFocus)searchButton.focus({preventScroll:true})}}
  function query(){if(!opened||!searching)return;const id=win.crypto.randomUUID();requestId=id;doc.dispatchEvent(new win.CustomEvent('sherlock:explore-search-request',{detail:{requestId:id,action:'search',query:input.value}}))}
  function renderResults(){
    if(!opened||!searching)return
    categoryButtons.forEach((node,key)=>{node.setAttribute('aria-selected',String(category===key));node.tabIndex=key===category?0:-1})
    const filtered=results.filter(row=>category==='all'||row.kind===category);list.replaceChildren();activeResult=Math.max(0,Math.min(activeResult,filtered.length-1))
    filtered.forEach((row,index)=>{const node=doc.createElement('button');node.type='button';node.role='option';node.setAttribute('aria-selected',String(index===activeResult));node.className='odyssey-explore-result';const icon=doc.createElement('i');icon.append(image(row.kind==='board'?boardIcon:row.kind==='note'?noteIcon:chatIcon));const copy=doc.createElement('span'),title=doc.createElement('strong'),location=doc.createElement('small');title.textContent=row.title;title.dataset.uiPreserve='';location.textContent=row.location;copy.append(title,location);node.append(icon,copy);node.onclick=()=>openResult(row);node.onfocus=()=>{activeResult=index;for(const [i,item]of [...list.querySelectorAll('button')].entries())item.setAttribute('aria-selected',String(i===index))};list.append(node)})
    if(!filtered.length){const empty=doc.createElement('p');empty.className='odyssey-explore-search-empty';empty.textContent=text('没有匹配的会话','No matching conversations');list.append(empty)}
  }
  function openResult(row:ExploreResult){if(openRequest||!opened||!searching)return;openRequest=win.crypto.randomUUID();list.setAttribute('aria-busy','true');doc.dispatchEvent(new win.CustomEvent('sherlock:explore-search-request',{detail:{requestId:openRequest,action:'open',key:row.key}}))}
  const searchReply=(event:Event)=>{const data=(event as CustomEvent).detail;if(!opened)return;if(data?.requestId===openRequest){openRequest='';list.removeAttribute('aria-busy');if(data.ok)void close(false).then(()=>doc.dispatchEvent(new win.CustomEvent('sherlock:search-session-opened')));else showError(Error(data.error||text('暂时无法打开','Could not open conversation')));return}if(!searching||data?.requestId!==requestId||!Array.isArray(data.results))return;results=data.results.filter((row:any)=>typeof row.key==='string'&&typeof row.title==='string'&&['board','session','note'].includes(row.kind));renderResults()}
  input.oninput=()=>{activeResult=0;query()};input.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setSearch(false);return}const rows=[...list.querySelectorAll<HTMLButtonElement>('button')];if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();activeResult=event.key==='ArrowDown'?0:rows.length-1;rows[activeResult]?.focus()}else if(event.key==='Enter'){event.preventDefault();rows[activeResult]?.click()}}
  searchPanel.onkeydown=event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){const rows=[...list.querySelectorAll<HTMLButtonElement>('button')];event.preventDefault();rows[Math.max(0,Math.min(rows.length-1,activeResult+(event.key==='ArrowDown'?1:-1)))]?.focus()}}
  const accountState=(event:Event)=>{const state=(event as CustomEvent).detail;if(!state||typeof state.username!=='string')return;const owner=typeof state.accountId==='string'?state.accountId:null;if(accountOwner!==undefined&&accountOwner!==owner)void close(false);accountOwner=owner;account.replaceChildren();const avatar=state.avatar instanceof win.HTMLElement&&state.avatar.ownerDocument===doc?state.avatar.cloneNode(true):undefined;if(avatar)account.append(avatar);const label=doc.createElement('span');label.textContent=state.username;label.dataset.uiPreserve='';account.append(label,image(chevronIcon,15));account.setAttribute('aria-label',state.username+text('，打开账户菜单',', open account menu'))}
  function open(){if(disposed||opened)return;if(closing){void closing.then(open);return}options.onBeforeOpen?.();opened=true;focusBefore=doc.activeElement instanceof win.HTMLElement?doc.activeElement:null;feedback.hidden=true;dialog.showModal();doc.body.dataset.exploreOpen='';doc.querySelector('[data-explore-trigger]')?.setAttribute('aria-expanded','true');dialog.dataset.motion='opening';labels();layout();(tab==='quick'?quickTab:wallpaperTab).focus({preventScroll:true});win.dispatchEvent(new win.CustomEvent('sherlock:account-state-request'));}
  function close(restoreFocus=true,preserveAction=false):Promise<void>{
    if(closing){if(!preserveAction)action?.abort();return closing}if(!opened)return Promise.resolve();opened=false;settleTabMotion();labels();cancelOpenResult();requestId='';win.dispatchEvent(new win.CustomEvent('sherlock:account-menu-close'));if(!preserveAction)action?.abort();carousel.setVisible(false);transition.setVisible(false);gallery.setVisible(false);dialog.dataset.motion='closing'
    const animations=reduced.matches?[]:[dialog.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out'}),body.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(8px) scale(.985)'}],{duration:180,easing:'ease-out'})]
    closing=Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{if(dialog.open)dialog.close();animations.forEach(animation=>animation.cancel());delete doc.body.dataset.exploreOpen;doc.querySelector('[data-explore-trigger]')?.setAttribute('aria-expanded','false');delete dialog.dataset.motion;searching=false;body.dataset.exploreSearching='false';searchPanel.hidden=true;brand.hidden=false;input.value='';results=[];settings.inert=false;appearance.inert=false;navigation.inert=false;labels();if(restoreFocus&&focusBefore?.isConnected)focusBefore.focus({preventScroll:true})}).finally(()=>{closing=undefined});return closing
  }
  async function run(card:HomeOperationExample,isExample:boolean){
    if(!opened||busy)return;const controller=new win.AbortController();action=controller;busy=true;feedback.hidden=true;createButtons.forEach(node=>node.disabled=true);example.disabled=true;labels()
    const origin=example.getBoundingClientRect(),description=showcase.querySelector<HTMLElement>('[aria-hidden="false"] .odyssey-explore-case-description')
    try{
      if(isExample){if(description){description.dataset.explorePreparing='';description.textContent=copy().demoIntro}await new Promise<void>((resolve,reject)=>{const timer=win.setTimeout(resolve,reduced.matches?0:1800);controller.signal.addEventListener('abort',()=>{win.clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))},{once:true})})}
      if(controller.signal.aborted)return
      const context:HomeOperationActionContext={signal:controller.signal,origin:{x:origin.left+origin.width/2,y:origin.top+origin.height/2},revealComposer:()=>close(false,true),handoff:()=>{},...(isExample?{demoEntry:{closeTarget:closeButton,closeOwned:async()=>{if(controller.signal.aborted||!opened)throw new DOMException('操作已取消。','AbortError');ownedDemoClose=true;try{closeButton.click()}finally{ownedDemoClose=false}await closing}}}:{})}
      if(!isExample)await close(false,true);if(controller.signal.aborted)return
      if(isExample)await options.onExample(card,context);else await options.onAction(card as HomeOperationCard,context)
    }catch(error){if(!controller.signal.aborted&&!disposed)showError(error)}finally{if(action===controller){action=undefined;busy=false;createButtons.forEach(node=>node.disabled=false);example.disabled=false;if(description){delete description.dataset.explorePreparing;description.textContent=copy().cases[caseIndex]![2]}labels()}}
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(searching)setSearch(false);else void close()})
  dialog.addEventListener('click',event=>{if(event.target===dialog||event.target===edge){if(searching)setSearch(false,false);else void close()}else if(searching&&!searchPanel.contains(event.target as Node)&&!searchWrap.contains(event.target as Node))setSearch(false,false)})
  const openEvent=()=>open(),closeEvent=(event:Event)=>{void close((event as CustomEvent).detail?.restoreFocus!==false)},changed=(event:Event)=>{if((event as CustomEvent).detail?.ownerChanged){reset();return}if(opened&&searching)query()},reset=()=>{action?.abort();void close(false)}
  win.addEventListener('sherlock:explore-open',openEvent);win.addEventListener('sherlock:explore-close',closeEvent);win.addEventListener('sherlock:account-state',accountState);doc.addEventListener('sherlock:explore-search-reply',searchReply);doc.addEventListener('sherlock:explore-search-changed',changed);win.addEventListener('sherlock:skill-menu-reset',reset)
  const observer=new win.MutationObserver(()=>{labels();layout()});observer.observe(doc.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});const resize=new win.ResizeObserver(layout);resize.observe(body)
  const dispose=()=>{if(disposed)return;disposed=true;settleTabMotion();cancelOpenResult();action?.abort();carousel.dispose();transition.dispose();gallery.dispose();observer.disconnect();resize.disconnect();win.removeEventListener('sherlock:explore-open',openEvent);win.removeEventListener('sherlock:explore-close',closeEvent);win.removeEventListener('sherlock:account-state',accountState);doc.removeEventListener('sherlock:explore-search-reply',searchReply);doc.removeEventListener('sherlock:explore-search-changed',changed);win.removeEventListener('sherlock:skill-menu-reset',reset);dialog.remove();style.remove();delete doc.body.dataset.exploreOpen;mounted.delete(doc)}
  labels();mounted.set(doc,dispose);return dispose
}
