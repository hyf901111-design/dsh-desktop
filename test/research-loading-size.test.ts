import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const start=source.indexOf('onExpandGeneration:(requestedSize='),end=source.indexOf('},',start)+1
const callback=(current:any)=>{const update=vi.fn();const call=runInNewContext('({'+source.slice(start,end)+'})',{node:{id:'node'},workspace:{getSnapshot:()=>({artifacts:[current]}),updateNodeGeometry:update}}).onExpandGeneration;return {call,update}}
it('shrinks automatic loading cards while keeping smaller cards unchanged',()=>{const a=callback({id:'node',width:656,height:456,sizeMode:'auto'});a.call('loading');expect(a.update).toHaveBeenCalledWith('node',{width:400,height:300,sizeMode:'auto'});const b=callback({id:'node',width:320,height:220,sizeMode:'auto'});b.call('loading');expect(b.update).not.toHaveBeenCalled()})
it('preserves manual geometry and existing generated content during refresh',()=>{for(const fields of [{sizeMode:'manual'},{sizeMode:'auto',containerSpec:{type:'html'}}]){const a=callback({id:'node',width:656,height:456,...fields});a.call('loading');expect(a.update).not.toHaveBeenCalled()}})
it('still expands completed content to its requested reading size',()=>{const a=callback({id:'node',width:400,height:300,sizeMode:'auto'});a.call('large');expect(a.update).toHaveBeenCalledWith('node',{width:656,height:456,sizeMode:'auto'})})
