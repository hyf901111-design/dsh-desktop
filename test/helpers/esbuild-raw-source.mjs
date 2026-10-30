import {readFile} from 'node:fs/promises'
import {build as buildStyles} from 'esbuild'
/** Match Vite's production text imports in standalone browser fixtures. */
export function esbuildRawSource(){return{name:'actual-raw-source',setup(build){
 build.onResolve({filter:/^\/(?:fonts\/|figma-self-avatar\.png$)/},args=>({path:args.path,external:true}))
 build.onResolve({filter:/\.(?:(?:js|svg)\?raw|css\?inline)$/},async args=>{const file=await build.resolve(args.path.replace(/\?(?:raw|inline)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:file.path,namespace:'raw-source'}})
 build.onLoad({filter:/.*/,namespace:'raw-source'},async args=>{
  const contents=await readFile(args.path,'utf8')
  // Vite's inline CSS is processed CSS, not a raw stylesheet with unresolved
  // @imports. Preserve that distinction for mount.tsx and its font assets.
  if(args.path.endsWith('.css')&&contents.includes('@import')){
   const compiled=await buildStyles({entryPoints:[args.path],conditions:['browser','import','style'],bundle:true,write:false,outfile:'notes.css',logLevel:'silent',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
   return{contents:compiled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}
  }
  return{contents,loader:'text'}
 })
}}}
