import {execFileSync} from 'node:child_process'
import {mkdirSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {findNodeApiHeaders} from './build-research-voice.mjs'
if(process.platform==='darwin') {
 const root=join(dirname(fileURLToPath(import.meta.url)),'..');mkdirSync(join(root,'build/native'),{recursive:true})
 execFileSync('/usr/bin/xcrun',['clang++','-std=c++17','-O2','-Wall','-Wextra','-Werror','-bundle','-undefined','dynamic_lookup','-fobjc-arc','-mmacosx-version-min=12.0','-arch',process.arch==='x64'?'x86_64':'arm64','-DNAPI_VERSION=8','-I',await findNodeApiHeaders(),'-framework','AppKit','-framework','ApplicationServices',join(root,'scripts/macos/computer-stroke.mm'),'-o',join(root,'build/native/computer-stroke.node')])
 console.log('Computer stroke native module built.')
}
