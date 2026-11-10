export type BrowserRegionRect={x:number;y:number;width:number;height:number}
export type BrowserQuestionPhase='plain'|'claimed'|'adjudicating'|'submitting'
export type BrowserQuestionCommand=
 |{kind:'prepare'}
 |{kind:'attach';ticket:string;png:string;name?:string}
 |{kind:'edit';ticket:string;draft:string;draftRev:number;sequence:number;syncVersion:number}
 |{kind:'send';ticket:string;draftRev?:number}
 |{kind:'state'|'close'|'delete'|'undo'|'redo';ticket:string}
export type BrowserQuestionState={ticket:string;ownerSessionId:string|null;draft:string;draftRev:number;imageIds:string[];regionImageIds:string[];phase:BrowserQuestionPhase;busy:boolean;active:boolean;canSend:boolean;sequence:number;syncVersion:number;sent?:boolean;error?:string}
export type BrowserQuestionUpdate={ticket:string;state:BrowserQuestionState}
export type BrowserRegionQuestion={operationId:string;ownerSessionId?:string|null;rect:BrowserRegionRect;draft:string;draftRev:number;phase:BrowserQuestionPhase;busy:boolean;sequence?:number;syncVersion?:number;canSend?:boolean;error?:string;sent?:boolean}
export type BrowserRegionOverlayEvent=
 |{kind:'selection';operationId:string;rect:BrowserRegionRect}
 |{kind:'draft';operationId:string;draft:string;draftRev:number;sequence:number;syncVersion:number}
 |{kind:'send'|'close'|'delete'|'undo'|'redo';operationId:string}
export type BrowserRegionStart={operationId:string;bounds:BrowserRegionRect;dark:boolean}
