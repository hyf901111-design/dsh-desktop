import type {ClientCapabilityContext,CapabilityReceipt,CapabilityHandler,createClientCapabilityRegistry} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {explicitNoteExportPaths} from './export-destination'

export type NoteCapabilityAction='notes.export'|'notes.components.style'|'notes.components.layout'|'notes.components.create'|'notes.blocks.align'|'notes.blocks.read'|'notes.blocks.apply'|'notes.blocks.undo'|'notes.components.inspect'|'notes.components.apply'|'notes.challenge.configure'|'notes.components.data'
type Handlers=Pick<Parameters<typeof createClientCapabilityRegistry>[0],'exportNote'|'styleComponents'|'layoutComponents'|'createComponent'|'alignBlocks'|'readNoteBlocks'|'applyNoteBlocks'|'undoNoteBlocks'|'inspectNoteComponent'|'applyNoteComponent'|'configureChallenge'|'componentData'>
type Options={
 context:ClientCapabilityContext|undefined
 renderer(action:NoteCapabilityAction,args:any):Promise<CapabilityReceipt>
 canWrite():boolean
 componentData?:CapabilityHandler<'notes.components.data'>
 requestContext:Record<string,unknown>
 sourceInstruction:string
}

/** Deterministic handlers shared by Notes composer and a host-bound external
 * document lease. The caller retains the single Notes bridge and its guards;
 * no model, document lookup or alternate transport is started here. */
export function createNoteCapabilityHandlers(options:Options):Handlers{
 if(!options.context||options.context.mode!=='notes')return{}
 const writable=()=>{if(!options.canWrite())throw Error('当前笔记不可编辑。')}
 const mutate=(action:NoteCapabilityAction)=>async(args:any)=>{writable();return options.renderer(action,args)}
 return{
  ...options.componentData?{componentData:options.componentData}:{},
  configureChallenge:mutate('notes.challenge.configure'),
  createComponent:async(args)=>{
   writable()
   return options.renderer('notes.components.create',{...args,requestContext:{...options.requestContext,sourceInstruction:options.sourceInstruction}})
  },
  exportNote:async(args)=>{
   const destinations=explicitNoteExportPaths(options.sourceInstruction)
   if(args.path&&destinations.length&&!destinations.includes(args.path))throw Error('导出位置与本次明确指定的位置不一致，请重新选择保存位置。')
   return options.renderer('notes.export',{...args,path:destinations[0]})
  },
  alignBlocks:mutate('notes.blocks.align'),
  readNoteBlocks:async(args)=>options.renderer('notes.blocks.read',args),
  applyNoteBlocks:async(args)=>{writable();return options.renderer('notes.blocks.apply',{...args,sourceInstruction:options.sourceInstruction})},
  undoNoteBlocks:mutate('notes.blocks.undo'),
  inspectNoteComponent:async(args)=>options.renderer('notes.components.inspect',args),
  layoutComponents:mutate('notes.components.layout'),
  applyNoteComponent:mutate('notes.components.apply'),
  styleComponents:mutate('notes.components.style')
 }
}
