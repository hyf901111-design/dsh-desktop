// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { it, expect } from 'vitest'
import { applyOfficeAxes } from '../packages/presentation-editor/overlay/office-axes'

import { trimEmptyOfficeSublists, liveChartXml } from '../packages/presentation-editor/overlay/office-import'
import { applyOfficeSeries } from '../packages/presentation-editor/overlay/office-series'

async function chartSource(number) {
  const zip = await JSZip.loadAsync(
    readFileSync(resolve('skills/efund-ppt-maker/assets/efund-template-v6.pptx'))
  )
  const source = await zip.file('ppt/charts/chart' + number + '.xml').async('string')
  return new DOMParser().parseFromString(source, 'application/xml')
}

it('turns the sample chart horizontally while retaining native series, blue fills and labels', async () => {
  const zip = await JSZip.loadAsync(readFileSync(resolve('packages/dsh-research-task-runtime/assets/home-presentation/company-research-briefing.pptx')))
  const source = await zip.file('ppt/charts/chart16.xml').async('string')
  const data = { labels: ['就业增长·高AI敞口','就业增长·其他职业','实际工资·高AI敞口','实际工资·其他职业'], legends: ['疫情前（2015—2019）','疫情后（2023Q2—2025Q2）'], series: [[1,1.1,.1,.5],[1.7,.8,3.8,.7]] }
  const palette = ['#1EB9E1','#005096'], original = { ...data, palette }
  const result = liveChartXml({ xml: source, type: 'bar', original }, data, 'column', palette)
  const before = new DOMParser().parseFromString(source, 'application/xml')
  const after = new DOMParser().parseFromString(result, 'application/xml')
  const nodes = (doc, name) => [...doc.getElementsByTagNameNS('*', name)]
  expect(nodes(after, 'barDir')[0].getAttribute('val')).toBe('bar')
  expect(nodes(after, 'ser').map(s => new XMLSerializer().serializeToString(s))).toEqual(nodes(before, 'ser').map(s => new XMLSerializer().serializeToString(s)))
  expect(nodes(after, 'catAx')[0].getElementsByTagNameNS('*','axPos')[0].getAttribute('val')).toBe('l')
  expect(nodes(after, 'valAx')[0].getElementsByTagNameNS('*','axPos')[0].getAttribute('val')).toBe('b')
})

it.each([11, 12])(
  'retains the visible date axis and both scales of the EFund combination chart %s',
  async (number) => {
    const doc = await chartSource(number)
    const host = document.createElement('div')
    host.innerHTML =
      '<div></div><div class="pptx-chart-custom-legend" style="flex-direction:column"><div><span>成交金额</span></div></div>'
    const option = {
      xAxis: [{ type: 'category', axisLabel: { show: false } }],
      yAxis: [
        { min: 0, max: 140000 },
        { min: -0.6, max: 0.8 }
      ],
      series: [
        { name: '成交金额', type: 'bar' },
        { name: '300非银', type: 'line', yAxisIndex: 1 }
      ],
      grid: [{ right: 10, top: 32 }]
    }
    let result
    const chart = {
      getDom: () => host.firstElementChild,
      getWidth: () => 829,
      getHeight: () => 306,
      setOption: (updates) => {
        result = updates
      }
    }
    applyOfficeAxes(chart, doc, option)
    expect(result.yAxis.map((a) => a.position)).toEqual(['right', 'left'])
    expect(result.xAxis.axisLabel.show).toBe(true)
    expect(result.xAxis.axisLine.onZero).toBe(false)
    expect(result.xAxis.axisLabel.formatter('2015/5/1', 0)).toBe('15-05')
    expect(result.xAxis.axisLabel.formatter('2017/5/1', 24)).toBe('17-05')
    if (number === 11) expect(result.grid.right).toBeGreaterThan(140)
  }
)

it('uses yearly calendar ticks across missing trading days and honors the percentage-axis major unit', async () => {
  const doc = await chartSource(2)
  const option = {
    xAxis: [{ type: 'category' }],
    yAxis: [{ min: 0 }, { min: 0 }],
    series: [
      { name: '量化增强', type: 'line' },
      { name: '累计超额收益', type: 'line', yAxisIndex: 1 }
    ],
    grid: [{}]
  }
  let result
  applyOfficeAxes(
    { getWidth: () => 521, getDom: () => document.createElement('div'), setOption: (o) => (result = o) },
    doc,
    option
  )
  const label = result.xAxis.axisLabel
  const count = doc
    .getElementsByTagNameNS('*', 'cat')[0]
    .getElementsByTagNameNS('*', 'ptCount')[0]
    .getAttribute('val')
  const shown = Array.from({ length: Number(count) }, (_, i) => i)
    .filter((i) => label.interval(i))
    .map((i) => label.formatter('', i))
  expect(shown).toEqual(
    ['2012/07/04', '2013/07/04', '2014/07/04', '2015/07/04', '2016/07/04', '2017/07/04'].slice(
      0,
      shown.length
    )
  )
  expect(shown.length).toBeGreaterThanOrEqual(5)
  expect(label.rotate).toBe(0)
  expect(result.yAxis.map((a) => a.interval)).toEqual([0.5, 0.5])
})

it('lists individually colored bars by category and keeps values intact', async () => {
  const doc = await chartSource(7),
    host = document.createElement('div')
  host.innerHTML =
    '<div></div><div class="pptx-chart-custom-legend"><div><svg><rect fill="#005096"/></svg><span>1</span></div></div>'
  const data = [110, 80, 60, 100, 120, 84]
  const color = (fill) =>
    fill?.firstElementChild?.getAttribute('val') === 'tx2'
      ? '#FFC000'
      : fill?.firstElementChild?.getAttribute('val') && '#' + fill.firstElementChild.getAttribute('val')
  let result
  applyOfficeSeries(
    { getDom: () => host.firstElementChild, setOption: (o) => (result = o) },
    doc,
    { series: [{ type: 'bar', name: '1', data }] },
    color
  )
  expect(result.series[0].data.map((p) => p.value)).toEqual(data)
  expect(result.series[0].data[4].itemStyle.color).toBe('#FFC000')
  expect(host.querySelectorAll('.pptx-chart-custom-legend span')).toHaveLength(6)
  expect([...host.querySelectorAll('span')].at(-1).textContent).toBe('上位都')
  expect(host.querySelectorAll('rect')[4].getAttribute('fill')).toBe('#FFC000')
})

it('discards the imported empty numbered sublist without touching authored nested lists', () => {
  const parent = '<ul><li data-pptx-level="3"><p>公募量化先锋奖</p>'
  const deck = [
    {
      elements: [
        {
          type: 'text',
          content: parent + '<ol><li data-pptx-level="3"><p><span> </span></p></li></ol></li></ul>'
        },
        { type: 'text', content: parent + '<ol><li data-pptx-level="3"><p>后续事项</p></li></ol></li></ul>' }
      ]
    }
  ]
  expect(trimEmptyOfficeSublists(deck)).toBe(true)
  expect(deck[0].elements[0].content).toBe(parent + '</li></ul>')
  expect(deck[0].elements[1].content).toContain('后续事项')
  expect(trimEmptyOfficeSublists(deck)).toBe(false)
})
