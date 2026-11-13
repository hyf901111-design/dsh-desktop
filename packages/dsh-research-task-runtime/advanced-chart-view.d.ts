import type {ChartGeometry} from './special-chart-view.js'
export function advancedChartView(spec: {
  variant: 'scatter'
  xAxis: {label: string; unit?: string}
  yAxis: {label: string; unit?: string}
  points: Array<{label: string; x: number; y: number; group?: string}>
}, width?: number): ChartGeometry
