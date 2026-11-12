export function loadPdfLibrary() {
  const here = new URL(import.meta.url)
  // The desktop package ships one PDF.js copy in the offline plugin profile.
  // A packaged runtime must resolve it without the checkout's node_modules.
  if (/\/(?:Resources|resources)\/app\/node_modules\/dsh-research-task-runtime\/pdf-library\.js$/u.test(here.pathname)) {
    const library = new URL('../../../sherlock-plugin-profile/modules/pdfjs-dist/legacy/build/pdf.mjs', here)
    return import(library.href)
  }
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}
