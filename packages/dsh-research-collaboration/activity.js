// Public progress only: never transports reasoning, tool arguments or credentials.
export function cleanActivity(value) {
  if (!value || !['conversation','canvas'].includes(value.kind) || typeof value.id !== 'string' || !/^[\w:-]{1,160}$/.test(value.id)) throw Error('INVALID_ACTIVITY')
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) throw Error('INVALID_ACTIVITY')
  const text=(v,n)=>typeof v==='string'?v.slice(0,n):''
  const number=(v,max)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0
  if(value.kind==='conversation') {
    const p=value.progress
    if(!p||!Array.isArray(p.events))throw Error('INVALID_ACTIVITY')
    return {kind:value.kind,id:value.id,sequence:value.sequence,progress:{startedAt:number(p.startedAt,1e15),lastActivityAt:number(p.lastActivityAt,1e15),outputChars:number(p.outputChars,1e9),events:p.events.slice(-12).filter(e=>['assistant-delta','tool-started','tool-finished'].includes(e.type)).map(e=>({type:e.type,text:text(e.text,1500),tool:text(e.tool,80),detail:text(e.detail,160),failed:e.failed===true}))}}
  }
  if(!['running','waiting','paused','stopped','completed'].includes(value.state))throw Error('INVALID_ACTIVITY')
  return {kind:value.kind,id:value.id,sequence:value.sequence,createdAt:number(value.createdAt,1e15),...(value.resumedAt?{resumedAt:number(value.resumedAt,1e15)}:{}),title:text(value.title,60),reason:text(value.reason,600),state:value.state,actions:number(value.actions,2000),maxActions:number(value.maxActions,2000),deadline:number(value.deadline,1e15)}
}
