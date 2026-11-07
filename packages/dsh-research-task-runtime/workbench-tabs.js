export const WORKBENCH_TABS_GUIDANCE = '页面组织也是交付内容：用户要求页签切换时，必须提交 tabs:[{name:"页签名称",panelIndexes:[0,1,2]}]，panelIndexes 是 panels 的零起始下标，每卡恰好归属一个页签；宿主创建可切换的原生页签组件，不能仅在标题或 prompt 写“页签”。页签数量不等于组件数量。综合企业投研监控应按各企业分别覆盖行情/趋势、财务经营与估值、公告/资讯等互补维度；根据用户范围选择实际有用的维度和数据，不因行情资讯有快捷路径就省略其他维度。同卡可组织相关指标与历史趋势，避免堆重复报价；模板只指导样式，数据取得后再选合适呈现。不要凭规划宣称页面已创建或全部完成，以工具实际结构与完成状态为准。'

export function validateWorkbenchTabs(value, panelCount, originalRequest='') {
 const requested=String(originalRequest).match(/(?:具备|包含|需要|创建|分成|分为|用|有)?\s*([1-9]\d?|[一二三四五六七八九十两])\s*个\s*(?:页签|标签页)/u)
 const count=requested ? Number(requested[1])||({'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[requested[1]]) : null
 if(value===undefined){
  if(count&&!/(?:不需要|不要|无需|不用).{0,8}(?:页签|标签页)/u.test(originalRequest))throw Error(`用户要求 ${count} 个页签。请提交 tabs:[{name:"名称",panelIndexes:[0,1]}]，不能用平铺面板或文字说明代替实际页签。`)
  return undefined
 }
 if(!Array.isArray(value)||!value.length||value.length>10||count&&value.length!==count)throw Error('页签数量需与用户要求一致，最多 10 个。')
 const names=new Set(),members=new Set()
 const tabs=value.map(tab=>{
  const name=typeof tab?.name==='string'?tab.name.trim():''
  const key=name.normalize('NFKC').toLocaleLowerCase()
  if(!name||[...name].length>32||/[\x00-\x1f\x7f\u2028\u2029]/u.test(name)||names.has(key))throw Error('页签名称需唯一、简短且不能换行。')
  names.add(key)
  if(!Array.isArray(tab.panelIndexes)||!tab.panelIndexes.length)throw Error('每个页签需指定其 panelIndexes。')
  for(const index of tab.panelIndexes){
   if(!Number.isInteger(index)||index<0||index>=panelCount||members.has(index))throw Error('panelIndexes 必须引用存在的零起始面板下标，且不可重复归属。')
   members.add(index)
  }
  return {name,panelIndexes:[...tab.panelIndexes]}
 })
 if(members.size!==panelCount)throw Error('请为每个面板指定一个页签归属。')
 return tabs
}
