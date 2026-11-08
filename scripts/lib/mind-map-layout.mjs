// Shared by source-derived and ordinary native mind maps. Layout depends on
// available reading width and tree structure, never on a particular document.
export function ResearchMindMapConnections({rootRef,revision}) {
  const [geometry,setGeometry]=(0,react.useState)({width:1,height:1,path:''});
  (0,react.useEffect)(()=>{
    const root=rootRef.current;if(!root)return;let active=true;
    const measure=()=>{
      if(!active)return;
      const origin=root.querySelector(':scope > [data-research-mind-map-node]');if(!origin)return;
      const children=root.querySelector(':scope > .rScV5Q_mindMapChildren'),count=children?.children.length||0;
      const depth=Math.max(1,...Array.from(root.querySelectorAll('[data-research-mind-map-depth]'),node=>Number(node.getAttribute('data-research-mind-map-depth'))||0));
      const minimum=180+Math.max(0,depth-2)*24;
      const wide=count>=2&&root.clientWidth>=840&&root.clientWidth-48>=count*minimum+(count-1)*24;
      const horizontalMinimum=48+(depth+1)*160+depth*40;
      const mode=wide?'wide':root.clientWidth>=horizontalMinimum?'compact':'stacked';
      if(root.getAttribute('data-research-mind-map-layout')!==mode){root.setAttribute('data-research-mind-map-layout',mode);root.scrollLeft=0;root.scrollTop=0;}
      root.style.setProperty('--ew-map-branches',String(Math.max(1,count)));
      const bounds=root.getBoundingClientRect();if(!(bounds.width>0&&bounds.height>0))return;
      const sx=root.clientWidth/bounds.width,sy=root.clientHeight/bounds.height;
      const box=element=>{const rect=element.getBoundingClientRect();return {left:(rect.left-bounds.left)*sx+root.scrollLeft,top:(rect.top-bounds.top)*sy+root.scrollTop,width:rect.width*sx,height:rect.height*sy};};
      const paths=[];
      for(const branch of root.querySelectorAll('[data-research-mind-map-branch]')){
        const child=branch.querySelector(':scope > [data-research-mind-map-node]'),parentBranch=branch.parentElement.closest('[data-research-mind-map-branch]'),parent=parentBranch?.querySelector(':scope > [data-research-mind-map-node]')??origin;
        if(!child||!parent)continue;
        const a=box(parent),b=box(child);
        if(wide){
          const x=a.left+a.width/2,y=a.top+a.height;
          if(!parentBranch||branch.parentElement.children.length===1){const endX=b.left+b.width/2,middle=(y+b.top)/2;paths.push('M'+x+' '+y+'V'+middle+'H'+endX+'V'+b.top);}
          else{const rail=b.left-10;paths.push('M'+x+' '+y+'V'+(y+10)+'H'+rail+'V'+(b.top+b.height/2)+'H'+b.left);}
        }else if(mode==='stacked'){const rail=a.left+9;paths.push('M'+rail+' '+(a.top+a.height)+'V'+(b.top+b.height/2)+'H'+b.left);}
        else{const x=a.left+a.width,y=a.top+a.height/2,endY=b.top+b.height/2,middle=(x+b.left)/2;paths.push('M'+x+' '+y+'H'+middle+'V'+endY+'H'+b.left);}
      }
      const content=Array.from(root.querySelectorAll('[data-research-mind-map-node],.odyssey-component-summary-note')).map(box);
      const next={width:Math.max(root.clientWidth,...content.map(item=>item.left+item.width)),height:Math.max(root.clientHeight,...content.map(item=>item.top+item.height)),path:paths.join(' ')};
      setGeometry(before=>JSON.stringify(before)===JSON.stringify(next)?before:next);
    };
    const View=root.ownerDocument.defaultView,observer=View?.ResizeObserver?new View.ResizeObserver(measure):null;
    observer?.observe(root);for(const node of root.querySelectorAll('[data-research-mind-map-node]'))observer?.observe(node);
    measure();root.ownerDocument.fonts?.ready.then(measure);
    return()=>{active=false;observer?.disconnect();};
  },[rootRef,revision]);
  return (0,react_jsx_runtime.jsx)('svg',{'data-research-mind-map-edges':'','aria-hidden':true,width:geometry.width,height:geometry.height,viewBox:'0 0 '+geometry.width+' '+geometry.height,children:(0,react_jsx_runtime.jsx)('path',{d:geometry.path,fill:'none',stroke:'currentColor',strokeWidth:1})});
}
export const adaptiveMindMapCss=`
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="stacked"]{height:auto!important;min-height:220px!important;flex:none!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:18px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="stacked"]>.rScV5Q_mindMapRoot{flex:none!important;align-self:stretch!important;width:100%!important;min-width:120px!important;max-width:none!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="stacked"] .rScV5Q_mindMapChildren{box-sizing:border-box!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;width:100%!important;min-width:0!important;padding-left:18px!important;gap:18px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="stacked"] .rScV5Q_mindMapBranch{display:flex!important;flex-direction:column!important;align-items:stretch!important;width:100%!important;min-width:0!important;gap:18px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="stacked"] .rScV5Q_mindMapBranch>[data-research-mind-map-node]{box-sizing:border-box!important;flex:none!important;width:100%!important;min-width:120px!important;max-width:none!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="wide"]{height:auto!important;min-height:220px!important;flex:none!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:32px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="wide"]>.rScV5Q_mindMapRoot{flex:none!important;align-self:center!important;width:224px!important;max-width:224px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="wide"]>.rScV5Q_mindMapChildren{display:grid!important;grid-template-columns:repeat(var(--ew-map-branches),minmax(0,1fr));align-items:start;width:100%;gap:24px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="wide"] .rScV5Q_mindMapBranch{flex-direction:column!important;align-items:stretch!important;gap:24px!important}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="wide"] .rScV5Q_mindMapBranch>.rScV5Q_mindMapChildren{padding-left:14px!important;gap:18px!important;min-width:0}
[data-research-compact-chrome] .rScV5Q_mindMap[data-research-mind-map-layout="wide"] .rScV5Q_mindMapBranch [data-research-mind-map-node]{flex:none!important;width:100%!important;min-width:0!important;max-width:none!important}
`;
