import{expect,it}from'vitest'
import{scalarEntityArgumentIssue}from'../packages/dsh-research-task-runtime/component-scalar-entity-arguments.js'
const records=[{purpose:'discovery',response:{kind:'catalog',interfaces:[{api:'entity_basic',parameters:{ts_code:{type:'str',description:'对象代码'},market:{type:'str',description:'市场'}}}]}}]
it('prevents an undeclared comma batch being sent as one scalar entity',()=>{
 expect(scalarEntityArgumentIssue({api_name:'entity_basic',params:{ts_code:'A.OF,B.OF'}},records)).toContain('逐个')
 expect(scalarEntityArgumentIssue({api_name:'entity_basic',params:{ts_code:'A.OF'}},records)).toBeUndefined()
 expect(scalarEntityArgumentIssue({api_name:'unknown',params:{ts_code:'A.OF,B.OF'}},records)).toBeUndefined()
})
it('preserves documented batch capability and does not interpret free text as a list',()=>{
 expect(scalarEntityArgumentIssue({api_name:'entity_basic',params:{ts_code:'A.OF,B.OF'}},[{response:{kind:'catalog',interfaces:[{api:'entity_basic',parameters:{ts_code:{type:'str',description:'对象代码，支持多个逗号分隔'}}}]}}])).toBeUndefined()
 expect(scalarEntityArgumentIssue({api_name:'entity_basic',params:{market:'含逗号,的文本'}},records)).toBeUndefined()
})
