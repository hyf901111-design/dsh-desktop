import { readFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const shellOpenExternal = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  shell: { openExternal: shellOpenExternal }
}))

import { secureWindow } from '../src/main/security'

beforeEach(() => shellOpenExternal.mockClear())

type NavigationEvent = {
  preventDefault(): void
  url?: string
  isMainFrame?: boolean
  initiator?: { processId: number; routingId: number; url?: string } | null
  frame?: { url: string; parent?: { processId: number; routingId: number } | null }
}

function secureWindowFixture(allowsResearchFrameUrl: (url: string) => boolean = () => false, ownsResearchFrame?: (frame: any) => boolean, researchFrameUrl?: (frame: any) => string | null, youtubeAppId?: string,openWebLink?:(url:string)=>void) {
  const listeners = new Map<string, (event: NavigationEvent, url?: string) => void>()
  const permissionCheck = vi.fn()
  const permissionRequest = vi.fn()
  const mainFrame = { processId: 7, routingId: 41, url: 'http://127.0.0.1:4310/' }
  const webContents = {
    id: 12,
    mainFrame,
    on: vi.fn((event: string, listener: (event: NavigationEvent, url?: string) => void) => {
      listeners.set(event, listener)
    }),
    setWindowOpenHandler: vi.fn(),
    session: {
      webRequest: { onBeforeSendHeaders: vi.fn() },
      setPermissionCheckHandler: permissionCheck,
      setPermissionRequestHandler: permissionRequest
    }
  }
  secureWindow({ webContents } as never, { allowsResearchFrameUrl, ownsResearchFrame, researchFrameUrl, youtubeAppId,openWebLink })
  return { listeners, mainFrame, webContents }
}

describe('main-window navigation security', () => {
  it('routes shell web navigation and popups through the client browser when configured',()=>{
    const open=vi.fn(),f=secureWindowFixture(undefined,undefined,undefined,undefined,open),preventDefault=vi.fn()
    f.listeners.get('will-navigate')!({preventDefault},'https://example.com/read')
    expect(preventDefault).toHaveBeenCalledOnce()
    f.webContents.setWindowOpenHandler.mock.calls[0]![0]({url:'https://example.com/popup'})
    expect(open.mock.calls).toEqual([['https://example.com/read'],['https://example.com/popup']])
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })
  it('identifies the authorized YouTube embed using the desktop app ID without changing other headers', () => {
    const url = 'https://www.youtube.com/embed/M7lc1UVf-VE?start=90'
    const { mainFrame, webContents } = secureWindowFixture(() => false, frame => frame?.name === 'owned', () => url, 'com.evanarts.sherlock')
    const handler = webContents.session.webRequest.onBeforeSendHeaders.mock.calls[0]?.[1]
    expect(handler).toBeTypeOf('function')
    const original = { referer: 'http://127.0.0.1:4310/', 'User-Agent': 'original Electron identity', Accept: 'text/html' }
    let sent: any
    handler({ url, webContentsId: 12, resourceType: 'subFrame', frame: { name: 'owned', url: 'about:blank', parent: mainFrame }, requestHeaders: original }, (result: any) => { sent = result })
    expect(sent.requestHeaders).toEqual({ Referer: 'https://com.evanarts.sherlock/', 'User-Agent': 'original Electron identity', Accept: 'text/html' })
    expect(original.referer).toBe('http://127.0.0.1:4310/')
  })

  it('does not grant the YouTube identity to unowned frames, different videos, or other requests', () => {
    const url = 'https://www.youtube.com/embed/M7lc1UVf-VE?start=90'
    const { mainFrame, webContents } = secureWindowFixture(() => false, frame => frame?.name === 'owned', () => url, 'com.evanarts.sherlock')
    const handler = webContents.session.webRequest.onBeforeSendHeaders.mock.calls[0]?.[1]
    expect(handler).toBeTypeOf('function')
    const base = { url, webContentsId: 12, resourceType: 'subFrame', frame: { name: 'owned', url: 'about:blank', parent: mainFrame } }
    for (const changed of [
      { webContentsId: 99 }, { resourceType: 'xhr' }, { frame: null },
      { frame: { ...base.frame, name: 'unowned' } },
      { frame: { ...base.frame, url: 'about:srcdoc' } },
      { frame: { ...base.frame, parent: { parent: mainFrame } } },
      { url: 'https://www.youtube.com/embed/aaaaaaaaaaa?start=90' },
      { url: 'https://www.youtube.com.evil.invalid/embed/M7lc1UVf-VE?start=90' },
      { url: 'https://accounts.google.com/AccountChooser' },
      { url: 'https://www.youtube.com/youtubei/v1/player' }
    ]) {
      const requestHeaders = { Referer: 'https://original.example/', 'User-Agent': 'unaltered' }
      let sent: any
      handler({ ...base, ...changed, requestHeaders }, (result: any) => { sent = result })
      expect(sent.requestHeaders).toEqual(requestHeaders)
    }
  })
  it('opens Google account selection for YouTube sign-in and returns to the original video after login',()=>{
    const {listeners,webContents}=secureWindowFixture(()=>false,frame=>frame?.name==='owned',()=> 'https://www.youtube.com/embed/M7lc1UVf-VE?start=90');
    const frame={name:'owned',url:'https://www.youtube.com/embed/M7lc1UVf-VE?start=90',executeJavaScript:vi.fn(async()=>{})},preventDefault=vi.fn();
    const url='https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin';
    listeners.get('will-frame-navigate')!({url,isMainFrame:false,frame:frame as any,preventDefault});
    const assertLogin=()=>{
      const login=new URL(shellOpenExternal.mock.calls[0]![0]);
      expect(login.origin).toBe('https://accounts.google.com');expect(login.pathname).toBe('/AccountChooser');
      expect(login.searchParams.get('service')).toBe('youtube');
      const resume=new URL(login.searchParams.get('continue')!);
      expect(resume.origin).toBe('https://www.youtube.com');expect(resume.pathname).toBe('/signin');
      expect(resume.searchParams.get('next')).toBe('/watch?v=M7lc1UVf-VE&t=90s');
    };
    expect(preventDefault).toHaveBeenCalledOnce();assertLogin();
    shellOpenExternal.mockClear();Object.assign(webContents.mainFrame,{framesInSubtree:[frame]});
    expect(webContents.setWindowOpenHandler.mock.calls[0]![0]({url,referrer:{url:frame.url}})).toEqual({action:'deny'});
    expect(frame.executeJavaScript).not.toHaveBeenCalled();assertLogin();
  });
  it('does not hand unrelated, lookalike or offline frames to YouTube browser sign-in',()=>{
    for(const original of [null,'https://www.youtube.com.evil.invalid/embed/M7lc1UVf-VE','https://example.org/embed/M7lc1UVf-VE']){
      const {listeners}=secureWindowFixture(()=>false,()=>true,()=>original);const preventDefault=vi.fn();
      listeners.get('will-frame-navigate')!({url:'https://accounts.google.com/ServiceLogin',isMainFrame:false,frame:{url:'https://example.org/'},preventDefault});
      expect(shellOpenExternal).not.toHaveBeenCalled();
    }
    const {listeners}=secureWindowFixture(()=>true,()=>true,()=> 'https://www.youtube.com/embed/M7lc1UVf-VE');
    listeners.get('will-frame-navigate')!({url:'https://accounts.google.com/ServiceLogin',isMainFrame:false,frame:{url:'about:srcdoc'},preventDefault:vi.fn()});
    expect(shellOpenExternal).not.toHaveBeenCalled();
  });
  it('routes a research popup to its source frame instead of the external browser',()=>{
    const {webContents}=secureWindowFixture(()=>false,frame=>frame?.name==='owned');
    const executeJavaScript=vi.fn(async()=>{});
    Object.assign(webContents.mainFrame,{framesInSubtree:[{name:'owned',url:'https://ui.shadcn.com/',executeJavaScript}]});
    const handler=webContents.setWindowOpenHandler.mock.calls[0]![0];
    expect(handler({url:'https://ui.shadcn.com/charts/line',referrer:{url:'https://ui.shadcn.com/'}})).toEqual({action:'deny'});
    expect(executeJavaScript).toHaveBeenCalledOnce();expect(shellOpenExternal).not.toHaveBeenCalled();
  });
  it('keeps remote navigation inside owned link frames while blocking shell and local document routes',()=>{
    const {listeners}=secureWindowFixture(()=>false,frame=>frame?.name==='owned');
    const navigate=listeners.get('will-frame-navigate')!;
    for(const url of ['https://ui.shadcn.com/view/chart','https://other.example/page']) {
      const preventDefault=vi.fn();navigate({url,isMainFrame:false,frame:{name:'owned',url:'https://ui.shadcn.com'} as any,preventDefault});expect(preventDefault).not.toHaveBeenCalled();
    }
    for(const url of ['http://127.0.0.1:4310/','file:///tmp/private','sherlock-preview://secret']) {
      const preventDefault=vi.fn();navigate({url,isMainFrame:false,frame:{name:'owned',url:'https://ui.shadcn.com'} as any,preventDefault});expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(shellOpenExternal).not.toHaveBeenCalled();
  });
  it('loads shell-created sidebar HTML frames without granting child documents the same access', () => {
    const { listeners, mainFrame } = secureWindowFixture()
    const navigate = listeners.get('will-frame-navigate')!
    const child = { processId: 7, routingId: 42, url: 'about:blank' }
    const frame = { url: 'about:blank', parent: mainFrame }
    for (const url of [
      'http://127.0.0.1:4310/sidebar/html/session-1/project/report.html'
    ]) {
      const allowed = vi.fn()
      navigate({ url, isMainFrame: false, frame, initiator: mainFrame, preventDefault: allowed })
      expect(allowed).not.toHaveBeenCalled()
      for (const origin of [child, null, undefined]) {
        const blocked = vi.fn()
        navigate({ url, isMainFrame: false, frame, initiator: origin, preventDefault: blocked })
        expect(blocked).toHaveBeenCalledOnce()
      }
      const nested = vi.fn()
      navigate({ url, isMainFrame: false, frame: { url: 'about:blank', parent: child }, initiator: mainFrame, preventDefault: nested })
      expect(nested).toHaveBeenCalledOnce()
    }
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('loads the packaged presentation editor as a direct child of its own shell', () => {
    const { listeners, mainFrame } = secureWindowFixture()
    const url = 'odyssey-presentation://editor/index.html?host=' + encodeURIComponent(new URL(mainFrame.url).origin)
    const navigate = listeners.get('will-frame-navigate')!
    const child = { url:'about:blank', parent:mainFrame, processId:3, routingId:4 }
    for (const [target, initiator, parent, allowed] of [
      [url, mainFrame, mainFrame, true], [url, child, mainFrame, false], [url, mainFrame, child, false],
      [url + '&extra=1', mainFrame, mainFrame, false],
      [url.replace('index.html','other.html'), mainFrame, mainFrame, false]
    ] as const) {
      const preventDefault = vi.fn()
      navigate({ url:target, isMainFrame:false, initiator, frame:{...child,parent}, preventDefault })
      expect(preventDefault).toHaveBeenCalledTimes(allowed ? 0 : 1)
    }
  })

  it('grants fullscreen to the packaged presentation editor in the active main window', () => {
    const {webContents, mainFrame} = secureWindowFixture()
    const handler = webContents.session.setPermissionRequestHandler.mock.calls[0]![0]
    const url = 'odyssey-presentation://editor/index.html?host=' + encodeURIComponent(new URL(mainFrame.url).origin)
    Object.assign(mainFrame, {frames:[{url}]})
    for (const [requester, requestingUrl, isMainFrame, allowed] of [
      [webContents,url,false,true], [null,url,false,false], [webContents,url,true,false],
      [webContents,'https://example.com',false,false]
    ] as const) {
      const callback = vi.fn()
      handler(requester, 'fullscreen', callback, {requestingUrl,isMainFrame})
      expect(callback).toHaveBeenCalledWith(allowed)
    }
  })

  it('does not turn sidebar preview admission into access to other local origins, routes or generated documents', () => {
    const { listeners, mainFrame } = secureWindowFixture()
    for (const url of [
      'http://127.0.0.1:4311/sidebar/html/session-1/report.html',
      'http://127.0.0.1:4310/settings',
      'http://127.0.0.1:4310/sidebar/file?path=/private.txt',
      'blob:http://127.0.0.1:4310/5d37d35a-1366-4bce-a177-50b6fb5f3cab',
      'blob:http://127.0.0.1:4311/5d37d35a-1366-4bce-a177-50b6fb5f3cab',
      'blob:https://example.com/5d37d35a-1366-4bce-a177-50b6fb5f3cab',
      'data:text/html,private',
      'file:///private.txt'
    ]) {
      const blocked = vi.fn()
      listeners.get('will-frame-navigate')!({ url, isMainFrame: false, frame: { url: 'about:blank', parent: mainFrame }, initiator: mainFrame, preventDefault: blocked })
      expect(blocked, url).toHaveBeenCalledOnce()
    }
    const srcdoc = vi.fn()
    listeners.get('will-frame-navigate')!({ url: 'http://127.0.0.1:4310/sidebar/html/session-1/report.html', isMainFrame: false, frame: { url: 'about:srcdoc', parent: mainFrame }, initiator: mainFrame, preventDefault: srcdoc })
    expect(srcdoc).toHaveBeenCalledOnce()
  })

  it('blocks offline srcdoc navigation even to a URL authorized by another research link', () => {
    const allows = vi.fn(() => true)
    const { listeners } = secureWindowFixture(allows)
    for (const url of ['https://approved.example/?private=document', 'sherlock-preview://token/private.html']) for (const sourceUrl of ['about:srcdoc', 'about:srcdoc#section']) {
      const preventDefault = vi.fn()
      listeners.get('will-frame-navigate')?.({ url, isMainFrame: false, frame: { url: sourceUrl }, preventDefault })
      expect(preventDefault).toHaveBeenCalledOnce()
    }
    expect(allows).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })
  it('keeps the application preload and Node integration out of HTML child frames', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('nodeIntegrationInSubFrames: false')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('sandbox: true')
  })

  it('blocks child-frame HTTP navigation without spawning the system browser', () => {
    const { listeners } = secureWindowFixture()
    const willFrameNavigate = listeners.get('will-frame-navigate')
    for (const url of [
      'https://example.com/report',
      'https://example.com/second',
      'http://example.com/third'
    ]) {
      const preventDefault = vi.fn()
      willFrameNavigate?.({ url, isMainFrame: false, preventDefault })
      expect(preventDefault, url).toHaveBeenCalledOnce()
    }

    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('allows only research child-frame URLs approved by the active registry', () => {
    const allowsResearchFrameUrl = vi.fn((url: string) =>
      new URL(url).origin === 'https://approved.example'
    )
    const { listeners } = secureWindowFixture(allowsResearchFrameUrl)
    const willFrameNavigate = listeners.get('will-frame-navigate')
    const allowed = vi.fn()
    const blocked = vi.fn()

    willFrameNavigate?.({
      url: 'https://approved.example/dashboard',
      isMainFrame: false,
      preventDefault: allowed
    })
    willFrameNavigate?.({
      url: 'https://blocked.example/dashboard',
      isMainFrame: false,
      preventDefault: blocked
    })

    expect(allowsResearchFrameUrl).toHaveBeenCalledTimes(2)
    expect(allowed).not.toHaveBeenCalled()
    expect(blocked).toHaveBeenCalledOnce()
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('cancels child-frame navigation outside the preview protocol', () => {
    const { listeners } = secureWindowFixture()
    const willFrameNavigate = listeners.get('will-frame-navigate')
    expect(willFrameNavigate).toBeTypeOf('function')

    for (const url of [
      'file:///Users/example/private.txt',
      'http://example.com/',
      'http://127.0.0.1:4310/settings',
      'dsh-recovery://plugin-error/'
    ]) {
      const preventDefault = vi.fn()
      willFrameNavigate?.({ url, isMainFrame: false, preventDefault })
      expect(preventDefault, url).toHaveBeenCalledOnce()
    }

    const allowPreview = vi.fn()
    willFrameNavigate?.({
      url: 'sherlock-preview://opaque-token/index.html',
      isMainFrame: false,
      preventDefault: allowPreview
    })
    expect(allowPreview).not.toHaveBeenCalled()
  })

  it('cancels child-initiated navigation of the main frame', () => {
    const { listeners } = secureWindowFixture()
    const willFrameNavigate = listeners.get('will-frame-navigate')
    const childFrame = { processId: 7, routingId: 42 }

    for (const url of [
      'file:///Applications/Sherlock.app/Contents/Resources/plugin-recovery.html',
      'http://127.0.0.1:4310/research',
      'dsh-recovery://show-log/'
    ]) {
      const preventDefault = vi.fn()
      willFrameNavigate?.({
        url,
        isMainFrame: true,
        initiator: childFrame,
        preventDefault
      })
      expect(preventDefault, url).toHaveBeenCalledOnce()
    }
  })

  it('allows trusted main-frame navigation initiated by its routed main frame', () => {
    const { listeners, mainFrame } = secureWindowFixture()
    const willFrameNavigate = listeners.get('will-frame-navigate')
    const preventDefault = vi.fn()

    willFrameNavigate?.({
      url: 'http://127.0.0.1:4310/research',
      isMainFrame: true,
      initiator: { ...mainFrame },
      preventDefault
    })

    expect(preventDefault).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'null', initiator: null },
    { label: 'undefined', initiator: undefined }
  ])('fails closed for a $label initiator targeting the main frame', ({ initiator }) => {
    const { listeners } = secureWindowFixture()
    const willFrameNavigate = listeners.get('will-frame-navigate')
    const preventDefault = vi.fn()

    willFrameNavigate?.({
      url: 'http://127.0.0.1:4310/research',
      isMainFrame: true,
      initiator,
      preventDefault
    })

    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('leaves trusted main-frame navigation on the existing policy', () => {
    const { listeners } = secureWindowFixture()
    const willNavigate = listeners.get('will-navigate')
    const preventDefault = vi.fn()

    willNavigate?.({ preventDefault }, 'http://127.0.0.1:4310/research')

    expect(preventDefault).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })
})
