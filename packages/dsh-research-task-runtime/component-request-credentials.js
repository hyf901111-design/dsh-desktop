const credentialKey=/^(?:authorization|proxy[-_]?authorization|(?:api[-_]?key|apikey|(?:access|refresh|auth|bearer|session|security)[-_]?token|token|password|passwd|(?:client[-_]?)?secret|private[-_]?key|cookie|set[-_]?cookie|x[-_]api[-_]key|(?:x[-_]amz[-_])?(?:signature|credential|security[-_]token)|sig))$/iu

// Tool arguments can contain provider JSON serialized one level down. Check
// those fields before a parent receipt or a component recipe reaches storage.
export function includesRequestCredentials(value,depth=0){
 if(depth>40)return true
 if(typeof value==='string'){
  const text=value.trim()
  if(/^(?:Bearer|Basic)\s+[A-Za-z0-9_+/=.~-]+$/iu.test(text)||text.includes('-----BEGIN PRIVATE KEY-----'))return true
  if(text.startsWith('{')||text.startsWith('[')){
   try{return includesRequestCredentials(JSON.parse(text),depth+1)}catch{return false}
  }
  if(/^https?:\/\//iu.test(text)){
   try{const url=new URL(text);return Boolean(url.username||url.password||[...url.searchParams.keys()].some(key=>credentialKey.test(key)||/^key$/iu.test(key)))}catch{}
  }
  return false
 }
 return Boolean(value&&typeof value==='object'&&Object.entries(value).some(([key,field])=>
  credentialKey.test(key)||includesRequestCredentials(field,depth+1)))
}
