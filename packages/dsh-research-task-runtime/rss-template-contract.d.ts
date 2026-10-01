export type RssEntry={id:string;title:string;url:string|null;summary:string;publishedAt:string|null;updatedAt:string|null}
export type RssFeed={id:string;url:string;title:string;format:'rss'|'atom'|'unknown';fetchedAt:string|null;error:string|null;entries:RssEntry[]}
export type RssSpec={version:1;type:'rss';title:string;asOf:string;feeds:RssFeed[]}
export const RSS_TEMPLATES:readonly unknown[]
export const RSS_WORKBENCH_GUIDANCE:string
export function rssUrl(value:unknown):string|null
export function rssDataIssue(value:unknown):string|null
export function rssTemplateSchema(type:string):string|undefined
export function validRssState(value:unknown):boolean
export function rssReduce(state:unknown,action:unknown):unknown
