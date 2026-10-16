import type { HomeThemeRenderer } from './home-theme-renderer'

/**
 * React Bits Dither / LiquidChrome, from the reviewed six-theme source handoff.
 * The original GLSL is kept intact. Scheduling, visibility and reduced motion
 * belong to the homepage controller; these renderers own only their GL surface.
 */
type Options = { dark: boolean; thumbnail?: boolean }
const MAX_PIXELS = 2_400_000
const MAX_TRAIL = 16
const MAX_RIPPLES = 4
const MAX_PALETTE = 8
const RIPPLE_SECONDS = 1.6

const DITHER_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const DITHER_WAVE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uCell;
uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;
uniform float uScale;
uniform float uContrast;
uniform float uBrightness;
uniform int uEffect;
uniform float uRadius;
uniform float uStrength;
uniform vec3 uTrail[${MAX_TRAIL}];
uniform int uTrailCount;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform int uRippleCount;
uniform float uIntro;
uniform float uReach;
out vec4 outColor;

vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fadeXY = fade(Pf.xy);
  vec2 nx = mix(vec2(n00, n01), vec2(n10, n11), fadeXY.x);
  return 2.3 * mix(nx.x, nx.y, fadeXY.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= uWaveFrequency;
    amp *= uWaveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - uTime * uWaveSpeed;
  return fbm(p + fbm(p2));
}

void main() {
  vec2 corner = (gl_FragCoord.xy - 0.5) * uCell;
  vec2 uv = corner / uResolution - 0.5;
  uv.x *= uResolution.x / uResolution.y;

  float touch = 0.0;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uTrailCount) break;
    vec3 point = uTrail[i];
    float reach = uRadius * mix(0.55, 1.0, point.z);
    touch = max(touch, point.z * (1.0 - smoothstep(0.0, reach, length(uv - point.xy))));
  }

  vec2 warp = vec2(0.0);
  float ring = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= uRippleCount) break;
    vec4 ripple = uRipples[i];
    vec2 delta = uv - ripple.xy;
    float dist = length(delta);
    float life = clamp(ripple.z / ${RIPPLE_SECONDS.toFixed(2)}, 0.0, 1.0);
    float wave = exp(-pow((dist - ripple.z * 0.9) / 0.07, 2.0)) * (1.0 - life) * (1.0 - life) * ripple.w;
    warp += (dist > 0.0001 ? delta / dist : vec2(0.0)) * wave * 0.035;
    ring += wave;
  }

  if (uEffect == 2 && touch > 0.0) {
    vec3 head = uTrail[0];
    vec2 delta = uv - head.xy;
    float dist = length(delta);
    warp += (dist > 0.0001 ? delta / dist : vec2(0.0)) * sin(dist / max(uRadius, 0.001) * 16.0 - uTime * 7.0) * 0.04 * touch * uStrength;
  }

  float f = pattern((uv + warp) / uScale);
  if (uEffect == 0) f -= 0.5 * touch * uStrength;
  if (uEffect == 1) f += 0.5 * touch * uStrength;
  f += ring * 0.55;
  f = (f - 0.5) * uContrast + 0.5 + uBrightness;
  float show = clamp((uIntro * uReach - length(uv)) / 0.45, 0.0, 1.0);
  float v = clamp(f, 0.0, 1.0) * show * show * (3.0 - 2.0 * show);
  outColor = vec4(floor(v * 255.0) / 255.0, fract(v * 255.0), 0.0, 1.0);
}`

const DITHER_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uField;
uniform ivec2 uFieldSize;
uniform float uCellDevice;
uniform int uMode;
uniform float uColorNum;
uniform vec3 uWave;
uniform vec3 uBackground;
uniform vec3 uPalette[${MAX_PALETTE}];
uniform int uPaletteCount;
uniform float uTransparent;
out vec4 outColor;

const float bayer8[64] = float[64](
  0.0 / 64.0, 48.0 / 64.0, 12.0 / 64.0, 60.0 / 64.0, 3.0 / 64.0, 51.0 / 64.0, 15.0 / 64.0, 63.0 / 64.0,
  32.0 / 64.0, 16.0 / 64.0, 44.0 / 64.0, 28.0 / 64.0, 35.0 / 64.0, 19.0 / 64.0, 47.0 / 64.0, 31.0 / 64.0,
  8.0 / 64.0, 56.0 / 64.0, 4.0 / 64.0, 52.0 / 64.0, 11.0 / 64.0, 59.0 / 64.0, 7.0 / 64.0, 55.0 / 64.0,
  40.0 / 64.0, 24.0 / 64.0, 36.0 / 64.0, 20.0 / 64.0, 43.0 / 64.0, 27.0 / 64.0, 39.0 / 64.0, 23.0 / 64.0,
  2.0 / 64.0, 50.0 / 64.0, 14.0 / 64.0, 62.0 / 64.0, 1.0 / 64.0, 49.0 / 64.0, 13.0 / 64.0, 61.0 / 64.0,
  34.0 / 64.0, 18.0 / 64.0, 46.0 / 64.0, 30.0 / 64.0, 33.0 / 64.0, 17.0 / 64.0, 45.0 / 64.0, 29.0 / 64.0,
  10.0 / 64.0, 58.0 / 64.0, 6.0 / 64.0, 54.0 / 64.0, 9.0 / 64.0, 57.0 / 64.0, 5.0 / 64.0, 53.0 / 64.0,
  42.0 / 64.0, 26.0 / 64.0, 38.0 / 64.0, 22.0 / 64.0, 41.0 / 64.0, 25.0 / 64.0, 37.0 / 64.0, 21.0 / 64.0
);

const float bayer4[16] = float[16](
  0.0 / 16.0, 8.0 / 16.0, 2.0 / 16.0, 10.0 / 16.0,
  12.0 / 16.0, 4.0 / 16.0, 14.0 / 16.0, 6.0 / 16.0,
  3.0 / 16.0, 11.0 / 16.0, 1.0 / 16.0, 9.0 / 16.0,
  15.0 / 16.0, 7.0 / 16.0, 13.0 / 16.0, 5.0 / 16.0
);

const float bayer2[4] = float[4](0.0 / 4.0, 2.0 / 4.0, 3.0 / 4.0, 1.0 / 4.0);

float threshold(vec2 cell) {
  if (uMode == 1) {
    ivec2 c = ivec2(mod(cell, 4.0));
    return bayer4[c.y * 4 + c.x];
  }
  if (uMode == 2) {
    ivec2 c = ivec2(mod(cell, 2.0));
    return bayer2[c.y * 2 + c.x];
  }
  if (uMode == 3) {
    vec2 r = vec2(cell.x + cell.y, cell.x - cell.y) * 0.70710678 / 4.0;
    return clamp(length(fract(r) - 0.5) * 1.41421356, 0.0, 0.999);
  }
  if (uMode == 4) {
    return abs(fract(cell.y / 4.0) - 0.5) * 2.0 * 0.999;
  }
  if (uMode == 5) {
    float a = abs(fract((cell.x + cell.y) / 6.0) - 0.5) * 2.0;
    float b = abs(fract((cell.x - cell.y) / 6.0) - 0.5) * 2.0;
    return min(a, b) * 0.999;
  }
  if (uMode == 6) {
    return fract(52.9829189 * fract(dot(cell, vec2(0.06711056, 0.00583715))));
  }
  if (uMode == 7) {
    return 0.25;
  }
  ivec2 c = ivec2(mod(cell, 8.0));
  return bayer8[c.y * 8 + c.x];
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uCellDevice);
  vec4 sampleValue = texelFetch(uField, clamp(ivec2(cell), ivec2(0), uFieldSize - 1), 0);
  float f = sampleValue.r + sampleValue.g / 255.0;
  float t = threshold(cell) - 0.25;

  if (uPaletteCount > 1) {
    float n = float(uPaletteCount);
    float v = f + t / (n - 1.0);
    v = clamp(v - mix(0.2, 0.0, smoothstep(0.45, 0.8, v)), 0.0, 1.0);
    int index = int(floor(v * (n - 1.0) + 0.5));
    outColor = vec4(toSrgb(uPalette[index]), 1.0);
    return;
  }

  float levels = max(uColorNum, 1.01) - 1.0;
  if (uTransparent > 0.5) {
    float v = f + t / levels;
    v = clamp(v - mix(0.2, 0.0, smoothstep(0.45, 0.8, v)), 0.0, 1.0);
    float a = floor(v * levels + 0.5) / levels;
    outColor = vec4(toSrgb(uWave) * a, a);
    return;
  }

  float base = dot(uBackground, vec3(0.2126, 0.7152, 0.0722));
  vec3 offset = (uWave - vec3(base)) * f + t / levels;
  float luminance = dot(uBackground + offset, vec3(0.2126, 0.7152, 0.0722));
  offset -= mix(0.2, 0.0, smoothstep(0.45, 0.8, luminance));
  bool rising = dot(uWave, vec3(0.2126, 0.7152, 0.0722)) >= base;
  float lower = rising ? 0.0 : -max(uBackground.r, max(uBackground.g, uBackground.b));
  float upper = rising ? 1.0 - min(uBackground.r, min(uBackground.g, uBackground.b)) : 0.0;
  offset = floor(clamp(offset, lower, upper) * levels + 0.5) / levels;
  outColor = vec4(toSrgb(uBackground + offset), 1.0);
}`

const LIQUID_VERTEX = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`

const LIQUID_CHROME_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uUnit;
uniform float uTime;
uniform float uAmplitude;
uniform vec2 uFrequency;
uniform float uDetail;
uniform float uSharpness;
uniform float uDepth;
uniform float uPresence;
uniform vec3 uTint;
uniform vec2 uShift;
uniform float uRoughness;
uniform float uExposure;
uniform float uLight;
uniform sampler2D uSlope;
uniform vec2 uSlopeSize;
uniform float uRipple;
out vec4 fragColor;

vec2 slopeAt(vec2 uv) {
  vec2 st = uv * uSlopeSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uSlopeSize;
  vec2 h1 = (i + 1.5 + w3 / g1) / uSlopeSize;
  vec2 a = texture(uSlope, vec2(h0.x, h0.y)).rg;
  vec2 b = texture(uSlope, vec2(h1.x, h0.y)).rg;
  vec2 c = texture(uSlope, vec2(h0.x, h1.y)).rg;
  vec2 d = texture(uSlope, vec2(h1.x, h1.y)).rg;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

float lamp(vec2 p, vec2 center, vec2 size, float soft) {
  vec2 grown = size + soft;
  vec2 q = (p - center) / grown;
  q *= q;
  float d = sqrt(sqrt(dot(q, q)));
  float edge = soft / min(grown.x, grown.y);
  float shape = (1.0 - smoothstep(1.0 - edge, 1.0 + edge, d)) * (1.0 - 0.45 * d * d);
  return shape * size.x * size.y / (grown.x * grown.y);
}

vec3 studio(vec3 r, float blur) {
  vec2 p = r.xy / max(r.z + 1.0, 0.05);
  p += uShift * smoothstep(0.3, 1.0, length(p));
  float radius = length(p);
  float soft = 0.008 + blur;
  vec2 dir = p / max(radius, 1e-3);
  float key = lamp(p, vec2(-0.25, 0.42), vec2(0.3, 0.12), soft);
  float side = lamp(p, vec2(0.48, 0.12), vec2(0.06, 0.3), soft);
  float ground = lamp(p, vec2(-0.1, -0.55), vec2(0.45, 0.06), soft);
  float rise = smoothstep(-1.0, 1.0, dir.y);
  if (uLight > 0.5) {
    float edge = 0.008 + blur * 0.8;
    float lobe = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(atan(dir.y, dir.x) * 2.0 + 0.9));
    float tone = mix(2.4, 0.95, smoothstep(0.5 - edge, 1.0 + edge, radius));
    tone = mix(tone, 0.02, smoothstep(0.98 - edge, 1.12 + edge, radius));
    tone = mix(tone, mix(0.03, 0.3, lobe) * (0.8 + 0.4 * rise), smoothstep(1.15 - edge, 1.3 + edge, radius));
    float width = 0.035 + edge;
    tone += 2.4 * exp(-pow((radius - 1.4) / width, 2.0)) * min(1.0, 0.06 / width) * (0.6 + 0.4 * rise);
    return vec3(tone) * (1.0 - 0.5 * side) * (1.0 - 0.3 * ground) + 0.8 * key;
  }
  float width = 0.015 + soft * 2.0;
  float rim = exp(-abs(radius - 1.0) / width) * 0.031 / width * (0.8 + smoothstep(-0.5, 0.8, p.y));
  float band = 1.0 - 0.95 * smoothstep(1.04 - soft, 1.12 + soft, radius);
  float wall = smoothstep(1.25, 1.55, radius) * (0.6 + 0.4 * rise);
  float streak = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(atan(dir.y, dir.x) * 3.0 + 0.6));
  vec3 color = vec3(0.004, 0.004, 0.005) + 0.02 * smoothstep(-0.4, 0.6, p.y);
  color += vec3(1.0, 0.97, 0.94) * key * 4.0 + vec3(0.9, 0.95, 1.0) * side * 3.0 + ground * 1.2;
  color += vec3(1.0, 0.98, 0.95) * rim;
  color *= band;
  return color + vec3(mix(0.45, 1.8, streak)) * wall;
}

vec3 shade(vec2 slope, vec3 v, float blur, vec3 f0) {
  float steep = length(slope);
  slope *= 3.0 * tanh(steep / 3.0) / max(steep, 1e-6);
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 r = reflect(v, n);
  float facing = clamp(dot(n, -v), 0.0, 1.0);
  return studio(r, blur) * (f0 + (1.0 - f0) * pow(1.0 - facing, 5.0));
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (2.0 * frag - uResolution) / uUnit;
  vec2 p = uv;
  vec2 rowX = vec2(1.0, 0.0);
  vec2 rowY = vec2(0.0, 1.0);
  float amplitude = uAmplitude * uPresence;
  for (float i = 1.0; i < 9.0; i++) {
    if (i > uDetail) break;
    float a = amplitude / i;
    float soften = exp(0.3 - 0.3 * i);
    float argX = i * uFrequency.x * p.y + uTime;
    p.x += a * cos(argX);
    rowX -= a * sin(argX) * i * uFrequency.x * soften * rowY;
    float argY = i * uFrequency.y * p.x + uTime;
    p.y += a * cos(argY);
    rowY -= a * sin(argY) * i * uFrequency.y * soften * rowX;
  }
  float phase = uTime - p.x - p.y;
  vec2 field = -(rowX + rowY);
  float density = max(length(field), 1e-3);
  vec2 across = field / density;
  float k = uSharpness;
  float sn = sin(phase);
  float cs = cos(phase);
  float th = tanh(k * sn);
  float bevel = (1.0 - th * th) / tanh(k);
  float fade = smoothstep(3.0, 9.0, 3.14159 * uUnit / density);
  float weight = uDepth * uPresence * fade;
  vec2 slope = k * cs * bevel * weight * across + slopeAt(frag / uResolution) * uRipple;
  vec2 sweep = -k * bevel * (sn + 2.0 * k * cs * cs * th) * weight * density * 2.0 / uUnit * across;
  vec2 stepX = dFdx(slope);
  vec2 stepY = dFdy(slope);
  vec2 crease = dot(stepX, stepX) > dot(stepY, stepY) ? stepX : stepY;
  if (dot(crease, crease) > dot(sweep, sweep)) sweep = crease;
  float bend = length(sweep);
  float alpha = smoothstep(0.0, 0.1, length(slope));
  vec3 f0 = mix(vec3(1.0), uTint, smoothstep(0.05, 0.6, length(slope))) * 0.92;
  vec3 v = normalize(vec3(uv * 0.08, -1.0));
  float blur = uRoughness * 0.35;
  vec3 light;
  if (bend < 0.01) {
    light = shade(slope, v, blur + bend * 0.5, f0);
  } else {
    light = vec3(0.0);
    for (float t = -0.375; t < 0.4; t += 0.25) {
      light += shade(slope + sweep * t, v, blur + bend * 0.15, f0);
    }
    light *= 0.25;
  }
  vec3 color = pow(aces(light * uExposure), vec3(1.0 / 2.2));
  float grain = fract(52.9829189 * fract(dot(frag, vec2(0.06711056, 0.00583715))));
  color += (grain - 0.5) / 255.0;
  fragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}`

type Program = { value: WebGLProgram; location: (name: string) => WebGLUniformLocation | null }

function createSurface(canvas: HTMLCanvasElement, options: Options, alpha: boolean) {
  let context: WebGL2RenderingContext | null
  try {
    context = canvas.getContext('webgl2', {
      alpha, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'default', preserveDrawingBuffer: options.thumbnail === true
    })
  } catch { return null }
  if (!context) return null
  const gl = context
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = []
  const textures: WebGLTexture[] = [], framebuffers: WebGLFramebuffer[] = []
  const buffers: WebGLBuffer[] = [], arrays: WebGLVertexArrayObject[] = []
  let disposed = false

  const track = <T>(value: T | null, list: T[]): T => {
    if (!value) throw new Error('Cannot allocate React Bits theme surface')
    list.push(value)
    return value
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    canvas.removeEventListener('webglcontextlost', contextLost)
    // Unbind deleted objects so their GPU storage can be released immediately.
    gl.useProgram(null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    for (const value of programs) gl.deleteProgram(value)
    for (const value of shaders) gl.deleteShader(value)
    for (const value of textures) gl.deleteTexture(value)
    for (const value of framebuffers) gl.deleteFramebuffer(value)
    for (const value of buffers) gl.deleteBuffer(value)
    for (const value of arrays) gl.deleteVertexArray(value)
    programs.length = shaders.length = textures.length = framebuffers.length = buffers.length = arrays.length = 0
    // Detached canvases otherwise retain a context slot until a later GC cycle.
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  function contextLost(event: Event) {
    event.preventDefault()
    dispose()
  }
  const alive = () => {
    if (disposed) return false
    if (gl.isContextLost()) { dispose(); return false }
    return true
  }
  const fail = () => { dispose(); return false }
  const compile = (kind: number, source: string) => {
    const shader = track(gl.createShader(kind), shaders)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Cannot compile React Bits theme shader')
    }
    return shader
  }
  const program = (vertex: string, fragment: string, attribute?: string): Program => {
    const value = track(gl.createProgram(), programs)
    gl.attachShader(value, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(value, compile(gl.FRAGMENT_SHADER, fragment))
    if (attribute) gl.bindAttribLocation(value, 0, attribute)
    gl.linkProgram(value)
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(value) || 'Cannot link React Bits theme program')
    }
    const locations = new Map<string, WebGLUniformLocation | null>()
    return {
      value,
      location: name => {
        if (!locations.has(name)) locations.set(name, gl.getUniformLocation(value, name))
        return locations.get(name) ?? null
      }
    }
  }
  const maxDimension = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))
  const resize = (width: number, height: number) => {
    if (!alive() || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    const dpr = Math.max(0.01, canvas.ownerDocument.defaultView?.devicePixelRatio || 1)
    const dimension = options.thumbnail ? Math.min(320, maxDimension) : maxDimension
    const ratio = Math.min(dpr, 2, Math.sqrt(MAX_PIXELS / (width * height)), dimension / width, dimension / height)
    const w = Math.max(1, Math.floor(width * ratio)), h = Math.max(1, Math.floor(height * ratio))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    return { width: w, height: h, ratio: w / width }
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  return {
    gl, program, alive, fail, dispose, resize,
    texture: () => track(gl.createTexture(), textures),
    framebuffer: () => track(gl.createFramebuffer(), framebuffers),
    buffer: () => track(gl.createBuffer(), buffers),
    array: () => track(gl.createVertexArray(), arrays)
  }
}

const toLinear = (value: number) => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4)
// Match the website's classic Demo preset, rather than the component's bare
// export defaults. CSS hex colors use the original source's sRGB conversion.
const DITHER_DARK_WAVE = new Float32Array([0xbc, 0xbc, 0xbc].map(channel => toLinear(channel / 255)))
const DITHER_DARK_BACKGROUND = new Float32Array([0x12, 0x0f, 0x17].map(channel => toLinear(channel / 255)))
const DITHER_LIGHT_WAVE = new Float32Array([0x33, 0x39, 0x44].map(channel => toLinear(channel / 255)))
const DITHER_LIGHT_BACKGROUND = new Float32Array([0xf7, 0xf8, 0xfc].map(channel => toLinear(channel / 255)))

export function createDitherRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  const surface = createSurface(canvas, options, false)
  if (!surface) return null
  const { gl } = surface
  try {
    const wave = surface.program(DITHER_VERTEX, DITHER_WAVE_FRAGMENT, 'aPosition')
    const dither = surface.program(DITHER_VERTEX, DITHER_FRAGMENT, 'aPosition')
    const vao = surface.array(), buffer = surface.buffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const field = surface.texture(), framebuffer = surface.framebuffer()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, field)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.useProgram(wave.value)
    gl.uniform1f(wave.location('uWaveSpeed'), .05)
    gl.uniform1f(wave.location('uWaveFrequency'), 3)
    gl.uniform1f(wave.location('uWaveAmplitude'), .3)
    gl.uniform1f(wave.location('uScale'), 1)
    gl.uniform1f(wave.location('uContrast'), 1)
    gl.uniform1f(wave.location('uBrightness'), 0)
    gl.uniform1i(wave.location('uEffect'), 0)
    gl.uniform1f(wave.location('uRadius'), .3)
    gl.uniform1f(wave.location('uStrength'), 1)
    gl.uniform3fv(wave.location('uTrail[0]'), new Float32Array(MAX_TRAIL * 3))
    gl.uniform1i(wave.location('uTrailCount'), 0)
    gl.uniform4fv(wave.location('uRipples[0]'), new Float32Array(MAX_RIPPLES * 4))
    gl.uniform1i(wave.location('uRippleCount'), 0)
    gl.uniform1f(wave.location('uIntro'), 1)
    gl.useProgram(dither.value)
    gl.uniform1i(dither.location('uField'), 0)
    gl.uniform1i(dither.location('uMode'), 0)
    gl.uniform1f(dither.location('uColorNum'), 4)
    gl.uniform3fv(dither.location('uPalette[0]'), new Float32Array(MAX_PALETTE * 3))
    gl.uniform1i(dither.location('uPaletteCount'), 0)
    gl.uniform1f(dither.location('uTransparent'), 0)

    let width = 1, height = 1, ratio = 1, cell = 1, cols = 0, rows = 0
    const resize = (cssWidth: number, cssHeight: number) => {
      try {
        const size = surface.resize(cssWidth, cssHeight)
        if (!size) return
        width = cssWidth; height = cssHeight; ratio = size.ratio
        cell = Math.max(1, Math.round(2 * ratio))
        const nextCols = Math.max(1, Math.ceil(size.width / cell))
        const nextRows = Math.max(1, Math.ceil(size.height / cell))
        if (nextCols === cols && nextRows === rows) return
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, field)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nextCols, nextRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, field, 0)
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        if (!complete || gl.getError() !== gl.NO_ERROR) { surface.fail(); return }
        cols = nextCols; rows = nextRows
      } catch { surface.fail() }
    }
    const render = (seconds: number, dark = options.dark) => {
      if (!surface.alive()) return false
      try {
        if (!cols || !rows) resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight))
        if (!surface.alive()) return false
        gl.disable(gl.BLEND)
        gl.disable(gl.DEPTH_TEST)
        gl.bindVertexArray(vao)
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.viewport(0, 0, cols, rows)
        gl.useProgram(wave.value)
        gl.uniform2f(wave.location('uResolution'), canvas.width / ratio, canvas.height / ratio)
        gl.uniform1f(wave.location('uCell'), cell / ratio)
        gl.uniform1f(wave.location('uTime'), options.thumbnail ? 12 : Math.max(0, Number.isFinite(seconds) ? seconds : 0))
        gl.uniform1f(wave.location('uReach'), .5 * Math.hypot(width / height, 1) + .45)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.useProgram(dither.value)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, field)
        gl.uniform2i(dither.location('uFieldSize'), cols, rows)
        gl.uniform1f(dither.location('uCellDevice'), cell)
        gl.uniform3fv(dither.location('uWave'), dark ? DITHER_DARK_WAVE : DITHER_LIGHT_WAVE)
        gl.uniform3fv(dither.location('uBackground'), dark ? DITHER_DARK_BACKGROUND : DITHER_LIGHT_BACKGROUND)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        return gl.getError() === gl.NO_ERROR || surface.fail()
      } catch { return surface.fail() }
    }
    return { backend: 'webgl2', resize, render, dispose: surface.dispose }
  } catch { surface.dispose(); return null }
}

const LIQUID_SETTINGS = {
  amplitude: .32, frequencyX: 1, speed: .25, frequencyY: 2.2,
  rippleSize: 1.75, roughness: .58, exposure: 1.1, thickness: 1.4,
  detail: 4, depth: 1, rippleStrength: 1, tilt: 1
} as const

export function createLiquidChromeRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  const surface = createSurface(canvas, options, true)
  if (!surface) return null
  const { gl } = surface
  try {
    const chrome = surface.program(LIQUID_VERTEX, LIQUID_CHROME_FRAGMENT)
    const vao = surface.array(), slope = surface.texture()
    // The original SIM/SLOPE passes stay exactly zero without pointer strokes.
    // One zero texel is that same neutral field, without float-target support or
    // three unused simulation targets. rippleSize=1.75 applies only to strokes.
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, slope)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.useProgram(chrome.value)
    gl.uniform1f(chrome.location('uAmplitude'), LIQUID_SETTINGS.amplitude)
    gl.uniform2f(chrome.location('uFrequency'), LIQUID_SETTINGS.frequencyX, LIQUID_SETTINGS.frequencyY)
    gl.uniform1f(chrome.location('uDepth'), LIQUID_SETTINGS.depth)
    gl.uniform1f(chrome.location('uDetail'), LIQUID_SETTINGS.detail)
    gl.uniform1f(chrome.location('uSharpness'), 5 / (3 * LIQUID_SETTINGS.thickness))
    gl.uniform1f(chrome.location('uPresence'), 1)
    gl.uniform3f(chrome.location('uTint'), 1, 1, 1)
    gl.uniform1f(chrome.location('uRoughness'), LIQUID_SETTINGS.roughness)
    gl.uniform1f(chrome.location('uExposure'), LIQUID_SETTINGS.exposure)
    gl.uniform1i(chrome.location('uSlope'), 0)
    gl.uniform2f(chrome.location('uSlopeSize'), 1, 1)
    gl.uniform1f(chrome.location('uRipple'), LIQUID_SETTINGS.rippleStrength * 2.2)

    let unit = 0, previous: number | null = null
    const view = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0 }
    const resize = (width: number, height: number) => {
      try {
        const size = surface.resize(width, height)
        if (size) unit = Math.min(size.width, size.height)
      } catch { surface.fail() }
    }
    const render = (seconds: number, dark = options.dark) => {
      if (!surface.alive()) return false
      try {
        if (!unit) resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight))
        if (!surface.alive()) return false
        const elapsed = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
        // A fixed native phase replaces the source's random initial time so
        // thumbnails and same-state redraws remain reproducible.
        const time = 12 + (options.thumbnail ? 0 : elapsed) * LIQUID_SETTINGS.speed
        const dt = previous === null ? 0 : Math.min(.05, Math.max(0, elapsed - previous))
        previous = elapsed
        const targetYaw = .22 * Math.sin(time * 1.3) * LIQUID_SETTINGS.tilt
        const targetPitch = .16 * Math.sin(time * .9 + 1.7) * LIQUID_SETTINGS.tilt
        if (options.thumbnail) {
          view.yaw = targetYaw; view.pitch = targetPitch
        } else {
          const stiffness = 36, damping = 2 * Math.sqrt(stiffness) * .95
          view.vyaw += ((targetYaw - view.yaw) * stiffness - view.vyaw * damping) * dt
          view.vpitch += ((targetPitch - view.pitch) * stiffness - view.vpitch * damping) * dt
          view.yaw += view.vyaw * dt
          view.pitch += view.vpitch * dt
        }
        gl.disable(gl.BLEND)
        gl.disable(gl.DEPTH_TEST)
        gl.bindVertexArray(vao)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.useProgram(chrome.value)
        gl.uniform2f(chrome.location('uResolution'), canvas.width, canvas.height)
        gl.uniform1f(chrome.location('uUnit'), unit)
        gl.uniform1f(chrome.location('uTime'), time)
        gl.uniform2f(chrome.location('uShift'), view.yaw, view.pitch)
        gl.uniform1f(chrome.location('uLight'), dark ? 0 : 1)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, slope)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        return gl.getError() === gl.NO_ERROR || surface.fail()
      } catch { return surface.fail() }
    }
    return { backend: 'webgl2', resize, render, dispose: surface.dispose }
  } catch { surface.dispose(); return null }
}
