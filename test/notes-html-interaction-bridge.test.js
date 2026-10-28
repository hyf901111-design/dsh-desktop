import {expect,it} from 'vitest'
import {createNoteHtmlInteractionBridge} from '../scripts/lib/notes-html-interaction.mjs'
const event=id=>({id,clock:id==='a'?1:2,targetRoute:[0],tag:'SUMMARY',type:'click'})
const state=(...events)=>({version:'v',events:Object.fromEntries(events.map(e=>[e.id,e]))})
it('waits for the real save and does not acknowledge the optimistic Notes payload',async()=>{
 const wait=Promise.withResolvers(),bridge=createNoteHtmlInteractionBridge(state(),()=>wait.promise),a=event('a'),pending=bridge.commit('v',a)
 bridge.observe(state(a));expect(bridge.snapshot()).toEqual(state());wait.resolve(state(a));await expect(pending).resolves.toBe(true);expect(bridge.snapshot()).toEqual(state(a))
})
it('keeps a successful ACK after an earlier failure even when observe is delayed',async()=>{
 const a=event('a'),b=event('b');let call=0
 const bridge=createNoteHtmlInteractionBridge(state(),async()=>{if(!call++)throw Error('disk');return state(b)})
 await expect(bridge.commit('v',a)).resolves.toBe(false);await expect(bridge.commit('v',b)).resolves.toBe(true);expect(bridge.snapshot()).toEqual(state(b))
})
it('does not roll a newer confirmed ACK back when an earlier response arrives later',async()=>{
 const a=event('a'),b=event('b'),first=Promise.withResolvers(),second=Promise.withResolvers()
 const bridge=createNoteHtmlInteractionBridge(state(),(_version,e)=>e.id==='a'?first.promise:second.promise),pa=bridge.commit('v',a),pb=bridge.commit('v',b)
 second.resolve(state(a,b));await expect(pb).resolves.toBe(true);first.resolve(state(a));await expect(pa).resolves.toBe(true);expect(bridge.snapshot()).toEqual(state(a,b))
})
it('accepts an idempotent saved event independently of JSON property ordering',async()=>{
 const a=event('a'),same={type:a.type,tag:a.tag,targetRoute:a.targetRoute,clock:a.clock,id:a.id},bridge=createNoteHtmlInteractionBridge(state(),async()=>state(same))
 await expect(bridge.commit('v',a)).resolves.toBe(true);expect(bridge.snapshot()).toEqual(state(a))
})
it('keeps the last confirmed state on failure and filters an unconfirmed failed write from observation',async()=>{
 const a=event('a'),wait=Promise.withResolvers(),bridge=createNoteHtmlInteractionBridge(state(),()=>wait.promise),pending=bridge.commit('v',a)
 bridge.observe(state(a));wait.reject(Error('disk'));await expect(pending).resolves.toBe(false);expect(bridge.snapshot()).toEqual(state());bridge.observe(state(a));expect(bridge.snapshot()).toEqual(state())
})
it('does not acknowledge or publish a disposed bridge',async()=>{
 const a=event('a'),wait=Promise.withResolvers(),bridge=createNoteHtmlInteractionBridge(state(),()=>wait.promise),pending=bridge.commit('v',a);bridge.dispose();wait.resolve(state(a));await expect(pending).resolves.toBe(false);expect(bridge.snapshot()).toEqual(state())
})

it('ignores a stale observation until the confirmed ACK has been observed, then honors Undo',async()=>{
 const a=event('a'),bridge=createNoteHtmlInteractionBridge(state(),async()=>state(a))
 await bridge.commit('v',a);bridge.observe(state());expect(bridge.snapshot()).toEqual(state(a))
 bridge.observe(state(a));bridge.observe(state());expect(bridge.snapshot()).toEqual(state())
})
it('never starts a malformed iframe event or request after disposal',async()=>{
 let calls=0;const bridge=createNoteHtmlInteractionBridge(state(),async()=>{calls++;return state()})
 await expect(bridge.commit('v',undefined)).resolves.toBe(false);bridge.dispose();await expect(bridge.commit('v',event('a'))).resolves.toBe(false);expect(calls).toBe(0)
})

it('retains an Undo observed while a later save fails',async()=>{
 const a=event('a'),b=event('b'),wait=Promise.withResolvers(),bridge=createNoteHtmlInteractionBridge(state(a),()=>wait.promise),pending=bridge.commit('v',b)
 bridge.observe(state());wait.reject(Error('disk'));await expect(pending).resolves.toBe(false);expect(bridge.snapshot()).toEqual(state())
})
