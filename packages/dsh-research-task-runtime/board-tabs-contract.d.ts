export function boardTabsApplyWorkbench<T extends {files:any[];artifacts:any[]}>(snapshot:T,plan:{id:string;panels:{nodeId:string}[];tabs?:{name:string;panelIndexes:number[]}[]}):T
