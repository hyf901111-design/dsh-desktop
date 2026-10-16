import type { HomeThemeRenderer } from './home-theme-renderer'
import {
  ASCII_VERTEX, ASCII_FIELD, ASCII_HALO, ASCII_BLUR, ASCII_COMPOSITE,
  TERMINAL_VERTEX, TERMINAL_CELL, TERMINAL_MAIN
} from './home-reactbits-ascii-terminal-shaders'

type Options = { dark: boolean; thumbnail?: boolean }
type Program = { program: WebGLProgram; uniforms(name: string): WebGLUniformLocation | null }
type Target = { textures: WebGLTexture[]; framebuffer: WebGLFramebuffer; width: number; height: number }
type Surface = {
  gl: WebGL2RenderingContext
  program(vertex: string, fragment: string): Program
  texture(nearest?: boolean): WebGLTexture
  target(count: number, nearest?: boolean): Target
  sizeTarget(target: Target, width: number, height: number): void
}
type Passes = {
  resize(width: number, height: number, ratio: number, cssWidth: number, cssHeight: number): void
  draw(seconds: number, dark: boolean): void
}
const MAX_PIXELS = 2_400_000

/** Canvas-local resources only; the homepage controller owns scheduling. */
function createRenderer(
  canvas: HTMLCanvasElement, options: Options, setup: (surface: Surface) => Passes
): HomeThemeRenderer | null {
  let gl: WebGL2RenderingContext | null
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'default', preserveDrawingBuffer: options.thumbnail === true
    })
  } catch { return null }
  if (!gl) return null
  const context = gl
  const programs: WebGLProgram[] = [], shaders: WebGLShader[] = []
  const textures: WebGLTexture[] = [], framebuffers: WebGLFramebuffer[] = []
  let vao: WebGLVertexArrayObject | null = null
  let disposed = false, sized = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    canvas.removeEventListener('webglcontextlost', contextLost)
    // Unbind before deleting: an attached or current object otherwise keeps its
    // GPU storage alive until another draw or the canvas's eventual collection.
    context.useProgram(null)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    context.bindVertexArray(null)
    for (let unit = 0; unit < 4; unit++) {
      context.activeTexture(context.TEXTURE0 + unit)
      context.bindTexture(context.TEXTURE_2D, null)
    }
    context.activeTexture(context.TEXTURE0)
    for (const program of programs) context.deleteProgram(program)
    for (const shader of shaders) context.deleteShader(shader)
    for (const texture of textures) context.deleteTexture(texture)
    for (const framebuffer of framebuffers) context.deleteFramebuffer(framebuffer)
    if (vao) context.deleteVertexArray(vao)
    programs.length = shaders.length = textures.length = framebuffers.length = 0
    vao = null
    // A detached canvas still occupies a browser context slot. Every abandoned
    // renderer releases that slot, including initialization and drawing failures.
    if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext()
  }
  const contextLost = (event: Event) => { event.preventDefault(); dispose() }
  const compile = (source: string, kind: number) => {
    const shader = context.createShader(kind)
    if (!shader) throw new Error('Cannot allocate React Bits shader')
    shaders.push(shader)
    context.shaderSource(shader, source)
    context.compileShader(shader)
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      throw new Error(context.getShaderInfoLog(shader) || 'Cannot compile React Bits shader')
    }
    return shader
  }
  const program = (vertex: string, fragment: string): Program => {
    const value = context.createProgram()
    if (!value) throw new Error('Cannot allocate React Bits program')
    programs.push(value)
    context.attachShader(value, compile(vertex, context.VERTEX_SHADER))
    context.attachShader(value, compile(fragment, context.FRAGMENT_SHADER))
    context.linkProgram(value)
    if (!context.getProgramParameter(value, context.LINK_STATUS)) {
      throw new Error(context.getProgramInfoLog(value) || 'Cannot link React Bits program')
    }
    const locations: Record<string, WebGLUniformLocation | null> = {}
    const count = context.getProgramParameter(value, context.ACTIVE_UNIFORMS)
    for (let i = 0; i < count; i++) {
      const info = context.getActiveUniform(value, i)
      if (!info) continue
      const name = info.name.replace(/\[0\]$/, '')
      locations[name] = context.getUniformLocation(value, name)
    }
    return { program: value, uniforms: name => locations[name] ?? null }
  }
  const texture = (nearest = false) => {
    const value = context.createTexture()
    if (!value) throw new Error('Cannot allocate React Bits texture')
    textures.push(value)
    context.bindTexture(context.TEXTURE_2D, value)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, nearest ? context.NEAREST : context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, nearest ? context.NEAREST : context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    return value
  }
  const target = (count: number, nearest = false): Target => {
    const targetTextures = Array.from({ length: count }, () => texture(nearest))
    const framebuffer = context.createFramebuffer()
    if (!framebuffer) throw new Error('Cannot allocate React Bits framebuffer')
    framebuffers.push(framebuffer)
    return { textures: targetTextures, framebuffer, width: 0, height: 0 }
  }
  const sizeTarget = (value: Target, width: number, height: number) => {
    if (value.width === width && value.height === height) return
    context.bindFramebuffer(context.FRAMEBUFFER, value.framebuffer)
    value.textures.forEach((valueTexture, index) => {
      context.bindTexture(context.TEXTURE_2D, valueTexture)
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null)
      context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0 + index, context.TEXTURE_2D, valueTexture, 0)
    })
    context.drawBuffers(value.textures.map((_, index) => context.COLOR_ATTACHMENT0 + index))
    if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
      throw new Error('Incomplete React Bits framebuffer')
    }
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    value.width = width; value.height = height
  }

  try {
    vao = context.createVertexArray()
    if (!vao) throw new Error('Cannot allocate React Bits vertex array')
    const passes = setup({ gl: context, program, texture, target, sizeTarget })
    const maxDimension = Math.min(4096, context.getParameter(context.MAX_TEXTURE_SIZE), context.getParameter(context.MAX_RENDERBUFFER_SIZE))
    canvas.addEventListener('webglcontextlost', contextLost)
    const resize = (width: number, height: number) => {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
      try {
        const dpr = Math.max(1, canvas.ownerDocument.defaultView?.devicePixelRatio || 1)
        const limit = options.thumbnail ? Math.min(320, maxDimension) : maxDimension
        const ratio = Math.min(dpr, 2, Math.sqrt(MAX_PIXELS / (width * height)), limit / width, limit / height)
        const w = Math.max(1, Math.floor(width * ratio)), h = Math.max(1, Math.floor(height * ratio))
        if (canvas.width !== w) canvas.width = w
        if (canvas.height !== h) canvas.height = h
        passes.resize(w, h, w / width, width, height)
        if (context.getError() !== context.NO_ERROR) throw new Error('Cannot resize React Bits surface')
        sized = true
      } catch { dispose() }
    }
    const render = (seconds: number, dark = options.dark) => {
      if (disposed || context.isContextLost()) { dispose(); return false }
      if (!sized) resize(Math.max(1, canvas.clientWidth || canvas.width), Math.max(1, canvas.clientHeight || canvas.height))
      if (disposed) return false
      try {
        context.bindVertexArray(vao)
        context.disable(context.BLEND)
        passes.draw(options.thumbnail ? 12 : Math.max(0, Number.isFinite(seconds) ? seconds : 0), dark)
        if (context.getError() !== context.NO_ERROR) throw new Error('Cannot draw React Bits surface')
        return true
      } catch { dispose(); return false }
    }
    return { backend: 'webgl2', resize, render, dispose }
  } catch { dispose(); return null }
}

const ASCII_CHARACTERS = ' =+xX0S8#@'
const ASCII_FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const ASCII_COLORS: [number, number, number][] = [[30 / 255, 63 / 255, 216 / 255], [246 / 255, 248 / 255, 1], [165 / 255, 216 / 255, 1], [56 / 255, 189 / 255, 248 / 255]]
const toLinear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
function toLab([r, g, b]: [number, number, number]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(.4122214708 * lr + .5363325363 * lg + .0514459929 * lb)
  const m = Math.cbrt(.2119034982 * lr + .6806995451 * lg + .1073969566 * lb)
  const s = Math.cbrt(.0883024619 * lr + .2817188376 * lg + .6299787005 * lb)
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s]
}

/** Original horizon field, default palette and glyph/blur/composite passes. */
export function createGradientAsciiRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  return createRenderer(canvas, options, ({ gl, program, target, texture, sizeTarget }) => {
    const field = program(ASCII_VERTEX, ASCII_FIELD), halo = program(ASCII_VERTEX, ASCII_HALO)
    const blur = program(ASCII_VERTEX, ASCII_BLUR), composite = program(ASCII_VERTEX, ASCII_COMPOSITE)
    const fieldTarget = target(2), haloA = target(1), haloB = target(1)
    const atlasCanvas = canvas.ownerDocument.createElement('canvas')
    atlasCanvas.width = 60 * ASCII_CHARACTERS.length; atlasCanvas.height = 100
    const atlasContext = atlasCanvas.getContext('2d')
    if (!atlasContext) throw new Error('Cannot allocate React Bits glyph atlas')
    atlasContext.font = `300 78px ${ASCII_FONT}`
    atlasContext.textAlign = 'center'; atlasContext.textBaseline = 'middle'; atlasContext.fillStyle = '#fff'
    Array.from(ASCII_CHARACTERS).forEach((character, index) => atlasContext.fillText(character, index * 60 + 30, 53))
    const atlas = texture()
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    const ramp = new Float32Array(8 * 3)
    ASCII_COLORS.forEach((color, index) => ramp.set(toLab(color), index * 3))
    const trail = new Float32Array(24 * 4), clicks = new Float32Array(4 * 4)
    let width = 1, height = 1, pixelRatio = 1
    const bindGlyphs = (value: Program, seconds: number, dark: boolean) => {
      const u = value.uniforms, cellH = 18 * pixelRatio, cellW = cellH * .6
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[0]!); gl.uniform1i(u('uField'), 0)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[1]!); gl.uniform1i(u('uAux'), 1)
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(u('uAtlas'), 2)
      gl.uniform2f(u('uResolution'), width, height); gl.uniform2f(u('uCell'), cellW, cellH)
      gl.uniform2f(u('uOffset'), (width - Math.ceil(width / cellW) * cellW) / 2, (height - Math.ceil(height / cellH) * cellH) / 2)
      gl.uniform2f(u('uAtlasGrid'), ASCII_CHARACTERS.length, 1)
      gl.uniform1f(u('uCount'), ASCII_CHARACTERS.length); gl.uniform1f(u('uDensity'), .8)
      gl.uniform1f(u('uOpacity'), .85); gl.uniform1f(u('uFlicker'), .2); gl.uniform1f(u('uDepth'), 0)
      gl.uniform1f(u('uGlyphTime'), seconds); gl.uniform1f(u('uSeedValue'), 0); gl.uniform1f(u('uLight'), dark ? 0 : 1)
    }
    return {
      resize(w, h, ratio) {
        width = w; height = h; pixelRatio = ratio
        sizeTarget(fieldTarget, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)))
        sizeTarget(haloA, Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4)))
        sizeTarget(haloB, haloA.width, haloA.height)
      },
      draw(seconds, dark) {
        const frame = Math.floor(seconds * 24) % 97, fu = field.uniforms
        gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget.framebuffer)
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
        gl.viewport(0, 0, fieldTarget.width, fieldTarget.height); gl.useProgram(field.program)
        gl.uniform1f(fu('uAspect'), width / height); gl.uniform1f(fu('uTime'), seconds * .5)
        gl.uniform1i(fu('uShape'), 0); gl.uniform3fv(fu('uRamp'), ramp); gl.uniform1i(fu('uCount'), 4)
        gl.uniform1f(fu('uScale'), 1); gl.uniform1f(fu('uSoftness'), .5); gl.uniform1f(fu('uFlow'), .5)
        gl.uniform2f(fu('uSeed'), 0, 0); gl.uniform4fv(fu('uTrail'), trail); gl.uniform1f(fu('uRadius'), .1)
        gl.uniform4fv(fu('uClicks'), clicks); gl.uniform1i(fu('uClickEffect'), 0)
        gl.uniform1f(fu('uIntro'), 1); gl.uniform1f(fu('uFrame'), frame); gl.drawArrays(gl.TRIANGLES, 0, 3)

        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer); gl.drawBuffers([gl.COLOR_ATTACHMENT0])
        gl.viewport(0, 0, haloA.width, haloA.height); gl.useProgram(halo.program)
        bindGlyphs(halo, seconds, dark); gl.uniform1f(halo.uniforms('uDownscale'), width / haloA.width)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.useProgram(blur.program); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(blur.uniforms('uSource'), 0)
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloB.framebuffer); gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]!)
        gl.uniform2f(blur.uniforms('uStep'), 1 / haloA.width, 0); gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer); gl.bindTexture(gl.TEXTURE_2D, haloB.textures[0]!)
        gl.uniform2f(blur.uniforms('uStep'), 0, 1 / haloA.height); gl.drawArrays(gl.TRIANGLES, 0, 3)

        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height); gl.useProgram(composite.program)
        bindGlyphs(composite, seconds, dark)
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]!); gl.uniform1i(composite.uniforms('uHalo'), 3)
        gl.uniform1f(composite.uniforms('uGlow'), .2); gl.uniform1f(composite.uniforms('uGradient'), .9)
        gl.uniform1f(composite.uniforms('uGrain'), .08); gl.uniform1f(composite.uniforms('uFrame'), frame)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
    }
  })
}

/** Original cell persistence and CRT/phosphor shader with native light mode.
 * The webpage's demo defaults differ from the component's generic prop defaults:
 * https://github.com/DavidHDev/react-bits/blob/main/src/demo/Backgrounds/FaultyTerminalDemo.jsx
 */
export function createFaultyTerminalRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  return createRenderer(canvas, options, ({ gl, program, target, sizeTarget }) => {
    const cellsProgram = program(TERMINAL_VERTEX, TERMINAL_CELL), main = program(TERMINAL_VERTEX, TERMINAL_MAIN)
    const targets: [Target, Target] = [target(2, true), target(2, true)]
    const clicks = new Float32Array(4 * 4)
    let width = 1, height = 1, columns = 1, originX = 0, originY = 0, cellWidth = 1, cellHeight = 1
    let current: 0 | 1 = 0
    let fresh = true, previous: number | null = null
    return {
      resize(w, h, _ratio, cssWidth, cssHeight) {
        width = w; height = h; columns = Math.min(1, cssWidth / cssHeight / 1.5)
        // Preserve the source's off-screen cells for barrel curvature, flicker
        // displacement and the nine-cell glow kernel.
        const uvMin = -.1, uvMax = 1.1, margin = .26, gridX = 30 * columns
        originX = Math.floor((uvMin * 1.5 - margin) * gridX) - 2
        originY = Math.floor((uvMin * 1.5 - margin) * 15) - 2
        cellWidth = Math.max(1, Math.floor((uvMax * 1.5 + margin) * gridX) + 2 - originX + 1)
        cellHeight = Math.max(1, Math.floor((uvMax * 1.5 + margin) * 15) + 2 - originY + 1)
        for (const value of targets) sizeTarget(value, cellWidth, cellHeight)
        fresh = true; previous = null
      },
      draw(seconds, dark) {
        // Demo defaults use a random [0, 50) time offset. A fixed point in
        // that range gives repeatable first frames and stable frozen cards.
        const time = 12 + seconds * .5
        const dt = previous === null ? 1 / 60 : Math.min(.05, Math.max(0, seconds - previous))
        if (previous !== null && seconds < previous) fresh = true
        const advance = fresh || previous !== seconds
        previous = seconds
        if (advance) {
          const source = targets[current], destination = targets[current === 0 ? 1 : 0], cu = cellsProgram.uniforms
          gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
          gl.viewport(0, 0, cellWidth, cellHeight); gl.useProgram(cellsProgram.program)
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.textures[0]!)
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, source.textures[1]!)
          gl.uniform1i(cu('uPrev0'), 0); gl.uniform1i(cu('uPrev1'), 1); gl.uniform1f(cu('iTime'), time)
          gl.uniform2f(cu('uGridMul'), 2 * columns, 1); gl.uniform1f(cu('uNoiseAmp'), 1); gl.uniform1f(cu('uScale'), 1.5)
          gl.uniform2f(cu('uMouse'), .5, .5); gl.uniform1f(cu('uMouseStrength'), .5); gl.uniform1f(cu('uUseMouse'), 0)
          gl.uniform1f(cu('uPageLoadProgress'), 1); gl.uniform1f(cu('uUsePageLoadAnimation'), 1)
          gl.uniform2i(cu('uOrigin'), originX, originY)
          gl.uniform1f(cu('uDecay'), Math.exp(-dt / .78)); gl.uniform1f(cu('uFresh'), fresh ? 1 : 0)
          gl.uniform1f(cu('uHover'), 0); gl.drawArrays(gl.TRIANGLES, 0, 3)
          current = current === 0 ? 1 : 0; fresh = false
        }

        const value = targets[current], u = main.uniforms
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height); gl.useProgram(main.program)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, value.textures[0]!)
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, value.textures[1]!)
        gl.uniform1i(u('uRings0'), 0); gl.uniform1i(u('uRings1'), 1); gl.uniform1f(u('iTime'), time)
        gl.uniform3f(u('iResolution'), width, height, width / height); gl.uniform1f(u('uScale'), 1.5)
        gl.uniform2f(u('uGridMul'), 2 * columns, 1); gl.uniform1f(u('uDigitSize'), 1.2)
        gl.uniform1f(u('uScanlineIntensity'), .5); gl.uniform1f(u('uGlitchAmount'), 1); gl.uniform1f(u('uFlickerAmount'), 1)
        gl.uniform1f(u('uChromaticAberration'), 0); gl.uniform1f(u('uDither'), 0); gl.uniform1f(u('uCurvature'), .1)
        gl.uniform3f(u('uTint'), 167 / 255, 239 / 255, 158 / 255); gl.uniform1f(u('uBrightness'), .6); gl.uniform1f(u('uLightMode'), dark ? 0 : 1)
        gl.uniform2i(u('uOrigin'), originX, originY); gl.uniform2i(u('uCellCount'), cellWidth, cellHeight)
        gl.uniform1i(u('uGlyphs'), 0); gl.uniform1f(u('uGlow'), .5); gl.uniform1f(u('uScramble'), .5)
        gl.uniform1f(u('uMouseGlow'), .6); gl.uniform1f(u('uVignette'), .25); gl.uniform4fv(u('uClicks'), clicks)
        gl.uniform1i(u('uClickMode'), 0); gl.uniform1f(u('uClickSeconds'), .7); gl.uniform1f(u('uClock'), seconds)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
    }
  })
}
