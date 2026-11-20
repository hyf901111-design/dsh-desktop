// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { it, expect } from 'vitest'
import { applyOfficeAxes } from '../packages/presentation-editor/overlay/office-axes'

it.each([11, 12])(
  'retains the visible date axis and both scales of the EFund combination chart %s',
  async (number) => {
    const zip = await JSZip.loadAsync(
      readFileSync(resolve('skills/efund-ppt-maker/assets/efund-template-v6.pptx'))
    )
    const source = await zip.file('ppt/charts/chart' + number + '.xml').async('string')
    const doc = new DOMParser().parseFromString(source, 'application/xml')
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
