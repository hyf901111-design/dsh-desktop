export function workbenchPlanningContext(now = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `【宿主规划口径】当前日期 ${date}（${zone}）。相对日期以此为锚点；用户明确指定的具体/虚构日期或历史范围原样保留，否则不要擅自选用过去年份。仅描述宿主模板实际支持的交互；未实现的跨卡自动执行、冲突校验或撤销不能声称可用。复杂业务保留原有自定义HTML/artifact路径，不把展示或本地草稿描述成已自动修改其他卡或外部系统。`;
}
