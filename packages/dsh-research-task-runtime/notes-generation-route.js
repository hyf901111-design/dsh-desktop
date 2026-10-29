// Private in-memory request snapshots. No credentials or persisted settings.
const routes=new WeakMap()
const scope=input=>JSON.stringify([input.requestId,input.prompt,input.insertionAnchor?.documentId,input.clientContext?.owner])
export function rememberNoteGenerationRoute(session,input,route){
 if(!session)return
 let requests=routes.get(session);if(!requests){requests=new Map();routes.set(session,requests)}
 if(!requests.has(input.requestId))requests.set(input.requestId,{scope:scope(input),route:Object.freeze({provider:route.provider,model:route.model,...route.reasoningEffort===undefined?{}:{reasoningEffort:route.reasoningEffort}})})
}
export function noteGenerationRoute(session,input){const entry=session&&routes.get(session)?.get(input.requestId);return entry?.scope===scope(input)?entry.route:undefined}
export function releaseNoteGenerationRoute(session,requestId){if(session)routes.get(session)?.delete(requestId)}
