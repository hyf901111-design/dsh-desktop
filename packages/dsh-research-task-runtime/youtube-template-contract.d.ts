export type YoutubeSpec={version:1;type:'youtube';title:string;url:string|null;description?:string;durationSeconds?:number;thumbnailUrl?:string;subtitles?:string}
export const YOUTUBE_GUIDANCE:string
export const YOUTUBE_TEMPLATES:ReadonlyArray<{id:string;type:string;title:string;figma:string;width:number;height:number;minWidth:number;minHeight:number;version:string;interactions:string[]}>
export function youtubeVideo(value:unknown):{id:string;startSeconds:number}|null
export function parseYoutubeSpec(value:unknown):Readonly<YoutubeSpec>|null
