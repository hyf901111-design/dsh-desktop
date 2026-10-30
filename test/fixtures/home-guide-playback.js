import {dirname,resolve} from 'node:path'
import {readFileSync} from 'node:fs'

/** Capture the real clock in browser fixtures without a production test hook. */
export function homeGuidePlaybackFixture(){
 return{name:'test-only-home-guide-playback',setup(build){
  build.onLoad({filter:/\/src\/preload\/home-guide-notes\.tsx$/},args=>({loader:'tsx',resolveDir:dirname(args.path),contents:readFileSync(args.path,'utf8').replace('const points=endpoints(),anchors=','const points=endpoints();globalThis.__testNoteSentenceStart={paragraph:paragraph.getBoundingClientRect().toJSON(),scroll:query(".en-document-scroll").scrollTop,height:query(".en-document-scroll").scrollHeight};const anchors=').replace('if(endpoints().some','globalThis.__testNoteSentenceGeometry={start:globalThis.__testNoteSentenceStart,before:points,after:endpoints(),paragraph:paragraph.getBoundingClientRect().toJSON(),scroll:query(".en-document-scroll").scrollTop,height:query(".en-document-scroll").scrollHeight,selected:document.getSelection()?.toString()};if(endpoints().some')}))
  build.onResolve({filter:/^\.\/home-guide-timeline$/},args=>args.importer.endsWith('/src/preload/home-guides.ts')?{path:resolve('src/preload/home-guide-timeline.ts'),namespace:'test-guide-playback'}:undefined)
  build.onLoad({filter:/.*/,namespace:'test-guide-playback'},args=>({loader:'ts',resolveDir:dirname(args.path),contents:`import {createHomeGuideTimeline as realTimeline} from ${JSON.stringify(args.path)};export * from ${JSON.stringify(args.path)};export function createHomeGuideTimeline(options){const timeline=realTimeline({...options,onError:error=>{window.__testHomeGuideError={message:error.message,index:timeline.snapshot().index,step:options.steps[timeline.snapshot().index]?.id};options.onError?.(error)}});window.__testHomeGuideTimeline=timeline;return timeline}`}))
 }}
}
