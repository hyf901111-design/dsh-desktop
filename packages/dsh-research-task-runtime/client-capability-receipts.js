// Browser-safe receipt presentation; no capability registry or artifact normalizer imports.
import {noteUiText,noteUiError} from './notes-locale.js'
/** Display only: unknown adapter/model details and paths remain literal. */
export function noteCapabilityReceiptMessage(receipt,locale='zh'){
 const message=receipt.message
 if(receipt.effect?.kind==='layout'&&['applied','saved'].includes(receipt.effect.state)&&Array.isArray(receipt.effect.changedBlockIds)&&receipt.effect.changedBlockIds.every(id=>typeof id==='string')){
  const key=receipt.effect.state==='saved'?'已保存 {count} 个组件的布局。':'已应用但未确认保存 {count} 个组件的布局。',render=language=>noteUiText(key,language).replace('{count}',String(receipt.effect.changedBlockIds.length))
  if(!message)return render(locale)
  for(const language of ['zh','en'])if(message.startsWith(render(language)))return render(locale)+noteUiError(message.slice(render(language).length),locale)
 }
 if(receipt.capability==='notes.components.data'&&typeof message==='string'&&message.startsWith('刷新未成功，已保留原有内容及上次成功记录。'))return noteUiText('刷新未成功，已保留原有内容及上次成功记录。',locale)+noteUiError(message.slice('刷新未成功，已保留原有内容及上次成功记录。'.length),locale)
 if(receipt.effect?.kind==='data'&&['applied','saved'].includes(receipt.effect.state)&&['configure','refresh'].includes(receipt.effect.operation)&&typeof receipt.effect.blockId==='string'){
  const effect=receipt.effect,base=effect.operation==='configure'?(effect.state==='saved'?'刷新设置已保存；尚未执行取数。':'刷新设置已应用，尚未确认保存。'):(effect.state==='saved'?'组件数据已刷新并保存。':'数据已应用，尚未确认保存。')
  if(!message)return noteUiText(base,locale)
  for(const prefix of [base,'刷新未成功，已保留原有内容及上次成功记录。'])if(message.startsWith(prefix))return noteUiText(prefix,locale)+noteUiError(message.slice(prefix.length),locale)
 }

 if(receipt.effect?.kind==='challenge'&&['applied','saved'].includes(receipt.effect.state)&&['off','idle','waiting','running','paused','limited','failed'].includes(receipt.effect.phase)&&Number.isInteger(receipt.effect.settings?.level)&&receipt.effect.settings.level>=0&&receipt.effect.settings.level<=4&&typeof receipt.effect.settings.commentsExpanded==='boolean'){
  const effect=receipt.effect
  const render=locale=>{
   const t=value=>noteUiText(value,locale),settings=effect.settings
   const phase=settings.level===0?'自动挑战已关闭。':effect.phase==='running'?'校验正在运行；本次回执仅确认设置。':effect.phase==='limited'?'校验等待用量恢复；本次回执仅确认设置。':effect.phase==='idle'?'当前没有运行中的校验；本次回执仅确认设置。':effect.phase==='failed'?'最近一次校验未完成；本次回执仅确认设置。':effect.phase==='waiting'||effect.phase==='paused'?'校验等待调度；本次回执仅确认设置。':'校验尚未启动；本次回执仅确认设置。'
   return t(effect.state==='saved'?'AI挑战设置已保存。':'AI挑战设置已应用，尚未确认保存。')+t('等级：{level}；评论展开偏好：{comments}。').replace('{level}',t(['关闭','宽松','标准','严格','抬杠'][settings.level])).replace('{comments}',t(settings.commentsExpanded?'展开':'收起'))+t(phase)
  }
  const original=render('zh'),display=render(locale)
  if(!message)return display
  if(message.startsWith(original))return display+noteUiError(message.slice(original.length),locale)
  const english=render('en')
  if(message.startsWith(english))return display+message.slice(english.length)
  return message
 }
 if(locale!=='en'||typeof message!=='string')return message
 const fixedEffects=['已生成并保存组件','已生成组件，尚未确认保存','已插入组件占位块，尚未生成完成']
 if(fixedEffects.includes(message))return noteUiText(message,locale)
 const fixed=noteUiError(message,locale);if(fixed!==message)return fixed
 const translate=part=>{
  if(fixedEffects.includes(part))return noteUiText(part,locale)
  const fixed=noteUiError(part,locale);if(fixed!==part)return fixed
  const count=/^(已保存|已应用但未确认保存) (\d{1,5}) (个组件的样式|个块的对齐方式|个组件的内容|个组件的布局)(。?)$/u.exec(part)
  if(count)return noteUiText(count[1]+' {count} '+count[3]+count[4],locale).replace('{count}',()=>count[2])
  return part
 }
 const effect=receipt.effect
 let original,display
 if(effect&&'path'in effect&&typeof effect.path==='string'){
  const key=effect.state==='saved'?'文件已保存：{path}':'文件写入已开始，保存结果尚未确认：{path}'
  original=key.replace('{path}',()=>effect.path);display=noteUiText(key,locale).replace('{path}',()=>effect.path)
 }else if(effect&&'changedBlockIds'in effect&&Array.isArray(effect.changedBlockIds)){
  const key=effect.kind==='alignment'?(effect.state==='saved'?'已保存 {count} 个块的对齐方式':'已应用但未确认保存 {count} 个块的对齐方式'):effect.kind==='layout'?(effect.state==='saved'?'已保存 {count} 个组件的布局':'已应用但未确认保存 {count} 个组件的布局'):effect.kind==='content'?(effect.state==='saved'?'已保存 {count} 个组件的内容':'已应用但未确认保存 {count} 个组件的内容'):effect.state==='saved'?'已保存 {count} 个组件的样式':'已应用但未确认保存 {count} 个组件的样式'
  original=key.replace('{count}',()=>String(effect.changedBlockIds.length));display=noteUiText(key,locale).replace('{count}',()=>String(effect.changedBlockIds.length))
 }else if(effect&&'blockId'in effect){
  original=effect.state==='saved'?'已生成并保存组件':effect.state==='applied'?'已生成组件，尚未确认保存':'已插入组件占位块，尚未生成完成';display=noteUiText(original,locale)
 }
 if(original&&message.startsWith(original)){
  const rest=message.slice(original.length)
  if(!rest)return display
  if(rest==='；后续操作已取消。')return display+noteUiText(rest,locale)
  if(rest.startsWith('。'))return display+'. '+noteUiError(rest.slice(1),locale)
 }
 const cancelled='；后续操作已取消。'
 if(message.endsWith(cancelled)){const base=message.slice(0,-cancelled.length),next=translate(base);if(next!==base)return next+noteUiText(cancelled,locale)}
 const translated=translate(message);if(translated!==message)return translated
 // A path supplied by the export receipt can contain punctuation or template syntax.
 if(typeof receipt.path==='string')for(const key of ['文件已保存：{path}','文件写入已开始，保存结果尚未确认：{path}'])if(message===key.replace('{path}',()=>receipt.path))return noteUiText(key,locale).replace('{path}',()=>receipt.path)
 return message
}
export function capabilityReceiptText(receipts,locale='zh'){
 const names={'conversation.components.create':'创建对话组件','notes.components.create':'创建组件','notes.export':'导出笔记','notes.components.style':'组件样式','notes.components.layout':'组件布局','notes.blocks.align':'笔记对齐','notes.components.inspect':'查看所选组件','notes.components.apply':'修改所选组件','notes.challenge.configure':'AI挑战设置','notes.components.data':'笔记组件数据','canvas.inspect':'查看画布','ui.zoom.reset':'恢复缩放','canvas.apply':'修改画布','canvas.undo':'撤销画布操作','ui.zoom.in':'放大窗口','ui.zoom.out':'缩小窗口','ui.fullscreen.set':'窗口全屏','ui.mode.set':'切换会话视图'},labels={succeeded:'已完成',pending:'等待用户操作',cancelled:'已取消',failed:'失败',unavailable:'不可用'}
 return receipts.map(r=>`${noteUiText(names[r.capability]||r.capability,locale)}${locale==='en'?': ':'：'}${noteUiText(r.status==='pending'&&r.capability?.startsWith('canvas.')?'同步待确认':r.capability==='notes.components.data'&&r.status==='pending'?'刷新进行中':labels[r.status]||'未完成',locale)}${r.path?' — '+r.path:''}${r.message?(locale==='en'?'. ':'。')+noteCapabilityReceiptMessage(r,locale):''}`).join('\n')
}
