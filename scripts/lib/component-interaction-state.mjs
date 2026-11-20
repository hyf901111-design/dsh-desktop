import {validNoteContent,validNoteState,noteMarkdownHtml,noteDraftSource} from '../../packages/dsh-research-task-runtime/note-template-contract.js';
import {patchRssClient} from './rss-client.mjs';
function patchLegacyComponentInteractionState(source) {
  if(source.includes('/* ODYSSEY_COMPONENT_INTERACTION_V1 */'))return source;
  const once=(a,b)=>{if(!source.includes(a)||source.indexOf(a)!==source.lastIndexOf(a))throw Error('Interaction anchor missing or ambiguous: '+a.slice(0,90));source=source.replace(a,b);};
  once('function createResearchWorkspaceSession(storage, sessionId) {',`const researchInteractionSinks = new Map();
  function createResearchWorkspaceSession(storage, sessionId) {`);
  once('const htmlFitStates = new Map();',`researchInteractionSinks.set(sessionId,(nodeId,version,event)=>{
    if(!collaborationCanWrite()||!validResearchInteractionEvent(event))return false;
    const node=snapshot.artifacts.find(n=>n.id===nodeId);
    if(!node?.containerSpec?.html||researchInteractionVersion(node.containerSpec.html)!==version)return false;
    const previous=node.config?.interactionState;
    const events=previous?.version===version&&validResearchInteractionState(previous)?previous.events:{};
    if(events[event.id])return true;
    const state={version,events:{...events,[event.id]:event}};
    if(!validResearchInteractionState(state))throw Error('组件交互记录已满，当前操作未保存。');
    return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,config:{...n.config,interactionState:state}}:n)},true)!==false;
  });
  const htmlFitStates = new Map();`);
  once('...(container && Object.hasOwn({small:1,medium:1,large:1}, value.containerSizePreset)',`...(container && validResearchInteractionState(value.config?.interactionState) ? {config:{interactionState:value.config.interactionState}} : {}),
                ...(container && Object.hasOwn({small:1,medium:1,large:1}, value.containerSizePreset)`);
  once('(ResearchHtmlArtifact, { spec, node, onSize: onHtmlSize })','(ResearchHtmlArtifact, { spec, node, sessionId, onSize: onHtmlSize })');
  once('const fittingRef = (0, react.useRef)({ node, onSize });',`const interactionSessionId=arguments[0].sessionId;
    (0,react.useSyncExternalStore)(sherlockBoardsAdapter?.subscribe ?? (()=>()=>{}),sherlockBoardsAdapter?.version ?? (()=>0));
    const interactionReadOnly=sherlockShared(interactionSessionId)&&sherlockBoardsAdapter?.getView(interactionSessionId)?.permissions.edit!==true;
    const interactionRef=(0,react.useRef)({});
    interactionRef.current={node,readOnly:interactionReadOnly,sessionId:interactionSessionId};
    const sendInteraction=()=>{
      const current=interactionRef.current;
      const version=researchInteractionVersion(current.node.containerSpec.html);
      const saved=current.node.config?.interactionState;
      frameRef.current?.contentWindow?.postMessage({type:'sherlock-interaction-state',state:saved?.version===version&&validResearchInteractionState(saved)?saved:{version,events:{}},readOnly:current.readOnly},'*');
    };
    (0,react.useLayoutEffect)(()=>{sendInteraction();},[node.config?.interactionState,interactionReadOnly]);
    const fittingRef = (0, react.useRef)({ node, onSize });`);
  once('if (data.type === "sherlock-content-hover" && Object.keys(data).length === 2',`if(data.type==='sherlock-interaction-ready'){sendInteraction();return;}
    if(data.type==='sherlock-interaction-event'){
      const c=interactionRef.current;
      try {
        if(c.readOnly || !researchInteractionSinks.get(c.sessionId)?.(c.node.id,researchInteractionVersion(spec.html),data.event))sendInteraction();
      } catch(error){sherlockBoardsAdapter?.showError(error);sendInteraction();}
      return;
    }
    if (data.type === "sherlock-content-hover" && Object.keys(data).length === 2`);
  const directoryPolicy = source.includes('const heroWorkspaceRow = research && (!browserAppActive || directoryLocked) ? null')
    ? '(!browserAppActive || directoryLocked)' : 'directoryLocked';
  once(`const heroWorkspaceRow = research && ${directoryPolicy} ? null`,
    `const heroWorkspaceRow = (research && ${directoryPolicy}) || (sherlockShared(sessionId) && ((sherlockBoardsAdapter?.getView(sessionId)?.history?.length ?? 0)+(sherlockBoardsAdapter?.getView(sessionId)?.messages?.length ?? 0))>0) ? null`);
  return source+'\n/* ODYSSEY_COMPONENT_INTERACTION_V1 */';
}

function patchSharedComponentInteractionState(source) {
  source = patchLegacyComponentInteractionState(source);
  if(source.includes('/* ODYSSEY_COMPONENT_SHARED_STATE_V1 */'))return source;
  const once=(a,b)=>{if(!source.includes(a)||source.indexOf(a)!==source.lastIndexOf(a))throw Error('Shared state anchor missing: '+a.slice(0,90));source=source.replace(a,b);};
  once('const researchInteractionSinks = new Map();',`const researchInteractionSinks = new Map(); const researchSharedStateSinks = new Map();`);
  once('researchInteractionSinks.set(sessionId,(nodeId,version,event)=>{',`researchSharedStateSinks.set(sessionId,(nodeId,version,state,revision)=>{
    let encoded;try{encoded=JSON.stringify(state);}catch{return false;}
    if(sherlockShared(sessionId)||!collaborationCanWrite()||!Number.isSafeInteger(revision)||revision<1||typeof encoded!=='string'||new TextEncoder().encode(encoded).length>65536)return false;
    const node=snapshot.artifacts.find(n=>n.id===nodeId);
    if(!node?.containerSpec?.html||researchInteractionVersion(node.containerSpec.html)!==version)return false;
    return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,config:{...n.config,sharedComponentState:{version,state,revision}}}:n)},true)!==false;
  });
  researchInteractionSinks.set(sessionId,(nodeId,version,event)=>{`);
  once('...(container && validResearchInteractionState(value.config?.interactionState)',`...(container && value.config?.sharedComponentState && JSON.stringify(value.config.sharedComponentState).length<66000 ? {config:{sharedComponentState:value.config.sharedComponentState}} : {}),
                ...(container && validResearchInteractionState(value.config?.interactionState)`);
  once('config:{interactionState:value.config.interactionState}', 'config:{interactionState:value.config.interactionState,...(value.config?.sharedComponentState && JSON.stringify(value.config.sharedComponentState).length<66000 ? {sharedComponentState:value.config.sharedComponentState} : {})}');
  once('const sendInteraction=()=>{',`const sharedPeerRef=(0,react.useRef)(null);
    const componentContext=()=>{
      const c=interactionRef.current, v=sherlockBoardsAdapter?.getView(c.sessionId);
      return {type:'sherlock-component-context',shared:sherlockShared(c.sessionId),online:v?.connection==='online',readOnly:c.readOnly,userId:sherlockBoardsAdapter?.getState()?.account?.user?.userId,saved:c.node.config?.sharedComponentState?.version===researchInteractionVersion(c.node.containerSpec.html)?c.node.config.sharedComponentState:undefined};
    };
    (0,react.useLayoutEffect)(()=>{
      frameRef.current?.contentWindow?.postMessage(componentContext(),'*');
    });
    (0,react.useLayoutEffect)(()=>{
      const off=sherlockBoardsAdapter?.subscribeComponent?.(event=>{
        const c=interactionRef.current, m=event.message;
        if(event.localSessionId!==c.sessionId || m.nodeId!==c.node.id || m.version!==researchInteractionVersion(c.node.containerSpec.html))return;
        frameRef.current?.contentWindow?.postMessage({type:'sherlock-component-receive',message:m},'*');
      });
      return ()=>{
        off?.();
        const peer=sharedPeerRef.current;
        if(peer)void sherlockBoardsAdapter?.call('component.send',{boardId:peer.boardId,message:{...peer.message,op:'leave'}}).catch(()=>{});
        sharedPeerRef.current=null;
      };
    },[interactionSessionId,node.id,spec.html]);
    const sendInteraction=()=>{`);
  once("if(data.type==='sherlock-interaction-ready'){",`if(data.type==='sherlock-component-send'){
      const c=interactionRef.current, context=componentContext(), m=data.message;
      if(!m||typeof m!=='object')return;
      if(m.op==='localCommit'){
        if(!context.shared)researchSharedStateSinks.get(c.sessionId)?.(c.node.id,researchInteractionVersion(c.node.containerSpec.html),m.state,m.revision);
        return;
      }
      if(m.op==='join')frameRef.current?.contentWindow?.postMessage(context,'*');
      if(!context.shared||!context.online)return;
      const v=sherlockBoardsAdapter?.getView(c.sessionId);
      const message={...m,nodeId:c.node.id,version:researchInteractionVersion(c.node.containerSpec.html)};
      if(m.op==='join')sharedPeerRef.current={boardId:v.boardId,message};
      void sherlockBoardsAdapter.call('component.send',{boardId:v.boardId,message}).catch(error=>{
        frameRef.current?.contentWindow?.postMessage({type:'sherlock-component-receive',message:{peerId:m.peerId,kind:'error',error:'组件同步暂不可用'}},'*');
      });
      return;
    }
    if(data.type==='sherlock-interaction-ready'){`);
  return source+'\n/* ODYSSEY_COMPONENT_SHARED_STATE_V1 */';
}

function patchNoteDraftSources(source){
 const marker='/* ODYSSEY_NOTE_DRAFT_SOURCES_V1 */',endMarker='/* ODYSSEY_NOTE_DRAFT_SOURCES_END */';
 const definitions=`${marker}
 const validNoteContent=${validNoteContent.toString()},validNoteState=${validNoteState.toString()},noteMarkdownHtml=${noteMarkdownHtml.toString()},noteDraftSource=${noteDraftSource.toString()};
 ${endMarker}`;
 const prior=source.indexOf(marker);
 if(prior>=0){let end=source.indexOf(endMarker,prior);if(end>=0)end+=endMarker.length;else{end=source.indexOf('const [readable, setReadable]',prior);if(end<0)throw Error('Note source helper boundary missing');}source=source.slice(0,prior)+definitions+'\n'+source.slice(end).replace(/^\s*\n/,'');}
 else{const anchor='function ResearchHtmlArtifact({ spec, node, onSize }) {';if(source.split(anchor).length!==2)throw Error('Note source host anchor missing');source=source.replace(anchor,`${anchor}\n ${definitions}`);}
 const original='const source = sources.find(s => s.href === normalizeResearchWebUrl(data.url));';
 if(source.includes(original)){if(source.split(original).length!==2)throw Error('Note source request anchor ambiguous');source=source.replace(original,'const source = sources.find(s => s.href === normalizeResearchWebUrl(data.url)) ?? noteDraftSource(current.node,data.url,researchInteractionVersion(spec.html));');}
 else if(!source.includes('?? noteDraftSource(current.node,data.url,researchInteractionVersion(spec.html))'))throw Error('Note source request anchor missing');
 return source;
}

export function patchComponentInteractionState(source) {
  source=patchRssClient(patchNoteDraftSources(patchSharedComponentInteractionState(source)));
  if(source.includes('/* ODYSSEY_COMPONENT_INTERACTION_ACK_V2 */'))return source;
  const once=(a,b)=>{if(source.split(a).length!==2)throw Error('Interaction acknowledgement anchor missing: '+a.slice(0,90));source=source.replace(a,b);};
  once('const sendInteraction=()=>{','const sendInteraction=(rejectedEventId)=>{');
  once("{version,events:{}},readOnly:current.readOnly},'*');", "{version,events:{}},readOnly:current.readOnly,...(typeof rejectedEventId==='string'?{rejectedEventId}:{})},'*');");
  once('researchInteractionVersion(spec.html),data.event))sendInteraction();','researchInteractionVersion(spec.html),data.event))sendInteraction(data.event?.id);');
  once('catch(error){sherlockBoardsAdapter?.showError(error);sendInteraction();}','catch(error){sherlockBoardsAdapter?.showError(error);sendInteraction(data.event?.id);}');
  return source+'\n/* ODYSSEY_COMPONENT_INTERACTION_ACK_V2 */';
}
