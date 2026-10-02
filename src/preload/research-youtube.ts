type Invoke=(channel:string,value?:unknown)=>Promise<unknown>
type Identity={sessionId:string;nodeId:string}
export function createResearchYoutubeBridge(invoke:Invoke){
 return Object.freeze({
  available:()=>invoke('research:youtube-native:available'),
  update:(value:Identity&{url:string;bounds:{x:number;y:number;width:number;height:number};active:boolean;reloadToken:number})=>invoke('research:youtube-native:update',value),
  login:(value:Identity)=>invoke('research:youtube-native:login',value),
  hide:(value:Identity)=>invoke('research:youtube-native:hide',value),
  release:(value:Identity)=>invoke('research:youtube-native:release',value)
 })
}
