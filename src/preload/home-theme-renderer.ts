import { HOME_THEME_CONFIGS, type HomeShaderThemeId as OpenShaderThemeId } from './home-theme-configs'
import { createReactBitsRenderer, isReactBitsTheme, type ReactBitsThemeId } from './home-reactbits-renderer'
import { HOME_THEME_FIELD_SHADER, HOME_THEME_POST_SHADERS, HOME_THEME_VERTEX_SHADER } from './home-theme-shaders'
import { createAuraRenderer } from './home-aura-renderer'
import { createKoiRenderer } from './home-koi-renderer'

export type HomeShaderThemeId = OpenShaderThemeId | ReactBitsThemeId | 'koi-pond'

export interface HomeThemeRenderer {
  readonly backend: 'webgl2' | 'webgl'
  /** CSS dimensions. The renderer bounds Retina backing storage itself. */
  resize(width: number, height: number): void
  /** Elapsed animation seconds; false asks the caller to replace this canvas. */
  render(seconds: number, dark?: boolean): boolean
  dispose(): void
}

type Options = { dark: boolean; thumbnail?: boolean; preview?: boolean }
type UniformName = 'iResolution' | 'iTime' | 'uLightMode' | 'uDarkBackground' | 'uLightBackground' |
  'uP' | 'tScene' | 'tGlyphs' | 'uPixelRatio' | 'uStrength' | 'uScale' | 'uSeed' | 'uIntensity'
type Uniforms = Record<UniformName, WebGLUniformLocation | null>
const MAX_PIXELS = 2_400_000
const BACKGROUND_DARK = [9 / 255, 9 / 255, 9 / 255]
const BACKGROUND_LIGHT = [1, 1, 1]

/**
 * Original OpenShaders fold field and surface textures, in two passes.
 * Scheduling belongs to the homepage controller so hidden pages and static
 * cards never retain their own animation loops, observers or event listeners.
 */
export function createHomeThemeRenderer(
  canvas: HTMLCanvasElement,
  theme: HomeShaderThemeId,
  options: Options
): HomeThemeRenderer | null {
  if (isReactBitsTheme(theme)) return createReactBitsRenderer(canvas, theme, options)
  if (theme === 'boz') return createAuraRenderer(canvas, options)
  if (theme === 'koi-pond') return createKoiRenderer(canvas, options)
  const config = HOME_THEME_CONFIGS[theme]
  if (!config) return null
  let gl: WebGL2RenderingContext | null
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'default', preserveDrawingBuffer: options.thumbnail === true
    })
  } catch { return null }
  if (!gl) return null
  const context = gl
  let disposed = false, lost = false, failed = false
  const programs: WebGLProgram[] = []
  const shaders: WebGLShader[] = []
  let scene: WebGLTexture | null = null
  let glyphs: WebGLTexture | null = null
  let framebuffer: WebGLFramebuffer | null = null
  let vertices: WebGLVertexArrayObject | null = null
  let fieldWidth = 0, fieldHeight = 0, cssWidth = 1, pixelRatio = 1
  let mode = options.dark ? 0 : 1
  let previousSeconds: number | null = null

  const release = () => {
    // Deleted-but-bound programs and attachments otherwise retain their GPU
    // storage until another draw changes those bindings.
    context.useProgram(null)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    context.bindTexture(context.TEXTURE_2D, null)
    context.activeTexture(context.TEXTURE1)
    context.bindTexture(context.TEXTURE_2D, null)
    context.activeTexture(context.TEXTURE0)
    context.bindVertexArray(null)
    for (const program of programs) context.deleteProgram(program)
    for (const shader of shaders) context.deleteShader(shader)
    if (scene) context.deleteTexture(scene)
    if (glyphs) context.deleteTexture(glyphs)
    if (framebuffer) context.deleteFramebuffer(framebuffer)
    if (vertices) context.deleteVertexArray(vertices)
    programs.length = 0; shaders.length = 0
    scene = glyphs = null; framebuffer = null; vertices = null
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    canvas.removeEventListener('webglcontextlost', contextLost)
    release()
    // The caller freezes any outgoing frame before disposal. Release every
    // abandoned canvas's context slot immediately, including main backgrounds,
    // instead of relying on detached-canvas garbage collection between switches.
    if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext()
  }
  const contextLost = (event: Event) => {
    // The controller swaps in its CPU fallback rather than leaving a blank
    // canvas. Prevent default so a later fresh renderer may recover normally.
    event.preventDefault()
    lost = true
  }
  const compile = (source: string, kind: number) => {
    const shader = context.createShader(kind)
    if (!shader) throw new Error('Cannot allocate homepage theme shader')
    shaders.push(shader)
    context.shaderSource(shader, source)
    context.compileShader(shader)
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      throw new Error(context.getShaderInfoLog(shader) || 'Cannot compile homepage theme shader')
    }
    return shader
  }
  const program = (fragment: string, vertex: WebGLShader) => {
    const result = context.createProgram()
    if (!result) throw new Error('Cannot allocate homepage theme program')
    programs.push(result)
    context.attachShader(result, vertex)
    context.attachShader(result, compile(fragment, context.FRAGMENT_SHADER))
    context.linkProgram(result)
    if (!context.getProgramParameter(result, context.LINK_STATUS)) {
      throw new Error(context.getProgramInfoLog(result) || 'Cannot link homepage theme program')
    }
    return result
  }
  const uniforms = (value: WebGLProgram, names: UniformName[]): Uniforms => Object.fromEntries(
    names.map(name => [name, context.getUniformLocation(value, name)])
  ) as Uniforms

  try {
    const vertex = compile(HOME_THEME_VERTEX_SHADER, context.VERTEX_SHADER)
    const field = program(HOME_THEME_FIELD_SHADER, vertex)
    const post = program(HOME_THEME_POST_SHADERS[config.traits.rarity], vertex)
    const sharedNames: UniformName[] = ['iResolution', 'iTime', 'uLightMode', 'uDarkBackground', 'uLightBackground']
    const fieldUniforms = uniforms(field, [...sharedNames, 'uP'])
    const postUniforms = uniforms(post, [...sharedNames, 'tScene', 'tGlyphs', 'uPixelRatio', 'uStrength', 'uScale', 'uSeed', 'uIntensity'])
    scene = context.createTexture()
    framebuffer = context.createFramebuffer()
    vertices = context.createVertexArray()
    if (!scene || !framebuffer || !vertices) throw new Error('Cannot allocate homepage theme surface')
    context.bindVertexArray(vertices)
    context.activeTexture(context.TEXTURE0)
    context.bindTexture(context.TEXTURE_2D, scene)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    context.useProgram(field)
    context.uniform1fv(fieldUniforms.uP, new Float32Array(config.values))
    context.useProgram(post)
    context.uniform1i(postUniforms.tScene, 0)
    context.uniform1f(postUniforms.uStrength, config.traits.strength)
    context.uniform1f(postUniforms.uScale, config.traits.scale)
    context.uniform1f(postUniforms.uSeed, config.traits.seed)
    const maxDimension = Math.min(4096, context.getParameter(context.MAX_TEXTURE_SIZE), context.getParameter(context.MAX_RENDERBUFFER_SIZE))
    canvas.addEventListener('webglcontextlost', contextLost)

    const resize = (width: number, height: number) => {
      if (disposed || lost || failed) return
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
      cssWidth = width
      const ratio = Math.max(1, canvas.ownerDocument.defaultView?.devicePixelRatio || 1)
      const dimension = options.thumbnail ? Math.min(320, maxDimension) : maxDimension
      const scale = Math.min(ratio, 2, Math.sqrt(MAX_PIXELS / (width * height)), dimension / width, dimension / height)
      const w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale))
      pixelRatio = w / cssWidth
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const fw = Math.max(1, Math.ceil(w / 2)), fh = Math.max(1, Math.ceil(h / 2))
      if (fieldWidth === fw && fieldHeight === fh) return
      context.bindTexture(context.TEXTURE_2D, scene)
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, fw, fh, 0, context.RGBA, context.UNSIGNED_BYTE, null)
      context.bindFramebuffer(context.FRAMEBUFFER, framebuffer)
      context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, scene, 0)
      failed = context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE
      context.bindFramebuffer(context.FRAMEBUFFER, null)
      fieldWidth = fw; fieldHeight = fh
    }
    const setShared = (locations: Uniforms, width: number, height: number, time: number, light: number) => {
      context.uniform2f(locations.iResolution, width, height)
      context.uniform1f(locations.iTime, time)
      context.uniform1f(locations.uLightMode, light)
      context.uniform3fv(locations.uDarkBackground, BACKGROUND_DARK)
      context.uniform3fv(locations.uLightBackground, BACKGROUND_LIGHT)
    }
    const draw = (time: number, light: number, blend: boolean) => {
      context.disable(context.BLEND)
      context.bindFramebuffer(context.FRAMEBUFFER, framebuffer)
      context.viewport(0, 0, fieldWidth, fieldHeight)
      context.useProgram(field)
      setShared(fieldUniforms, fieldWidth, fieldHeight, time, light)
      context.drawArrays(context.TRIANGLES, 0, 3)
      context.bindFramebuffer(context.FRAMEBUFFER, null)
      context.viewport(0, 0, canvas.width, canvas.height)
      context.useProgram(post)
      context.activeTexture(context.TEXTURE0)
      context.bindTexture(context.TEXTURE_2D, scene)
      setShared(postUniforms, canvas.width, canvas.height, time, light)
      context.uniform1f(postUniforms.uPixelRatio, pixelRatio)
      context.uniform1f(postUniforms.uIntensity, options.thumbnail ? (light ? .95 : .85) : (light ? .9 : .7))
      if (blend) {
        context.enable(context.BLEND)
        context.blendColor(0, 0, 0, mode)
        context.blendFunc(context.CONSTANT_ALPHA, context.ONE_MINUS_CONSTANT_ALPHA)
      }
      context.drawArrays(context.TRIANGLES, 0, 3)
      context.disable(context.BLEND)
    }
    const render = (seconds: number, dark = options.dark) => {
      if (disposed || lost || failed || context.isContextLost()) return false
      if (!fieldWidth || !fieldHeight) resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight))
      if (failed) return false
      const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
      const still = previousSeconds !== null && elapsed === previousSeconds
      const delta = previousSeconds === null ? 0 : Math.min(.1, Math.max(0, elapsed - previousSeconds))
      previousSeconds = elapsed
      const target = dark ? 0 : 1
      // Render both endpoints while changing theme. Interpolating their ink
      // uniforms would wash out the surface texture halfway through the fade.
      mode = options.thumbnail || still ? target : mode + (target - mode) * (1 - Math.exp(-delta * 7))
      if (Math.abs(target - mode) < .002) mode = target
      try {
        context.bindVertexArray(vertices)
        const time = options.thumbnail ? 12 : elapsed * .35 + 12
        if (mode > 0 && mode < 1) { draw(time, 0, false); draw(time, 1, true) }
        else draw(time, mode, false)
        if (context.getError() !== context.NO_ERROR) { failed = true; return false }
        return true
      } catch { failed = true; return false }
    }
    return { backend: 'webgl2', resize, render, dispose }
  } catch {
    dispose()
    return null
  }
}
