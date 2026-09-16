import {describe,it,expect,vi} from 'vitest'
import {TemporaryBoards} from '../src/preload/temporary-board'
function store<T>(initial:T){let value=initial;const listeners=new Set<()=>void>();return {getSnapshot:()=>value,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},set:(next:T)=>{value=next;for(const fn of [...listeners])fn()}}}
function fixture(){const selection=store<{current?:string}>({current:'new'}),session=store<any>({blank:true}),canvas=store<any>({files:[],artifacts:[]}),discard=vi.fn(async()=>{});const drafts=new TemporaryBoards(selection,discard,vi.fn());drafts.track('new',session,canvas);return {selection,session,canvas,discard,drafts}}
describe('temporary empty boards',()=>{
 it('discards a newly created empty board once when leaving, including a blank conversation destination',()=>{const f=fixture();f.selection.set({});f.selection.set({current:'other'});expect(f.discard).toHaveBeenCalledExactlyOnceWith('new')})
 it.each([{blank:false},{blank:true,running:true},{blank:true,pending:[{}]}])('retains a board once conversation activity starts: %j',s=>{const f=fixture();f.session.set(s);f.session.set({blank:true});f.selection.set({current:'other'});expect(f.discard).not.toHaveBeenCalled()})
 it.each(['files','artifacts'])('retains a board after adding %s even if later removed',key=>{const f=fixture();f.canvas.set({[key]:[{}]});f.canvas.set({files:[],artifacts:[]});f.selection.set({current:'other'});expect(f.discard).not.toHaveBeenCalled()})
 it('keeps explicitly promoted boards and does not clean up existing sessions',()=>{const f=fixture();f.drafts.keep('new');f.selection.set({current:'existing'});f.selection.set({current:'other'});expect(f.discard).not.toHaveBeenCalled()})
 it('does not discard while history is unknown',()=>{const f=fixture();f.session.set({});f.selection.set({current:'other'});expect(f.discard).not.toHaveBeenCalled()})
})
