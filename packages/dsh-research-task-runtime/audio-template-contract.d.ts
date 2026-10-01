export type AudioSpec={version:1;type:'audio';title:string;url:string|null;description?:string;source?:string;date?:string;durationSeconds?:number;waveform?:number[];transcript?:string;chapters?:{title:string;startSeconds:number}[]}
export const AUDIO_GUIDANCE:string
export const AUDIO_TEMPLATES:readonly {id:string;type:string;title:string;figma:string;width:number;height:number;minWidth:number;minHeight:number;version:string;interactions:string[]}[]
export function parseAudioSpec(value:unknown):Readonly<AudioSpec>|null
