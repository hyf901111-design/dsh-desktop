export function renderCartesianChart(value: unknown): { html: string; title: string; type: 'html'; version: number } | null

export function cartesianChartSvg(spec: any, width?:number, height?:number, visible?:boolean[]): {markup:string;width:number;height:number;elements:any[]};

export function cartesianChartAxisPrecision(base:typeof cartesianChartSvg):typeof cartesianChartSvg;
