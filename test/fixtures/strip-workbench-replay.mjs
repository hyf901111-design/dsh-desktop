import {createRequire} from 'node:module'

// Keep strict inverses byte-identical to the production Node installer. The
// workbench portal wraps the older guide and must be removed before refreshing
// that guide, presentation hooks, or the grid they depend on.
const require=createRequire(import.meta.url)
const {stripHomeGuideWorkbenchNative}=require('../../scripts/lib/home-guide-workbench-native.mjs')
const {stripHomeWorkbenchClient}=require('../../scripts/lib/home-workbench-client.mjs')
export const stripWorkbenchReplay=source=>stripHomeWorkbenchClient(stripHomeGuideWorkbenchNative(source))
