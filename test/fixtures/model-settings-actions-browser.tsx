import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
const w=window as any
let fallback:any;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback,construct:()=>({})})
const native=w.modelsDescriptor.factory((id:string)=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({},{get:()=>()=>null}):fallback)
const copy:Record<string,string>={models:'模型目录',modelsCustomized:'已自定义模型目录',modelId:'模型 ID',modelName:'显示名称',modelVision:'视觉',modelAdvanced:'容量',removeModel:'删除模型',addModel:'添加模型',fetchModels:'获取可用模型',contextWindow:'上下文窗口',maxTokens:'最大输出 token'}
function App(){
 const [models,setModels]=React.useState([{id:'ark-code-latest',name:'Ark Code Latest (Auto)',input:['text','image']},{id:'deepseek-v4.1-flash-261017',name:'DeepSeek V4.1 Flash 1017',input:['text','image']}])
 w.modelSettingsSnapshot=()=>models
 return React.createElement('div',{className:'VOzbGW_overlay'},React.createElement('section',{className:'zGbnIq_section'},React.createElement(native.ModelListEditor,{models,onChange:setModels,probe:{provider:'custom'},api:{llm:{discoverModels:async()=>undefined}},t:(key:string)=>copy[key]??key,disabled:false,overridden:true})))
}
createRoot(document.getElementById('app')!).render(React.createElement(App))
