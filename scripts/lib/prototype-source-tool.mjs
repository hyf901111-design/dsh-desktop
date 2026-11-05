const marker='/* sherlock:prototype-source-read:v1 */'
const imports='import { registerPrototypeSourceTool } from "../../../dsh-research-task-runtime/prototype-source-tool.js";\n'
const anchor='\tctx.inject(["attachments"], (imageCtx) => {'
const registration='\t'+marker+'\n\tregisterPrototypeSourceTool(ctx, resolveRegularReadTarget);\n'
export function patchPrototypeSourceTool(source){
 if(source.includes(marker)){
  if(source.split(marker).length!==2||!source.startsWith(imports)||!source.includes(registration+anchor))throw Error('Prototype source tool partial install')
  return source
 }
 if(source.split(anchor).length!==2)throw Error('Prototype source tool native read anchor drifted')
 return imports+source.replace(anchor,registration+anchor)
}
