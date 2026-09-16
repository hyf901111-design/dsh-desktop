import {describe,it,expect} from 'vitest'
import {installBoardSessionFork} from '../src/preload/board-session-fork'

describe('board fork project preparation',()=>{
  it('registers the parent project before forking and refreshes membership before returning',async()=>{
    const calls:string[]=[]
    const sessions={async fork(input:{sessionId:string;atSeq?:number}){calls.push('fork:'+input.sessionId+':'+input.atSeq);return 'child'}}
    const dispose=installBoardSessionFork(sessions,id=>id==='board',async id=>{calls.push('prepare:'+id)},async()=>{calls.push('refresh')})
    expect(await sessions.fork({sessionId:'board',atSeq:12})).toBe('child')
    expect(calls).toEqual(['prepare:board','fork:board:12','refresh'])
    calls.length=0
    await sessions.fork({sessionId:'ordinary'})
    expect(calls).toEqual(['fork:ordinary:undefined'])
    dispose();calls.length=0
    await sessions.fork({sessionId:'board'})
    expect(calls).toEqual(['fork:board:undefined'])
  })
  it('does not create an orphan child if directory preparation fails',async()=>{
    let created=0
    const sessions={async fork(_input:{sessionId:string}){created++;return 'child'}}
    installBoardSessionFork(sessions,()=>true,async()=>{throw Error('directory unavailable')},async()=>{})
    await expect(sessions.fork({sessionId:'board'})).rejects.toThrow('directory unavailable')
    expect(created).toBe(0)
  })
})
