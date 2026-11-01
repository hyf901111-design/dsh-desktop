// Default jobs still require exit/results. Only an explicit launch declaration
// can identify a long-lived service; output collection and a later verified
// setup milestone are independently required by task-progress-runtime.
const marker='/* sherlock:bash-background-lifecycle:v1 */\n'
const swaps=[
 ['function validateBashArgs(args) {','function validateBashArgs(args) {\n\tif(args.background_kind!==void 0&&(!["finite","service"].includes(args.background_kind)||args.run_in_background!==true))throw Error("background_kind requires an explicit background finite/service command");'],
 ['\t\t\t...backgroundEnabled ? { run_in_background: {','\t\t\t...backgroundEnabled ? { background_kind: {type:"string",enum:["finite","service"],description:"Defaults to finite: render/build/export tasks must finish and their output must be collected. Use service only for an intentionally long-lived server or watcher that the user asked to leave running. Verify readiness using normal tools, read its job_output, then mark the verified setup milestone completed and report that it remains running. Never label finite work as service to bypass delivery."}, run_in_background: {'],
 ['\t\t\t\t\t\tkind: "bash",','\t\t\t\t\t\tkind: args.background_kind==="service"?"bash-service":"bash",']
]
const one=(source,from,to)=>{if(source.split(from).length!==2)throw Error('Background lifecycle anchor drifted');return source.replace(from,to)}
export function stripBashBackgroundLifecycle(source){
 if(!source.includes(marker)){if(source.includes('args.background_kind')||source.includes('bash-service'))throw Error('Background lifecycle partial install');return source}
 source=one(source,marker,'');for(const[from,to]of swaps)source=one(source,to,from)
 if(source.includes('background_kind')||source.includes('bash-service'))throw Error('Background lifecycle partial restore')
 return source
}
export function patchBashBackgroundLifecycle(source){
 const clean=stripBashBackgroundLifecycle(source);let next=clean
 for(const[from,to]of swaps)next=one(next,from,to)
 return marker+next
}
