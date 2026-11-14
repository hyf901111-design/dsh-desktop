function exact(s,a,b){if(s.split(a).length!==2)throw Error('Markdown file link anchor mismatch');return s.replace(a,b)}
export function patchMarkdownFileLinks(source,web=false){
 const legacy='/* sherlock:markdown-file-links:v1 */'
 const marker='/* sherlock:markdown-file-links:v2 */'
 const allowed = String.raw`/^sherlock-knowledge:\/\/file\/[a-f0-9]{32}$/u`
 if(source.includes(marker))return source
 if(source.includes(legacy)){
  const old=web?'const mention=local?i.fileMentions?.resolve(n.url):void 0;':'const mention=local?context.fileMentions?.resolve(node.url):void 0;'
  const url=web?'n.url':'node.url'
  return exact(source,old,old.replace('=local?',`=local||${allowed}.test(${url})?`)).replace(legacy,marker)
 }
 if(web){
  const before='case"link":return kc(n.url,$t(n.children,{...i,inLink:!0}),r);'
  return exact(source,before,`case"link":{${marker}const children=$t(n.children,{...i,inLink:!0});const local=!/^(?:[a-z][a-z0-9+.-]*:|\\/\\/)/i.test(n.url);const mention=local||${allowed}.test(n.url)?i.fileMentions?.resolve(n.url):void 0;return mention?f.jsx("button",{type:"button",className:S1.fileMention,title:mention.title,"aria-label":mention.label,onClick:mention.open,children},r):kc(n.url,children,r);}`)
 }
 const before='case "link": return renderAnchor(node.url, renderChildren(node.children, {\n\t\t\t...context,\n\t\t\tinLink: true\n\t\t}), key);'
 return exact(source,before,`case "link": {${marker}
            const children=renderChildren(node.children,{...context,inLink:true});
            const local=!/^(?:[a-z][a-z0-9+.-]*:|\\/\\/)/i.test(node.url);
            const mention=local||${allowed}.test(node.url)?context.fileMentions?.resolve(node.url):void 0;
            return mention?jsx("button",{type:"button",className:MarkdownText_module_css_default.fileMention,title:mention.title,"aria-label":mention.label,onClick:mention.open,children},key):renderAnchor(node.url,children,key);
        }`)
}
