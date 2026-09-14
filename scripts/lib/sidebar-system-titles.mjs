export function systemTabTitle(tab, english) {
  if (tab.type === 'sherlock-research-conversation') return english ? 'Chat' : '对话'
  if (tab.type === 'editor' && !tab.path) return english ? 'Files' : '文件'
  return tab.title
}
export function patchSidebarSystemTitles(source) {
  if (source.includes('/* odyssey:system-tab-titles:v1 */')) return source.replace('title: tab.title,', 'title: systemTabTitle(tab, systemEnglish),')
  const start = source.indexOf('function TabBar(props) {')
  const end = source.indexOf('\n\t\tfunction ', start + 1)
  if (start < 0 || end < 0) throw Error('System tab title scope missing')
  let block = source.slice(start, end)
  block = block.replace('function TabBar(props) {', `/* odyssey:system-tab-titles:v1 */
${systemTabTitle.toString()}
function TabBar(props) {
  const [systemEnglish, setSystemEnglish] = (0, react.useState)(() => document.documentElement.dataset.odysseyLocale === 'en');
  (0, react.useEffect)(() => {
    const update = () => setSystemEnglish(document.documentElement.dataset.odysseyLocale === 'en');
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] });
    update(); return () => observer.disconnect();
  }, []);`)
  block = block.replaceAll('children: tab.title', 'children: systemTabTitle(tab, systemEnglish)').replace('title: tab.title,', 'title: systemTabTitle(tab, systemEnglish),')
  return source.slice(0, start) + block + source.slice(end)
}
