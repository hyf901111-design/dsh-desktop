export type SharedCalendarEvent = {id:string;title:string;date:string;time:string|null;timezone:string;notes:string;repeat:'none'|'daily'|'weekly'|'monthly';reminderMinutes:null;createdAt:number;updatedAt:number;completed:Record<string,true>}
export type SharedCalendarSpec = {version:1;type:'calendar-tool';title:string;[key:string]:unknown}
export function calendarSharedDate(value:unknown):value is string
export function calendarSharedEvent(value:unknown,id:string):SharedCalendarEvent|null
export function calendarSharedSpec(value:unknown):SharedCalendarSpec|null
