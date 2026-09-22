import {assertTrustedMainWindowEvent,type TrustedWindow,type TrustedWindowEvent} from '../ipc-trust'
import {IntegrationError} from '../../shared/integrations'
import {isSkillDetailCommand} from '../../shared/integration-ui'
const commands=new Set(['snapshot','market','set-enabled','dependencies','uninstall','disconnect','save-connection','connection-draft','probe','compile-openapi','grant-tools','preview-skill','skill-detail','import-skill','install','create-plugin','add-source','authorize','operation','cancel-operation','rollback-plugin','legacy-preview','migrate-legacy-skills'])
export function registerIntegrationIpc(
  ipc:{handle(channel:string,handler:(event:TrustedWindowEvent,command:unknown)=>Promise<unknown>):unknown},
  getWindow:()=>TrustedWindow|undefined,
  service:{request(command:unknown):Promise<unknown>},
) {
  ipc.handle('integrations:request',async(event,command)=>{
    assertTrustedMainWindowEvent(event,getWindow())
    if(!command || typeof command!=='object' || Array.isArray(command) || !commands.has((command as {type:string}).type)) throw new IntegrationError('INVALID_CONFIG','未知集成操作')
    if((command as {type:string}).type==='skill-detail' && !isSkillDetailCommand(command)) throw new IntegrationError('INVALID_CONFIG','技能详情请求无效')
    if(JSON.stringify(command).length>2*1024*1024) throw new IntegrationError('INVALID_CONFIG','配置内容过大，请精简后重试')
    return service.request(command)
  })
}
