// Attempt-local source progress, never a capability or authorization cache.
// Repeating empty interface directories cannot produce business records.
export function componentDiscoveryProgress(discoveryTools = new Set()) {
 const calls = new Map(), empty = new Map(), exactEmpty = new Set(), alternativeDiscoveries = new Set();
 const exactKey=(tool,args)=>typeof args?.api_name==='string'&&args.api_name.trim()?JSON.stringify([tool,args.api_name]):undefined;
 return {
  accept(event) {
   if(event?.type==='tool/call'&&discoveryTools.has(event.data?.name)&&typeof event.data.callId==='string') {
    let args;try{args=typeof event.data.arguments==='string'?JSON.parse(event.data.arguments):event.data.arguments}catch{}
    calls.set(event.data.callId,{tool:event.data.name,key:exactKey(event.data.name,args)});if(calls.size>64)calls.delete(calls.keys().next().value);return;
   }
   if(event?.type!=='tool/result')return;
   const message=event.data?.message,call=calls.get(message?.source?.callId);
   if(!call)return;calls.delete(message.source.callId);
   const {tool,key}=call;
   const result=message.content?.find(block=>block.type==='tool-result');
   if(!result||result.isError||result.error)return;
   try {
    const value=JSON.parse((result.content??[]).filter(block=>block.type==='text').map(block=>block.text).join('\n'));
    // Only a declared, successfully decoded empty directory is conclusive.
    // Business empty rows, prose, failed transport and permissions are separate.
    if(value.kind!=='catalog'||!Array.isArray(value.interfaces))return;
    if(value.interfaces.length){empty.delete(tool);if(key)exactEmpty.delete(key)}
    else if(key){exactEmpty.add(key);if(exactEmpty.size>64)exactEmpty.delete(exactEmpty.values().next().value)}
    else empty.set(tool,(empty.get(tool)??0)+1);
   }catch{}
  },
  // Reuse only the child's existing grants and call budget. An empty catalog
  // is evidence to switch acquisition method, not to close all source tools.
  allowAlternativeRead({elapsed,hasBusinessData}) {
   return elapsed<135000&&!hasBusinessData&&(exactEmpty.size>0||[...empty.values()].some(count=>count>=2));
  },
  reserveAlternativeDiscovery(tool,options) {
   if(!this.allowAlternativeRead(options)||options.observedTools?.has(tool)||alternativeDiscoveries.has(tool)||alternativeDiscoveries.size>=2)return false;
   alternativeDiscoveries.add(tool);return true;
  },
  issue(tool,args) {
   const key=exactKey(tool,args);
   if(key)return exactEmpty.has(key)?'该接口名已返回空定义，本轮不重复查询同一接口；按实际可用定义或当前授权的其他来源取数。':undefined;
   if((empty.get(tool)??0)>=2)return '本组件已从该目录连续取得两次空 interfaces，继续同源发现不会取得业务数据。本轮停止重复关键词搜索，尚未查询的明确 api_name 仍可读取定义；在用户原授权范围内改用当前可用的其他来源或网页原文，保留已取得记录。没有获准替代来源时如实报告缺失，不能猜接口、复用失效工具名或用样例补值。';
  }
 };
}
