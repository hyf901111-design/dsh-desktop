import {createRequire} from 'node:module'
// Exercise the actual serialized owner functions with their production globals.
export function createNativePreviewOwnerHarness(){
 const native=createRequire(import.meta.url)('../../scripts/lib/home-guide-native.mjs')
 const names=['homeGuideNativePreviewOwner','subscribeHomeGuideNativePreviewOwner','createHomeGuideNativeOwnedResource']
 const functions=names.map(name=>{if(typeof native[name]!=='function')throw Error('Native preview owner helper missing: '+name);return native[name].toString()}).join('\n')
 return new Function('console','let homeGuideNativeSharedResource=null;const homeGuideNativePreviewOwnerListeners=new WeakMap();\n'+functions+`\nreturn {adapter:{get:homeGuideNativePreviewOwner,subscribe:subscribeHomeGuideNativePreviewOwner},create(id,workspace){homeGuideNativeSharedResource=createHomeGuideNativeOwnedResource({id,workspace,owner:null});return homeGuideNativeSharedResource},current:()=>homeGuideNativeSharedResource};`)(console)
}
