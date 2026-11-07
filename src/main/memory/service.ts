import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { basename, isAbsolute, resolve } from 'node:path'
import { realpath, readdir, readFile, stat } from 'node:fs/promises'
import type { MemoryCandidate, MemoryCapture, MemoryCommand, MemoryInput, MemoryProject, MemoryRecall, MemoryRecord, MemoryRuntimeContext, MemoryRuntimeTurn, MemorySettings, MemorySnapshot, MemorySource, MemoryUsage } from '../../shared/memory'
import {MemoryDocument,type DocumentEntry} from './document'
import {parseEditableMemory,renderEditableMemory} from './editable-document'
import { MemoryStore, type MemoryEncryption } from './store'
import { LocalMemoryEngine, type MemorySemanticProvider, type LocalMemoryConfig } from './semantic'
import { splitMemoryImport } from './import'
import { contextualMemoryEvidence, reusableMemoryEvidence, unresolvedMemoryReference } from './capture-policy'
import { canonicalMemoryKey, MemoryRetriever, normalizedMemoryText, MEMORY_BACKGROUND_INTRO } from './retriever'

type Summary = {signature:string;scopeEpoch:number;state:'pending'|'ready'|'failed';text?:string;updatedAt?:number;model?:string;attempts:number;ownerEpoch?:string}
type State = { schemaVersion: 1; revision: number; scopeEpoch: number; secret: string; rows: Record<string,MemoryRecord>; versions: Record<string,MemoryRecord[]>; projects: Record<string,MemoryProject>; bindings: Record<string,string|null>; disabled: Record<string,boolean>; settings: MemorySettings; settingsVersion?:2; candidatePolicyVersion?:1; suppression: { key:string;content:string;sessionId?:string;seq?:number }[]; usages:MemoryUsage[]; jobs: Record<string,{turn:MemoryRuntimeTurn;state:'pending'|'done'|'failed';message?:string;attempts?:number}>; imported:string[]; documentHash?:string;documentSignature?:string;documentPending?:{previousHash?:string;targetHash:string;signature:string};summary?:Summary;summaryRoute?:{provider:string;model:string};warning?:string }
type Options = {root:string;encryption:MemoryEncryption;owner():string;isShared(sessionId:string):boolean;workspaceRoot(sessionId:string):Promise<string|null>;now?():number;legacyRoot?:string;changed?():void;semantic?:MemorySemanticProvider;semanticConfig?:LocalMemoryConfig}
type Capture = {owner:string;epoch:string;scopeEpoch:number;jobKey:string;turn:MemoryRuntimeTurn;projectId?:string}
const kinds=new Set(['preference','background','decision','progress']), scopes=new Set(['global','project'])
function fresh():State {return {schemaVersion:1,revision:0,scopeEpoch:0,secret:randomBytes(32).toString('hex'),rows:{},versions:{},projects:{},bindings:{},disabled:{},settings:{use:true,auto:true,semantic:true},settingsVersion:2,candidatePolicyVersion:1,suppression:[],usages:[],jobs:{},imported:[]}}
function text(v:unknown,max=600):string {if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('记忆内容或标题无效，请精简后重试。');return v.trim()}
function identifier(v:unknown):string {if(typeof v!=='string'||!v.length||v.length>256||/[\0\r\n]/u.test(v))throw Error('记忆参数无效。');return v}
function secretContent(value:string) {return /(?:sk-[A-Za-z0-9]{16,}|(?:password|api[_ -]?key|access[_ -]?token|密码|密钥|验证码)\s*[:：=]\s*\S{4,}|\b\d{15,19}\b)/iu.test(value)}
function validateState(state:State) {if(state?.schemaVersion!==1||!Number.isSafeInteger(state.revision)||!state.rows||!state.projects||!state.settings||!state.jobs||typeof state.secret!=='string')throw Error('记忆数据格式无效，原文件已保留。');return state}

export class MemoryService {
  private cache?: {owner:string;state:State}
  private epoch=randomUUID()
  private captures=new Map<string,Capture>()
  private retriever=new MemoryRetriever()
  private semantic?:MemorySemanticProvider
  private queue:Promise<unknown>=Promise.resolve()
  private closed=false
  private documents:MemoryDocument
  private documentError?:{owner:string;message:string}
  private constructor(private options:Options,private store:MemoryStore){this.documents=new MemoryDocument(options.root);this.semantic=options.semantic??(options.semanticConfig?new LocalMemoryEngine(options.semanticConfig,store,options.changed):undefined)}
  static async open(options:Options) {return new MemoryService(options,await MemoryStore.open(options.root,options.encryption))}
  private now(){return this.options.now?.()??Date.now()}
  private owner(){return identifier(this.options.owner())}
  private state(owner=this.owner()) {if(this.cache?.owner!==owner){const state=validateState(this.store.read<State>(owner)??fresh());
      // A previous pause must never silently start saving after the controls are unified.
      if(state.settingsVersion!==2){const enabled=state.settings.use&&state.settings.auto&&!Object.values(state.disabled??{}).some(Boolean);state.settings={use:enabled,auto:enabled,semantic:true};state.settingsVersion=2;state.disabled={};state.revision++;state.scopeEpoch++;this.cancelPending(state);delete state.summary;this.store.write(owner,state)}
      this.cache={owner,state}}return this.cache.state}
  private usable(state:State,owner=this.owner()){return this.documentError?.owner!==owner&&state.settings.use}
  private capturable(state:State,owner=this.owner()){return this.documentError?.owner!==owner&&state.settings.auto}
  private hash(state:State,value:string) {return createHmac('sha256',state.secret).update(normalizedMemoryText(value)).digest('hex')}
  private async serial<T>(work:(state:State,owner:string)=>Promise<T>|T):Promise<T> {
    const owner=this.owner(),epoch=this.epoch
    const operation=this.queue.then(async()=>{
      if(this.closed||owner!==this.owner()||epoch!==this.epoch)throw Error('账户状态已变化，请重新打开记忆。')
      const result=await work(this.cleanupLegacyCandidates(this.syncDocument(this.state(owner),owner),owner),owner)
      if(owner!==this.owner()||epoch!==this.epoch)throw Error('账户状态已变化，请重试。')
      return result
    })
    this.queue=operation.catch(()=>{});return operation
  }
  private documentEntries(state:State):DocumentEntry[]{return Object.values(state.rows).map(({id,revision,title,content,kind,scope,projectId,status,pinned,expiresAt})=>({id,revision,title,content,kind,scope,projectId,status,pinned,expiresAt}))}
  private cleanupLegacyCandidates(original:State,owner:string):State {
    if(original.candidatePolicyVersion===1||this.documentError?.owner===owner)return original
    const state=structuredClone(original),removed=new Set(Object.values(state.rows).filter(row=>row.status==='candidate').map(row=>row.id))
    // Archive the synchronized Markdown before changing either persisted store.
    // The content hash makes retrying after interruption safe and idempotent.
    if(removed.size)this.documents.preserveBeforeCandidateCleanup(owner)
    for(const id of removed){delete state.rows[id];delete state.versions[id]}
    for(const usage of state.usages)usage.entries=usage.entries.filter(entry=>!removed.has(entry.id))
    state.candidatePolicyVersion=1;state.scopeEpoch++
    this.cancelPending(state);this.captures.clear();this.retriever.clear();this.semantic?.clear()
    this.persist(state,owner,removed.size>0)
    return state
  }
  private documentSignature(state:State){return createHash('sha256').update(JSON.stringify([this.documentEntries(state).sort((a,b)=>a.id!.localeCompare(b.id!)),Object.values(state.projects).map(p=>({id:p.id,name:p.name})).sort((a,b)=>a.id.localeCompare(b.id))])).digest('hex')}
  private summaryRecords(state:State){return Object.values(state.rows).filter(r=>r.status==='active'&&(r.expiresAt===undefined||r.expiresAt>this.now())).sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({id:r.id,revision:r.revision,title:r.title,content:r.content,kind:r.kind,scope:r.scope,projectName:r.projectId?state.projects[r.projectId]?.name:undefined}))}
  private summarySignature(state:State){return createHash('sha256').update(JSON.stringify(this.summaryRecords(state))).digest('hex')}
  private persist(state:State,owner:string,purge=false,contextChanged=true) {
    if(owner!==this.owner())throw Error('账户状态已变化，请重试。')
    const staged=structuredClone(state),signature=this.documentSignature(staged)
    if(!staged.documentHash||signature!==staged.documentSignature){const target=this.documents.prepare(owner,this.documentEntries(staged),Object.values(staged.projects),signature);staged.documentPending={previousHash:staged.documentHash,targetHash:target.hash,signature}}
    if(staged.summary?.signature!==this.summarySignature(staged))delete staged.summary
    if(contextChanged)staged.revision++
    // Commit encrypted state plus the intended document hash before replacing Markdown.
    // A restart can finish either side of the rename without interpreting it as user edits.
    this.store.write(owner,staged,purge);this.cache={owner,state:staged};Object.assign(state,staged)
    if(!staged.summary)delete state.summary
    if(staged.documentPending){Object.assign(state,this.finishDocument(staged,owner));delete state.documentPending}
    this.options.changed?.()
  }
  private finishDocument(original:State,owner:string):State {
    const pending=original.documentPending;if(!pending)return original
    const raw=this.documents.raw(owner)
    if(raw?.hash!==pending.targetHash){if(raw&&raw.hash!==pending.previousHash)this.documents.preserveConflict(owner);this.documents.write(owner,this.documentEntries(original),Object.values(original.projects),pending.signature,raw?.hash)}
    const state=structuredClone(original);state.documentHash=pending.targetHash;state.documentSignature=pending.signature;delete state.documentPending
    this.store.write(owner,state);this.cache={owner,state};return state
  }
  private syncDocument(original:State,owner:string):State {
    try{
      if(original.documentPending)original=this.finishDocument(original,owner)
      const file=this.documents.read(owner)
      if(!original.documentHash){this.persist(original,owner,false,false);this.documentError=undefined;return original}
      if(file?.hash===original.documentHash){this.documentError=undefined;return original}
      if(file&&file.signature!==original.documentSignature){this.documents.preserveConflict(owner);const state=structuredClone(original);state.documentHash=file.hash;state.documentSignature=undefined;state.scopeEpoch++;this.cancelPending(state);this.captures.clear();this.retriever.clear();this.semantic?.clear();this.persist(state,owner);this.documentError={owner,message:'旧版本编辑已保留在同目录的记忆冲突文档中，记忆.md 已恢复最新内容。'};return state}
      const state=structuredClone(original),purge=this.applyDocumentEntries(state,file?.entries??[])
      state.documentHash=file?.hash;state.documentSignature=undefined;state.scopeEpoch++;this.cancelPending(state);this.captures.clear();this.retriever.clear();this.semantic?.clear();this.documentError=undefined;this.persist(state,owner,purge)
      return state
    }catch(error){this.documentError={owner,message:error instanceof Error?error.message:'记忆文件暂不可读取，原文件已保留。'};return original}
  }
  private applyDocumentEntries(state:State,entries:DocumentEntry[]){
      const retained=new Set<string>(),accepted:string[]=[],now=this.now()
      for(const entry of entries){const old=entry.id?state.rows[entry.id]:undefined
        if(entry.id&&!old)throw Error('记忆文件中有未知条目，原文件已保留。')
        if(old&&entry.revision!==old.revision)throw Error('记忆条目版本已更新，请重新读取。')
        this.input(state,entry,entry.status==='candidate')
        if(old)retained.add(old.id)
        if(old&&JSON.stringify([entry.title,entry.content,entry.kind,entry.scope,entry.projectId,entry.status,entry.pinned,entry.expiresAt])===JSON.stringify([old.title,old.content,old.kind,old.scope,old.projectId,old.status,old.pinned,old.expiresAt]))continue
        const row=this.save(state,{...entry,source:{kind:'manual',title:'记忆.md中编辑',excerpt:entry.content,createdAt:now}},old,entry.status,true)
        if(old?.status==='candidate'&&row.status==='active')accepted.push(row.id)
        retained.add(row.id);state.suppression=state.suppression.filter(s=>s.key!==this.hash(state,row.semanticKey)&&s.content!==this.hash(state,row.content))
      }
      for(const id of accepted.reverse()){const row=state.rows[id]!;if(row.status!=='active')continue;for(const other of Object.values(state.rows))if(other.id!==id&&other.status==='active'&&other.scope===row.scope&&other.projectId===row.projectId&&other.semanticKey===row.semanticKey){other.status='superseded';other.updatedAt=now;other.revision++}}
      let purge=false
      for(const row of Object.values(state.rows))if(!retained.has(row.id)){
        state.suppression.push({key:this.hash(state,row.semanticKey),content:this.hash(state,row.content)})
        for(const source of row.sources)if(source.sessionId)state.suppression.push({key:this.hash(state,row.semanticKey),content:this.hash(state,row.content),sessionId:source.sessionId,seq:source.seq})
        delete state.rows[row.id];delete state.versions[row.id];for(const usage of state.usages)usage.entries=usage.entries.filter(e=>e.id!==row.id);purge=true
      }
      return purge
  }
  private documentSnapshot(state:State,owner:string):MemorySnapshot{
    const snapshot=this.snapshot(state),raw=this.documents.raw(owner)
    if(!raw)throw Error('记忆文档暂不可读取，请稍后重试。')
    return {...snapshot,document:{...snapshot.document!,content:renderEditableMemory(this.documentEntries(state),Object.values(state.projects)),hash:raw.hash}}
  }
  private summaryView(state:State):NonNullable<MemorySnapshot['summary']>{const count=this.summaryRecords(state).length,signature=this.summarySignature(state),summary=state.summary
    if(this.documentError?.owner===this.owner())return {state:'failed',text:'',count}
    if(!count)return {state:'empty',text:'',count}
    if(!summary||summary.signature!==signature)return {state:'waiting',text:'',count}
    if(summary.state==='pending'&&(summary.scopeEpoch!==state.scopeEpoch||summary.ownerEpoch!==this.epoch))return {state:summary.attempts>=2?'failed':'waiting',text:'',count}
    return {state:summary.state,text:summary.text??'',count,updatedAt:summary.updatedAt,model:summary.model}
  }

  private cancelPending(state:State,sessionId?:string) {for(const job of Object.values(state.jobs))if((job.state==='pending'||job.state==='failed')&&(!sessionId||job.turn.sessionId===sessionId)){job.state='done';job.turn.events=[]}}
  private snapshot(state:State,sessionId?:string,query?:string):MemorySnapshot {
    const now=this.now()
    const rows=Object.values(state.rows).filter(row=>row.status!=='candidate'||now-row.createdAt<30*86400000).filter(row=>!query||normalizedMemoryText(row.title+row.content).includes(normalizedMemoryText(query)))
    const failed=Object.values(state.jobs).find(job=>job.state==='failed')
    return structuredClone({revision:state.revision,owner:this.owner(),document:{...this.documents.location(this.owner()),...(this.documentError?.owner===this.owner()?{error:this.documentError.message}:{})},summary:this.summaryView(state),settings:state.settings,retrieval:state.settings.semantic===false?{state:'keyword',message:'仅使用本地关键词检索；使用前仍会核对依据。'}:(this.semantic?.status()??{state:'fallback',message:'本地语义模型尚未就绪，暂用关键词候选。'}),projects:Object.values(state.projects),rows:rows.sort((a,b)=>b.updatedAt-a.updatedAt),usages:state.usages.map(usage=>({...usage,entries:usage.entries.map(e=>state.rows[e.id]?e:{...e,title:'该记忆已删除',reason:'已删除'})})),...(sessionId?{session:{id:sessionId,projectId:state.bindings[sessionId]??undefined,disabled:false}}:{}),extraction:{state:failed||state.warning?'failed':Object.values(state.jobs).some(job=>job.state==='pending')?'running':'ready',message:state.warning??(failed?'最近一次自动整理未完成，可继续使用已保存记忆。':'已保存的记忆会在相关私人对话中使用。')}}) as MemorySnapshot
  }
  private async project(state:State,name:string,path?:string) {
    let canonical:string|undefined
    if(path){if(!isAbsolute(path))throw Error('项目目录无效。');canonical=await realpath(path).catch(()=>resolve(path))}
    const existing=canonical?Object.values(state.projects).find(p=>p.path===canonical||p.aliases.includes(canonical!)):undefined
    if(existing)return existing
    const value:MemoryProject={id:randomUUID(),name:text(name,120),...(canonical?{path:canonical}:{}),aliases:[],createdAt:this.now()};state.projects[value.id]=value;return value
  }
  private async sessionProject(state:State,sessionId:string) {
    if(Object.hasOwn(state.bindings,sessionId))return state.bindings[sessionId]??undefined
    const path=await this.options.workspaceRoot(sessionId)
    if(!path)return undefined
    const project=await this.project(state,basename(path)||'工作区',path);state.bindings[sessionId]=project.id;return project.id
  }
  private input(state:State,input:MemoryInput,allowUnbound=false) {
    if(!input||!kinds.has(input.kind)||!scopes.has(input.scope))throw Error('记忆分类或范围无效。')
    const content=text(input.content),title=text(input.title,120)
    if(input.scope==='project'&&(!input.projectId&&!allowUnbound||input.projectId&&!state.projects[input.projectId]))throw Error('请选择记忆所属项目。')
    if(input.expiresAt!==undefined&&(!Number.isFinite(input.expiresAt)||input.expiresAt<0))throw Error('记忆有效期无效。')
    return {...input,title,content,projectId:input.scope==='project'?input.projectId:undefined}
  }
  private save(state:State,input:MemoryInput,old?:MemoryRecord,status:MemoryRecord['status']='active',manual=true,semanticKey?:string) {
    const value=this.input(state,input,status==='candidate'),now=this.now()
    const row:MemoryRecord={id:old?.id??randomUUID(),title:value.title,content:value.content,kind:value.kind,scope:value.scope,...(value.projectId?{projectId:value.projectId}:{}),semanticKey:canonicalMemoryKey(value.content,value.kind,semanticKey??old?.semanticKey),status,revision:(old?.revision??0)+1,manualLocked:manual||old?.manualLocked===true,pinned:value.pinned??old?.pinned??false,createdAt:old?.createdAt??now,updatedAt:now,lastConfirmedAt:now,...(value.expiresAt!==undefined?{expiresAt:value.expiresAt}:value.kind==='progress'?{expiresAt:now+7*86400000}:{}),sources:old?.sources??[]}
    if(value.source){const source=value.source;row.sources=[...row.sources,{kind:source.kind,title:text(source.title||'来源',160),excerpt:String(source.excerpt??'').slice(0,600),createdAt:now,...(source.sessionId?{sessionId:identifier(source.sessionId)}:{}),...(source.seq!==undefined?{seq:source.seq}:{}),...(source.noteId?{noteId:identifier(source.noteId)}:{}),...(Number.isSafeInteger(source.noteRevision)?{noteRevision:source.noteRevision}:{}),...(source.messageId?{messageId:identifier(source.messageId)}:{})}].slice(-20)}
    else if(manual&&!old)row.sources=[{kind:'manual',title:'手动保存',excerpt:value.content,createdAt:now}]
    if(old)(state.versions[old.id]??=[]).push(structuredClone(old))
    state.rows[row.id]=row;return row
  }
  async request(command:MemoryCommand):Promise<MemorySnapshot> {return this.serial(async(original,owner)=>{
    const state=structuredClone(original);let changed=false,purge=false
    if(!command||typeof command!=='object')throw Error('未知记忆操作。')
    if(command.type==='document-read')return this.documentSnapshot(state,owner)
    if(command.type==='document-save'){
      const raw=this.documents.raw(owner)
      if(typeof command.expectedHash!=='string'||!raw||command.expectedHash!==raw.hash)throw Error('记忆文档已更新。你的修改已保留，请重新读取最新内容后再编辑。')
      if(this.documentError?.owner===owner)throw Error(this.documentError.message)
      const rows=this.documentEntries(state),projects=Object.values(state.projects)
      if(command.content===renderEditableMemory(rows,projects))return this.documentSnapshot(state,owner)
      const entries=parseEditableMemory(command.content,rows,projects)
      const purge=this.applyDocumentEntries(state,entries)
      state.documentHash=raw.hash;state.documentSignature=undefined;state.scopeEpoch++
      this.cancelPending(state);this.captures.clear();this.retriever.clear();this.semantic?.clear()
      this.persist(state,owner,purge);this.documentError=undefined
      return this.documentSnapshot(state,owner)
    }
    if(command.type==='snapshot'){
      if(command.sessionId&&!this.options.isShared(command.sessionId)){await this.sessionProject(state,identifier(command.sessionId));changed=JSON.stringify(state.bindings)!==JSON.stringify(original.bindings)}
    }else if(command.type==='save'){
      const old=command.id?state.rows[identifier(command.id)]:undefined
      if(command.id&&(!old||old.revision!==command.expectedRevision))throw Error('记忆已更新，请重新读取最新版本后保存。')
      const row=this.save(state,command.input,old,old?.status??'active')
      state.suppression=state.suppression.filter(s=>s.key!==this.hash(state,row.semanticKey)&&s.content!==this.hash(state,row.content));state.scopeEpoch++;changed=true
    }else if(command.type==='action'){
      if(!Array.isArray(command.ids)||command.ids.length>500||!['delete','disable','enable','accept','ignore'].includes(command.action))throw Error('记忆操作无效。')
      for(const id of [...new Set(command.ids)]){
        const row=state.rows[identifier(id)];if(!row)throw Error('记忆已删除或无权访问。')
        if(command.expectedRevisions?.[id]!==undefined&&row.revision!==command.expectedRevisions[id])throw Error('记忆已更新，请刷新后重试。')
        if(command.action==='delete'||command.action==='ignore'){
          state.suppression.push({key:this.hash(state,row.semanticKey),content:this.hash(state,row.content)})
          for(const source of row.sources)if(source.sessionId)state.suppression.push({key:this.hash(state,row.semanticKey),content:this.hash(state,row.content),sessionId:source.sessionId,seq:source.seq})
          delete state.rows[id];delete state.versions[id]
          for(const usage of state.usages)usage.entries=usage.entries.filter(e=>e.id!==id)
          purge=true
        }else{
          if(command.action==='disable'&&row.status!=='active'||command.action==='enable'&&row.status!=='disabled'||command.action==='accept'&&row.status!=='candidate')throw Error('记忆状态已更新，请刷新后重试。')
          if(command.action==='accept'&&row.scope==='project'&&!row.projectId)throw Error('请先编辑并选择记忆所属项目。')
          row.status=command.action==='disable'?'disabled':'active';row.revision++;row.updatedAt=this.now()
          if(command.action==='accept'){
            row.manualLocked=true;row.lastConfirmedAt=this.now()
            for(const other of Object.values(state.rows))if(other.id!==row.id&&other.status==='active'&&other.scope===row.scope&&other.projectId===row.projectId&&other.semanticKey===row.semanticKey){other.status='superseded';other.updatedAt=this.now();other.revision++}
          }
        }
      }
      state.scopeEpoch++;changed=true
    }else if(command.type==='settings'){
      if(typeof command.use!=='boolean')throw Error('记忆开关无效。')
      state.settings={use:command.use,auto:command.use,semantic:true};state.disabled={}
      state.scopeEpoch++;changed=true
    }else if(command.type==='rebuild-index'){
      this.store.clearVectors(owner);this.semantic?.clear();state.scopeEpoch++;changed=true
    }else if(command.type==='project'){
      const project=await this.project(state,command.name,command.path)
      if(command.sessionId){if(this.options.isShared(command.sessionId))throw Error('共享对话不能绑定私人记忆项目。');state.bindings[identifier(command.sessionId)]=project.id;state.scopeEpoch++}
      changed=true
    }else if(command.type==='bind'){
      if(this.options.isShared(command.sessionId))throw Error('共享对话不能绑定私人记忆项目。')
      if(command.projectId&&!state.projects[command.projectId])throw Error('项目不存在或无权访问。')
      if(command.projectId)state.bindings[identifier(command.sessionId)]=command.projectId;else state.bindings[identifier(command.sessionId)]=null
      state.scopeEpoch++;changed=true
    }else if(command.type==='source'){
      const row=state.rows[identifier(command.id)];if(!row)throw Error('记忆来源不可用。')
      return {...this.snapshot(state),source:row.sources.at(-1)}
    }else if(command.type==='legacy-preview')return {...this.snapshot(state),legacy:await this.legacy()}
    else if(command.type==='import-legacy'){
      if(!Array.isArray(command.ids)||command.ids.length>100)throw Error('导入数量无效。')
      const available=await this.legacy()
      for(const id of command.ids){const item=available.find(i=>i.id===id);if(!item||state.imported.includes(id))continue
        const chunks=splitMemoryImport(item.content)
        for(let index=0;index<chunks.length;index++){
          const content=chunks[index]!
          this.save(state,{title:item.title+(chunks.length>1?`（${index+1}/${chunks.length}）`:''),content,kind:'background',scope:'project',projectId:command.projectId,source:{kind:'legacy',title:item.title,excerpt:content,createdAt:item.createdAt}},undefined,'candidate',false)
        }
        state.imported.push(id)
      }
      changed=true
    }else throw Error('未知记忆操作。')
    if(changed){
      if(state.scopeEpoch!==original.scopeEpoch){this.cancelPending(state);this.captures.clear();this.retriever.clear();this.semantic?.clear()}
      this.persist(state,owner,purge)
    }
    return this.snapshot(state,'sessionId' in command?command.sessionId:undefined,command.type==='snapshot'?command.query:undefined)
  })}
  async recall(context:MemoryRuntimeContext):Promise<MemoryRecall>{
    const prepared=await this.serial(async(original,owner)=>{
      const sessionId=identifier(context.sessionId),state=structuredClone(original)
      const privateSession=!this.options.isShared(sessionId)
      const enabled=this.usable(state,owner)&&privateSession,autoEnabled=this.capturable(state,owner)&&privateSession
      const projectId=enabled||autoEnabled?await this.sessionProject(state,sessionId):state.bindings[sessionId]??undefined
      if(JSON.stringify(state.bindings)!==JSON.stringify(original.bindings))this.persist(state,owner)
      const rows=Object.values(state.rows).filter(row=>row.status==='active'&&(!row.expiresAt||row.expiresAt>this.now()))
      return {owner,ownerEpoch:this.epoch,revision:state.revision,scopeEpoch:state.scopeEpoch,enabled,autoEnabled,projectId,rows,query:String(context.query??'').slice(0,2000),semantic:state.settings.semantic!==false}
    })
    let selected:{id:string;revision:number}[]=[]
    if(prepared.enabled&&prepared.query.trim()&&prepared.rows.length){
      if(prepared.semantic&&this.semantic){
        try{selected=await this.semantic.select(prepared.rows,prepared.query,prepared.projectId,this.now(),prepared.owner)}
        catch{selected=this.retriever.candidates(prepared.rows,prepared.query,prepared.projectId,this.now()).map(row=>({id:row.id,revision:row.revision}))}
      }else selected=this.retriever.candidates(prepared.rows,prepared.query,prepared.projectId,this.now()).map(row=>({id:row.id,revision:row.revision}))
    }
    return this.serial((state,owner)=>{
      if(owner!==prepared.owner||this.epoch!==prepared.ownerEpoch||state.revision!==prepared.revision||state.scopeEpoch!==prepared.scopeEpoch)throw Error('记忆或账户状态已变化，旧检索已失效。')
      if(prepared.enabled&&(!this.usable(state,owner)||this.options.isShared(context.sessionId)))throw Error('当前会话不再允许使用记忆。')
      const unique=new Set<string>(),candidates:MemoryRecall['candidates']=[]
      for(const item of selected){const row=state.rows[item.id];if(!row||row.revision!==item.revision||unique.has(row.id)||row.status!=='active'||row.expiresAt&&row.expiresAt<=this.now()||row.scope==='project'&&row.projectId!==prepared.projectId)continue
        unique.add(row.id);candidates.push({id:row.id,revision:row.revision,title:row.title,content:row.content,reason:'本地检索候选，尚未核对依据'})
        if(candidates.length===30)break
      }
      return {enabled:prepared.enabled,autoEnabled:prepared.autoEnabled,ownerEpoch:prepared.ownerEpoch,revision:prepared.revision,scopeEpoch:prepared.scopeEpoch,projectId:prepared.projectId,entries:[],block:'',candidates,selectionRequired:true}
    })
  }
  async capture(turn:MemoryRuntimeTurn):Promise<MemoryCapture>{return this.serial(async(original,owner)=>{
    const state=structuredClone(original),sessionId=identifier(turn.sessionId),jobKey=sessionId+':'+identifier(turn.turnId)
    if(!this.capturable(state,owner)||!turn.anchor||turn.anchor.ownerEpoch!==this.epoch||turn.anchor.scopeEpoch!==state.scopeEpoch||this.options.isShared(sessionId)||state.jobs[jobKey]?.state==='done')return {enabled:false,captureId:'',ownerEpoch:this.epoch,revision:state.revision}
    for(const [id,capture]of this.captures)if(capture.jobKey===jobKey&&capture.owner===owner&&capture.epoch===this.epoch&&capture.scopeEpoch===state.scopeEpoch)return {enabled:true,captureId:id,ownerEpoch:this.epoch,revision:state.revision,projectId:capture.projectId}
    if(!Array.isArray(turn.events)||turn.events.length>80)throw Error('记忆来源无效。')
    const events=turn.events.filter(e=>e&&Number.isSafeInteger(e.seq)&&e.seq>=0&&['user','assistant'].includes(e.role)&&typeof e.text==='string'&&e.text.length<=16000)
    if(!events.some(e=>e.role==='user'))return {enabled:false,captureId:'',ownerEpoch:this.epoch,revision:state.revision}
    const projectId=await this.sessionProject(state,sessionId)
    if(turn.anchor.projectId!==projectId)return {enabled:false,captureId:'',ownerEpoch:this.epoch,revision:state.revision}
    const captureId=randomBytes(24).toString('hex')
    const clean={...turn,sessionId,events};if(turn.route?.provider&&turn.route.model)state.summaryRoute={provider:identifier(turn.route.provider),model:identifier(turn.route.model)};state.jobs[jobKey]={turn:clean,state:'pending',attempts:state.jobs[jobKey]?.attempts??0}
    const pending=Object.keys(state.jobs);if(pending.length>2000)for(const key of pending.slice(0,pending.length-2000))if(state.jobs[key]?.state!=='pending')delete state.jobs[key]
    this.persist(state,owner);this.captures.set(captureId,{owner,epoch:this.epoch,scopeEpoch:state.scopeEpoch,jobKey,turn:clean,projectId})
    return {enabled:true,captureId,ownerEpoch:this.epoch,revision:state.revision,projectId}
  })}
  async commitExtraction(input:{captureId:string;candidates:MemoryCandidate[]}){return this.serial((original,owner)=>{
    const capture=this.captures.get(identifier(input.captureId)),state=structuredClone(original)
    if(!this.capturable(state,owner)||!capture||capture.owner!==owner||capture.epoch!==this.epoch||capture.scopeEpoch!==state.scopeEpoch||this.options.isShared(capture.turn.sessionId))throw Error('记忆整理任务已失效。')
    if(!Array.isArray(input.candidates)||input.candidates.length>5)throw Error('记忆提炼结果无效。')
    for(const candidate of input.candidates){
      const source=capture.turn.events.find(e=>e.seq===candidate.sourceSeq&&e.role==='user')
      if(!source||typeof candidate.evidence!=='string'||!candidate.evidence.trim()||!source.text.includes(candidate.evidence)||secretContent(candidate.evidence))continue
      const evidence=contextualMemoryEvidence(source.text,candidate.evidence)
      if(secretContent(evidence)||unresolvedMemoryReference(evidence))continue
      if(/^\s*>|```|引用(?:网页|文档|文章|原文)|(?:网页|文档|文章|他说|她说).{0,10}[:：]|<external_/imu.test(source.text))continue
      // Judge the complete source; an extractor cannot remove temporary qualifiers.
      if(/这次|本次|临时|这回|this time|for now|temporarily/iu.test(source.text))continue
      if(!kinds.has(candidate.kind)||!scopes.has(candidate.scope)||evidence.length>600)continue
      if(candidate.scope==='global'&&candidate.kind!=='preference')continue
      const scope=candidate.scope,projectId=scope==='project'?capture.projectId:undefined
      const confirmedProposal=/^(?:确认|好的|好|采用|就这样|同意|okay|yes|confirmed)[。.!！\s]*$/iu.test(evidence)&&typeof candidate.content==='string'&&candidate.content.length<=600&&capture.turn.events.some(e=>e.role==='assistant'&&e.text.includes(candidate.content))
      const content=confirmedProposal?candidate.content:evidence,key=canonicalMemoryKey(content,candidate.kind,candidate.semanticKey)
      if(state.suppression.some(s=>s.key===this.hash(state,key)||s.content===this.hash(state,content)||s.sessionId===capture.turn.sessionId&&s.seq!==undefined&&source.seq<=s.seq))continue
      if(Object.values(state.rows).length>=5000)continue
      const same=Object.values(state.rows).find(r=>r.scope===scope&&r.projectId===projectId&&r.semanticKey===key&&(r.status==='active'||r.status==='disabled'))
      const explicit=!confirmedProposal&&candidate.explicit===true&&reusableMemoryEvidence(evidence,candidate.kind)
      const sourceRef:MemorySource={kind:'conversation',sessionId:capture.turn.sessionId,seq:source.seq,title:'对话中明确表达',excerpt:evidence,createdAt:this.now()}
      if(same?.status==='disabled'&&normalizedMemoryText(same.content)===normalizedMemoryText(content))continue
      if(same&&normalizedMemoryText(same.content)===normalizedMemoryText(content)){same.sources=[...same.sources,sourceRef].slice(-20);continue}
      const status:MemoryRecord['status']=explicit&&same?.status!=='disabled'&&!same?.manualLocked&&(scope==='global'||!!projectId)?'active':'candidate'
      // An uncertain extraction is not a task for the user to review. Only
      // fully admitted facts enter the document; legacy candidates remain readable.
      if(status!=='active')continue
      this.save(state,{title:typeof candidate.title==='string'&&candidate.title.trim()?candidate.title.slice(0,120):'新记忆',content,kind:candidate.kind,scope,projectId,source:sourceRef},same,status,false,key)
    }
    state.jobs[capture.jobKey]={turn:{...capture.turn,events:[]},state:'done',attempts:state.jobs[capture.jobKey]?.attempts??0}
    this.captures.delete(input.captureId);this.persist(state,owner);return this.snapshot(state)
  })}
  async validate(input:{sessionId:string;ownerEpoch:string;revision:number;scopeEpoch:number;entries?:{id:string;revision:number}[]}){return this.serial(state=>({
    valid:this.usable(state)&&this.epoch===input.ownerEpoch&&state.revision===input.revision&&state.scopeEpoch===input.scopeEpoch&&!this.options.isShared(input.sessionId)&&
      (input.entries===undefined||Array.isArray(input.entries)&&input.entries.length<=30&&input.entries.every(entry=>{const row=state.rows[entry.id];return !!row&&row.revision===entry.revision&&row.status==='active'&&(!row.expiresAt||row.expiresAt>this.now())&&(row.scope==='global'||row.projectId===state.bindings[input.sessionId])}))
  }))}
  async attempt(input:{captureId:string}){return this.serial((original,owner)=>{
    const capture=this.captures.get(input.captureId)
    if(!this.capturable(original,owner)||!capture||capture.owner!==owner||capture.epoch!==this.epoch||capture.scopeEpoch!==original.scopeEpoch||this.options.isShared(capture.turn.sessionId))throw Error('记忆整理任务已失效。')
    const state=structuredClone(original),job=state.jobs[capture.jobKey]
    if(!job||job.state!=='pending'||(job.attempts??0)>=2)return {allowed:false}
    job.attempts=(job.attempts??0)+1;this.persist(state,owner);return {allowed:true}
  })}
  async usage(input:{sessionId:string;ownerEpoch:string;revision:number;entries:MemoryRecall['entries'];warning?:string}){return this.serial((original,owner)=>{
    if(!this.usable(original,owner)||input.ownerEpoch!==this.epoch||input.revision!==original.revision||this.options.isShared(input.sessionId))return {ok:false}
    const state=structuredClone(original),entries=input.entries.flatMap(e=>{const row=state.rows[e.id];return row?.status==='active'&&row.revision===e.revision&&(!row.expiresAt||row.expiresAt>this.now())&&(row.scope==='global'||row.projectId===state.bindings[input.sessionId])?[{id:e.id,revision:e.revision,title:row.title,reason:String(e.reason).slice(0,120)}]:[]})
    const warnings=new Set(['记忆背景超出当前模型容量，本轮未使用。','记忆暂不可用，本轮未使用。'])
    if(input.warning&&warnings.has(input.warning)){state.warning=input.warning;this.persist(state,owner,false,false)}
    if(entries.length){delete state.warning;const now=this.now();for(const e of entries)state.rows[e.id]!.lastUsedAt=now;state.usages.unshift({id:randomUUID(),sessionId:identifier(input.sessionId),createdAt:now,entries});state.usages=state.usages.slice(0,100);this.persist(state,owner,false,false)}
    return {ok:true}
  })}
  async failure(input:{captureId:string;message?:string}){return this.serial((original,owner)=>{
    const capture=this.captures.get(input.captureId);if(!this.capturable(original,owner)||!capture||capture.owner!==owner||capture.epoch!==this.epoch||capture.scopeEpoch!==original.scopeEpoch||original.jobs[capture.jobKey]?.state!=='pending')return {ok:false}
    const state=structuredClone(original);state.jobs[capture.jobKey]={turn:capture.turn,state:'failed',message:'自动整理未完成',attempts:state.jobs[capture.jobKey]?.attempts??0};this.captures.delete(input.captureId);this.persist(state,owner);return {ok:true}
  })}
  async pending(){return this.serial(state=>({items:this.capturable(state)?Object.values(state.jobs).filter(j=>j.state==='pending'&&j.turn.anchor?.scopeEpoch===state.scopeEpoch&&j.turn.anchor.projectId===(state.bindings[j.turn.sessionId]??undefined)).map(j=>({turn:{...structuredClone(j.turn),anchor:{...j.turn.anchor!,ownerEpoch:this.epoch}}})).slice(0,20):[]}))}
  async directory(){return this.serial((_state,owner)=>this.documents.location(owner))}
  async summaryInput(){return this.serial((original,owner)=>{
    const records=this.summaryRecords(original),signature=this.summarySignature(original),same=original.summary?.signature===signature
    if(this.documentError?.owner===owner||!original.settings.use||!original.settings.auto||!records.length||!original.summaryRoute)return {enabled:false as const}
    if(same&&(original.summary!.state==='ready'||original.summary!.ownerEpoch===this.epoch&&original.summary!.scopeEpoch===original.scopeEpoch||original.summary!.attempts>=2))return {enabled:false as const}
    const state=structuredClone(original);state.summary={signature,scopeEpoch:state.scopeEpoch,ownerEpoch:this.epoch,state:'pending',attempts:(same?state.summary?.attempts??0:0)+1}
    this.persist(state,owner,false,false)
    return {enabled:true as const,ownerEpoch:this.epoch,scopeEpoch:state.scopeEpoch,signature,route:state.summaryRoute!,records:records.slice(0,20),count:records.length}
  })}
  async summaryCommit(input:{ownerEpoch:string;scopeEpoch:number;signature:string;text:string;model:string}){return this.serial((original,owner)=>{
    if(input.ownerEpoch!==this.epoch||input.scopeEpoch!==original.scopeEpoch||input.signature!==this.summarySignature(original)||original.summary?.state!=='pending'||this.documentError?.owner===owner||!original.settings.use||!original.settings.auto)return {ok:false}
    const state=structuredClone(original);state.summary={...state.summary!,state:'ready',text:text(input.text,1600),model:text(input.model,256),updatedAt:this.now()};this.persist(state,owner,false,false);return {ok:true}
  })}
  async summaryFailure(input:{ownerEpoch:string;scopeEpoch:number;signature:string}){return this.serial((original,owner)=>{
    if(!this.usable(original,owner)||input.ownerEpoch!==this.epoch||input.scopeEpoch!==original.scopeEpoch||input.signature!==this.summarySignature(original)||original.summary?.state!=='pending')return {ok:false}
    const state=structuredClone(original);state.summary={...state.summary!,state:'failed',text:undefined};this.persist(state,owner,false,false);return {ok:true}
  })}
  rotateIdentity(){this.documentError=undefined;this.epoch=randomUUID();this.cache=undefined;this.captures.clear();this.retriever.clear();this.semantic?.clear();this.options.changed?.()}
  async close(){if(this.closed)return;await this.queue;this.closed=true;this.captures.clear();this.retriever.close();this.semantic?.close();this.cache=undefined;this.store.close()}
  private async legacy(){
    const root=this.options.legacyRoot;if(!root)return []
    const items:NonNullable<MemorySnapshot['legacy']>=[]
    async function walk(directory:string,depth:number){if(depth>3)return;for(const entry of await readdir(directory,{withFileTypes:true}).catch(()=>[])){if(entry.isSymbolicLink())continue;const path=resolve(directory,entry.name);if(entry.isDirectory())await walk(path,depth+1);else if(entry.name.endsWith('.md')){const info=await stat(path);if(info.size>128000||items.length>=100)continue;const content=await readFile(path,'utf8');items.push({id:path.slice(root!.length+1),title:entry.name,content,createdAt:info.mtimeMs})}}}
    await walk(root,0);return items
  }
}
