import {app,Notification,powerMonitor,type BrowserWindow,ipcMain} from 'electron'
import {join} from 'node:path'
import {CalendarStore} from './calendar-store'
import {validateCalendarTarget,type CalendarTarget,type CalendarNotice} from '../../shared/calendar-tool'
import {registerTrustedMainWindowHandler} from '../ipc-trust'

export async function installCalendarService(options:{getWindow:()=>BrowserWindow|undefined;ensureWindow:()=>Promise<void>;exists:(target:CalendarTarget)=>boolean;isShared:(sessionId:string)=>boolean;english:()=>boolean}){
 const send=(value:unknown)=>{const w=options.getWindow();if(w&&!w.isDestroyed())w.webContents.send('research:calendar:event',value)}
 const store=new CalendarStore(join(app.getPath('userData'),'calendar-events.json'),Date.now,()=>send({kind:'changed'}))
 let loadError=false
 let pendingOpen:{kind:'open';sessionId:string;nodeId:string;date:string}|null=null
 try{await store.load()}catch(e){loadError=true;console.error('[calendar] original data preserved',e)}
 registerTrustedMainWindowHandler(ipcMain,'research:calendar:request',options.getWindow,async(_event,v:any)=>{
  if(loadError)throw Error('日历数据读取失败，原文件已保留')
  if(!v||typeof v!=='object')throw Error('日历操作无效')
  if(v.action==='pending')return pendingOpen
  if(v.action==='session'){if(typeof v.sessionId!=='string'||!v.sessionId||v.sessionId.length>200||options.isShared(v.sessionId))throw Error('日历会话无效');return {notices:store.list({sessionId:v.sessionId}).notices.filter(n=>options.exists(n))}}
  const target=validateCalendarTarget(v)
  if(options.isShared(target.sessionId))throw Error('个人日历暂不支持协作看板')
  if(!options.exists(target))throw Error('日历组件不存在')
  if(v.action==='opened'){if(pendingOpen?.sessionId===target.sessionId&&pendingOpen.nodeId===target.nodeId)pendingOpen=null;return {ok:true}}
  if(v.action==='list')return store.list(target)
  if(v.action==='save')return store.save(target,v.input,v.id)
  if(typeof v.id!=='string'||!v.id||v.id.length>200)throw Error('事项标识无效')
  if(v.action==='complete')return store.complete(target,v.id,v.date,v.completed)
  if(v.action==='delete')return store.remove(target,v.id)
  if(v.action==='dismiss')return store.dismiss(target.sessionId,v.id)
  throw Error('未知日历操作')
 })
 const notify=(n:CalendarNotice)=>{
  send({kind:'reminder',sessionId:n.sessionId,nodeId:n.nodeId,date:n.date})
  if(!Notification.isSupported())return
  const notification=new Notification({title:options.english()?'Calendar reminder':'日历提醒',body:`${n.title}\n${n.date} ${n.time??(options.english()?'All day':'全天')}`})
  notification.on('click',()=>{pendingOpen={kind:'open',sessionId:n.sessionId,nodeId:n.nodeId,date:n.date};void options.ensureWindow().then(()=>{const w=options.getWindow();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();if(pendingOpen)send(pendingOpen)}).catch(e=>console.warn('[calendar] unable to open reminder',e))})
  notification.show()
 }
 const tick=()=>{if(!loadError)void store.tick(t=>!options.isShared(t.sessionId)&&options.exists(t),notify).catch(e=>console.warn('[calendar] reminder check failed',e))}
 const timer=setInterval(tick,5000);timer.unref();powerMonitor.on('resume',tick);tick()
 app.once('before-quit',()=>{clearInterval(timer);powerMonitor.removeListener('resume',tick)})
 return store
}
