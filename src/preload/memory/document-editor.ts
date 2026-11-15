import type { MemoryBridge, MemorySnapshot } from '../../shared/memory'
import { renderSkillMarkdown } from '../integrations/skill-markdown'
import { memoryStyles } from './style'

type Options = { document:Document; host?:HTMLElement; bridge:MemoryBridge; owner:string; current():boolean; t(value:string):string; saved(snapshot:MemorySnapshot):void; closed():void }

/** The editor owns its draft; background memory notifications never replace text being edited. */
export function openMemoryDocumentEditor(options:Options){
  const {document,host,bridge,t}=options,previousFocus=document.activeElement as HTMLElement|null
  const dialog=document.createElement(host ? 'section' : 'dialog')
  dialog.className='ew-memory-document-dialog';dialog.dataset.memoryDocumentEditor=''
  const id = host ? 'memory-document-' + document.defaultView!.crypto.randomUUID() : 'memory'
  if (host) {
    dialog.dataset.inline = ''
    if (!document.querySelector('style[data-memory-style]')) {
      const style = document.createElement('style')
      style.dataset.memoryStyle = ''
      style.textContent = memoryStyles
      document.head.append(style)
    }
  }
  dialog.setAttribute('aria-label',t('编辑记忆.md'))
  let closed=false,busy=false,mode:'preview'|'edit'='preview',content='',original='',hash='',error='',saved=false
  const current=()=>!closed&&options.current()
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value}
  const button=(label:string,action:()=>void)=>{const value=element('button',t(label));value.type='button';value.onclick=action;return value}
  const close=()=>{if(closed)return;closed=true;dialog.remove();options.closed();if(!host&&previousFocus?.isConnected)previousFocus.focus()}
  async function read(){
    if(busy||!current())return
    busy=true;error='';saved=false;render()
    try{
      const snapshot=await bridge.request({type:'document-read'})
      if(!current())return
      if(snapshot.owner!==options.owner){close();return}
      if(typeof snapshot.document?.content!=='string'||!snapshot.document.hash)throw Error(t('记忆文档暂不可读取，请稍后重试。'))
      content=original=snapshot.document.content;hash=snapshot.document.hash
    }catch(e){if(current())error=e instanceof Error?e.message:t('记忆文档暂不可读取，请稍后重试。')}
    finally{if(current()){busy=false;render()}}
  }
  async function save(){
    if(busy||!hash||content===original||!current())return
    busy=true;error='';saved=false;render()
    try{
      const snapshot=await bridge.request({type:'document-save',content,expectedHash:hash})
      if(!current())return
      if(snapshot.owner!==options.owner){close();return}
      if(snapshot.document?.error)throw Error(snapshot.document.error)
      if(typeof snapshot.document?.content!=='string'||!snapshot.document.hash)throw Error(t('保存未完成，输入已保留。'))
      content=original=snapshot.document.content;hash=snapshot.document.hash;saved=true;mode='preview';options.saved(snapshot)
    }catch(e){if(current())error=e instanceof Error?e.message:t('保存未完成，输入已保留。')}
    finally{if(current()){busy=false;render()}}
  }
  function render(){
    if(!current())return
    const wasEditor=dialog.contains(document.activeElement)&&document.activeElement?.tagName==='TEXTAREA'
    const cursor=wasEditor?[(document.activeElement as HTMLTextAreaElement).selectionStart,(document.activeElement as HTMLTextAreaElement).selectionEnd]:undefined
    dialog.replaceChildren()
    const header=element('header'),title=element('h2',t('记忆.md')),exit=button('关闭',()=>{if(!busy)close()})
    exit.className='ew-memory-dialog-close';exit.textContent='×';exit.setAttribute('aria-label',t('关闭'));exit.disabled=busy
    header.append(title)
    if(!host)header.append(exit)
    const tabs=element('div',undefined,'ew-memory-document-tabs');tabs.role='tablist';tabs.setAttribute('aria-label',t('文档视图'))
    for(const [key,label]of [['preview','预览'],['edit','编辑']] as const){
      const tab=button(label,()=>{mode=key;render()});tab.role='tab';tab.id=id+'-tab-'+key;tab.setAttribute('aria-selected',String(mode===key));tab.setAttribute('aria-controls',id+'-document-body');tab.disabled=busy||!hash;tabs.append(tab)
    }
    const body=element('section',undefined,'ew-memory-document-body');body.id=id+'-document-body';body.role='tabpanel';body.setAttribute('aria-labelledby',id+'-tab-'+mode)
    if(!hash)body.append(element('p',t(busy?'正在读取记忆…':'记忆文档暂不可读取，请稍后重试。'),'ew-memory-muted'))
    else if(mode==='edit'){
      const textarea=element('textarea');textarea.value=content;textarea.setAttribute('aria-label',t('记忆 Markdown 内容'));textarea.dataset.uiPreserve='';textarea.spellcheck=false;textarea.disabled=busy;textarea.placeholder=t('使用 Markdown 记录需要记住的内容；不同内容之间可用 --- 分隔。')
      textarea.oninput=()=>{content=textarea.value;saved=false;const saveButton=dialog.querySelector<HTMLButtonElement>('[data-memory-document-save]');if(saveButton)saveButton.disabled=busy||content===original}
      body.append(textarea)
    }else{
      const preview=element('div',undefined,'ew-memory-markdown');preview.dataset.memoryPreview='';preview.dataset.uiPreserve=''
      preview.innerHTML=renderSkillMarkdown(content)
      body.append(preview)
    }
    if(host)header.append(tabs)
    dialog.append(header)
    if(!host)dialog.append(tabs)
    dialog.append(body)
    const status=element('p',error||(saved?t('已保存到记忆.md'):''),'ew-memory-editor-status');status.role=error?'alert':'status';status.hidden=!status.textContent;dialog.append(status)
    const footer=element('footer'),hint=element('span',t('使用 Markdown 编辑；不同内容之间可用 --- 分隔。'),'ew-memory-muted'),actions=element('div',undefined,'ew-memory-actions')
    if(error){const reload=button(hash?'放弃修改并重新读取':'重试',()=>void read());reload.disabled=busy;actions.append(reload)}
    const cancel=button('取消',()=>{
      if(busy)return
      if(!host){close();return}
      content=original;error='';saved=false;mode='preview';render()
    }),submit=button(busy&&hash?'保存中…':'保存',()=>void save())
    cancel.disabled=busy;submit.disabled=busy||!hash||content===original;submit.dataset.memoryDocumentSave='';submit.className='ew-memory-primary'
    if(!host||mode==='edit')actions.append(cancel,submit)
    if(!host||mode==='edit')footer.append(hint)
    if(actions.childElementCount){footer.append(actions);dialog.append(footer)}
    if(mode==='edit'){const input=body.querySelector('textarea');input?.focus();if(cursor)input?.setSelectionRange(cursor[0]!,cursor[1]!)}
  }
  if (host) host.append(dialog)
  else {
    const modal = dialog as HTMLDialogElement
    modal.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close()})
    document.body.append(modal);if(typeof modal.showModal==='function')modal.showModal();else modal.open=true
  }
  void read()
  return {close,render}
}
