export type BrowserOverlayPreparation = {
 element:HTMLElement
 waitUntil(ready:Promise<boolean>):void
}

export const rendererAttachmentSurfaceSelector = '[data-image-preview-dialog],.srb-notifications .srb-problem-form'

/** Popup owners can measure a hidden portal before handing it to a native surface. */
export function prepareBrowserOverlay(document:Document,element:HTMLElement){
 const pending:Promise<boolean>[]=[],Event=document.defaultView?.CustomEvent
 if(!Event)return
 document.dispatchEvent(new Event('sherlock:browser-overlay-prepare',{detail:{element,waitUntil:(ready:Promise<boolean>)=>pending.push(ready)} satisfies BrowserOverlayPreparation}))
 if(pending.length)return Promise.allSettled(pending).then(results=>results.every(result=>result.status==='fulfilled'&&result.value))
}
