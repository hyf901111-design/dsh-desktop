import {pptxAnnotationAssets} from './pptx-annotation-assets.mjs'
// Figma inline variants 253:23/30/39/46/53/62. Renderer-only UTF-16 projection.
const referenceCellFont = "AAEAAAAKAIAAAwAgT1MvMiUAlZAAAAEoAAAAYGNtYXAZCiRlAAABlAAAMjxnbHlmAAAAAAAAM9gAAAABaGVhZCyoIVgAAACsAAAANmhoZWEDIkccAAAA5AAAACRobXR4h/AAAAAAAYgAAAAMbG9jYQAAAAAAADPQAAAACG1heHAABAACAAABCAAAACBuYW1lrSyrKgAAM9wAAAE1cG9zdK0ina0AADUUAAAAOwABAAAAAQAABWbKmF8PPPUAAwPoAAAAAObI8DwAAAAA5sjwPAAAAAAAAAAAAAAAAwACAAAAAAAAAAEAAAMg/zgAAEfgAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAADAAEAAAADAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAA0P4AZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAACAAAAAAPz8/PwAA4AD//AMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAAAAAAAQBAAAEfgAAAAAAACAAAAAwAAABQAAwABAAAAFAAEMigAAAAGAAQAAQAC+P///P//AADgAP/8//8AAAAFAAEABgAAAAAAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAAAAAAAAAAAAAAAAAAAoAfgABAAAAAAABABMAAAABAAAAAAACAAcAEwABAAAAAAADABIAGgABAAAAAAAEABMAAAABAAAAAAAGABEALAADAAEECQABACYAPQADAAEECQACAA4AYwADAAEECQADACQAcQADAAEECQAEACYAPQADAAEECQAGACIAlU9keXNzZXkgSW5saW5lIENlbGxSZWd1bGFyT2R5c3NleUlubGluZUNlbGwxT2R5c3NleUlubGluZUNlbGwATwBkAHkAcwBzAGUAeQAgAEkAbgBsAGkAbgBlACAAQwBlAGwAbABSAGUAZwB1AGwAYQByAE8AZAB5AHMAcwBlAHkASQBuAGwAaQBuAGUAQwBlAGwAbAAxAE8AZAB5AHMAcwBlAHkASQBuAGwAaQBuAGUAQwBlAGwAbAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAECAQMJcmVmZXJlbmNlCHNlbGVjdGVkAA==";
// A renderer-only, one-code-unit projection. Canonical drafts remain U+FFFC.
export function referenceMarkerForDraft(draft) {
  for (let code = 0xe000; code <= 0xf8ff; code++) {
    const marker = String.fromCharCode(code)
    if (!draft.includes(marker)) return marker
  }
  return null
}

export function projectReferenceDraft(draft, occurrences, selectedId, ready = true, skillCells = []) {
  const marker = referenceMarkerForDraft(draft)
  const selected = occurrences.find(item => item.occurrenceId === selectedId && draft[item.offset] === '\uFFFC')
  const offset = ready && marker !== null && selected ? selected.offset : -1
  const cells = ready ? skillCells.filter(cell => draft[cell.offset] === '\uFFFC').map(cell => ({...cell, selected: cell.offset === offset})) : []
  if (offset >= 0 && !cells.some(cell => cell.offset === offset)) cells.push({offset, marker, selected: true})
  let text = draft
  for (const cell of cells) text = text.slice(0, cell.offset) + cell.marker + text.slice(cell.offset + 1)
  return {canonical: draft, marker, offset, cells, text}
}

export function retainedReferenceCells(next, projection, beforeInput) {
  const {text: before, marker, offset} = projection
  const cells = projection.cells ?? (offset >= 0 && marker !== null ? [{offset, marker, selected: true}] : [])
  if (!cells.length) return []
  let prefix = 0, suffix = 0
  // Native beforeinput disambiguates insertion of the same literal private-use
  // character immediately beside the projected marker.
  if (beforeInput?.value === before && beforeInput.inputType?.startsWith('insert')) {
    const {start, end} = beforeInput
    const inserted = next.length - before.length + end - start
    if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start &&
        end <= before.length && inserted >= 0 &&
        next.slice(0, start) === before.slice(0, start) &&
        next.slice(start + inserted) === before.slice(end)) {
      prefix = start
      suffix = before.length - end
    } else beforeInput = undefined
  } else beforeInput = undefined
  if (!beforeInput) {
    while (prefix < before.length && prefix < next.length && before[prefix] === next[prefix]) prefix++
    while (suffix < before.length - prefix && suffix < next.length - prefix &&
           before[before.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++
  }
  return cells.flatMap(cell => {
    const at = cell.offset < prefix ? cell.offset
      : cell.offset >= before.length - suffix ? next.length - (before.length - cell.offset) : -1
    return at >= 0 && next[at] === cell.marker ? [{...cell, offset: at}] : []
  })
}

export function unprojectReferenceEdit(next, projection, beforeInput) {
  for (const cell of retainedReferenceCells(next, projection, beforeInput)) next = next.slice(0, cell.offset) + '\uFFFC' + next.slice(cell.offset + 1)
  return next
}

// The existing font maps PUA cells to its third, empty glyph. Change only that
// glyph's advance; file/reference and selected-file metrics remain untouched.
export function skillReferenceCellFont(fontData, width) {
  const bytes = Uint8Array.from(atob(fontData), char => char.charCodeAt(0))
  const view = new DataView(bytes.buffer), tables = new Map()
  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + index * 16
    tables.set(String.fromCharCode(...bytes.slice(record, record + 4)), {record, offset: view.getUint32(record + 8), length: view.getUint32(record + 12)})
  }
  const hmtx = tables.get('hmtx'), head = tables.get('head')
  const units = view.getUint16(head.offset + 18)
  view.setUint16(hmtx.offset + 8, Math.min(65535, Math.round(width * units / 10)))
  const checksum = (offset, length) => {
    let sum = 0
    for (let at = offset; at < offset + length; at += 4) {
      let word = 0
      for (let byte = 0; byte < 4; byte++) word = (word * 256 + (bytes[at + byte] ?? 0)) >>> 0
      sum = (sum + word) >>> 0
    }
    return sum
  }
  view.setUint32(hmtx.record + 4, checksum(hmtx.offset, hmtx.length))
  view.setUint32(head.offset + 8, 0)
  view.setUint32(head.offset + 8, (0xb1b0afba - checksum(0, bytes.length)) >>> 0)
  return btoa(String.fromCharCode(...bytes))
}

// This hook only projects a native input's view. Business reducers receive the
// canonical U+FFFC draft, with exactly the original UTF-16 offsets.
export function useReferenceProjection(react, inputRef, draft, occurrences, selectedId, fontData) {
  const [font, setFont] = react.useState(null)
  const [, refresh] = react.useState(0)
  const composing = react.useRef(false)
  const composition = react.useRef(null)
  const beforeInput = react.useRef(null)
  const committed = react.useRef(null)
  const pendingSelection = react.useRef(null)
  const marker = composition.current?.marker ?? referenceMarkerForDraft(draft)
  const skillKey = JSON.stringify([...new Map(occurrences.filter(item => (item.source === 'ework-managed-skill' || item.source === 'pptx-annotation') && typeof item.label === 'string').map(item => {const value=item.source==='pptx-annotation'?{label:item.label,source:item.source,selected:item.occurrenceId===selectedId}:item.label;return[JSON.stringify(value),value]})).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const literals = [...new Set([...draft].filter(char => char >= '\uE000' && char <= '\uF8FF'))].sort().join('')
  const fontRef = react.useRef(null)
  const fontCache = react.useRef(new Map())
  // Definition reuse belongs to this input's lifetime, not an individual
  // measured-label effect. Registration still belongs to that effect below.
  react.useLayoutEffect(() => () => { fontCache.current.clear() }, [])
  react.useLayoutEffect(() => {
    const el = inputRef.current
    if (!el || typeof FontFace !== "function" || !document.fonts) return
    let stopped = false
    let generation = 0
    let pendingKey = null
    const faces = new Map()
    const loadFace = (family, source, options) => {
      const cache = fontCache.current
      const key = JSON.stringify([family, source, options.unicodeRange, options.sizeAdjust])
      const cached = cache.get(key)
      if (cached) { cache.delete(key); cache.set(key, cached); return cached }
      const loading = new FontFace(family, source, options).load()
      cache.set(key, loading)
      while (cache.size > 32) cache.delete(cache.keys().next().value)
      // A failed load must not poison retries or remove a newer replacement.
      void loading.catch(() => { if (cache.get(key) === loading) cache.delete(key) })
      return loading
    }
    async function loadFont() {
      if (stopped) return
      const style = getComputedStyle(el), size = Number.parseFloat(style.fontSize)
      const labels = JSON.parse(skillKey), skillCells = []
      if (labels.length) {
        const context = document.createElement('canvas').getContext('2d')
        if (context) {
          context.font = '400 13px "Noto Sans SC",sans-serif'
          const available = Math.max(12, Math.min(650, el.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0)))
          const used = new Set([...literals, marker])
          let code = 0xe000
          for (const entry of labels) {
            const label=typeof entry==='string'?entry:entry.label,ppt=typeof entry==='object'&&entry.source==='pptx-annotation'
            while (code <= 0xf8ff && used.has(String.fromCharCode(code))) code++
            if (code > 0xf8ff) break
            const cell = String.fromCharCode(code++)
            used.add(cell)
            skillCells.push({label,...(ppt?{source:entry.source,selected:entry.selected}:{}),marker:cell,width:Math.min(available,Math.ceil(context.measureText(label).width+(ppt?35+(entry.selected?19:0):12)))})
          }
        }
      }
      const key = size + ':' + (marker ?? '') + ':' + JSON.stringify(skillCells)
      // A different pending width can still replace the committed font. Only
      // reuse that committed key when no other batch is in flight.
      if (pendingKey === key || (pendingKey === null && fontRef.current?.key === key)) return
      if (fontRef.current !== null) setFont(null)
      const current = ++generation
      pendingKey = key
      const family = 'SherlockReferenceCell' + size + (marker?.charCodeAt(0) ?? 0)
      const face = loadFace(family, 'url(data:font/ttf;base64,' + fontData + ')', {
        unicodeRange: 'U+FFFC' + (marker ? ',U+' + marker.charCodeAt(0).toString(16) : ''),
        sizeAdjust: (1000 / size) + '%'
      })
      try {
        const skillLoads = skillCells.map(cell => {
          const name = 'SherlockSkillCell' + size + 'x' + cell.marker.charCodeAt(0) + 'w' + cell.width
          return loadFace(name, 'url(data:font/ttf;base64,' + skillReferenceCellFont(fontData, cell.width) + ')', {unicodeRange: 'U+' + cell.marker.charCodeAt(0).toString(16), sizeAdjust: (1000 / size) + '%'})
        })
        const [baseFace, ...skillFaces] = await Promise.all([face, ...skillLoads])
        if (stopped || current !== generation) return
        for (const oldFace of faces.values()) document.fonts.delete(oldFace)
        faces.clear()
        for (const loaded of [baseFace, ...skillFaces]) { document.fonts.add(loaded); faces.set(loaded.family, loaded) }
        const next = {key, size, marker, family, skillKey, literals, skillCells, families: [...skillFaces.map(face => face.family), family]}
        fontRef.current = next
        setFont(next)
      } catch {
        if (!stopped && current === generation) {
          fontRef.current = null
          setFont(null)
        }
      } finally {
        if (current === generation) pendingKey = null
      }
    }
    void loadFont()
    void document.fonts.ready?.then(loadFont)
    const resize = new ResizeObserver(loadFont)
    resize.observe(el)
    return () => { stopped = true; pendingKey = null; resize.disconnect(); fontRef.current = null; for (const face of faces.values()) document.fonts.delete(face) }
  }, [marker, fontData, skillKey, literals])
  const ready = font !== null && font.marker === marker && font.skillKey === skillKey && font.literals === literals
  const skillCells = ready ? occurrences.flatMap(item => {
    const cell = ['ework-managed-skill','pptx-annotation'].includes(item.source) && font.skillCells.find(cell => cell.label === item.label && (item.source==='pptx-annotation'?cell.source===item.source&&cell.selected===(item.occurrenceId===selectedId):!cell.source))
    return cell ? [{...cell, offset: item.offset}] : []
  }) : []
  const projection = composition.current ?? projectReferenceDraft(draft, occurrences, selectedId, ready, skillCells)
  const old = committed.current
  // Changing a controlled textarea's projected value would otherwise collapse
  // its native selection to the end. Preserve it through this one render.
  const el = inputRef.current
  const selection = el && el.value !== projection.text
    ? pendingSelection.current ?? (old && el.value === old.text ? {start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection} : null) : null
  react.useLayoutEffect(() => {
    committed.current = projection
    pendingSelection.current = null
    if (selection && inputRef.current) inputRef.current.setSelectionRange(selection.start, selection.end, selection.direction)
  })
  react.useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    const capture = event => { beforeInput.current = {value: input.value, start: input.selectionStart, end: input.selectionEnd, inputType: event.inputType} }
    input.addEventListener('beforeinput', capture)
    return () => input.removeEventListener('beforeinput', capture)
  }, [])
  function decode(next) {
    const input = inputRef.current
    if (input) pendingSelection.current = {start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection}
    const current = composition.current ?? committed.current ?? projection
    const cells = retainedReferenceCells(next, current, beforeInput.current)
    const canonical = unprojectReferenceEdit(next, current, beforeInput.current)
    beforeInput.current = null
    if (composing.current) {
      composition.current = {...current, canonical, text: next, cells, offset: cells.find(cell => cell.selected)?.offset ?? -1}
      refresh(value => value + 1)
    }
    return canonical
  }
  return {
    projection, ready, family: ready ? font.family : null, families: ready ? font.families : [],
    decode,
    startComposition() { composing.current = true; composition.current = committed.current ?? projection },
    finishComposition() { composing.current = false; composition.current = null; beforeInput.current = null; refresh(value => value + 1) }
  }
}


function replaceOne(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Figma inline reference anchor drifted: ' + before.slice(0, 100));
  return source.replace(before, after);
}
export function selectedInlineReferenceOccurrenceId(draft, occurrences, selection) {
  if (selection.end !== selection.start + 1 || draft[selection.start] !== '\uFFFC') return null
  return occurrences.find(item => item.offset === selection.start)?.occurrenceId ?? null
}

export function inlineReferenceArrowSelection(draft, occurrences, selection, key) {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const selected = selectedInlineReferenceOccurrenceId(draft, occurrences, selection)
  if (selected !== null) {
    const at = key === 'ArrowLeft' ? selection.start : selection.end
    return {start: at, end: at, direction: 'none'}
  }
  if (selection.start !== selection.end) return null
  const at = selection.start - (key === 'ArrowLeft' ? 1 : 0)
  if (draft[at] !== '\uFFFC' || !occurrences.some(item => item.offset === at)) return null
  return {start: at, end: at + 1, direction: key === 'ArrowLeft' ? 'backward' : 'forward'}
}

export function deleteInlineReferenceOccurrence(keyboard, occurrenceId) {
  const delegated=globalThis.window?.[Symbol.for('sherlock:pptx-annotation-input')]?.removeReference?.(keyboard,occurrenceId)
  if(typeof delegated==='number')return delegated
  const snapshot = keyboard.snapshot
  const occurrence = snapshot.occurrences.find(item => item.occurrenceId === occurrenceId && snapshot.draft[item.offset] === '\uFFFC')
  if (!occurrence) return null
  const start = occurrence.offset
  keyboard.setDraft(snapshot.draft.slice(0, start) + snapshot.draft.slice(start + 1), {start, end: start + 1, insertedLength: 0})
  return start
}

function legacyDeleteInlineReferenceOccurrence(keyboard, occurrenceId) {
  const snapshot = keyboard.snapshot
  const occurrence = snapshot.occurrences.find(item => item.occurrenceId === occurrenceId && snapshot.draft[item.offset] === '\uFFFC')
  if (!occurrence) return null
  const start = occurrence.offset
  keyboard.setDraft(snapshot.draft.slice(0, start) + snapshot.draft.slice(start + 1), {start, end: start + 1, insertedLength: 0})
  return start
}

function patchInlineReferenceInteractions(source) {
  const marker = '/* sherlock-inline-reference-interactions:v1 */'
  const helpers = [selectedInlineReferenceOccurrenceId, inlineReferenceArrowSelection, deleteInlineReferenceOccurrence].map(fn => fn.toString()).join('\n')
  const runtime = marker + '\n' + helpers + '\n'
  if (source.includes(marker)) {
    if (source.split(marker).length !== 2) throw Error('Inline reference interaction runtime anchor drifted')
    const installed = source.indexOf(marker)
    let cursor = installed + marker.length
    for (const fn of [selectedInlineReferenceOccurrenceId, inlineReferenceArrowSelection, deleteInlineReferenceOccurrence]) {
      if (!source.startsWith('\nfunction ' + fn.name + '(', cursor)) throw Error('Inline reference interaction runtime anchor drifted')
      const end = source.indexOf('\n}\n', cursor + 1)
      if (end < cursor) throw Error('Inline reference interaction runtime anchor drifted')
      cursor = end + 2
    }
    const previous = source.slice(installed, cursor + 1)
    // Vite inserts terminal ASI semicolons when serializing the same functions.
    // Ignore only those; changed helper statements or intervening code still fail.
    const withoutTerminalSemicolons = text => text.replace(/;(?=\n|$)/g, '')
    const legacy=runtime.replace(deleteInlineReferenceOccurrence.toString(),legacyDeleteInlineReferenceOccurrence.toString().replace('legacyDeleteInlineReferenceOccurrence','deleteInlineReferenceOccurrence'))
    if (![runtime,legacy].some(value=>withoutTerminalSemicolons(previous)===withoutTerminalSemicolons(value))) throw Error('Inline reference interaction runtime anchor drifted')
    const start = source.search(/^[\t ]*function InputBar\(\{/m), end = source.indexOf('\n\t\t//#endregion', start)
    if (installed > start && installed < end) return replaceOne(source, previous, runtime)
    // Older installs placed this block before InputBar. The creation-progress
    // pass replaces that entire region while retaining InputBar's handlers.
    source = replaceOne(source, previous, '')
  }
  const start = source.search(/^[\t ]*function InputBar\(\{/m), end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw Error('Inline reference interaction boundary drifted')
  let input = source.slice(start, end)
  const replace = (before, after) => {
    // Admit only the exact old handler or its complete installed equivalent.
    // This repairs a legacy orphan without accepting a partially changed body.
    if (!input.includes(before) && input.split(after).length === 2) return
    input = replaceOne(input, before, after)
  }
  replace('occurrence.occurrenceId === selectedResearchOccurrenceId && (occurrence.source === CHAT_FILE_REFERENCE_SOURCE || occurrence.source === RESEARCH_FILE_REFERENCE_SOURCE || occurrence.source === RESEARCH_ARTIFACT_REFERENCE_SOURCE)', 'occurrence.occurrenceId === selectedResearchOccurrenceId && draft[occurrence.offset] === "\\uFFFC"')
  replace('deleteResearchReferenceOccurrence(keyboard, occurrenceId)', 'deleteInlineReferenceOccurrence(keyboard, occurrenceId)')
  replace('const selectedOccurrenceId = selectedResearchReferenceOccurrenceId(input?.occurrences ?? [], selection);', 'const selectedOccurrenceId = selectedInlineReferenceOccurrenceId(draft, input?.occurrences ?? [], selection);')
  replace('onClick: researchReference === null ? void 0 : () => {\n\t\t\t\t\t\t\t\tconst el = inputRef.current;', 'onClick: () => {\n\t\t\t\t\t\t\t\tconst el = inputRef.current;')
  replace('if (el === null || locked || machineBusy) return;\n\t\t\t\t\t\t\t\tel.focus', 'if (el === null || locked || machineBusy || composingRef.current) return;\n\t\t\t\t\t\t\t\tel.focus')
  replace('if ((e.key === "Backspace" || e.key === "Delete") && selectedResearchOccurrenceId !== null) {', `// A painted chip selection may lag native select-all or pointer selection.
                // Read the actual one-code-unit textarea range before atomic deletion.
                const exactReferenceId = selectedInlineReferenceOccurrenceId(keyboard.snapshot.draft, keyboard.snapshot.occurrences, selectionOf(e.currentTarget));
                const plainReferenceKey = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
                if (!composing && !locked && !machineBusy && plainReferenceKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                    const selection = inlineReferenceArrowSelection(keyboard.snapshot.draft, keyboard.snapshot.occurrences, selectionOf(e.currentTarget), e.key);
                    if (selection !== null) {
                        e.preventDefault();
                        e.currentTarget.setSelectionRange(selection.start, selection.end, selection.direction);
                        setSelectedResearchOccurrenceId(selectedInlineReferenceOccurrenceId(keyboard.snapshot.draft, keyboard.snapshot.occurrences, selection));
                        setInputCaretOffset(selection.start);
                        keyboard.track(keyboard.snapshot.draft, selection.start);
                        revealSelectionFocus(e.currentTarget);
                        return;
                    }
                }
                if ((e.key === "Backspace" || e.key === "Delete") && plainReferenceKey && exactReferenceId !== null) {`)
  replace('removeFigmaReference(selectedResearchOccurrenceId, e.currentTarget);', 'removeFigmaReference(exactReferenceId, e.currentTarget);')
  // Own the helpers inside the same stable function body as their consumers.
  // Other build passes may refresh everything immediately before InputBar.
  input = replaceOne(input, 'const input = useInput((s) => s);', runtime + 'const input = useInput((s) => s);')
  return source.slice(0, start) + input + source.slice(end)
}
export function patchFigmaInlineReferences(source) {
  // The projected textarea already owns the native insertion point, including
  // references and IME. The old backdrop caret would draw a second cursor.
  const oldCaret = 'const visibleCaretOffset = !locked && !machineBusy && inputCaretOffset !== null ? Math.max(0, Math.min(inputCaretOffset, draft.length)) : null;';
  const nativeCaret = 'const visibleCaretOffset = null; /* Figma: the native textarea owns the only caret. */';
  if (source.includes(oldCaret)) source = replaceOne(source, oldCaret, nativeCaret);
  else if (!source.includes(nativeCaret)) throw Error('Figma native input caret anchor drifted');
  const skillWidthMarker = '/* sherlock-skill-reference-width:v1 */';
  const functions = [referenceMarkerForDraft, projectReferenceDraft, retainedReferenceCells, unprojectReferenceEdit, skillReferenceCellFont, useReferenceProjection];
  const familyValue = 'figmaReferences.families.map(family => JSON.stringify(family)).join(",")';
  if (source.includes('/* sherlock-figma-inline-reference-v1 */')) {
    const refresh = source.includes(skillWidthMarker) ? [useReferenceProjection] : [projectReferenceDraft, unprojectReferenceEdit, useReferenceProjection];
    for (const fn of refresh) {
      const start = source.indexOf('\nfunction ' + fn.name + '(');
      const end = source.indexOf('\n}\n', start);
      if (start < 0 || end < start) throw Error('Skill reference projection upgrade anchor drifted: ' + fn.name);
      source = source.slice(0, start + 1) + fn.toString() + source.slice(end + 2);
    }
    if (source.includes(skillWidthMarker)) return patchPptxReferenceVisuals(patchInlineReferenceInteractions(source));
    source = replaceOne(source, '\nfunction referenceMarkerForDraft(', '\n' + skillWidthMarker + '\n' + [retainedReferenceCells, skillReferenceCellFont].map(fn => fn.toString()).join('\n') + '\nfunction referenceMarkerForDraft(');
    return patchPptxReferenceVisuals(patchInlineReferenceInteractions(replaceOne(source, 'JSON.stringify(figmaReferences.family)', familyValue)));
  }
  const start = source.search(/^[\t ]*function InputBar\(\{/m), end = source.indexOf('\n\t\t//#endregion', start);
  if (start < 0 || end < 0) throw Error('Figma InputBar boundary drifted');
  let input = source.slice(start, end);
  const replace = (before, after) => { input = replaceOne(input, before, after); };
  replace('const composingRef = (0, react.useRef)(false);', 'const composingRef = (0, react.useRef)(false);\n            const figmaReferences = useReferenceProjection(react, inputRef, draft, input?.occurrences ?? [], selectedResearchOccurrenceId, referenceCellFont);');
  replace('composingRef.current = true;', 'composingRef.current = true;\n                figmaReferences.startComposition();');
  replace('composingRef.current = false;', 'composingRef.current = false;\n                    figmaReferences.finishComposition();');
  replace('const next = e.target.value;', 'const next = figmaReferences.decode(e.target.value);');
  replace('value: draft,', 'value: figmaReferences.projection.text,');
  replace('children: measurement', 'children: figmaReferences.ready ? figmaReferences.projection.text + "\\n" : measurement');
  replace('className: clsx(InputBar_module_css_default.root, variant === "hero" && InputBar_module_css_default.hero),', 'className: clsx(InputBar_module_css_default.root, variant === "hero" && InputBar_module_css_default.hero),\n                "data-figma-inline-ready": figmaReferences.ready || void 0,\n                style: figmaReferences.family ? { "--sherlock-reference-font": ' + familyValue + ' } : void 0,');
  replace('"data-decoration": "chip",', '"data-decoration": "chip",\n                            "data-inline-cell": figmaReferences.projection.text[chip.offset],\n                            "data-inline-selected": figmaReferences.projection.offset === chip.offset || void 0,');
  const deletionStart = input.indexOf('\t\t\t\t\tconst provisional = provisionalResearchReferencesRef.current.get(selectedResearchOccurrenceId);');
  const deletionEnd = input.indexOf('\n\t\t\t\t\treturn;', deletionStart);
  if (deletionStart < 0 || deletionEnd < 0) throw Error('Figma inline deletion anchor drifted');
  const deletion = input.slice(deletionStart, deletionEnd);
  const helper = 'const removeFigmaReference = (occurrenceId, el) => {\n' + deletion.replaceAll('selectedResearchOccurrenceId', 'occurrenceId').replaceAll('e.currentTarget', 'el') + '\n                el.focus({ preventScroll: true });\n            };\n            ';
  input = input.slice(0, deletionStart) + '                    removeFigmaReference(selectedResearchOccurrenceId, e.currentTarget);' + input.slice(deletionEnd);
  replace('const onKeyDown = (e) => {', helper + 'const onKeyDown = (e) => {');
  replace('children: chip.label\n\t\t\t\t\t\t\t})]', 'children: chip.label\n\t\t\t\t\t\t\t}), researchReference !== null && selectedResearchOccurrenceId === chip.occurrenceId && (0, react_jsx_runtime.jsx)("button", {\n                                type: "button", className: "sherlock-inline-reference-remove", tabIndex: -1, title: "移除引用", "aria-label": "移除引用", disabled: locked || machineBusy,\n                                onPointerDown: (event) => { event.preventDefault(); event.stopPropagation(); },\n                                onClick: (event) => { event.preventDefault(); event.stopPropagation(); const el = inputRef.current; if (el !== null && !locked && !machineBusy && !composingRef.current) removeFigmaReference(chip.occurrenceId, el); },\n                                children: (0, react_jsx_runtime.jsx)("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": true, children: (0, react_jsx_runtime.jsx)("path", { d: "M4 4L10 10M10 4L4 10", stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round" }) })\n                            })]');
  const runtime = '/* sherlock-figma-inline-reference-v1 */\n' + skillWidthMarker + '\nconst referenceCellFont = ' + JSON.stringify(referenceCellFont) + ';\n' + functions.map(fn => fn.toString()).join('\n');
  return patchPptxReferenceVisuals(patchInlineReferenceInteractions(source.slice(0, start) + runtime + '\n' + input + source.slice(end)));
}


export function renderPptxAnnotationPin(react,chip,selected,assets){
 let mark=null;try{mark=window[Symbol.for('sherlock:pptx-annotation-input')]?.referenceInfo?.(chip.ref)}catch{}
 return react.createElement('span',{className:'pptxa-reference-pin','data-pptx-annotation-tag':'','aria-hidden':true},
  react.createElement('img',{src:assets[selected?'pin18-selected':'pin18-normal'],width:18,height:18,alt:'',draggable:false}),
  react.createElement('span',{className:'pptxa-reference-number'},Number.isInteger(mark?.ordinal)&&mark.ordinal>0?String(mark.ordinal):'·'))
}
function patchPptxReferenceVisuals(source){
 const marker='/* sherlock-pptx-reference-visuals:v1 */',start=source.search(/^[\t ]*function InputBar\(\{/m),end=source.indexOf('\n\t\t//#endregion',start)
 if(start<0||end<0)throw Error('PPT reference visual boundary drifted')
 let input=source.slice(start,end)
 const assets=JSON.stringify(Object.fromEntries(['pin18-normal','pin18-selected'].map(name=>[name,pptxAnnotationAssets[name]])))
 const runtime=marker+'\n'+renderPptxAnnotationPin.toString()+'\nconst pptxReferenceAssets='+assets+';\nconst pptxReferenceCoordinator=window[Symbol.for("sherlock:pptx-annotation-input")];\n(0,react.useSyncExternalStore)(pptxReferenceCoordinator?.subscribe??(()=>()=>{}),pptxReferenceCoordinator?.getRevision??(()=>0));\n/* sherlock-pptx-reference-visuals:end */\n'
 const replacements=[
  ['const input = useInput((s) => s);',runtime+'const input = useInput((s) => s);'],
  ['children: [fileReference !== null &&','children: [chip.source === "pptx-annotation" && renderPptxAnnotationPin(react,chip,selectedResearchOccurrenceId === chip.occurrenceId,pptxReferenceAssets), fileReference !== null &&'],
  ['researchReference !== null && selectedResearchOccurrenceId === chip.occurrenceId &&','(researchReference !== null || chip.source === "pptx-annotation") && selectedResearchOccurrenceId === chip.occurrenceId &&'],
  ['revealSelectionFocus(el);\n\t\t\t\t\t\t\t},','revealSelectionFocus(el);\n                                if(chip.source === "pptx-annotation") window[Symbol.for("sherlock:pptx-annotation-input")]?.selectReference?.(chip.ref);\n\t\t\t\t\t\t\t},']
 ]
 if(input.includes(marker)){
  const endMarker='/* sherlock-pptx-reference-visuals:end */',a=input.indexOf(marker),b=input.indexOf(endMarker,a),normalize=value=>value.replace(/;(?=\n|$)/g,'')
  if(input.split(marker).length!==2||input.split(endMarker).length!==2||b<a||replacements.slice(1).some(([,after])=>input.split(after).length!==2))throw Error('PPT reference visual installation drifted')
  const previous=input.slice(a,b+endMarker.length+1)
  if(normalize(previous)!==normalize(runtime))throw Error('PPT reference visual runtime drifted')
  input=input.slice(0,a)+input.slice(a+previous.length)
  input=replaceOne(input,'const input = useInput((s) => s);',runtime+'const input = useInput((s) => s);')
  return source.slice(0,start)+input+source.slice(end)
 }
 for(const[before,after]of replacements)input=replaceOne(input,before,after)
 return source.slice(0,start)+input+source.slice(end)
}
