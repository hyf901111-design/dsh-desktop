declare module '*.svg?raw' {
  const source: string
  export default source
}

declare module '*.png?url&inline' {
  const dataUrl: string
  export default dataUrl
}
