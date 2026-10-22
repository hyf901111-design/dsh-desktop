import type {ChallengeBlock,ChallengeCheck,ChallengeLevel} from '../../shared/notes-challenge'
import type {ParagraphReview} from './challenge-coverage'

type Entry={id:string;type:string;hash:string;complete:boolean;issueCount:number}
type SavedReview={version:1;title:string;level:ChallengeLevel;documentHash:string;entries:Entry[];checks:ChallengeCheck[]}
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')
const documentKey=(title:string,blocks:ChallengeBlock[])=>JSON.stringify([title,blocks])
const checks=(value:unknown):ChallengeCheck[]=>Array.isArray(value)?value.filter((check):check is ChallengeCheck=>typeof check?.kind==='string'&&typeof check.detail==='string'&&['completed','unavailable','skipped','partial'].includes(check.status)).map(({kind,status,detail})=>({kind,status,detail})):[]

export async function saveChallengeReviewState(title:string,blocks:ChallengeBlock[],level:ChallengeLevel,covered:Map<string,ParagraphReview>,reviewChecks:ChallengeCheck[]):Promise<SavedReview>{
 const entries=await Promise.all(blocks.flatMap(block=>{
  const review=covered.get(block.id)
  return review?.title===title&&review.level===level&&review.text===block.text?[hash(block.text).then(digest=>({id:block.id,type:block.type,hash:digest,complete:review.complete,issueCount:review.issueCount}))]:[]
 }))
 return {version:1,title,level,documentHash:await hash(documentKey(title,blocks)),entries,checks:checks(reviewChecks)}
}

export async function restoreChallengeReviewState(value:unknown,title:string,blocks:ChallengeBlock[],level:ChallengeLevel){
 const covered=new Map<string,ParagraphReview>(),saved=value as SavedReview|undefined
 if(saved?.version!==1||saved.title!==title||saved.level!==level||!Array.isArray(saved.entries)||saved.entries.length>10000)return {covered,checks:[] as ChallengeCheck[]}
 const byId=new Map(blocks.map(block=>[block.id,block]))
 await Promise.all(saved.entries.map(async entry=>{
  const block=byId.get(entry?.id)
  if(!block||entry.type!==block.type||typeof entry.hash!=='string'||!/^[a-f\d]{64}$/.test(entry.hash)||typeof entry.complete!=='boolean'||!Number.isInteger(entry.issueCount)||entry.issueCount<0||entry.hash!==await hash(block.text))return
  covered.set(block.id,{text:block.text,title,level,complete:entry.complete,issueCount:entry.issueCount})
 }))
 return {covered,checks:saved.documentHash===await hash(documentKey(title,blocks))?checks(saved.checks):[]}
}
