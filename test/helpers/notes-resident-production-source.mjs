import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'

/** Recreate the resident Notes renderer through native production serializers.
 * Tests never write the installed client, and Function.toString never sees SSR.
 */
export function notesResidentProductionSource({activity=false,conversation=false}={}){
 const current=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const rebuild=`import{readFileSync}from'node:fs';import{createRequire}from'node:module';const require=createRequire(import.meta.url);let source=readFileSync(0,'utf8');
 source=require('./test/fixtures/strip-conversation-transient-ui.mjs').stripConversationGridOverlays(source);
 source=require('./scripts/lib/home-guide-presentation-native.mjs').stripHomeGuidePresentationNative(source);
 const grid=require('./scripts/lib/research-grid-workbench.mjs'),data=require('./scripts/lib/component-data-refresh.mjs'),financial=require('./scripts/lib/financial-widget-client.mjs');source=grid.patchResearchGridWorkbench(financial.patchFinancialWidgetClient(data.patchComponentDataRefresh(grid.restoreResearchGridWorkbench(require('./scripts/lib/home-guide-native.mjs').stripHomeGuideNative(source)))));source=require('./scripts/lib/${activity?'notes-activity':'notes-components'}.mjs').${activity?'patchNotesActivity':'patchNotesComponents'}(source);${conversation?"source=require('./scripts/lib/conversation-components.mjs').patchConversationComponents(source);":''}process.stdout.write(source);`
 return execFileSync(process.execPath,['--input-type=module','-e',rebuild],{input:current,encoding:'utf8',maxBuffer:64*1024*1024})
}
