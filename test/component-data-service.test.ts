import {expect,it} from 'vitest'
import {componentRefreshBindings} from '../src/main/component-data/service'
import {validateIntegrationBindings} from '../src/shared/scheduled-tasks'

it('combines repeated requests into one valid connection grant with all tool schemas',()=>{
 const first={connectionId:'datayes',connectionRevision:2,toolId:'call-api',schemaDigest:'a'.repeat(64)}
 const second={...first,toolId:'reports',schemaDigest:'b'.repeat(64)}
 const bindings=componentRefreshBindings([first,first,second,{...first,connectionId:'other'}])
 expect(validateIntegrationBindings(bindings)).toHaveLength(2)
 expect(bindings[0]).toMatchObject({entityId:'datayes',bindingRevision:2,toolIds:['call-api','reports'],schemaDigests:{'call-api':first.schemaDigest,reports:second.schemaDigest}})
 expect(()=>componentRefreshBindings([first,{...first,connectionRevision:3}])).toThrow(/版本/)
})
