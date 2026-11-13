export function renderCartesianChart(value: unknown): { html: string; title: string; type: 'html'; version: number } | null

export function cartesianChartSvg(spec: any, width?:number, visible?:boolean[], height?:number): {markup:string;width:number;height:number;elements:any[]};

export function cartesianChartAxisPrecision(base:typeof cartesianChartSvg):typeof cartesianChartSvg;
