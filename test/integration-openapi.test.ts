import {expect,it} from 'vitest'
import {compileOpenApi} from '../src/main/integrations/adapters/openapi'
it('compiles path/query/body contracts and resolves only document-local refs',()=>{
  const result=compileOpenApi(JSON.stringify({openapi:'3.1.0',info:{title:'Test',version:'1'},components:{schemas:{Query:{type:'string'}}},paths:{'/items/{id}':{get:{operationId:'readItem',parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}},{name:'query',in:'query',schema:{$ref:'#/components/schemas/Query'}}],responses:{'200':{description:'ok'}}}}}}),'json')
  expect(result.diagnostics).toEqual([])
  expect(result.tools[0]).toMatchObject({id:'readItem',method:'GET',path:'/items/{id}',pathParams:['id'],queryParams:['query'],effect:'read'})
  expect(result.tools[0]?.inputSchema).toMatchObject({required:['id'],properties:{id:{type:'string'},query:{type:'string'}}})
})
it('reports external references and unsupported request encoding instead of making unsafe tools',()=>{
  const result=compileOpenApi(JSON.stringify({openapi:'3.0.3',paths:{'/x':{post:{requestBody:{content:{'multipart/form-data':{schema:{type:'object'}}}},responses:{}}}}}),'json')
  expect(result.tools).toEqual([]);expect(result.diagnostics[0]?.message).toMatch(/JSON|编码/)
  const remote=compileOpenApi(JSON.stringify({openapi:'3.1.0',paths:{'/x':{get:{parameters:[{name:'x',in:'query',schema:{$ref:'https://other/schema'}}],responses:{}}}}}),'json')
  expect(remote.tools).toEqual([]);expect(remote.diagnostics[0]?.message).toMatch(/引用/)
})
