// Authorization and activity need current header identity, never a replay of
// every cold conversation. The ordinary list keeps its title/blank semantics.
export function patchSessionIdentityList(source) {
 const marker='/* ework:session-identity-list:v1 */'
 if(source.includes(marker))return source
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Session identity list anchor drifted: '+a.slice(0,90));source=source.replace(a,b)}
 replace('const sessionListRequestSchema = z$1.object({ cursor: z$1.string().optional() });',
  'const sessionListRequestSchema = z$1.object({ cursor: z$1.string().optional(), identitySessionId: sessionIdSchema.optional(), activitySessionIds: z$1.array(sessionIdSchema).max(128).optional() });')
 replace('async function listVisibleSessionSummaries(signal) {',`${marker}
 async function sessionIdentitySummaries(payload, signal) {
  const {identitySessionId,activitySessionIds}=payload;
  const row=(header,running)=>({sessionId:header.id,updatedAt:header.createdAt,running,blank:false,...sessionListFields(header)});
  const live=id=>ctx.sessions.get(id);
  const running=id=>ctx.agents.get(id)?.status==='running';
  if(activitySessionIds){
   // Existing list rows only; no polling of cold artifacts. The client never
   // applies this response to remote-only catalog entries without local identity.
   return [...new Set(activitySessionIds)].flatMap(id=>{const session=live(id);return session?[row(session.header,running(id))]:[]});
  }
  const items=[], seen=new Set(), persistence=ctx.get('sessionPersistence');
  let id=identitySessionId;
  while(id&&!seen.has(id)&&seen.size<32){
   signal?.throwIfAborted();
   seen.add(id);
   const current=live(id);
   const stored=current?undefined:await persistence?.readStoredIdentity?.(id,signal);
   const header=live(id)?.header??stored;
   if(!header||header.id!==id)break;
   items.push(row(header,running(id)));
   id=header.origin==='subagent'?header.parentSession:undefined;
  }
  return items;
 }
 async function listVisibleSessionSummaries(signal) {`)
 replace('async list(request) {\n\t\t\t\treturn ok(request, { items: await listVisibleSessionSummaries() });','async list(request, signal) {\n\t\t\t\tconst scoped=request.payload.identitySessionId!==undefined||request.payload.activitySessionIds!==undefined;\n\t\t\t\treturn ok(request, { items: scoped ? await sessionIdentitySummaries(request.payload, signal) : await listVisibleSessionSummaries(signal) });')
 return source
}

export function patchStoredSessionIdentity(source){
 const marker='/* ework:stored-session-identity:v1 */',anchor='\tasync list(signal) {'
 if(source.includes(marker))return source
 if(source.split(anchor).length!==2)throw Error('Stored session identity anchor drifted')
 return source.replace(anchor,`\t${marker}
 async readStoredIdentity(id, signal){
  signal?.throwIfAborted();
  await this.ensureRootEncoding();
  const path=await this.findLog(id,signal);
  if(path===undefined)return;
  const first=this.compression==='zstd'?await this.readFirstZstdLine(path,signal):await this.readFirstLine(path,signal);
  const meta=first===undefined?undefined:parseHeaderMeta(first);
  if(meta===undefined)return;
  await this.assertStoredIdentity(path,meta,id,signal);
  return meta;
 }
${anchor}`)
}
