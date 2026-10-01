export type IframeSpec={version:1;type:'iframe';title:string;url:string|null;description?:string}
export const IFRAME_GUIDANCE:string
export const IFRAME_TEMPLATES:ReadonlyArray<{id:string;type:string;title:string;figma:string;width:number;height:number;minWidth:number;minHeight:number;version:string;interactions:string[]}>
export function parseIframeSpec(value:unknown):Readonly<IframeSpec>|null
