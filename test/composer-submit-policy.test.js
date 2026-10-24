import {readFile} from 'node:fs/promises'
import {describe,it,expect,vi} from 'vitest'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isVariableDeclaration} from 'typescript'
import {patchComposerSubmitPolicy} from '../scripts/lib/composer-submit-policy.mjs'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'

const installed = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
function primary(source, overrides={}) {
  const tree=createSourceFile('client.js',source,ScriptTarget.Latest,false,ScriptKind.JS)
  let declaration
  const visit=node=>{if(!declaration&&isVariableDeclaration(node)&&node.name.getText(tree)==='onPrimary')declaration=node;forEachChild(node,visit)}
  visit(tree)
  const deps={primaryStops:false,stop:vi.fn(),inputActions:{submit:vi.fn()},empty:false,disabled:false,machineBusy:false,eworkNotes:false,
    odysseyCreationAnnounce:vi.fn(),sessionId:'session',draft:'继续核对数据',subagentPanel:false,running:true,canvasRunning:false,researchCanvasWorkspace:undefined,
    keyboard:{submit:vi.fn()},resolveSubmitMode:vi.fn((running,_gesture,available)=>running&&available?'steer':'queue'),subagent:null,...overrides}
  new Function(...Object.keys(deps),`return (${declaration.initializer.getText(tree)})();`)(...Object.values(deps))
  return deps
}
describe('发送按钮与回车的提交策略一致',()=>{
  it('uses the configured steering policy during a running parent turn',()=>{
    const d=primary(patchComposerSubmitPolicy(installed))
    expect(d.resolveSubmitMode).toHaveBeenCalledWith(true,'enter',true)
    expect(d.keyboard.submit).toHaveBeenCalledWith('steer')
    expect(d.inputActions.submit).not.toHaveBeenCalled()
  })
  it('keeps queue preference, idle input, child input and durable canvas tasks on their existing paths',()=>{
    for(const overrides of [{resolveSubmitMode:()=> 'queue'},{running:false},{subagent:{}},{canvasRunning:true}]){
      const d=primary(patchComposerSubmitPolicy(installed),overrides)
      expect(d.keyboard.submit).toHaveBeenCalledWith('queue')
    }
  })
  it('preserves stop, disabled, empty and missing-keyboard behavior',()=>{
    const stopped=primary(patchComposerSubmitPolicy(installed),{primaryStops:true})
    expect(stopped.stop).toHaveBeenCalledOnce();expect(stopped.keyboard.submit).not.toHaveBeenCalled()
    for(const overrides of [{empty:true},{disabled:true},{machineBusy:true}])expect(primary(patchComposerSubmitPolicy(installed),overrides).keyboard.submit).not.toHaveBeenCalled()
    expect(primary(patchComposerSubmitPolicy(installed),{keyboard:undefined}).inputActions.submit).toHaveBeenCalledOnce()
  })
  it('patches old installed copies idempotently and rejects a moved native boundary',()=>{
    const patched=patchComposerSubmitPolicy(installed)
    expect(createSourceFile('client.js',patched,ScriptTarget.Latest,false,ScriptKind.JS).parseDiagnostics).toHaveLength(0)
    expect(patchComposerSubmitPolicy(patched)).toBe(patched)
    expect(()=>patchComposerSubmitPolicy('unknown')).toThrow()
  })
  it('survives the creation-progress installer being applied again',()=>{
    const patched=patchResearchCreationProgress(installed)
    expect(primary(patchResearchCreationProgress(patched)).keyboard.submit).toHaveBeenCalledWith('steer')
  })
})
