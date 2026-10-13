// Freeze the expensive PPT layout during a pointer gesture. Only the compositor
// transform changes; the viewer's width observer runs once after release.
export function freezeOfficePreviewDuringResize(host, content) {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return () => {};
  const original = content.style.cssText;
  Object.assign(content.style, {
    width: width + 'px', height: height + 'px', flex: 'none',
    transformOrigin: 'top left', willChange: 'transform'
  });
  const update = () => {
    const nextWidth = host.clientWidth;
    if (nextWidth > 0) content.style.transform = 'scale(' + nextWidth / width + ')';
  };
  const Observer = host.ownerDocument.defaultView?.ResizeObserver;
  const observer = Observer ? new Observer(update) : null;
  observer?.observe(host);
  update();
  return () => { observer?.disconnect(); content.style.cssText = original; };
}

function ResearchOfficeResizeSurface({ resizing, children, ...props }) {
  const hostRef = (0, react.useRef)(null);
  const contentRef = (0, react.useRef)(null);
  (0, react.useLayoutEffect)(() => {
    if (!resizing || !hostRef.current || !contentRef.current) return;
    return freezeOfficePreviewDuringResize(hostRef.current, contentRef.current);
  }, [resizing]);
  return (0, react_jsx_runtime.jsx)('div', {
    ...props, ref: hostRef,
    children: (0, react_jsx_runtime.jsx)('div', {
      ref: contentRef, 'data-research-office-resize-content': '',
      // Office viewers are flex children. A block wrapper lets the PPT list
      // grow to its full document height instead of creating a scroll viewport.
      style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }, children
    })
  });
}

export function patchResearchOfficeResize(source) {
  if (source.includes('function ResearchOfficeResizeSurface(')) {
    const start=source.indexOf('function ResearchOfficeResizeSurface('),end=source.indexOf('function ResearchCanvasOfficePreview(',start);
    if(end<0)throw Error('Office resize surface boundary drifted');
    const block=source.slice(start,end);
    const before="style: { width: '100%', height: '100%', minHeight: 0 }, children";
    const after="style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }, children";
    if(!block.includes(before)&&!block.includes(after))throw Error('Office resize layout anchor drifted');
    return source.slice(0,start)+block.replace(before,after)+source.slice(end);
  }
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Office resize anchor missing or ambiguous: ' + before.slice(0, 80));
    source = source.replace(before, after);
  };
  replace('function ResearchCanvasOfficePreview({ node, sessionId, kind, visible, service }) {',
    freezeOfficePreviewDuringResize.toString() + '\n' + ResearchOfficeResizeSurface.toString() +
    '\nfunction ResearchCanvasOfficePreview({ node, sessionId, kind, visible, service, resizing }) {');
  replace('className: "rScV5Q_officePreview",', 'className: "rScV5Q_officePreview",\n                resizing: kind === "pptx" && resizing,');
  const start = source.indexOf('const Component = service.Component;');
  const end = source.indexOf('function ResearchCanvasFileCard(', start);
  const block = source.slice(start, end);
  const wrapped = block.replace('react_jsx_runtime.jsx)("div", {', 'react_jsx_runtime.jsx)(ResearchOfficeResizeSurface, {');
  if (wrapped === block) throw Error('Office resize preview root missing');
  source = source.slice(0, start) + wrapped + source.slice(end);
  replace('service: officePreview\n', 'service: officePreview,\n                    resizing\n');
  return source;
}
