export function patchSidebarFileRefresh(source) {
 const marker='/* sherlock:live-file-list:v1 */'
 if(source.includes(marker))return source
 const start=source.indexOf('\t\t\tconst loadDir = (0, react.useCallback)((dir) => {',source.indexOf('function FileTree(props)'))
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
                api.fsTree({sessionId,cwd},dir,request.signal).then(listing=>{
                  if(disposed)return;
                  const next={entries:listing.entries};
                  if(JSON.stringify(dataRef.current[dir])!==JSON.stringify(next))storeLevel(dir,next);
                }).catch(error=>{
                  if(!disposed&&!request.signal.aborted)storeLevel(dir,{error:error instanceof Error?error.message:String(error)});
                }).finally(()=>pending.delete(dir));
              };
              const refresh=()=>{
                if(document.visibilityState==='hidden')return;
                for(const dir of directories)load(dir);
              };
              refresh();
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
