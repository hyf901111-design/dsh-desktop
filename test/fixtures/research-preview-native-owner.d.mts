type PreviewGetter=()=>boolean
type NativeResource={owner:unknown}
export function createNativePreviewOwnerHarness():{
 adapter:{get(sessionId:string,read:PreviewGetter):unknown;subscribe(sessionId:string,read:PreviewGetter,listener:(owner:unknown,phase:string)=>void):()=>void}
 create(sessionId:string,workspace:{getPreviewMode:PreviewGetter}):NativeResource
 current():NativeResource|null
}
