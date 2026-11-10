/** Serialized host-authored finite DOM API. No model output is executable. Each
 * frame owns its originals until its document goes away, including cancelled jobs. */
export function createTranslationSurface(documentId:string){
 type RecordEntry={id:string;node:Text|Element;attribute?:string;before:string;after?:string}
 const records=new Map<string,RecordEntry>(),ids=new WeakMap<Node,Map<string,string>>(),revoked=new Map<string,number>()
 let sequence=0,active='',expires=0,sourceChars=0,restoreGeneration=0,lastGeneration=-1
 const excluded='script,style,noscript,template,head,object,embed,canvas,svg,pre,code,kbd,samp,[translate="no" i],[contenteditable]:not([contenteditable="false"]),[role="textbox"]'
 const read=(record:RecordEntry)=>record.attribute?(record.node as Element).getAttribute(record.attribute)??'':(record.node as Text).data
 const write=(record:RecordEntry,value:string)=>{if(record.attribute)(record.node as Element).setAttribute(record.attribute,value);else(record.node as Text).data=value}
 const ancestors=(element:Element,attribute=false)=>{
  let depth=0
  for(let el:Element|null=element;el;el=el.parentElement??((el.getRootNode() as ShadowRoot).host??null)){
   if(++depth>128||el.matches(excluded)||!attribute&&el.matches('input,textarea,select,option,datalist,output'))return false
   const style=el.ownerDocument.defaultView!.getComputedStyle(el)
   if(el.hasAttribute('hidden')||el.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false
  }
  return true
 }
 const eligible=(record:RecordEntry)=>{
  const el=record.attribute?record.node as Element:record.node.parentElement
  if(!el||!record.node.isConnected||record.node.ownerDocument!==document||!ancestors(el,!!record.attribute))return false
  if(record.attribute&&el.matches('input[type=password],input[type=file]'))return false
  const rect=el.getBoundingClientRect();return rect.width>0&&rect.height>0
 }
 const check=(job:string)=>{if(active!==job||revoked.has(job)||Date.now()>expires)throw Error('翻译任务已取消或过期。')}
 const pause=async(job:string)=>{await new Promise(resolve=>setTimeout(resolve,0));check(job)}
 const add=(node:Text|Element,attribute:string|undefined,items:any[],budget:{records:number;chars:number})=>{
  const name=attribute??'',known=ids.get(node)?.get(name),old=known?records.get(known):undefined
  if(old){if(old.after!==undefined||read(old)!==old.before||!eligible(old))return;items.push({id:old.id,text:old.before,viewport:inViewport(old)});return}
  const record:RecordEntry={id:'',node,attribute,before:''}
  if(!eligible(record))return
  const before=read(record)
  if(!before.trim())return
  // Preserve an explicit partial result rather than retaining unbounded originals.
  if(records.size>=10000||sourceChars+before.length>1000000||budget.records<=0||before.length>budget.chars)return false
  record.id='r'+ ++sequence;record.before=before;budget.records--;budget.chars-=before.length
  let names=ids.get(node);if(!names){names=new Map();ids.set(node,names)}names.set(name,record.id);records.set(record.id,record);sourceChars+=before.length
  items.push({id:record.id,text:before,viewport:inViewport(record)})
 }
 const inViewport=(record:RecordEntry)=>{const el=record.attribute?record.node as Element:record.node.parentElement!,r=el.getBoundingClientRect();return r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth}
 const summary=()=>({documentId,canRestore:[...records.values()].some(record=>record.after!==undefined&&record.after!==record.before),records:records.size,sourceChars})
 return async(args:any)=>{
  if(args.documentId!==documentId)throw Error('网页文档已变化。')
  if(!Number.isSafeInteger(args.generation)||args.generation<lastGeneration)throw Error('翻译操作已被新任务取代。')
  lastGeneration=args.generation
  if(args.op==='cancel'){
   if(typeof args.job==='string')revoked.set(args.job,Math.max(expires,Date.now()+1000));if(active===args.job)active=''
   restoreGeneration++
   if(args.discard){records.clear();sourceChars=0}
   return summary()
  }
  if(args.op==='restore'){
   if(active)revoked.set(active,expires);active='';const generation=++restoreGeneration;let restored=0,conflicts=0,visited=0
   for(const record of records.values()){
    if(generation!==restoreGeneration)throw Error('还原已取消。')
    if(record.after!==undefined&&record.after!==record.before){if(eligible(record)&&read(record)===record.after){write(record,record.before);restored++}else conflicts++}
    record.after=undefined
    if(++visited%128===0)await new Promise(resolve=>setTimeout(resolve,0))
   }
   records.clear();sourceChars=0
   return{...summary(),restored,conflicts}
  }
  if(args.op==='begin'){
   for(const [job,deadline]of revoked)if(deadline<Date.now())revoked.delete(job)
   if(revoked.has(args.job)||Date.now()>args.expires)throw Error('翻译任务已取消或过期。')
   active=args.job;expires=args.expires;restoreGeneration++;return summary()
  }
  check(args.job)
  if(args.op==='scan'){
   const items:any[]=[],deadline=Math.min(expires,Date.now()+3000),roots:(Document|ShadowRoot)[]=[document],maxVisits=Math.max(0,Math.min(50000,args.remainingVisits??50000)),budget={records:Math.max(0,Math.min(10000,args.remainingRecords??10000)),chars:Math.max(0,Math.min(1000000,args.remainingChars??1000000))}
   let visited=0,truncated=false,frameElements=0
   for(let rootIndex=0;rootIndex<roots.length;rootIndex++){
    const root=roots[rootIndex]!,walker=document.createTreeWalker(root===document?document.body??document.documentElement:root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT)
    for(let node=walker.nextNode();node;node=walker.nextNode()){
     check(args.job)
     if(++visited>maxVisits||Date.now()>deadline){truncated=true;break}
     if(visited%128===0)await pause(args.job)
     if(node.nodeType===Node.ELEMENT_NODE){
      const element=node as Element
      if(element.matches('iframe,frame'))frameElements++
      if(element.shadowRoot){if(roots.length<32)roots.push(element.shadowRoot);else truncated=true}
      if(!element.matches('input[type=password],input[type=file]'))for(const attribute of ['title','alt','placeholder'])if(element.hasAttribute(attribute)&&add(element,attribute,items,budget)===false)truncated=true
     }else if(node.nodeType===Node.TEXT_NODE&&add(node as Text,undefined,items,budget)===false)truncated=true
    }
    if(truncated&&visited>maxVisits||Date.now()>deadline)break
   }
   check(args.job);items.sort((a,b)=>Number(b.viewport)-Number(a.viewport))
   const conflicts=[...records.values()].filter(record=>record.after!==undefined&&(!record.node.isConnected||read(record)!==record.after)).length
   return{...summary(),items,visited,truncated,frameElements,conflicts}
  }
  if(args.op==='apply'){
   if(!Array.isArray(args.items)||args.items.length>100||JSON.stringify(args.items).length>6100000)throw Error('翻译批次过大。')
   let changed=0,conflicts=0
   // This small synchronous loop cannot interleave with a website mutation
   // observer. A cancellation queued before this call revokes it first.
   for(const item of args.items){
    check(args.job);const record=records.get(item.id)
    if(!record||typeof item.text!=='string'||item.text.length>Math.max(12000,record.before.length*6)||item.text.includes('\0'))throw Error('翻译结果无效。')
    if(record.after!==undefined||!eligible(record)||read(record)!==record.before){conflicts++;continue}
    record.after=item.text;write(record,item.text);changed++
   }
   return{...summary(),changed,conflicts}
  }
  throw Error('未知翻译操作。')
 }
}
