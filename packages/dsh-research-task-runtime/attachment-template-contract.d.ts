export type AttachmentItem={id:string;name:string;url?:string|null;relativePath?:string;authorizationId?:string;sizeBytes?:number|null;date?:string;mimeType?:string;description?:string;source?:string;alt?:string;permissions?:{preview?:boolean;download?:boolean;remove?:boolean}}
export type AttachmentSpec={version:1;type:'files'|'gallery';title:string;items:AttachmentItem[];description?:string;source?:string;date?:string;asOf?:string;presentation?:'webpage';comparisonPlanNames?:readonly string[]}
export const ATTACHMENT_GUIDANCE:string
export const ATTACHMENT_TEMPLATES:readonly {id:string;type:string;title:string;figma:string;width:number;height:number;minWidth:number;minHeight:number;version:string;interactions:string[]}[]
export function parseAttachmentSpec(value:unknown):Readonly<AttachmentSpec>|null
