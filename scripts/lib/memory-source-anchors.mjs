const marker='/* ework:memory-source-anchors:v1 */'
const before='function UserStyleBubble({ content, imageLoader, actions, openFile, pending = false, t }) {'
const after='function UserStyleBubble({ content, imageLoader, actions, openFile, pending = false, t, eventSeq }) {'
function replace(source,a,b){if(source.split(a).length!==2)throw Error('Memory source anchor drift');return source.replace(a,b)}
export function patchMemorySourceAnchors(source){
  if(source.includes(marker)){
    if(!source.includes(after)||!source.includes('"data-event-seq": eventSeq')||!source.includes('eventSeq: data.seq,'))throw Error('Memory source anchor patch incomplete')
    return source
  }
  source=replace(source,before,after)
  source=replace(source,'className: MessageItem_module_css_default.userRow,','className: MessageItem_module_css_default.userRow,\n                '+marker+'\n                "data-event-seq": eventSeq,')
  source=replace(source,'const data = node.data;\n\t\t\treturn (0, react_jsx_runtime.jsx)(UserStyleBubble, {\n\t\t\t\tcontent: data.content,','const data = node.data;\n\t\t\treturn (0, react_jsx_runtime.jsx)(UserStyleBubble, {\n\t\t\t\teventSeq: data.seq,\n\t\t\t\tcontent: data.content,')
  return source
}
