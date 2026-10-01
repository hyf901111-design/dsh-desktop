export function patchRssClient(source){
 const start='/* ODYSSEY_RSS_REQUEST_V1 */',end='/* ODYSSEY_RSS_REQUEST_END */';
 const body=`${start}
    if(data.type==='sherlock-rss-request'){
      const c=interactionRef.current;
      if(c.readOnly||!c.sessionId||!/<body\\b[^>]*data-sherlock-template="rss"/.test(c.node.containerSpec?.html??'')||typeof data.requestId!=='string'||!/^[a-z0-9-]{1,80}$/.test(data.requestId)||!['add','defaults','refresh','remove'].includes(data.action))return;
      const requestId=data.requestId,windowRef=frameRef.current?.contentWindow,nodeId=c.node.id;
      const reply=error=>{if(interactionRef.current.node.id===nodeId)windowRef?.postMessage({type:'sherlock-rss-result',requestId,...(error?{error:String(error).slice(0,1000)}:{})},'*');};
      if(!window.dshDesktop?.researchRss?.request){reply('订阅读取服务不可用');return;}
      void window.dshDesktop.researchRss.request({sessionId:c.sessionId,nodeId,action:data.action,...(data.url!==undefined?{url:data.url}:{}),...(data.feedId!==undefined?{feedId:data.feedId}:{})}).then(()=>reply()).catch(error=>reply(error?.message??'读取失败，已有内容保留'));
      return;
    }
    ${end}`;
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('RSS patch boundary missing');return source.slice(0,a)+body+source.slice(b+end.length);}
 const anchor="if(data.type==='sherlock-component-send'){";if(source.split(anchor).length!==2)throw Error('RSS host request anchor missing');return source.replace(anchor,body+'\n'+anchor);
}
