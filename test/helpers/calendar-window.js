import {Window} from 'happy-dom';
// Deterministic state transport; production opaque-frame transport is separately exercised.
export function calendarWindow(html,{saved,readOnly=false}={}){const w=new Window({settings:{enableJavaScriptEvaluation:true}});w.document.write(html);w.TextEncoder=TextEncoder;let state=saved,config;
 w.sherlockShared={register(options){config=options;state=state??config.initialState;config.render(state,{connected:true,readOnly});return {dispatch(action){if(readOnly)return false;state=config.reduce(state,action);config.render(state,{connected:true,readOnly});return true;}}}};
 w.eval(w.document.querySelector('script:not([type])').textContent);return {window:w,document:w.document,state:()=>structuredClone(state)};
}
