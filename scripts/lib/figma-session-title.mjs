export function EditableSessionTitle({ children, rename, className, ...props }) {
  const [editing,setEditing]=react.useState(false),[error,setError]=react.useState('');
  const inputRef=react.useRef(null),saving=react.useRef(false),cancelled=react.useRef(false);
  react.useLayoutEffect(()=>{if(editing){inputRef.current?.focus();inputRef.current?.select();}},[editing]);
  const save=async()=>{
    if(cancelled.current||saving.current)return;
    const title=inputRef.current?.value.trim();
    if(!title){setEditing(false);return;}
    if(title===children){setEditing(false);return;}
    saving.current=true;
    try{await rename(title);setEditing(false);setError('');}
    catch(e){setError(e?.message||'标题保存失败，请重试');inputRef.current?.focus();}
    finally{saving.current=false;}
  };
  if(editing)return react_jsx_runtime.jsxs('span',{className:'odyssey-session-title-edit',children:[react_jsx_runtime.jsx('input',{
    ref:inputRef,defaultValue:children,maxLength:120,'aria-label':'会话标题','aria-invalid':!!error,
    onBlur:save,onKeyDown:event=>{event.stopPropagation();if(event.nativeEvent?.isComposing||event.keyCode===229)return;
      if(event.key==='Escape'){event.preventDefault();cancelled.current=true;setEditing(false);}
      else if(event.key==='Enter'){event.preventDefault();void save();}}
  }),error&&react_jsx_runtime.jsx('span',{role:'alert',children:error})]});
  return react_jsx_runtime.jsx('button',{...props,className,title:'双击修改会话标题',onDoubleClick:event=>{event.preventDefault();event.stopPropagation();cancelled.current=false;setError('');setEditing(true);},children});
}
export function patchFigmaSessionTitle(source){
  const direct='rename: async (id,title) => {const binding=sessions.binding(id);if(!binding)throw Error("会话尚未就绪");await binding.session.rename(title);},';
  const synced='rename: async (id,title) => {if(sherlockBoardsAdapter)return sherlockBoardsAdapter.renamePersonal(id,title);const binding=sessions.binding(id);if(!binding)throw Error("会话尚未就绪");await binding.session.rename(title);},';
  source=source.replace(direct,synced);
  const marker='/* ODYSSEY_EDITABLE_SESSION_TITLE */';
  if(source.includes(marker)){
    if(source.split(marker).length!==2 || !source.includes('function EditableSessionTitle('))throw Error('Session title helper drifted');
    return source;
  }
  const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Session title anchor drifted: '+a.slice(0,80));source=source.replace(a,b);};
  replace('function ConversationSessionHeader({ sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, t })', 'function ConversationSessionHeader({ sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, rename, t })');
  replace('disabled: last,\n\t\t\t\t\t\t\t\t\t\tonClick:', 'rename: title => rename(summary.id,title),\n\t\t\t\t\t\t\t\t\t\tonClick:');
  replace('open(summary.id);','if (!last) open(summary.id);');
  const a='}), (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t\t\t\t\tclassName: clsx(ConversationRoot_module_css_default.crumb,';
  replace(a,a.replace('("button",','(last ? EditableSessionTitle : "button",'));
  replace('inject: () => ({\n\t\t\t\t\tviews,\n\t\t\t\t\topen:', 'inject: () => ({\n\t\t\t\t\tviews,\n                    rename: async (id,title) => {const binding=sessions.binding(id);if(!binding)throw Error("会话尚未就绪");await binding.session.rename(title);},\n\t\t\t\t\topen:');
  source=source.replace(direct,synced);
  return source.replace('function ConversationSessionHeader(',marker+'\n'+EditableSessionTitle.toString()+'\n\t\tfunction ConversationSessionHeader(');
}
