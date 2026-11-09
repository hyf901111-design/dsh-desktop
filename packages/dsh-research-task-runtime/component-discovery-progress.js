// Attempt-local source progress, never a capability or authorization cache.
// Repeating empty interface directories cannot produce business records.
export function componentDiscoveryProgress(discoveryTools = new Set()) {
 const calls = new Map(), empty = new Map();
 return {
  accept(event) {
   if(event?.type==='tool/call'&&discoveryTools.has(event.data?.name)&&typeof event.data.callId==='string') {
    calls.set(event.data.callId,event.data.name);if(calls.size>64)calls.delete(calls.keys().next().value);return;
   }
   if(event?.type!=='tool/result')return;
   const message=event.data?.message,tool=calls.get(message?.source?.callId);
   if(!tool)return;calls.delete(message.source.callId);
   const result=message.content?.find(block=>block.type==='tool-result');
   if(!result||result.isError||result.error)return;
   try {
    const value=JSON.parse((result.content??[]).filter(block=>block.type==='text').map(block=>block.text).join('\n'));
    // Only a declared, successfully decoded empty directory is conclusive.
    // Business empty rows, prose, failed transport and permissions are separate.
    if(value.kind!=='catalog'||!Array.isArray(value.interfaces))return;
    if(value.interfaces.length)empty.delete(tool);
    else empty.set(tool,(empty.get(tool)??0)+1);
   }catch{}
  },
  issue(tool) {
   if((empty.get(tool)??0)>=2)return '本组件已从该目录连续取得两次空 interfaces，继续同源发现不会取得业务数据。本轮停止重复查询此目录；在用户原授权范围内改用当前可用的其他来源或网页原文，保留已取得记录。没有获准替代来源时如实报告缺失，不能猜接口、复用失效工具名或用样例补值。';
  }
 };
}
