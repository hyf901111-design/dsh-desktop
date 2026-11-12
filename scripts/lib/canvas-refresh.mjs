// Refresh presentation only: no generation task, content mutation or history entry.
export async function refreshResearchCanvasView({sessionId,shared,adapter,remount,isActive}) {
  if (shared) {
    if (!adapter) throw Error('协作画板暂不可用。');
    if (!isActive()) return;
    await adapter.refreshCanvas(sessionId);
  }
  if (isActive()) remount();
}
export function patchCanvasRefresh(source) {
  const marker='/* odyssey:canvas-refresh:v1 */';
  const state='const [contextMenu, setContextMenu] = (0, react.useState)(null);';
  const helper=marker+'\n'+refreshResearchCanvasView.toString()+'\n';
  const existing=source.indexOf(marker);
  if(existing>=0){
    const end=source.indexOf(state,existing+marker.length);
    if(end<0)throw Error('Canvas refresh helper boundary missing');
    return source.slice(0,existing)+helper+source.slice(end);
  }
  const replace=(anchor,value)=>{
    if(source.split(anchor).length!==2)throw Error('Canvas refresh anchor missing or ambiguous: '+anchor.slice(0,90));
    source=source.replace(anchor,value);
  };
  replace(state,helper+state);
  // Older builds may retain hooks while the layout patch regenerated helpers.
  if(source.includes('const [canvasRefreshEpoch,setCanvasRefreshEpoch]'))return source;
  replace(state,state+`
    const [canvasRefreshEpoch,setCanvasRefreshEpoch]=react.useState(0);
    const [canvasRefreshBusy,setCanvasRefreshBusy]=react.useState(false);
    const canvasRefreshPending=react.useRef(false);
    const refreshCanvasView=async()=>{
      if(canvasRefreshPending.current)return;
      canvasRefreshPending.current=true;setCanvasRefreshBusy(true);setContextMenu(null);
      try{
        await refreshResearchCanvasView({sessionId,shared:sherlockShared(sessionId),adapter:sherlockBoardsAdapter,isActive:()=>dropLifecycle.active,remount:()=>setCanvasRefreshEpoch(value=>value+1)});
        if(dropLifecycle.active)setClipboardFeedback({state:'success',message:'画板已刷新'});
      }catch(error){if(dropLifecycle.active)setClipboardFeedback({state:'error',message:error?.message??'画板刷新失败，请重试。'});}
      finally{if(dropLifecycle.active){canvasRefreshPending.current=false;setCanvasRefreshBusy(false);}}
    };
    react.useEffect(()=>{canvasRefreshPending.current=false;setCanvasRefreshBusy(false);},[sessionId]);`);
  replace('}), selectionActionPosition === null', '}, canvasRefreshEpoch), selectionActionPosition === null');
  const button=`(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-research-context-refresh':'',disabled:canvasRefreshBusy||editingNodeId!==null||editingContentNodeId!==null||resizingNodeId!==null||draggingNodeIds.length>0,onClick:()=>void refreshCanvasView(),children:canvasRefreshBusy?'刷新中…':'刷新'},'refresh'), `;
  replace('children: contextMenu.nodeId === null ? [','children: contextMenu.nodeId === null ? ['+button);
  replace('}, "select-all")] : [','}, "select-all")] : ['+button);
  return source;
}
