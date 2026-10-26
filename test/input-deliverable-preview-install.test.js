import {execFileSync} from 'node:child_process'
import {expect,it} from 'vitest'

it('upgrades the frozen actual v1/v2 installers and all three exact orphans, then roundtrips and reinstalls the actual resident module twice under production Node',()=>{
 const script=`
 import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
 import{patchComposerDeliverablePreview as patch,stripComposerDeliverablePreview as strip}from'./scripts/lib/figma-composer-deliverable-preview.mjs';
 import{patchComposerDeliverablePreview as legacy}from'./test/fixtures/input-deliverable-preview-v1.mjs';
 import{patchComposerDeliverablePreview as legacy2}from'./test/fixtures/input-deliverable-preview-v2.mjs';
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=strip(source),old=legacy(base),fresh=patch(base),upgraded=patch(old),twice=patch(upgraded),orphan=old.replace(/\\/\\* sherlock:composer-deliverable-preview:v1:start \\*\\/[\\s\\S]*?\\/\\* sherlock:composer-deliverable-preview:v1:end \\*\\/\\n/,''),assets=JSON.parse(fresh.match(/const composerDeliverableAssets = (.*);\\n/)[1]),hash=value=>createHash('sha256').update(value).digest('hex');
 new Function(upgraded);
 const versions=[old,legacy2(base),fresh].map((installed,index)=>{const version=index+1,begin='/* sherlock:composer-deliverable-preview:v'+version+':start */',end='/* sherlock:composer-deliverable-preview:v'+version+':end */',a=installed.indexOf(begin),b=installed.indexOf(end)+end.length+1,orphan=installed.slice(0,a)+installed.slice(b);return{version,upgrade:patch(installed)===fresh,strip:strip(installed)===base,orphan:patch(orphan)===fresh}});
 for(const[key,file]of [['closeDefault','skill-cover-close.svg'],['closeHover','skill-cover-close-hover.svg']])if(assets[key]!=='data:image/svg+xml;base64,'+readFileSync('src/preload/input-deliverable-assets/'+file).toString('base64'))throw Error('asset drift');
 const failures=[fresh.replace('remove: deleteInlineReferenceOccurrence','remove: foreignDelete'),fresh.replace('input:v3','input:v99'),fresh+fresh,fresh.replace('v3:end','v99:end')].map(value=>{try{patch(value);return false}catch{return true}});
 process.stdout.write(JSON.stringify({versions,upgraded:upgraded===fresh,resident:patch(source)===fresh,orphan:patch(orphan)===fresh,roundtrip:strip(twice)===base,reinstall:twice===upgraded,failures,assets:Object.keys(assets),sourceSHA:hash(source),installedSHA:hash(fresh)}));
 `
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:1024*1024}))
 expect(result).toMatchObject({versions:[1,2,3].map(version=>({version,upgrade:true,strip:true,orphan:true})),upgraded:true,resident:true,orphan:true,roundtrip:true,reinstall:true,failures:[true,true,true,true],assets:['template','logo','closeDefault','closeHover']})
})
