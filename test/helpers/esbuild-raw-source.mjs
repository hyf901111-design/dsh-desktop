import {readFile} from 'node:fs/promises'
/** Match Vite's production text imports in standalone browser fixtures. */
export function esbuildRawSource(){return{name:'actual-raw-source',setup(build){
 build.onResolve({filter:/^\/(?:fonts\/|figma-self-avatar\.png$)/},args=>({path:args.path,external:true}))
 build.onResolve({filter:/\.(?:(?:js|svg)\?raw|css\?inline)$/},async args=>{const file=await build.resolve(args.path.replace(/\?(?:raw|inline)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:file.path,namespace:'raw-source'}})
 build.onLoad({filter:/.*/,namespace:'raw-source'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))
}}}
