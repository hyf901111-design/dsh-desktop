export function cancelPptxResize(viewer) {
  clearTimeout(viewer.sherlockResizeTimer)
  viewer.sherlockResizeTimer = undefined
}
export function schedulePptxResize(viewer) {
  cancelPptxResize(viewer)
  viewer.sherlockResizeTimer = setTimeout(() => {
    viewer.sherlockResizeTimer = undefined
    if (viewer.presentation) void viewer.queueRender()
  }, 160)
}
const marker='/* sherlock:pptx-resize-settle:v1 */'
const original='this.resizeRafId = null, this.queueRender();'
const replacement='this.resizeRafId = null, schedulePptxResize(this);'
const teardown='teardownAdaptiveResize() {'
const cleanup='teardownAdaptiveResize() { cancelPptxResize(this);'
export function stripPptxResizePatch(source) {
 if(!source.includes(marker))return source
 const start=source.indexOf(marker),end=source.indexOf('/* sherlock:pptx-resize-settle:end */',start)
 if(end<0)throw Error('PPT resize patch end missing')
 return (source.slice(0,start)+source.slice(end+'/* sherlock:pptx-resize-settle:end */'.length+1)).replace(replacement,original).replace(cleanup,teardown)
}
export function patchPptxResize(source) {
 if(source.includes(marker))return source
 if(source.split(original).length!==2||source.split(teardown).length!==2)throw Error('PPT resize anchors drifted')
 return marker+'\n'+cancelPptxResize.toString()+'\n'+schedulePptxResize.toString()+'\n/* sherlock:pptx-resize-settle:end */\n'+source.replace(original,replacement).replace(teardown,cleanup)
}
