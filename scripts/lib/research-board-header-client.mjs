const start = '/* odyssey:research-board-header-actions */'
const end = '/* odyssey:research-board-header-actions:end */'
export function stripResearchBoardHeaderClient(source) {
  const first = source.indexOf(start)
  if (first < 0) return source
  const last = source.indexOf(end, first)
  if (last < 0) throw Error('Incomplete research board header actions patch')
  return source.slice(0, first) + source.slice(last + end.length + 1)
}
export function patchResearchBoardHeaderClient(source) {
  if (source.includes(start)) return source
  const anchor = 'const emptyViewport = canvasNodes.length > 0'
  if (source.split(anchor).length !== 2) throw Error('Research board header actions anchor missing or ambiguous')
  return source.replace(anchor, `${start}
    const headerCanvasIdle=editingNodeId===null&&editingContentNodeId===null&&resizingNodeId===null&&draggingNodeIds.length===0;
    sherlockBoardsPage.useResearchBoardCanvasHeader(workspace,rootRef,true,{
      ...(!canvasRefreshBusy&&headerCanvasIdle?{refresh:()=>void refreshCanvasView()}:{}),
      ...(!sharedReadOnly&&headerCanvasIdle&&canvasNodes.length?{arrange:()=>{
        const root=rootRef.current;
        if(root&&researchCanvasArrangeWithMotion(root,workspace,researchCanvasMeasureForArrange(root,canvasNodes)))setClipboardFeedback({state:"success",kind:"arrange",message:workbenchText("已整理 ")+canvasNodes.length+workbenchText(" 个组件")});
      }}:{}),
      ...(canvasNodes.length?{'select-all':()=>{
        workspace.updateSelection(canvasNodes.map(node=>node.id),"replace");
        rootRef.current?.focus({preventScroll:true});
      }}:{})
    });
${end}
${anchor}`)
}
