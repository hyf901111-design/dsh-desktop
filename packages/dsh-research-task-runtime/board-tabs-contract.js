// Shared by the host validator and the native canvas serializer.
export function boardTabsIssue(tabs) {
 if(!Array.isArray(tabs)||!tabs.length)return '至少保留一个页签'
 if(tabs.length>100)return '最多支持 100 个页签'
 const names=new Set(),ids=new Set(),members=new Set()
 for(const tab of tabs){
  if(!tab||typeof tab.id!=='string'||!/^[-\w:.]{1,128}$/.test(tab.id)||ids.has(tab.id))return '页签身份无效'
  ids.add(tab.id)
  const name=typeof tab.name==='string'?tab.name.trim():''
  if(!name||[...name].length>32||/[\x00-\x1f\x7f\u2028\u2029]/.test(name))return '名称需为 1–32 个字符，不能换行'
  const normalized=name.normalize('NFKC').toLocaleLowerCase()
  if(names.has(normalized))return '页签名称重复'
  names.add(normalized)
  if(!Array.isArray(tab.nodeIds)||tab.nodeIds.length>1000)return '页签组件归属无效'
  for(const id of tab.nodeIds){if(typeof id!=='string'||!/^[-\w:.]{1,128}$/.test(id)||members.has(id))return '页签组件归属重复或无效';members.add(id)}
 }
 return null
}
export function boardTabsSpec(value) {
 if(!value||value.version!==1||value.type!=='board-tabs'||value.title!=='页签'||!Number.isSafeInteger(value.revision)||value.revision<0||Object.keys(value).some(k=>!['version','type','title','revision','tabs'].includes(k))||boardTabsIssue(value.tabs))return null
 return {version:1,type:'board-tabs',title:'页签',revision:value.revision,tabs:value.tabs.map(t=>({id:t.id,name:t.name.trim(),nodeIds:[...t.nodeIds]}))}
}
export function boardTabsInitial(ids,makeId) {
 return {version:1,type:'board-tabs',title:'页签',revision:0,tabs:[{id:makeId(),name:'页签 1',nodeIds:[...new Set(ids)]},{id:makeId(),name:'页签 2',nodeIds:[]}]}
}
export function boardTabsNode(snapshot) {return snapshot.artifacts.find(n=>n.containerSpec?.type==='board-tabs')??null}
export function boardTabsMove(spec,ids,target) {
 if(!boardTabsSpec(spec)||!spec.tabs.some(t=>t.id===target)||!ids.length||ids.some(id=>!spec.tabs.some(t=>t.nodeIds.includes(id))))return null
 const moved=new Set(ids)
 return {...spec,revision:spec.revision+1,tabs:spec.tabs.map(t=>({...t,nodeIds:t.id===target?[...t.nodeIds.filter(id=>!moved.has(id)),...ids]:t.nodeIds.filter(id=>!moved.has(id))}))}
}
export function boardTabsSave(current,revision,draft) {
 if(!boardTabsSpec(current)||current.revision!==revision||!Array.isArray(draft))return null
 const tabs=draft.map(t=>({id:t.id,name:t.name,nodeIds:current.tabs.find(old=>old.id===t.id)?.nodeIds??[]}))
 if(boardTabsIssue(tabs))return null
 const keep=new Set(tabs.map(t=>t.id)),removedIds=current.tabs.filter(t=>!keep.has(t.id)).flatMap(t=>t.nodeIds)
 return {spec:boardTabsSpec({...current,revision:current.revision+1,tabs}),removedIds}
}
export function boardTabsReconcile(snapshot,activeId,targetId=activeId,targetForNode=()=>null) {
 const nav=boardTabsNode(snapshot);if(!nav)return snapshot
 const spec=boardTabsSpec(nav.containerSpec);if(!spec)return snapshot
 const nodes=[...snapshot.files,...snapshot.artifacts].filter(n=>n.id!==nav.id),live=new Set(nodes.map(n=>n.id)),known=new Set(spec.tabs.flatMap(t=>t.nodeIds)),fresh=nodes.filter(n=>!known.has(n.id))
 const target=spec.tabs.find(t=>t.id===targetId)||spec.tabs.find(t=>t.id===activeId)||spec.tabs[0]
 const assigned=new Map(spec.tabs.map(t=>[t.id,[]]))
 for(const node of fresh){const captured=targetForNode(node);const id=captured?.navId===null?spec.tabs[0].id:captured?.tabId??target.id;if(captured?.navId&&captured.navId!==nav.id||!assigned.has(id))throw Error('目标页签已删除，请保留生成结果并重新放置。');assigned.get(id).push(node.id)}
 const tabs=spec.tabs.map(t=>({...t,nodeIds:[...t.nodeIds.filter(id=>live.has(id)),...assigned.get(t.id)]}))
 if(JSON.stringify(tabs)===JSON.stringify(spec.tabs))return snapshot
 return {...snapshot,artifacts:snapshot.artifacts.map(n=>n.id===nav.id?{...n,containerSpec:{...spec,revision:spec.revision+1,tabs}}:n)}
}
export function boardTabsVisible(snapshot,activeId) {
 const nav=boardTabsNode(snapshot);if(!nav)return snapshot
 const tab=nav.containerSpec.tabs.find(t=>t.id===activeId)||nav.containerSpec.tabs[0],ids=new Set(tab.nodeIds)
 return {...snapshot,files:snapshot.files.filter(n=>ids.has(n.id)),artifacts:snapshot.artifacts.filter(n=>n.id!==nav.id&&ids.has(n.id))}
}
