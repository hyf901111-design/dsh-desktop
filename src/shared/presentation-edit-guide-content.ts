// Pages follow the presentation's visible order. The package's slide XML filenames use different numbers.
const notes: string[] = [
  '各位好。假如 AI 真能让美国经济增长得更快，今天持有大型科技股的人，就一定能分享到同样高的回报吗？这两个问题，在 Vanguard 的推演里有不同的答案。\n我们一起回到 2025 年末，看看作者当时掌握了哪些证据，又把哪些判断留给了未来。',
  '请先记住两个时间跨度。表里关于增长和通胀的数字，是对 2026 年的预测。讲到股票和债券时，我们看的是未来十年的年化回报。\n先把这两个口径分清，再从企业建设基础设施讲起，看看一笔投入要经过哪些环节，才能变成投资人的回报。',
  '有三个日期值得先记下来。Vanguard 在 2025 年 12 月发布这份展望，宏观预测截至 12 月 10 日，资本市场模型的模拟时点则是 10 月 31 日。\n后面若听到“预计”，指的都是作者站在当时做的判断。到了跟踪清单，我会说明哪些问题是我们读完报告后想继续追问的。',
  '先把报告中看似矛盾的两组数放在一起。作者当时预计美国 2026 年实际 GDP 增长 2.25%，同时给美股未来十年的年化回报估了 4% 到 5%。\n建设数据中心会拉动当期投资。可如果股价已经反映了很高的盈利预期，企业就得交出更好的成绩，股东才能获得更高回报。',
  '请看实际 GDP 增速这一列。美国是 2.25%，指 2026 年四季度相对上年同期。欧元区的 1.2% 和中国的 4.5%，用的都是全年同比。\n再看最右列，美国这项预测尤其依赖 AI 建设能否按计划推进。带着这个条件，我们接下来看看企业准备怎样花这笔钱。',
  '假设一家企业决定建一座数据中心。它签下设备订单时，投资就会增加。但要让生产率也提高，还得有客户用上这些算力，并且真的省下工时。\n接下来几页，我们沿着这条线往下看。先比较过去几轮建设持续了多久，再看资金、实际采用和就业数据。',
  '从开始建设到投资强度见顶，历史上的油气周期用了三年九个月，电信周期用了五年半。对照这些周期，报告估算当时 AI 投资强度约为历史峰值的 30% 到 40%。\n请留意，这个百分比比较的是投资强度。它能帮我们理解起点，却不能据此算出本轮周期还剩几年。',
  '请把 2.1 万亿美元和 2.4 万亿美元放在一起看。前者是相关企业在 2025 至 2027 年的资本开支承诺，后者是当时预计扣除回购后的留存现金流，加上已有现金。\n单看总额，预计资金能覆盖承诺。再往里看，八家超大盘科技公司就贡献了其中 1.4 万亿美元的承诺，因此这几家公司调整计划就值得跟踪。',
  '企业说自己采用了 AI，和员工究竟有多少工作能得到 AI 辅助，是两种不同的度量。报告里，九类行业的企业采用率从 3.6% 到 25.4%，跨度相当大。\n在作者设想的增长路径里，AI 能辅助的工时占比要从当时约 12%，提高到 2035 年约 30%。接下来要观察的是，更多行业能否把试用变成日常工作。',
  '我们顺着图里的两组职业读。2023 年二季度到 2025 年二季度，高 AI 敞口职业的就业年化增长 1.7%，其他职业是 0.8%。实际工资的差距更大，分别是 3.8% 和 0.7%。\n在这段时间里，高敞口职业没有普遍落后。至于差距有多少来自 AI，这张按职业分组的图还回答不了。',
  '刚才讲的是 AI 能不能带动经济。现在换个位置，假设我们用当时的价格买入美股。企业要把多少新增收入留下来，我们才有理想的回报？\n先看三种市场情景，再看同一笔投资换一组假设后，净现值会怎样变化。',
  '请先读中间的基准情景。作者给了它 60% 的概率，估计美股未来十年年化回报为 5% 到 7%。如果 AI 的效果不及预期，表里的回报区间就变成负 2% 到正 2%。\n把三种情景及其概率都考虑进去，原报告给出的整体区间是 4% 到 5%。所以引用这张表时，要说清楚我们指的是哪一行。',
  '先看基准点。这组测算把研发和资本开支都算进去，2025 至 2027 年投资合计 3.1 万亿美元，估出的净现值是负 0.9 万亿美元。\n五种情景里，只有同时具备强护城河、又按 10% 的低折现率估值时，净现值才转为正 4.1 万亿美元。企业能留住多少收益，和资金有多贵，都直接影响结果。',
  '我们来比较两段五年期。截至 2025 年三季度，美国消费者的股票和房产财富合计增长了 72%。互联网泡沫时期是 82%，而报告给出的历史中位数是 46%。\n财富增加能给消费提供支撑。这也留下一个问题。如果家庭资产价格回落，支撑消费的这股力量会怎么变？',
  '回到组合。刚才的情景里，有的风险来自盈利兑现，有的来自估值变化，一个仓位很难同时解决所有问题。\n最后一章，我们先看不同资产各自能承担什么角色，再看报告当时怎样把这些角色组合起来，以及什么新证据值得让我们重新讨论。',
  '右图里，美国价值股的十年年化回报预测约为 7%，高质量美国固收约为 4%。为什么在作者的风险回报排序中，固收反而排第一？因为排序还考虑波动和分散作用。\n还有一个容易读错的地方。图上约 6% 的回报预测对应非美股票整体。报告在风险回报排序中单独提到的是非美发达市场，两者覆盖的市场不同。',
  '请先把四类资产合成股票和固收两组。基准是股票 60%、固收 40%。在 2025 年 10 月底的时点组合里，股票降到 40%，固收升到 60%。\n再看股票内部，美国价值股占整个组合的 15%，美国成长股占 6%。这说明作者同时调整了股债比例和股票内部的倾向。具体权重也取决于模型当时的约束。',
  '下一次拿到企业季报，我会先核对资本开支指引有没有下调，再核对预计留存现金流能否支撑承诺。再看行业采用率，判断需求有没有扩散。\n如果开支被削减，同时美股盈利增速也低于报告基准区间的下限 6%，我们就翻回第 12 页，重新讨论下行情景。这是本次研读提出的跟踪办法。',
  '回到开头那个问题。新增投资会进入经济增长，但股东能拿到多少回报，还取决于买入价格、企业的竞争优势和融资成本。\n我建议把这份历史展望留作一张可以逐季核对的清单。下次讨论时，先指出哪个假设有了新证据，再说明它会怎样改变我们对组合的判断。',
  '谢谢大家。最后想请大家选一项。如果只能先核实一个假设，大家会选企业能否兑现资本开支，还是新增业务能否形成足够的利润？这两个答案，对应报告里两类不同的证据。\n想谈资金的同事，我们翻回第 8 页。想谈盈利门槛，我们一起看第 13 页的净现值测算。'
]

const chart = {
  page: 10,
  titleHint: '劳动力市场数据反证悲观预期',
  comment: '图放大到左边，标出疫情后高 AI 敞口职业的两根柱子。',
  prompt: '按批注调整，右边用两句话讲清差距，原数据保留。',
  caption: '2023 年二季度至 2025 年二季度，高 AI 敞口职业两项增速均较高（年化，%）',
  highlights: [
    { seriesIndex: 1, pointIndex: 0, color: '#CB482A' },
    { seriesIndex: 1, pointIndex: 2, color: '#CB482A' }
  ],
  // All coordinates are on a 1000-unit wide slide, including vertical coordinates.
  layout: {
    chart: { left: 40, top: 140, width: 625, height: 325 },
    caption: { left: 40, top: 105, width: 625, height: 33 },
    heading: { left: 690, top: 105, width: 269, height: 35 },
    body: { left: 690, top: 153, width: 269, height: 150 },
    takeaway: { left: 690, top: 319, width: 269, height: 142 }
  }
}

export const PRESENTATION_EDIT_GUIDE_CONTENT = {
  filename: '人工智能周期与资产配置.pptx',
  notesPrompt: '给这份 PPT 每页写一段能直接照着讲的逐字稿，放在演讲者备注里，翻页时衔接自然一点。',
  notes,
  reviewPages: [1, 5, 12, 20],
  chart,
  title: {
    page: 13,
    original: 'AI 投资回报的 NPV 敏感性',
    replacement: '五种情景中，仅一种净现值为正',
    prompt: '把这个标题改成一句结论，说清几种情景里净现值为正。'
  },
  replies: {
    notes: '20 页的逐字稿已写入演讲者备注。翻到任意一页，都可以在画布下方查看这一页怎么讲。',
    chart: '图已移到左侧放大，并标出了高 AI 敞口职业的两根柱子。右侧列出两组职业的年化增速差距，就业为 0.9 个百分点，实际工资为 3.1 个百分点。',
    title: '第 13 页的标题已改为“五种情景中，仅一种净现值为正”。'
  }
}

type InspectedSlide = {
  id: string
  elements: ReadonlyArray<{ id: string; type: string; text?: string }>
}

export function createPresentationGuideChartOperations(slide: InspectedSlide, viewportSize: number, chartId: string) {
  if (!Number.isFinite(viewportSize) || viewportSize <= 0 || !slide.elements.some(el => el.id === chartId && el.type === 'chart'))
    throw Error('未找到批注引用的图表。')

  const compact = (text: string) => text.replace(/\s+/g, '')
  const matchText = (prefix: string, replacement: string) => {
    const matches = slide.elements.filter(el => {
      const text = compact(el.text ?? '')
      return text.startsWith(compact(prefix)) || text === compact(replacement)
    })
    if (matches.length !== 1) throw Error('未找到唯一的图表解读文字：' + prefix)
    return matches[0]!.id
  }
  const move = (elementId: string, box: typeof chart.layout.chart) => {
    const scale = viewportSize / 1000
    return {
      op: 'move', slideId: slide.id, elementId,
      left: box.left * scale, top: box.top * scale, width: box.width * scale, height: box.height * scale
    }
  }
  const rewrites = [
    { prefix: '就业与实际工资年化增速', box: chart.layout.caption, text: chart.caption },
    { prefix: '高 AI 敞口职业反而', box: chart.layout.heading, text: '实际工资增速差距更大' },
    {
      prefix: '约 140 个 AI 敞口最高的职业', box: chart.layout.body,
      text: '高 AI 敞口职业的实际工资年化增长 3.8%，其他职业为 0.7%，相差 3.1 个百分点。'
    },
    {
      prefix: '含义：AI 目前总体', box: chart.layout.takeaway,
      text: '同期就业年化增速分别为 1.7% 和 0.8%，相差 0.9 个百分点。'
    }
  ]
  const textChanges = rewrites.flatMap(({ prefix, box, text }) => {
    const elementId = matchText(prefix, text)
    return [move(elementId, box), { op: 'text', slideId: slide.id, elementId, text }]
  })
  return [
    move(chartId, chart.layout.chart),
    ...textChanges,
    ...chart.highlights.map(highlight => ({ op: 'chartPointColor', slideId: slide.id, elementId: chartId, ...highlight }))
  ]
}
