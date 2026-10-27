// Strict source transforms for Native Session paging and its existing anchored ChatView button.
const runtimeSwap=["\t\t\t/** Page up: pull one earlier page with the window's first seq as beforeSeq and prepend. */\n\t\t\tasync loadOlder() {\n\t\t\t\tif (this.openState !== \"open\" || !this.hasMore || this.loadingOlder) return;\n\t\t\t\tthis.loadingOlder = true;\n\t\t\t\tthis.notifier.markDirty();\n\t\t\t\ttry {\n\t\t\t\t\tconst { result } = await this.history({\n\t\t\t\t\t\tbeforeSeq: this.baseSeq,\n\t\t\t\t\t\tmaxMessages: 50\n\t\t\t\t\t});\n\t\t\t\t\tif (!result.ok) return;\n\t\t\t\t\tconst older = result.value.events;\n\t\t\t\t\tif (older.length === 0) {\n\t\t\t\t\t\tthis.hasMore = result.value.hasMore;\n\t\t\t\t\t\tthis.conversation.prepend([], this.hasMore);\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t\tconst tail = older[older.length - 1];\n\t\t\t\t\tif (tail === void 0 || tail.event.seq + 1 !== this.baseSeq) {\n\t\t\t\t\t\tconsole.error(`[web-runtime] history page discontinuous: tail seq ${tail?.event.seq} vs baseSeq ${this.baseSeq}`);\n\t\t\t\t\t\tthis.hasMore = false;\n\t\t\t\t\t\tthis.conversation.prepend([], false);\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t\tthis.events = [...older.map((e) => e.event), ...this.events];\n\t\t\t\t\tthis.views = [...older.map((e) => e.view), ...this.views];\n\t\t\t\t\t/* v8 ignore next -- the ?? arm needs older[0] undefined, but the empty-page branch above already returned. */\n\t\t\t\t\tthis.baseSeq = older[0]?.event.seq ?? this.baseSeq;\n\t\t\t\t\tthis.hasMore = result.value.hasMore;\n\t\t\t\t\tthis.conversation.prepend(older.map(conversationInput), this.hasMore);\n\t\t\t\t} catch (error) {\n\t\t\t\t\tconsole.error(\"[web-runtime] loadOlder failed:\", error);\n\t\t\t\t} finally {\n\t\t\t\t\tthis.loadingOlder = false;\n\t\t\t\t\tthis.notifier.markDirty();\n\t\t\t\t}\n\t\t\t}\n",String.raw`			/* ework:conversation-history-runtime:v1 */
			async loadOlder(options) {
                const signal=options?.signal;
                if(this.openState!=="open"||!this.hasMore||this.loadingOlder||this.removed||signal?.aborted)return;
                const generation=this.openGeneration,address=this.address,startSeq=this.baseSeq,humans=new Set(),turns=new Set();
                const current=()=>!signal?.aborted&&generation===this.openGeneration&&address===this.address&&this.openState==="open"&&!this.removed;
                const read=payload=>new Promise((resolve,reject)=>{
                    let settled=false;
                    const finish=(callback,value)=>{if(settled)return;settled=true;signal?.removeEventListener("abort",abort);callback(value)};
                    const abort=()=>finish(resolve,null);
                    if(signal?.aborted){abort();return}
                    signal?.addEventListener("abort",abort,{once:true});
                    Promise.resolve().then(()=>current()?this.history(payload):null).then(value=>finish(resolve,value),error=>finish(reject,error));
                });
                this.loadingOlder=true;this.notifier.markDirty();
                try {
                    for(let page=0;page<8&&this.hasMore&&current();page++){
                        const cursor=this.baseSeq,response=await read({beforeSeq:cursor,maxMessages:50});
                        if(!current()||this.baseSeq!==cursor||response===null)return;
                        const {result}=response;
                        if(!result.ok)return result;
                        const older=result.value.events;
                        if(older.length===0){
                            if(result.value.hasMore)throw Error("History page did not advance");
                            this.hasMore=false;this.conversation.prepend([],false);return;
                        }
                        if(older[0].event.seq>=cursor||older[older.length-1].event.seq+1!==cursor||older.some((entry,index)=>!Number.isSafeInteger(entry.event.seq)||entry.event.seq<0||(index>0&&entry.event.seq!==older[index-1].event.seq+1)))throw Error("History page is not contiguous");
                        this.events=[...older.map(entry=>entry.event),...this.events];
                        this.views=[...older.map(entry=>entry.view),...this.views];
                        this.baseSeq=older[0].event.seq;this.hasMore=result.value.hasMore;
                        this.conversation.prepend(older.map(conversationInput),this.hasMore);
                        for(const {event}of older){
                            if(event.seq>=startSeq)continue;
                            if(event.type==="user/message"&&isAppendSurfaceEvent(event)&&event.data.source?.kind==="user")humans.add(event.seq);
                            if(event.type==="turn/end"&&Number.isSafeInteger(event.data.turn))turns.add(event.data.turn);
                        }
                        this.notifier.markDirty();
                        if(humans.size>=3||turns.size>=3)break;
                    }
                }catch(error){
                    if(current())return{ok:false,error:{code:"history-load-failed",message:String(error?.message??error)}};
                }finally{this.loadingOlder=false;this.notifier.markDirty()}
            }
			/* ework:conversation-history-runtime:end */
`]
const clientSwaps=[
 ["async loadOlder() {\n\t\t\t\tawait this.scopedSession(\"loadOlder\").loadOlder();\n\t\t\t}",String.raw`/* ework:conversation-history-service:v1 */
			async loadOlder(options) {
				return await this.scopedSession("loadOlder").loadOlder(options);
			}`],
 ["loadOlder: () => {\n\t\t\t\t\t\t\tscoped.loadOlder();\n\t\t\t\t\t\t}",String.raw`/* ework:conversation-history-binding:v1 */
						loadOlder: options => scoped.loadOlder(options)`],
 ["\t\t\tconst loadOlderAnchored = () => {\n\t\t\t\tconst local = listRef.current;\n\t\t\t\t/* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */\n\t\t\t\tif (local !== null) {\n\t\t\t\t\tconst el = scrollerOf(local);\n\t\t\t\t\tconst row = pagingAnchor(local, el);\n\t\t\t\t\tif (row !== null && row.dataset.chatAnchorKey !== void 0) anchorRef.current = {\n\t\t\t\t\t\tkey: row.dataset.chatAnchorKey,\n\t\t\t\t\t\ttop: flowTop(row, el)\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t\tloadOlder();\n\t\t\t};\n",String.raw`            /* ework:conversation-history-view:v1 */
            const historyRequest=(0,react.useRef)(null),[historyError,setHistoryError]=(0,react.useState)(null);
            (0,react.useLayoutEffect)(()=>{setHistoryError(null);return()=>{historyRequest.current?.abort();historyRequest.current=null}},[sessionId,useSession]);
            const loadOlderAnchored = async () => {
                if(historyRequest.current)return;
                const ticket=new AbortController();historyRequest.current=ticket;setHistoryError(null);
                const local=listRef.current;
                if(local!==null){const el=scrollerOf(local),row=pagingAnchor(local,el);if(row!==null&&row.dataset.chatAnchorKey!==void 0)anchorRef.current={key:row.dataset.chatAnchorKey,top:flowTop(row,el)}}
                try{const result=await loadOlder({signal:ticket.signal});if(result?.ok===false)throw Error(result.error.message)}
                catch(error){if(!ticket.signal.aborted&&historyRequest.current===ticket)setHistoryError(String(error?.message??error).slice(0,400))}
                finally{if(historyRequest.current===ticket)historyRequest.current=null}
            };
            /* ework:conversation-history-view:end */
`],
 ["const anchor = anchorRef.current;\n\t\t\t\t\tanchorRef.current = null;",String.raw`const anchor = anchorRef.current;
					/* ework:conversation-history-anchor:v1 */ if(!loadingOlder)anchorRef.current = null;`],
 ["children: loadingOlder ? t(\"loading\") : t(\"chat.loadOlder\")",String.raw`/* ework:conversation-history-error:v1 */ children: historyError ? t("chat.loadError",{message:historyError,code:"history"})+" · "+t("chat.loadOlder") : loadingOlder ? t("loading") : t("chat.loadOlder")`]
]
const count=(source,text)=>source.split(text).length-1
function strip(source,swaps,kind){
 const markers=source.match(/ework:conversation-history-[\w-]+(?::v\d+|:end)/g)??[];
 if(!markers.length){if(source.includes('ework:conversation-history-')||source.includes('startSeq=this.baseSeq,humans=new Set()')||source.includes('const historyRequest=(0,react.useRef)(null)')||swaps.some(([,after])=>source.includes(after)))throw Error(kind+' orphaned');return source}
 for(const[before,after]of swaps){if(count(source,after)!==1||source.includes(before))throw Error(kind+' installed source drifted');source=source.replace(after,before)}
 if(source.includes('ework:conversation-history-'))throw Error(kind+' inverse traces remain');return source
}
function patch(source,swaps,kind){source=strip(source,swaps,kind);for(const[before,after]of swaps){if(!before||count(source,before)!==1)throw Error(kind+' native anchor drifted');source=source.replace(before,after)}return source}
export const stripConversationHistoryRuntime=source=>strip(source,[runtimeSwap],'Conversation history runtime')
export const patchConversationHistoryRuntime=source=>patch(source,[runtimeSwap],'Conversation history runtime')
export const stripConversationHistoryClient=source=>strip(source,clientSwaps,'Conversation history client')
export const patchConversationHistoryClient=source=>patch(source,clientSwaps,'Conversation history client')
