declare module '*.svg?raw' {
  const source: string
  export default source
}

declare module '*.png?url&inline' {
  const dataUrl: string
  export default dataUrl
}

declare module '*.css?raw' { const content: string; export default content }
declare module '*.png?inline' { const content: string; export default content }
