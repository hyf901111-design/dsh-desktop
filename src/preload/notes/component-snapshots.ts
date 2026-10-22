import type {NoteContent,NotesBridge} from '../../shared/workspace-notes'
import type {NoteComponentSnapshot} from '../../shared/note-component-snapshot'
export function noteSnapshotBlockIds(content:Pick<NoteContent,'blocks'>):string[]{
 const ids:string[]=[]
 const visit=(blocks:any[])=>{for(const block of blocks){if(block.type==='research'||block.type==='attachment')ids.push(block.id);if(Array.isArray(block.children))visit(block.children)}}
 visit(content.blocks);return ids
}
export async function gatherNoteComponentSnapshots(content:NoteContent,bridge:NotesBridge,sessionId:string):Promise<NoteComponentSnapshot[]>{
 const blockIds=noteSnapshotBlockIds(content)
 return blockIds.length?bridge.request('component-snapshots',{sessionId,blockIds}):[]
}

export async function exportNoteWithSnapshots(options:{snapshot():NoteContent;bridge:NotesBridge;sessionId:string;format:string;locale?:string;path?:string;executionId?:string;current():boolean}):Promise<unknown>{
 if(!options.current())throw Error('笔记会话已变化，请重新打开笔记后导出。')
 const fingerprint=JSON.stringify(options.snapshot()),content=JSON.parse(fingerprint) as NoteContent
 const snapshots=options.format==='md'?undefined:await gatherNoteComponentSnapshots(content,options.bridge,options.sessionId)
 if(!options.current())throw Error('笔记会话已变化，请重新打开笔记后导出。')
 if(JSON.stringify(options.snapshot())!==fingerprint)throw Error('笔记内容已变化，请重新导出以保持正文与组件一致。')
 return options.bridge.request('export',{sessionId:options.sessionId,format:options.format,locale:options.locale,content,...options.path?{path:options.path}:{},...options.executionId?{executionId:options.executionId}:{},...snapshots?{snapshots}:{}})
}
