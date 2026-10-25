import {dirname,resolve} from 'node:path'

/** Capture the real clock in browser fixtures without a production test hook. */
export function homeGuidePlaybackFixture(){
 return{name:'test-only-home-guide-playback',setup(build){
  build.onResolve({filter:/^\.\/home-guide-timeline$/},args=>args.importer.endsWith('/src/preload/home-guides.ts')?{path:resolve('src/preload/home-guide-timeline.ts'),namespace:'test-guide-playback'}:undefined)
  build.onLoad({filter:/.*/,namespace:'test-guide-playback'},args=>({loader:'ts',resolveDir:dirname(args.path),contents:`import {createHomeGuideTimeline as realTimeline} from ${JSON.stringify(args.path)};export * from ${JSON.stringify(args.path)};export function createHomeGuideTimeline(options){const timeline=realTimeline(options);window.__testHomeGuideTimeline=timeline;return timeline}`}))
 }}
}
