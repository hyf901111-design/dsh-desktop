export function workbenchPlanningContext(now = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `【宿主规划口径】当前日期 ${date}（${zone}）。相对日期以此为锚点；用户明确指定的具体/虚构日期或历史范围原样保留。仅描述实际支持的交互；未实现的跨卡自动执行、冲突校验或撤销不能声称可用。
【取数与交付】先理解用户问题、指定来源、范围和联网限制，先确认实体类别与样本范围，再通过已有授权工具批量取得记录。只使用已暴露的真实工具名和已发现的参数 schema；统计在可用工具或脚本中计算，模型接收完整汇总字段和来源定位，原始明细保留可读取的文件引用，不逐卡重复注入。再按实际内容决定呈现。同批数据统一获取并复用，保留来源、日期、单位和真实缺失，不为迁就模板改动问题或补造数据。正文、明细或可视化可提交 panel.content；多卡共享 sharedDatasets/view，完整组件可用 artifact；原生能力不足时保留自定义 HTML。实际取得内容前不把占位、规划受理或来源目录当作完成。
【按问题选择视图】每卡回答一个问题。同一对象、指标和期间的重复小卡或列默认合并，保留用户明确要求的独立卡及对照。已核验的核心走势和总览放在通用背景之前。保留完整实有记录和层级；数量、日期和单位必须可比较，缺失不冒充零。类型和尺寸依据内容与所需交互确定。跟随用户语言，仅回报新增结果、重要缺失或必要操作。`;
}
