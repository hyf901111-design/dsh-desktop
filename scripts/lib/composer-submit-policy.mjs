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


export function patchComposerNoticeDismissal(source) {
  if (source.includes('data-composer-notice-dismiss')) return source
  const anchor = /notice !== null && \(0, react_jsx_runtime\.jsx\)\("div", \{\s*className: clsx\(InputBar_module_css_default\.notice, notice\.level === "error" && InputBar_module_css_default\.noticeError\),\s*role: "status",\s*children: notice\.text\s*\}\)/
  if (source.split(anchor).length !== 2) throw Error('Composer notice renderer missing or ambiguous')
  return source.replace(anchor, `notice !== null && react_jsx_runtime.jsxs("div", {
    className: clsx(InputBar_module_css_default.notice, notice.level === "error" && InputBar_module_css_default.noticeError),
    "data-composer-notice": "",
    children: [
      react_jsx_runtime.jsx("span", { role: "status", children: notice.text }),
      notice.level === "error" && keyboard?.notices?.getSnapshot() === notice && react_jsx_runtime.jsx("button", {
        type: "button",
        "data-composer-notice-dismiss": "",
        "aria-label": workbenchText("关闭对话提示"),
        onPointerDown: event => { event.preventDefault(); event.stopPropagation(); },
        onClick: event => {
          event.stopPropagation();
          if (keyboard.notices.getSnapshot() !== notice) return;
          keyboard.notices.set(null);
          if (event.detail === 0) inputRef.current?.focus({ preventScroll: true });
        },
        children: "×"
      })
    ]
  })`)
}
