import {expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {createNoteFileViewStore} from '../scripts/lib/notes-files.mjs'
it('accepts only owned note hosts, keeps a stable snapshot and removes viewers on unmount or identity change',()=>{
 const window=new Window(),doc=window.document,store=createNoteFileViewStore(doc);doc.body.innerHTML='<section class="en-root"><div id="file" class="en-file-host" data-note-file="n" data-note-session="s"></div></section><div id="foreign" class="en-file-host" data-note-file="n" data-note-session="s"></div>'
 const send=value=>doc.dispatchEvent(new window.CustomEvent('sherlock:notes-file-view',{detail:value})),value={instanceId:'i',hostId:'file',sessionId:'s',node:{id:'n',authorizationId:'grant'}}
 const empty=store.snapshot();send({...value,hostId:'foreign'});expect(store.snapshot()).toBe(empty);send({...value,node:{id:'different',authorizationId:'grant'}});expect(store.snapshot()).toBe(empty)
 send(value);expect(store.snapshot()).toHaveLength(1);expect(store.snapshot()).toBe(store.snapshot());send({...value,node:{...value.node,height:700}});expect(store.snapshot()[0].node.height).toBe(700)
 send({instanceId:'i',remove:true});expect(store.snapshot()).toEqual([]);send(value);doc.dispatchEvent(new window.Event('sherlock:notes-reset'));expect(store.snapshot()).toEqual([]);store.dispose();window.happyDOM.abort()
})
