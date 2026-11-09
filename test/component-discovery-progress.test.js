import {expect,it} from 'vitest'
import {componentDiscoveryProgress} from '../packages/dsh-research-task-runtime/component-discovery-progress.js'
const tool='ework__catalog';
function reply(progress,id,value,{name=tool,isError=false,args={}}={}){
 progress.accept({type:'tool/call',data:{callId:id,name,arguments:JSON.stringify(args)}});
 progress.accept({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',isError,content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]}]}}});
}
it('bounds a repeatedly empty directory while leaving alternate sources and other children independent',()=>{
 const p=componentDiscoveryProgress(new Set([tool,'other']));
 reply(p,'a',{kind:'catalog',interfaces:[]});expect(p.issue(tool)).toBeUndefined();
 reply(p,'b',{kind:'catalog',interfaces:[]});expect(p.issue(tool)).toContain('其他来源');
 expect(p.issue('other')).toBeUndefined();expect(componentDiscoveryProgress(new Set([tool])).issue(tool)).toBeUndefined();
 // A real later definition reopens that source, never a stale generic flag.
 reply(p,'c',{kind:'catalog',interfaces:[{api:'real'}]});expect(p.issue(tool)).toBeUndefined();
});
it('does not infer an unavailable catalog from two empty fuzzy searches and still permits a new exact definition',()=>{
 const p=componentDiscoveryProgress(new Set([tool]));
 reply(p,'a',{kind:'catalog',interfaces:[]},{args:{query:'自然语言需求一'}});
 reply(p,'b',{kind:'catalog',interfaces:[]},{args:{query:'自然语言需求二'}});
 expect(p.issue(tool,{query:'反复改关键词'})).toBeTruthy();
 expect(p.issue(tool,{api_name:'actual_api'})).toBeUndefined();
 reply(p,'c',{kind:'catalog',interfaces:[]},{args:{api_name:'actual_api'}});
 expect(p.issue(tool,{api_name:'actual_api'})).toBeTruthy();
 expect(p.issue(tool,{api_name:'another_api'})).toBeUndefined();
});
it.each([{records:[]},{kind:'catalog',interfaces:[]},'not JSON'])('does not treat failed transport, business emptiness or unknown tools as conclusive discovery',value=>{
 const p=componentDiscoveryProgress(new Set([tool]));
 reply(p,'a',value,{isError:true});reply(p,'b',value,{isError:true});expect(p.issue(tool)).toBeUndefined();
 reply(p,'c',value,{name:'unknown'});reply(p,'d',value,{name:'unknown'});expect(p.issue('unknown')).toBeUndefined();
 if(value?.kind!=='catalog'){reply(p,'e',value);reply(p,'f',value);expect(p.issue(tool)).toBeUndefined()}
});

it('allows one bounded alternative-source window after conclusive empty discovery, never after data or the hard deadline',()=>{
 const p=componentDiscoveryProgress(new Set([tool]));
 expect(p.allowAlternativeRead({elapsed:95000,hasBusinessData:false})).toBe(false)
 reply(p,'one',{kind:'catalog',interfaces:[]},{args:{api_name:'missing'}})
 expect(p.allowAlternativeRead({elapsed:95000,hasBusinessData:false})).toBe(true)
 expect(p.allowAlternativeRead({elapsed:134999,hasBusinessData:false})).toBe(true)
 expect(p.allowAlternativeRead({elapsed:135000,hasBusinessData:false})).toBe(false)
 expect(p.allowAlternativeRead({elapsed:95000,hasBusinessData:true})).toBe(false)
 expect(componentDiscoveryProgress(new Set([tool])).allowAlternativeRead({elapsed:95000,hasBusinessData:false})).toBe(false)
})

it('reserves at most two unseen-source discoveries after empty directories without reopening exhausted sources',()=>{
 const p=componentDiscoveryProgress(new Set([tool]));const window={elapsed:100000,hasBusinessData:false,observedTools:new Set([tool])};
 reply(p,'missing',{kind:'catalog',interfaces:[]},{args:{api_name:'unavailable'}});
 expect(p.reserveAlternativeDiscovery(tool,window)).toBe(false);
 expect(p.reserveAlternativeDiscovery('public_data_query',window)).toBe(true);
 expect(p.reserveAlternativeDiscovery('public_data_query',window)).toBe(false);
 expect(p.reserveAlternativeDiscovery('financial_query',window)).toBe(true);
 expect(p.reserveAlternativeDiscovery('third',window)).toBe(false);
 const fresh=componentDiscoveryProgress(new Set([tool]));reply(fresh,'missing',{kind:'catalog',interfaces:[]},{args:{api_name:'unavailable'}});
 expect(fresh.reserveAlternativeDiscovery('other',{...window,elapsed:135000})).toBe(false);
 expect(fresh.reserveAlternativeDiscovery('other',{...window,hasBusinessData:true})).toBe(false);
});
