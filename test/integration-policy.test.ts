import {expect,it} from 'vitest'
import {emptyIntegrationState,type Connection,type ToolCall} from '../src/shared/integrations'
import {assertCapabilityAccess} from '../src/main/integrations/policy'
const connection:Connection={id:'c',name:'Test',providerId:'api',kind:'api',ownerAccountId:'owner',config:{type:'api',baseUrl:'https://example.com',auth:{type:'none'},network:{},operations:[]},enabled:true,revision:2,authState:'connected',health:'healthy',workspaceGrant:{mode:'selected',workspaceIds:['w']},toolGrants:['tool'],unattendedToolGrants:['tool'],createdAt:1,updatedAt:1,configDigest:'hash'}
const call:ToolCall={callId:'call',toolId:'tool',connectionRevision:2,arguments:{},context:{ownerAccountId:'owner',sessionId:'s',rootSessionId:'s',workspaceId:'w',unattended:false,runtimeEpoch:'epoch'}}
it('rejects stale tools, changed owners, ungranted workspaces and revoked connections',()=>{
  const state=emptyIntegrationState();state.connections.c=structuredClone(connection);state.tools.tool={id:'tool',connectionId:'c',operationId:'read',name:'read',description:'read',inputSchema:{type:'object'},effect:'read',enabled:true,schemaDigest:'schema'}
  expect(()=>assertCapabilityAccess(call,state,'owner','epoch')).not.toThrow()
  for(const bad of [{...call,connectionRevision:1},{...call,context:{...call.context,ownerAccountId:'other'}},{...call,context:{...call.context,workspaceId:'other'}},{...call,context:{...call.context,runtimeEpoch:'old'}}])expect(()=>assertCapabilityAccess(bad,state,'owner','epoch')).toThrow()
  state.connections.c!.enabled=false
  expect(()=>assertCapabilityAccess(call,state,'owner','epoch')).toThrow()
})
it('requires explicit unattended tool grants even for a previously usable session',()=>{
  const state=emptyIntegrationState();state.connections.c={...connection,unattendedToolGrants:[]};state.tools.tool={id:'tool',connectionId:'c',operationId:'read',name:'read',description:'read',inputSchema:{type:'object'},effect:'read',enabled:true,schemaDigest:'schema'}
  expect(()=>assertCapabilityAccess({...call,context:{...call.context,unattended:true}},state,'owner','epoch')).toThrow()
})
