import {createHash} from 'node:crypto'
const MAX_PDF=32*1024*1024,MAX_JSON=Math.ceil(MAX_PDF/3)*4+65536
export async function requestResearchPdf(html,environment=process.env){
 return (await requestResearchPdfResult(html,environment)).pdf
}
export async function requestResearchPdfResult(html,environment=process.env){
 const endpoint=environment.SHERLOCK_RESEARCH_CONTEXT_URL,token=environment.SHERLOCK_RESEARCH_CONTEXT_TOKEN
 if(!endpoint||!token)throw Error('PDF_RUNTIME_UNAVAILABLE:请在EWork客户端调用 research_report 专用入口；Bash按设计不携带PDF服务凭据。开发检查且明确只需HTML时可使用 --format html')
 const url=new URL(endpoint)
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||!['','/'].includes(url.pathname)||url.search||url.hash)throw Error('PDF_RUNTIME_INVALID:PDF服务必须是客户端提供的本机端点')
 const response=await fetch(new URL('/research-pdf',url),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({html}),signal:AbortSignal.timeout(55000),redirect:'error'})
 if(!response.ok)throw Error('PDF_RENDER_FAILED:客户端PDF导出未完成（HTTP '+response.status+'）')
 if(Number(response.headers.get('content-length'))>MAX_JSON)throw Error('PDF_RESPONSE_INVALID:PDF响应过大')
 let size=0;const chunks=[]
 for await(const chunk of response.body){size+=chunk.length;if(size>MAX_JSON){await response.body.cancel().catch(()=>{});throw Error('PDF_RESPONSE_INVALID:PDF响应过大')}chunks.push(chunk)}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'))
 if(typeof result.pdfBase64!=='string'||result.pdfBase64.length>MAX_JSON||!Number.isSafeInteger(result.bytes)||result.bytes<8||result.bytes>MAX_PDF||!/^[a-f0-9]{64}$/.test(result.sha256??''))throw Error('PDF_RESPONSE_INVALID:PDF响应字段无效')
 const bytes=Buffer.from(result.pdfBase64,'base64')
 if(bytes.length!==result.bytes||bytes.toString('base64')!==result.pdfBase64||bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==result.sha256)throw Error('PDF_RESPONSE_INVALID:PDF二进制、长度或摘要不匹配')
 return {pdf:bytes,pagination:result.pagination}
}

// The HTML is our controlled renderer output. Fill only its exact numeric slots;
// caller markup or arbitrary replacement text never comes back from the host.
export function fillPrintedNavigation(html,pagination){
 const expression=/<span class="toc-page" data-publication-page="([a-zA-Z0-9.-]+)">(—|[1-9]\d{0,2})<\/span>/g
 const slots=[...html.matchAll(expression)],targets=slots.map(m=>m[1])
 const validTarget=x=>/^(?:research-theses|financial-statements|fact-evidence|calculation-evidence|source-ledger|limitations|section-[a-z][a-z0-9-]*|(?:chart|table)-[1-9]\d{0,3})$/.test(x)
 if(!pagination||!Number.isSafeInteger(pagination.pageCount)||pagination.pageCount<1||pagination.pageCount>999||!pagination.pages||typeof pagination.pages!=='object'||Array.isArray(pagination.pages)||!slots.length||slots.length>512||new Set(targets).size!==slots.length||targets.some(x=>!validTarget(x))||(html.match(/data-publication-page=/g)??[]).length!==slots.length||Object.keys(pagination.pages).length!==slots.length||targets.some(x=>!Number.isSafeInteger(pagination.pages[x])||pagination.pages[x]<1||pagination.pages[x]>pagination.pageCount))throw Error('PDF_PAGINATION_INVALID:真实PDF目录目的页不完整或超出范围')
 return html.replace(expression,(_all,target)=>`<span class="toc-page" data-publication-page="${target}">${pagination.pages[target]}</span>`)
}
