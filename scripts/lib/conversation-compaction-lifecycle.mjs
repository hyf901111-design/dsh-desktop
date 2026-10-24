const MARKER='/* ework:conversation-compaction-lifecycle:v1 */'
const BEFORE='if (state.start === void 0 || state.end !== void 0) return null;\n\t\t\t\t\tconst marker = runningCompaction(state.start);\n\t\t\t\t\treturn chatNode(context, "compaction", marker.seq, marker);'
const BODY='if (state.start === void 0) return null;\n\t\t\t\t\tconst marker = runningCompaction(state.start);\n\t\t\t\t\tif (state.end !== void 0) return chatNode(context, "compaction", marker.seq, { ...marker, running: false }, { visibility: "hidden" });\n\t\t\t\t\treturn chatNode(context, "compaction", marker.seq, marker);'
const AFTER=MARKER+'\n\t\t\t\t\t'+BODY
const count=(source,text)=>source.split(text).length-1
const drift=()=>{throw Error('Conversation compaction lifecycle anchor drifted')}

/** Keep a published automatic-compaction key after an end without a checkpoint. */
export function stripConversationCompactionLifecycle(source){
 if(!source.includes(MARKER)){if(source.includes(BODY))drift();return source}
 if(count(source,MARKER)!==1||count(source,AFTER)!==1||source.includes(BEFORE))drift()
 return source.replace(AFTER,BEFORE)
}

export function patchConversationCompactionLifecycle(source){
 const base=stripConversationCompactionLifecycle(source)
 if(count(base,BEFORE)!==1)drift()
 return base.replace(BEFORE,AFTER)
}
