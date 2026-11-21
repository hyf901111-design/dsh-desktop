import type { KnowledgeFilter, KnowledgeFormat } from '../../src/shared/knowledge-library'
import type {ConversationComponentCreateArguments,ConversationComponentCreateReceipt} from './conversation-component-contract.js'
export type ClientCapabilityContext={owner:string;sessionId:string;documentId:string;mode:'notes'|'research'|'conversation'|'spreadsheet'|'presentation'|'knowledge'|'image'|'browser'|'trajectory';editable:boolean;selectedBlockIds:string[];componentBlockIds?:string[];selectedParagraphIds?:string[];selectedNativeBlockIds?:string[];canvasAvailable?:boolean}
/** Native payloads receive full type/content validation in the visible Notes editor. */
export type CapabilityNativeBlock={id?:string;type?:string;props?:Record<string,unknown>;content?:string|unknown[]|Record<string,unknown>;children?:CapabilityNativeBlock[]}
export type CapabilityNativeBlockAnchor={blockId:string;placement:'before'|'after'}
export type CapabilityNativeBlockOperation=
 |{op:'insert';blocks:CapabilityNativeBlock[];anchor:CapabilityNativeBlockAnchor;consumeEmpty?:boolean}
 |{op:'update';blockId:string;block:Omit<CapabilityNativeBlock,'id'>}
 |{op:'move';blockIds:string[];anchor:CapabilityNativeBlockAnchor}
 |{op:'remove';blockIds:string[]}
export type ClientCapabilityArguments={
 'knowledge.shared.search':{query?:string;category?:string;formats?:KnowledgeFormat[];offset?:number;scope?:'metadata'|'content'}
 'knowledge.shared.read':{id:string;offset?:number}
 'knowledge.inspect':Record<string,never>
 'knowledge.filter':{revision:string;filter:KnowledgeFilter}
 'knowledge.filter.undo':{revision:string}
 'knowledge.file.read':{id:string;offset?:number}
 'knowledge.markdown.inspect':{id:string}
 'knowledge.markdown.save':{id:string;revision:string;text:string}
 'knowledge.file.organize':{id:string;operation:'rename'|'move'|'star'|'save';name?:string;folderId?:string|null;value?:boolean}
 'conversation.components.create':ConversationComponentCreateArguments
 'notes.components.create':{prompt:string}
 'notes.export':{format:'pdf'|'docx'|'md';path?:string}
 'notes.components.style':{scope:'note'|'selected';theme?:'light'|'dark'|'enterprise'|'openterminal'|'auto';titleBar?:boolean;frame?:boolean}
 'notes.components.layout':{scope:'note'|'selected';width?:'full'|number;height?:'auto'|number}
 'notes.blocks.align':{scope:'note'|'selected';target:'paragraphs'|'researchComponents';alignment:'left'|'center'|'right'}
 'notes.blocks.read':{scope:'note'|'selected';ids?:string[]}
 'notes.blocks.apply':{revision:string;operations:CapabilityNativeBlockOperation[]}
 'notes.blocks.undo':{revision:string;actionId:string}
 'notes.components.inspect':Record<string,never>
 'notes.components.apply':{blockId:string;revision:string;containerSpec:Record<string,any>}
 'notes.challenge.configure':{level?:0|1|2|3|4;commentsExpanded?:boolean}
 'notes.components.data':{action:'inspect'|'configure'|'refresh';revision?:number;settings?:{enabled?:boolean;intervalMinutes?:number}}
 'presentation.open':{revision:number;path:string}
 'presentation.inspect':{slideId?:string;startPage?:number}
 'presentation.apply':{revision:number;createName?:string;operations:Record<string,any>[]}
 'spreadsheet.inspect':{scope?:'workbook'}|{scope:'selected'}|{scope:'range';sheetId:string;range:string}|{scope:'reference';referenceIndex:number}
 'spreadsheet.apply':{revision:number;createName?:string;operations:Record<string,any>[]}
 'spreadsheet.undo':{revision:number;actionId:string}
 'canvas.inspect':{ids?:string[]}
 'canvas.apply':{revision:string;operations:Array<{op:'remove'|'update'|'arrange'|'presentation';id?:string;ids?:string[];fields?:Record<string,any>}>}
 'canvas.undo':{revision:string;actionId:string}
 'ui.zoom.in':Record<string,never>
 'ui.zoom.out':Record<string,never>
 'ui.fullscreen.set':{enabled:boolean}
 'ui.mode.set':{mode:'conversation'|'research'|'notes'|'spreadsheet'|'presentation'}
 'ui.zoom.reset':Record<string,never>
}
export type ClientCapabilityId=keyof ClientCapabilityArguments
export type CapabilityCall={[K in ClientCapabilityId]:{requestId:string;capability:K;arguments:ClientCapabilityArguments[K]}}[ClientCapabilityId]
export type CapabilityStyleEffect={state:'applied'|'saved';changedBlockIds:string[];kind?:'alignment'|'content'|'layout'}
export type CapabilityExportEffect={state:'writing'|'saved';path:string}
export type CapabilityCreateEffect={state:'placeholder'|'applied'|'saved';blockId:string}
export type CapabilityChallengeConfiguration={level:0|1|2|3|4;commentsExpanded:boolean;phase:'off'|'idle'|'waiting'|'running'|'paused'|'limited'|'failed'}
export type CapabilityChallengeEffect={kind:'challenge';state:'applied'|'saved';settings:Omit<CapabilityChallengeConfiguration,'phase'>;phase:CapabilityChallengeConfiguration['phase']}
export type CapabilityDataEffect={kind:'data';state:'applied'|'saved';blockId:string;operation:'configure'|'refresh';enabled?:boolean;intervalMinutes?:number;lastSuccess?:number}
export type CapabilityNativeBlocksEffect={kind:'native-blocks';state:'applied'|'saved';actionId:string;changedBlockIds:string[];revision:string}
export type CapabilityEffect=CapabilityNativeBlocksEffect|CapabilityDataEffect|CapabilityStyleEffect|CapabilityExportEffect|CapabilityCreateEffect|CapabilityChallengeEffect
export type CapabilityReceipt={requestId?:string;capability?:string;status:'succeeded'|'pending'|'cancelled'|'failed'|'unavailable';message?:string;effect?:CapabilityEffect|ConversationComponentCreateReceipt['effect'];path?:string;changedBlockIds?:string[];blockId?:string;data?:unknown}
export type CapabilityHandler<K extends ClientCapabilityId=ClientCapabilityId>=(args:ClientCapabilityArguments[K],context:ClientCapabilityContext,signal?:AbortSignal,requestId?:string)=>Promise<CapabilityReceipt>
export function createClientCapabilityRegistry(handlers:{searchSharedKnowledge?:CapabilityHandler<'knowledge.shared.search'>;readSharedKnowledge?:CapabilityHandler<'knowledge.shared.read'>;inspectKnowledge?:CapabilityHandler<'knowledge.inspect'>;filterKnowledge?:CapabilityHandler<'knowledge.filter'>;undoKnowledgeFilter?:CapabilityHandler<'knowledge.filter.undo'>;readKnowledgeDocument?:CapabilityHandler<'knowledge.file.read'>;inspectKnowledgeMarkdown?:CapabilityHandler<'knowledge.markdown.inspect'>;saveKnowledgeMarkdown?:CapabilityHandler<'knowledge.markdown.save'>;editKnowledgeDocument?:CapabilityHandler<'knowledge.file.organize'>;openPresentation?:CapabilityHandler<'presentation.open'>;inspectPresentation?:CapabilityHandler<'presentation.inspect'>;applyPresentation?:CapabilityHandler<'presentation.apply'>;inspectSpreadsheet?:CapabilityHandler<'spreadsheet.inspect'>;applySpreadsheet?:CapabilityHandler<'spreadsheet.apply'>;undoSpreadsheet?:CapabilityHandler<'spreadsheet.undo'>;readNoteBlocks?:CapabilityHandler<'notes.blocks.read'>;applyNoteBlocks?:CapabilityHandler<'notes.blocks.apply'>;undoNoteBlocks?:CapabilityHandler<'notes.blocks.undo'>;createConversationComponent?:CapabilityHandler<'conversation.components.create'>;createComponent?:CapabilityHandler<'notes.components.create'>;exportNote?:CapabilityHandler<'notes.export'>;styleComponents?:CapabilityHandler<'notes.components.style'>;layoutComponents?:CapabilityHandler<'notes.components.layout'>;alignBlocks?:CapabilityHandler<'notes.blocks.align'>;inspectNoteComponent?:CapabilityHandler<'notes.components.inspect'>;applyNoteComponent?:CapabilityHandler<'notes.components.apply'>;configureChallenge?:CapabilityHandler<'notes.challenge.configure'>;componentData?:CapabilityHandler<'notes.components.data'>;inspectCanvas?:CapabilityHandler<'canvas.inspect'>;applyCanvas?:CapabilityHandler<'canvas.apply'>;undoCanvas?:CapabilityHandler<'canvas.undo'>;zoomIn?:CapabilityHandler<'ui.zoom.in'>;zoomOut?:CapabilityHandler<'ui.zoom.out'>;setFullscreen?:CapabilityHandler<'ui.fullscreen.set'>;setMode?:CapabilityHandler<'ui.mode.set'>;resetZoom?:CapabilityHandler<'ui.zoom.reset'>}):{catalog(context:ClientCapabilityContext):Array<{id:string;description:string;parameters:any;available:boolean}>;get(id:string):any;execute(call:CapabilityCall,context:ClientCapabilityContext,signal?:AbortSignal):Promise<CapabilityReceipt>}
export function createCapabilityExecutor(registry:ReturnType<typeof createClientCapabilityRegistry>,current:()=>ClientCapabilityContext|undefined):{execute(call:CapabilityCall,context:ClientCapabilityContext,signal?:AbortSignal):Promise<CapabilityReceipt>}
export function noteCapabilityReceiptMessage(receipt:CapabilityReceipt,locale?:string):string|undefined
export function capabilityReceiptText(receipts:CapabilityReceipt[],locale?:string):string
