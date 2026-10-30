import type {SidebarSearchResult} from './sidebar-session-search'

export type ExploreResult=SidebarSearchResult&{kind:'board'|'session'|'note';location:string}
export type ExploreSearchSource={results(query:string):ExploreResult[];subscribe(listener:()=>void):()=>void;open(result:ExploreResult):Promise<void>;cancelOpen?():void;generation():unknown}

/** Reuses the native sidebar owner; requests cannot open stale or invented rows. */
export function installExploreSearch(doc:Document,source:ExploreSearchSource) {
  const win=doc.defaultView!;let disposed=false
  const pending=new Set<string>(),completed=new Set<string>()
  let owner=source.generation()
  const receive=(event:Event)=>{
    const value=(event as CustomEvent).detail
    if(disposed||typeof value?.requestId!=='string'||value.requestId.length>200||!['search','open','cancel'].includes(value.action))return
    if(value.action==='cancel'){if(pending.delete(value.requestId)){completed.add(value.requestId);source.cancelOpen?.()}return}
    const requestId=value.requestId,generation=source.generation()
    const reply=(extra:Record<string,unknown>)=>{if(!disposed&&source.generation()===generation)doc.dispatchEvent(new win.CustomEvent('sherlock:explore-search-reply',{detail:{requestId,...extra}}))}
    if(value.action==='search'){
      if(typeof value.query!=='string'||value.query.length>2000)return
      reply({ok:true,results:source.results(value.query)});return
    }
    const row=source.results('').find(item=>item.key===value.key)
    if(!row){reply({ok:false,error:'此会话已变化，请重新搜索。'});return}
    if(pending.has(requestId)||completed.has(requestId))return
    pending.add(requestId)
    const finish=(extra:Record<string,unknown>)=>{if(!pending.delete(requestId))return;completed.add(requestId);if(completed.size>128)completed.delete(completed.values().next().value!);reply(extra)}
    void Promise.resolve().then(()=>{if(!pending.has(requestId)||source.generation()!==generation)return;return source.open(row)}).then(()=>finish({ok:true}),error=>finish({ok:false,error:error instanceof Error?error.message:'暂时无法打开此会话。'}))
  }
  const off=source.subscribe(()=>{const ownerChanged=owner!==source.generation();if(ownerChanged){owner=source.generation();if(pending.size)source.cancelOpen?.();pending.clear();completed.clear()}doc.dispatchEvent(new win.CustomEvent('sherlock:explore-search-changed',{detail:{ownerChanged}}))})
  doc.addEventListener('sherlock:explore-search-request',receive)
  return()=>{disposed=true;if(pending.size)source.cancelOpen?.();pending.clear();completed.clear();off();doc.removeEventListener('sherlock:explore-search-request',receive)}
}
