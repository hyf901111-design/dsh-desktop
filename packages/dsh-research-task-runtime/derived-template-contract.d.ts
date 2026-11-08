export const DERIVED_GUIDANCE:string
export const DERIVED_TEMPLATES:readonly {id:string;type:string;title:string;figma:string;width:number;height:number;minWidth:number;minHeight:number;version:string;interactions:string[]}[]
export type DerivedSpec={version:1;type:'summary'|'mind-map';title:string;content:string;asOf?:string;note?:string;source:{title:string;text:string;nodeId?:string}}
export function parseDerivedSpec(s:unknown):DerivedSpec|null
export function derivedOutline(content:string):{label:string;line:number;children:unknown[]}|null
