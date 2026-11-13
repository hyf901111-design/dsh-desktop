export type ChartGeometryNode = string | {
  tag: string
  attributes: Record<string, string | number | boolean>
  children: ChartGeometryNode[]
}
export type ChartGeometry = { width: number; height: number; elements: ChartGeometryNode[] }
export function specialChartView(spec: {
  variant: 'pie' | 'donut'
  items: Array<{label: string; value: number}>
}, width?: number): ChartGeometry
