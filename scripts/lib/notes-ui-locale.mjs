import {NOTE_ENGLISH,noteUiText} from '../../packages/dsh-research-task-runtime/notes-locale.js'

// Inject in each consumer's lexical scope: native header/activity are module
// siblings, while the composer adapter belongs to the plugin apply closure.
export const notesUiLocaleSource = `
const NOTE_ENGLISH=${JSON.stringify(NOTE_ENGLISH)};
${noteUiText.toString()}
function useNoteUiLocale(){const [,render]=react.useState(0);react.useEffect(()=>{if(typeof MutationObserver==='undefined')return;const observer=new MutationObserver(()=>render(n=>n+1));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});return()=>observer.disconnect()},[])}

`;
