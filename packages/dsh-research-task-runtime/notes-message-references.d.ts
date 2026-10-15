export type NoteMessageReference={blockId:string;type:'research'|'attachment'|'text';title:string}
export function noteMessageReferences(context:{scope:string;components?:{blockId:string;type:string;title?:string}[]},selection?:string):NoteMessageReference[]
