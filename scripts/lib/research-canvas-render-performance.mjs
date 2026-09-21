/** Keep immutable card inputs stable during viewport and generation updates. */
export function patchResearchCanvasRenderPerformance(source) {
  if (source.includes('/* ODYSSEY_STABLE_CANVAS_CARDS */')) return source
  const change=(a,b)=>{if(!source.includes(a))throw Error('Missing canvas performance anchor: '+a);source=source.replace(a,b)}
  for(const field of ['files','artifacts'])change(`Object.freeze(snapshot.${field}.map((node) => Object.freeze({ ...node })))`, `Object.isFrozen(snapshot.${field}) ? snapshot.${field} : Object.freeze(snapshot.${field}.map((node) => Object.isFrozen(node) ? node : Object.freeze({ ...node })))`)
  change('function ResearchCanvasArtifactCard(', `/* ODYSSEY_STABLE_CANVAS_CARDS */
    function stableResearchCard(Card){
      const Content=react.memo(Card);
      return function StableResearchCard(props){
        const latest=react.useRef(props);latest.current=props;
        const callbacks=react.useRef({}),forwarded={};
        for(const [key,value] of Object.entries(props)){
          if(typeof value==='function'){
            if(!callbacks.current[key])callbacks.current[key]=(...args)=>latest.current[key]?.(...args);
            forwarded[key]=callbacks.current[key];
          }else forwarded[key]=value;
        }
        return react_jsx_runtime.jsx(Content,forwarded);
      };
    }
    const ResearchStableArtifactCard=stableResearchCard(ResearchCanvasArtifactCard);
    const ResearchStableFileCard=stableResearchCard(ResearchCanvasFileCard);
    function ResearchCanvasArtifactCard(`)
  change('jsx)(ResearchCanvasArtifactCard, {', 'jsx)(ResearchStableArtifactCard, {')
  change('jsx)(ResearchCanvasFileCard, {', 'jsx)(ResearchStableFileCard, {')
  return source
}
