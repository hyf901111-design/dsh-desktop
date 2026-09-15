export function patchComponentInteractionState(source) {
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
  once('const heroWorkspaceRow = research && directoryLocked ? null', "const heroWorkspaceRow = (research && directoryLocked) || (sherlockShared(sessionId) && ((sherlockBoardsAdapter?.getView(sessionId)?.history?.length ?? 0)+(sherlockBoardsAdapter?.getView(sessionId)?.messages?.length ?? 0))>0) ? null");
  return source+'\n/* ODYSSEY_COMPONENT_INTERACTION_V1 */';
}
