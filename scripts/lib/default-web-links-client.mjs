/** One session-aware path for ordinary anchors and native popup/navigation requests. */
export function installDefaultWebLinks({bridge,sessions,documentTarget}) {
  if(!bridge?.subscribe||!bridge?.openSource)return ()=>{};
  let active=true,creating,errorTimer;
  const doc=documentTarget;
  const normalize=value=>{try{if(typeof value!=='string'||value.length>8192)return null;const url=new URL(value,doc.location.href);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)?url.href:null;}catch{return null}};
  const failed=()=>{
    if(!active)return;
    doc.querySelector('[data-ework-web-link-error]')?.remove();
    const alert=doc.createElement('div');alert.setAttribute('data-ework-web-link-error','');alert.setAttribute('role','alert');
    alert.textContent=doc.documentElement.lang.startsWith('en')?'This page could not be opened. Please try again.':'网页暂时无法打开，请稍后重试。';
    alert.style.cssText='position:fixed;right:20px;bottom:24px;z-index:2147483647;max-width:360px;padding:12px 16px;border:1px solid #666;border-radius:8px;background:var(--surface-primary,#252525);color:var(--text-primary,#eee);font:13px/1.5 system-ui;box-shadow:0 4px 20px #0004';
    doc.body.append(alert);clearTimeout(errorTimer);errorTimer=setTimeout(()=>alert.remove(),8000);
  };
  const open=async raw=>{
    const url=normalize(raw);if(!active||!url)return;
    try{
      let sessionId=sessions.list.getSnapshot().current;
      if(!sessionId){
        creating??=Promise.resolve().then(()=>sessions.create({})).finally(()=>{creating=undefined});
        sessionId=await creating;if(!active)return;sessions.open(sessionId);
      }
      if(typeof sessionId!=='string'||!sessionId)throw Error('Session unavailable');
      doc.dispatchEvent(new doc.defaultView.Event('sherlock:open-client-browser'));
      await (doc.defaultView?.dshDesktop?.browserApp?.openSource??bridge.openSource)({sessionId,url});
    }catch{failed()}
  };
  const click=event=>{
    if(event.defaultPrevented||event.button!==0)return;
    const link=event.target?.closest?.('a[href]');
    if(!link||link.hasAttribute('download')||!normalize(link.href))return;
    event.preventDefault();void open(link.href);
  };
  doc.addEventListener('click',click);
  const off=bridge.subscribe(event=>{if(event?.request==='open-link')void open(event.url)});
  return ()=>{active=false;off?.();doc.removeEventListener('click',click);clearTimeout(errorTimer);doc.querySelector('[data-ework-web-link-error]')?.remove();};
}

export function patchDefaultWebLinks(source) {
  source=source.replace('dialog[open],[aria-modal=true],[role=menu]\'','dialog[open],[aria-modal=true],[role=menu],[data-ework-web-link-error]\'');
  const marker='/* EWORK_DEFAULT_WEB_LINKS_V1 */';
  if(source.includes(marker))return source;
  const anchor='const unregisterBrowser=service.registerTab(';
  if(source.split(anchor).length!==2)throw Error('默认网页浏览器无法定位右侧浏览器注册。');
  source=source.replace(anchor,`${marker}\nconst offDefaultWebLinks=(${installDefaultWebLinks.toString()})({bridge:window.dshDesktop?.conversationBrowser,sessions,documentTarget:document});\n${anchor}`);
  const handler='const unsubscribeBrowser=window.dshDesktop?.conversationBrowser?.subscribe(event=>{';
  if(source.split(handler).length!==2)throw Error('默认网页浏览器无法定位右侧浏览器事件。');
  source=source.replace(handler,handler+"\n      if(event?.request==='open-link')return;");
  const cleanup='unregisterBrowser?.();';
  if(source.split(cleanup).length!==2)throw Error('默认网页浏览器无法定位清理入口。');
  return source.replace(cleanup,cleanup+'offDefaultWebLinks();');
}
