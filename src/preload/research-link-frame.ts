type ResearchLinkFrameInvoke = (channel: string, value: unknown) => Promise<unknown>

export type ResearchLinkFrameIdentity = {
  sessionId: string
  nodeId: string
}

export type ResearchLinkFrameAuthorization = ResearchLinkFrameIdentity & {
  url: string
}

export function createResearchLinkFrameBridge(invoke: ResearchLinkFrameInvoke) {
  return Object.freeze({
    resolveEngine(value: ResearchLinkFrameAuthorization) { return invoke('research:native-web:resolve',value) as Promise<{engine:'iframe'|'native'}> },
    updateNative(value: ResearchLinkFrameAuthorization & {bounds:{x:number;y:number;width:number;height:number};active:boolean;scale:number;radius:number}) { return invoke('research:native-web:update',value) as Promise<{image:string;error:string;url:string;title:string}> },
    hideNative() { return invoke('research:native-web:hide',{}) },
    releaseNative(value: ResearchLinkFrameIdentity) { return invoke('research:native-web:release',value) },
    authorize(value: ResearchLinkFrameAuthorization) {
      return invoke('research:link-frame:authorize', value) as Promise<{
        url: string
        frameName: string
      }>
    },
    inspect(value: ResearchLinkFrameIdentity) {
      return invoke('research:link-frame:inspect', value) as Promise<{
        url: string
        title: string
        sourceText: string
        scrollWidth: number
        clientWidth: number
      } | null>
    },
    release(value: ResearchLinkFrameIdentity) {
      return invoke('research:link-frame:release', value) as Promise<{ ok: boolean }>
    },
    releaseSession(sessionId: string) {
      return invoke('research:link-frame:release-session', { sessionId }) as Promise<{
        ok: boolean
        removed: number
      }>
    }
  })
}
