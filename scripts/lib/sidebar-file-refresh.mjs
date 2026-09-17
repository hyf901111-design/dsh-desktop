export function patchSidebarFileRefresh(source) {
 const marker='/* sherlock:live-file-list:v2 */'
 if(source.includes(marker))return source
 const old=source.indexOf('/* sherlock:live-file-list:v1 */');
 const start=old>=0?old:source.indexOf('\t\t\tconst loadDir = (0, react.useCallback)((dir) => {',source.indexOf('function FileTree(props)'))
 const end=source.indexOf('\n\t\t\t/** Copy `text`;',start)
 if(start<0||end<start)throw Error('FileTree loading boundary missing')
 return source.slice(0,start)+`${marker}
            (0, react.useEffect)(()=>{
              let disposed=false;
              const pending=new Map();
              const directories=[...new Set([cwd,...expanded].filter(Boolean))];
              const load=dir=>{
                if(disposed||pending.has(dir))return;
                const request=new AbortController();pending.set(dir,request);
                return api.fsTree({sessionId,cwd},dir,request.signal).then(listing=>{
                  if(disposed)return false;
                  const next={entries:listing.entries};
                  if(JSON.stringify(dataRef.current[dir])!==JSON.stringify(next))storeLevel(dir,next);
                  return true;
                }).catch(error=>{
                  if(!disposed&&!request.signal.aborted)storeLevel(dir,{error:error instanceof Error?error.message:String(error)});
                                  return false;
                }).finally(()=>pending.delete(dir));
              };
              const refresh=()=>{
                if(document.visibilityState==='hidden')return;
                return Promise.all(directories.map(load));
              };
              const initial=refresh();
              if(refreshTick>0)initial?.then(results=>{if(!disposed)props.onRefreshComplete?.(results.every(Boolean));});
              const timer=window.setInterval(refresh,3000);
              window.addEventListener('focus',refresh);
              document.addEventListener('visibilitychange',refresh);
              return()=>{
                disposed=true;window.clearInterval(timer);
                window.removeEventListener('focus',refresh);
                document.removeEventListener('visibilitychange',refresh);
                for(const request of pending.values())request.abort();
              };
            },[sessionId,cwd,expanded,refreshTick,storeLevel]);
`+source.slice(end)
}

export function patchSidebarRefreshFeedback(source) {
 const marker='/* sherlock:file-refresh-feedback:v2 */'
 if(source.includes('/* sherlock:file-refresh-feedback:v1 */'))return source
   .replace('/* sherlock:file-refresh-feedback:v1 */',marker)
   .replace('ok?"已刷新":"刷新失败，请重试"','ok?"":"刷新失败，请重试"')
   .replace('}), refreshStatus && (0,react_jsx_runtime.jsx)("div", {','}), refreshStatus === "刷新失败，请重试" && (0,react_jsx_runtime.jsx)("div", {')
 if(source.includes(marker))return source
 const start=source.indexOf('\t\tfunction TreePanel(props) {')
 const end=source.indexOf('\n\t\t//#endregion',start)
 if(start<0||end<start)throw Error('TreePanel feedback boundary missing')
 let panel=source.slice(start,end)
 const replace=(from,to)=>{if(!panel.includes(from))throw Error('File refresh feedback anchor missing: '+from);panel=panel.replace(from,to)}
 replace('const needle = query.trim();',`${marker}
            const [refreshStatus,setRefreshStatus]=(0,react.useState)("");
            const onRefreshComplete=(0,react.useCallback)(ok=>setRefreshStatus(ok?"":"刷新失败，请重试"),[]);
            (0,react.useEffect)(()=>{setRefreshStatus("");},[sessionId,cwd,query]);
            const needle = query.trim();`)
 replace('setResults(found);','setResults(found);\n                        if(refreshTick>0)onRefreshComplete(true);')
 replace('setError(failure instanceof Error ? failure.message : String(failure));','setError(failure instanceof Error ? failure.message : String(failure));\n                        if(refreshTick>0)onRefreshComplete(false);')
 replace('\t\t\t\tneedle\n','\t\t\t\tneedle, refreshTick\n')
 replace('"aria-label": t("refresh"),','"aria-label": refreshStatus === "刷新中…" ? refreshStatus : t("refresh"),\n                        "aria-busy": refreshStatus === "刷新中…",\n                        disabled: refreshStatus === "刷新中…",')
 replace('setRefreshTick((tick) => tick + 1);','setRefreshStatus("刷新中…");\n                            setRefreshTick((tick) => tick + 1);')
 replace('}), needle === "" ?',`}), refreshStatus === "刷新失败，请重试" && (0,react_jsx_runtime.jsx)("div", {
                    "data-odyssey-refresh-status":true, role:"status", children:refreshStatus
                }), needle === "" ?`)
 replace('\t\t\t\t\trefreshTick\n','\t\t\t\t\trefreshTick, onRefreshComplete\n')
 return source.slice(0,start)+panel+source.slice(end)
}
