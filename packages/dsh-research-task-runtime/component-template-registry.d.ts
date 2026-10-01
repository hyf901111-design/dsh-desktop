export type TemplateModel={templateId:string;version:string;data:unknown}
export function readTemplateModel(spec:unknown):TemplateModel|null
