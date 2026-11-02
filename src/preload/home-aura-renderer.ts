import type { HomeThemeRenderer } from './home-theme-renderer'
import source from './home-theme-assets/aura-shaders.json'
import atlas from './home-theme-assets/aura-square-atlas.json'

/** Aura Financial's public Unicorn scene, using its exported GLSL locally.
 * The native homepage owns time, visibility, thumbnails and context lifetime.
 * Only the viewport-edge beam is adapted to the conversation pane's radii.
 */
const VERTEX = `#version 300 es
out vec2 vTextureCoord; out vec3 vVertexPosition;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
vTextureCoord=p;vVertexPosition=vec3(p*2.-1.,0.);gl_Position=vec4(vVertexPosition,1.);}`
const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vTextureCoord; uniform sampler2D uTexture;
uniform vec2 uResolution; uniform vec4 uRadii;
out vec4 fragColor;
vec3 tone(vec3 c){c=clamp(c,-40.,40.);return (exp(c)-exp(-c))/(exp(c)+exp(-c));}
void main(){
 vec2 uv=vTextureCoord, size=uResolution;
 // Radii are TL, TR, BR, BL in CSS pixels. This signed distance follows
 // the actual curve: clipping a rectangular beam would leave bright wedges.
 float r=uv.y>.5?(uv.x<.5?uRadii.x:uRadii.y):(uv.x<.5?uRadii.w:uRadii.z);
 vec2 q=abs(uv*size-size*.5)-(size*.5-vec2(r));
 float sdf=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
 float d=max(0.,-sdf)/min(size.x,size.y);
 float denominator=max(.0001,smoothstep(.01,.12,d+.02));
 vec3 ink=vec3(.2705882353,.6039215686,1.);
 vec3 border=tone(.016/denominator*pow(max(0.,1.-d),3.)*ink);
 border+=tone(.064/denominator*pow(max(0.,1.-d),3.)*ink)*(1.-border);
 vec4 ring=texture(uTexture,uv);
 fragColor=vec4(ring.rgb+border*(1.-clamp(ring.a,0.,1.)),1.);
}`
// Keep the original nine-square sprite dither. Add the native paper palette
// after dithering, so switching appearance doesn't wash out the pixel texture.
const FINAL = source.glyph.replace('out vec4 fragColor;', 'uniform float uLight; uniform vec2 uCssSize; out vec4 fragColor;')
  .replace('fragColor = color;', `
 vec2 p=vTextureCoord*uCssSize;
 vec2 line=abs(mod(p,vec2(100.,200.))-.5);
 float grid=1.-smoothstep(.4,1.,min(line.x,line.y));
 vec3 darkColor=max(color.rgb,vec3(.012,.018,.022))+grid*.018;
 vec3 lightColor=vec3(.94,.97,.985)-color.rgb*vec3(.65,.48,.35)-grid*.018;
 fragColor=vec4(mix(darkColor,lightColor,uLight),1.);`)

type Options = { dark: boolean; thumbnail?: boolean }
const MAX_PIXELS = 2_400_000

export function createAuraRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  let gl: WebGL2RenderingContext | null
  try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: !!options.thumbnail }) } catch { return null }
  if (!gl) return null
  const ctx = gl, shaders: WebGLShader[] = [], programs: WebGLProgram[] = []
  const textures: WebGLTexture[] = [], targets: WebGLFramebuffer[] = []
  let disposed = false, lost = false, failed = false, width = 1, height = 1, fieldW = 0, fieldH = 0
  let radii = [0, 0, 0, 0], mode = options.dark ? 0 : 1, previous: number | null = null
  const onLost = (event: Event) => { event.preventDefault(); lost = true }
  const dispose = () => {
    if (disposed) return
    disposed = true; canvas.removeEventListener('webglcontextlost', onLost)
    ctx.useProgram(null); ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
    for (const unit of [0, 1]) { ctx.activeTexture(ctx.TEXTURE0 + unit); ctx.bindTexture(ctx.TEXTURE_2D, null) }
    for (const program of programs) ctx.deleteProgram(program)
    for (const shader of shaders) ctx.deleteShader(shader)
    for (const texture of textures) ctx.deleteTexture(texture)
    for (const target of targets) ctx.deleteFramebuffer(target)
    if (!ctx.isContextLost()) ctx.getExtension('WEBGL_lose_context')?.loseContext()
  }
  const compile = (type: number, text: string) => {
    const shader = ctx.createShader(type)
    if (!shader) throw new Error('Cannot allocate Aura shader')
    shaders.push(shader); ctx.shaderSource(shader, text); ctx.compileShader(shader)
    if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(shader) || 'Aura shader failed')
    return shader
  }
  const texture = () => {
    const value = ctx.createTexture()
    if (!value) throw new Error('Cannot allocate Aura texture')
    textures.push(value); ctx.bindTexture(ctx.TEXTURE_2D, value)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE)
    return value
  }
  try {
    const vertex = compile(ctx.VERTEX_SHADER, VERTEX)
    const stages = [source.ring, source.noise, source.diffuse, ...source.blur, COMPOSITE, FINAL].map(fragment => {
      const program = ctx.createProgram()
      if (!program) throw new Error('Cannot allocate Aura program')
      programs.push(program); ctx.attachShader(program, vertex); ctx.attachShader(program, compile(ctx.FRAGMENT_SHADER, fragment)); ctx.linkProgram(program)
      if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(program) || 'Aura program failed')
      return { program, uniforms: Object.fromEntries(['uTexture', 'uSprite', 'uCustomTexture', 'uResolution', 'uTime', 'uPos', 'uMousePos', 'uRadii', 'uLight', 'uCssSize'].map(name => [name, ctx.getUniformLocation(program, name)])) }
    })
    // Two reusable ping-pong targets, not one allocation per animation frame.
    const buffers = [0, 1].map(() => {
      const tex = texture(), fb = ctx.createFramebuffer()
      if (!fb) throw new Error('Cannot allocate Aura framebuffer')
      targets.push(fb); return { tex, fb }
    })
    const empty = texture()
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA8, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4))
    const sprite = texture(), pixels = new Uint8Array(atlas.width * atlas.height)
    let offset = 0
    for (let i = 0; i < atlas.runs.length; i += 2) { pixels.fill(atlas.runs[i + 1]!, offset, offset + atlas.runs[i]!); offset += atlas.runs[i]! }
    // PNG rows are top-down; flip them to match WebGL's texture convention.
    const flipped = new Uint8Array(pixels.length)
    for (let y = 0; y < atlas.height; y++) flipped.set(pixels.subarray(y * atlas.width, (y + 1) * atlas.width), (atlas.height - y - 1) * atlas.width)
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.R8, atlas.width, atlas.height, 0, ctx.RED, ctx.UNSIGNED_BYTE, flipped)
    const maxDimension = Math.min(4096, ctx.getParameter(ctx.MAX_TEXTURE_SIZE), ctx.getParameter(ctx.MAX_RENDERBUFFER_SIZE))
    canvas.addEventListener('webglcontextlost', onLost)
    const resize = (w: number, h: number) => {
      if (disposed || lost || failed || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
      width = w; height = h
      const style = canvas.parentElement && canvas.ownerDocument.defaultView?.getComputedStyle(canvas.parentElement)
      const parse = (value: string | undefined) => {
        const token = value?.split(' ')[0] || '0'
        return Math.min(w / 2, h / 2, Math.max(0, Number.parseFloat(token) || 0) * (token.endsWith('%') ? Math.min(w, h) / 100 : 1))
      }
      radii = options.thumbnail ? [8, 8, 8, 8] : [parse(style?.borderTopLeftRadius), parse(style?.borderTopRightRadius), parse(style?.borderBottomRightRadius), parse(style?.borderBottomLeftRadius)]
      const limit = options.thumbnail ? Math.min(320, maxDimension) : maxDimension
      const scale = Math.min(canvas.ownerDocument.defaultView?.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (w * h)), limit / w, limit / h)
      canvas.width = Math.max(1, Math.floor(w * scale)); canvas.height = Math.max(1, Math.floor(h * scale))
      // Match the reference's quarter-scale blur without spending full Retina
      // fill rate on its seven intermediate passes.
      const fw = Math.max(1, Math.ceil(canvas.width / 2)), fh = Math.max(1, Math.ceil(canvas.height / 2))
      if (fw === fieldW && fh === fieldH) return
      for (const { tex, fb } of buffers) {
        ctx.bindTexture(ctx.TEXTURE_2D, tex)
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA8, fw, fh, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null)
        ctx.bindFramebuffer(ctx.FRAMEBUFFER, fb); ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, tex, 0)
        if (ctx.checkFramebufferStatus(ctx.FRAMEBUFFER) !== ctx.FRAMEBUFFER_COMPLETE) failed = true
      }
      ctx.bindFramebuffer(ctx.FRAMEBUFFER, null); fieldW = fw; fieldH = fh
    }
    const render = (seconds: number, dark = options.dark) => {
      if (disposed || lost || failed || ctx.isContextLost()) return false
      if (!fieldW) resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight))
      if (failed) return false
      const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
      const target = dark ? 0 : 1, delta = previous === null ? 0 : Math.min(.1, Math.max(0, elapsed - previous))
      mode = options.thumbnail || previous === elapsed ? target : mode + (target - mode) * (1 - Math.exp(-delta * 7)); previous = elapsed
      if (Math.abs(mode - target) < .002) mode = target
      // Start with a visible ring. Source uTime counts frames (speed * 60/s),
      // not seconds; using seconds directly makes it appear stationary.
      const time = (options.thumbnail ? 1.5 : elapsed + 1.5) * 60
      ctx.disable(ctx.BLEND); ctx.disable(ctx.DEPTH_TEST)
      for (let i = 0; i < stages.length; i++) {
        const { program, uniforms: u } = stages[i]!, final = i === stages.length - 1
        const dest = buffers[i % 2]!, input = buffers[(i + 1) % 2]!
        ctx.bindFramebuffer(ctx.FRAMEBUFFER, final ? null : dest.fb)
        ctx.viewport(0, 0, final ? canvas.width : fieldW, final ? canvas.height : fieldH)
        ctx.useProgram(program); ctx.activeTexture(ctx.TEXTURE0); ctx.bindTexture(ctx.TEXTURE_2D, i ? input.tex : empty)
        ctx.uniform1i(u.uTexture!, 0); ctx.uniform2f(u.uResolution!, fieldW, fieldH)
        ctx.uniform2f(u.uMousePos!, .5, .5); ctx.uniform2f(u.uPos!, .5, .5)
        ctx.uniform1f(u.uTime!, time * (i === 0 ? .2 : i === 1 ? .37 : 0))
        ctx.uniform2f(u.uCssSize!, width, height); ctx.uniform1f(u.uLight!, mode)
        // The SDF runs in CSS coordinates, independent of Retina/thumbnail size.
        if (i === stages.length - 2) ctx.uniform2f(u.uResolution!, width, height)
        ctx.uniform4fv(u.uRadii!, radii)
        if (final) {
          ctx.activeTexture(ctx.TEXTURE1); ctx.bindTexture(ctx.TEXTURE_2D, sprite)
          ctx.uniform1i(u.uSprite!, 1); ctx.uniform1i(u.uCustomTexture!, 1)
        }
        ctx.drawArrays(ctx.TRIANGLES, 0, 3)
      }
      return !ctx.isContextLost()
    }
    return { backend: 'webgl2', resize, render, dispose }
  } catch (error) { console.warn('Aura wallpaper unavailable', error); dispose(); return null }
}
