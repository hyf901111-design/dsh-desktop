import type {ComponentDataBinding,ComponentDataInput,ComponentDataSettings,DataRequest,DataValue} from '../../src/shared/component-data'
export function evaluateMapping(mapping:unknown,responses:Record<string,unknown>,now?:Date):any
export function materializeComponentMapping(mapping:unknown,responses:Record<string,unknown>,now?:Date):any
export function decodeDataResponse(value:unknown):unknown
export class ComponentDataRefresh {
 constructor(options:{onChange?:(rows:ComponentDataBinding[])=>void;now?:()=>number;owner:()=>string|undefined;load:()=>Promise<ComponentDataBinding[]>;save:(value:ComponentDataBinding[])=>Promise<void>;inspect:(binding:ComponentDataInput|ComponentDataBinding,signal?:AbortSignal)=>Promise<{revision:string;spec:any;writable:boolean}>;apply:(binding:ComponentDataBinding,revision:string,spec:any,signal:AbortSignal)=>Promise<unknown>;validateRequest:(request:Pick<DataRequest,'key'|'toolId'|'args'>,target:ComponentDataInput)=>Promise<DataRequest>;execute:(binding:ComponentDataBinding,request:DataRequest,args:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>})
 load():Promise<void>
 list(sessionId?:string):ComponentDataBinding[]
 setVisible(sessionId:string,active:boolean):void
 isVisible(sessionId:string):boolean
 bind(input:ComponentDataInput,initialSpec?:unknown,options?:{preserveSettings?:boolean}):Promise<ComponentDataBinding>
 configure(id:string,patch:ComponentDataSettings,control?:{expectedRevision?:number;signal?:AbortSignal}):Promise<ComponentDataBinding>
 refresh(id:string,automatic?:boolean,control?:{expectedRevision?:number;signal?:AbortSignal;guardId?:string}):Promise<ComponentDataBinding|undefined>
 tick():Promise<void>
 dispose():Promise<void>
}
