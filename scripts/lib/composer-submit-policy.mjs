export function patchComposerSubmitPolicy(source) {
  const start=source.indexOf('const onPrimary = () => {'),end=source.indexOf('const accessSelect =',start)
  if(start<0||end<0)throw Error('发送策略无法定位原生发送按钮。')
  const primary=source.slice(start,end),marker='/* EWORK_PRIMARY_SUBMIT_POLICY_V1 */'
  if(primary.includes(marker))return source
  if(!primary.includes('inputActions.submit();'))throw Error('发送策略无法定位原生提交动作。')
  const replacement=`${marker}{
    if(typeof keyboard?.submit==='function')keyboard.submit(canvasRunning&&subagent===null?'queue':resolveSubmitMode(running,'enter',subagent===null));
    else inputActions.submit();
  }`
  return source.slice(0,start)+primary.replace('inputActions.submit();',replacement)+source.slice(end)
}
