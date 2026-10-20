import {expect,it,vi}from'vitest'
import{openClientLink}from'../src/main/search/open-client-link'
it('sends a validated web URL to the trusted shell without granting a webpage a session identity',async()=>{
 const send=vi.fn(),window={isDestroyed:()=>false,webContents:{send}}
 await expect(openClientLink(window as never,'https://example.com/path?q=a#b')).resolves.toEqual({ok:true})
 expect(send).toHaveBeenCalledExactlyOnceWith('conversation:browser',{request:'open-link',url:'https://example.com/path?q=a#b'})
 for(const url of ['javascript:alert(1)','file:///tmp/a','https://user:secret@example.com','not a link'])await expect(openClientLink(window as never,url)).rejects.toThrow()
 expect(send).toHaveBeenCalledTimes(1)
 await expect(openClientLink(undefined,'https://example.com')).rejects.toThrow()
})
