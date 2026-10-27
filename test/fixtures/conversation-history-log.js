/** Fixed messages only; no remote agent or model is invoked. */
export function historyLog(turns=16,steps=65){
 const log=[],append=(type,data,extra={})=>log.push({seq:log.length,time:1000+log.length,type,data,...extra})
 for(let turn=1;turn<=turns;turn++){
  append('user/message',{id:'user-'+turn,role:'user',source:{kind:'user',rpcId:'rpc-'+turn},content:[{type:'text',text:'第'+turn+'轮真实请求'}]},{surfaceOp:'append'})
  append('turn/start',{turn})
  for(let step=1;step<=steps;step++){
   append('step/start',{turn,step})
   append('assistant/message',{turn,step,message:{id:`assistant-${turn}-${step}`,role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'text',text:step===steps?'第'+turn+'轮最终回复':''}]}},{surfaceOp:'append'})
   append('step/end',{turn,step})
  }
  append('turn/end',{turn,reason:{kind:'completed'}})
 }
 return log
}
