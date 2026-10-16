import type { HomeThemeRenderer } from './home-theme-renderer'

/**
 * React Bits CRTWarp / PatternWaves, adapted from the reviewed source handoff.
 * Original GLSL and native defaults are preserved. The homepage controller owns
 * scheduling and visibility; these renderers create no animation or input loop.
 */
type Options = { dark: boolean; thumbnail?: boolean }

const CRT_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const CRT_CONTENT = `#version 300 es
precision highp float;
uniform vec2 uGrid;
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uLevels;
uniform float uDecay;
uniform float uReveal;
uniform float uRise;
uniform vec4 uSeed;
uniform sampler2D uPrevious;
out vec4 outColor;

float field(vec2 uv, float t) {
  uv = (uv - 0.5) * uFrequency + 0.5;
  float f = 0.0;
  f += 0.7 * sin(0.5 * uv.x + t / 5.0 + uSeed.x);
  f += 3.0 * sin(1.6 * uv.y + t / 5.0 + uSeed.y);
  f += sin(10.0 * (uv.y * sin(t / 2.0 + uSeed.z) + uv.x * cos(t / 5.0)) + t / 2.0);
  float cx = uv.x + 0.5 * sin(t / 2.0 + uSeed.w);
  float cy = uv.y + 0.5 * cos(t / 4.0 + uSeed.x * 0.7);
  f += 0.4 * sin(sqrt(100.0 * cx * cx + 100.0 * cy * cy + 1.0) + t);
  f += 0.9 * sin(sqrt(75.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  f -= 1.4 * sin(sqrt(256.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  f += 0.3 * sin(0.5 * uv.y + uv.x + sin(t));
  return f;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / uGrid;
  float s = (0.5 + 0.499 * sin(field(uv, uTime) * uAmplitude)) * mix(1.0 / uLevels, 1.0, uReveal);
  float level = floor(s * uLevels) / max(uLevels - 1.0, 1.0);
  float previous = texelFetch(uPrevious, ivec2(cell), 0).r;
  float lifted = min(level, previous + uRise);
  outColor = vec4(max(lifted, previous * uDecay - 0.004), level, 0.0, 1.0);
}`

const CRT_GLOW = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uSize;
out vec4 outColor;

void main() {
  float v = texture(uContent, gl_FragCoord.xy / uSize).r;
  outColor = vec4(v * v, 0.0, 0.0, 1.0);
}`

const CRT_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uSize;
uniform vec2 uDirection;
uniform float uSigma;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float stride = max(uSigma * 0.55, 0.5);
  float total = 0.0;
  float sum = 0.0;
  for (int i = -7; i <= 7; i++) {
    float x = float(i) * stride;
    float w = exp(-0.5 * x * x / (uSigma * uSigma));
    sum += texture(uSource, uv + uDirection * x / uSize).r * w;
    total += w;
  }
  outColor = vec4(sum / total, 0.0, 0.0, 1.0);
}`

const CRT_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform sampler2D uGlow;
uniform vec2 uGrid;
uniform vec2 uResolution;
uniform float uPixel;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBackground;
uniform float uOpaque;
uniform float uLight;
uniform float uLines;
uniform float uScanline;
uniform float uCurve;
uniform float uCorners;
uniform int uMaskType;
uniform float uMask;
uniform float uBloom;
uniform float uBrightness;
uniform float uNoise;
uniform float uFlicker;
uniform float uInterference;
uniform float uVignette;
uniform float uShift;
uniform float uWarm;
uniform float uFocus;
uniform float uStatic;
uniform float uRoll;
uniform float uTear;
uniform float uGain;
uniform vec4 uMagnet;
uniform float uPurity;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 curve(vec2 uv) {
  if (uCurve <= 0.0) return uv;
  vec2 p = (uv - 0.5) * 2.0;
  float corner = uCurve / sqrt(max(uCurve * uCurve - 2.0, 0.001));
  p = uCurve * p / sqrt(max(uCurve * uCurve - dot(p, p), 0.001));
  p /= corner;
  return p * 0.5 + 0.5;
}

float lineValue(float x, float y) {
  if (x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0) return 0.0;
  float cx = x * uGrid.x - 0.5;
  float c0 = floor(cx);
  int row = int(clamp(floor(y * uGrid.y), 0.0, uGrid.y - 1.0));
  float a = texelFetch(uContent, ivec2(int(clamp(c0, 0.0, uGrid.x - 1.0)), row), 0).r;
  float b = texelFetch(uContent, ivec2(int(clamp(c0 + 1.0, 0.0, uGrid.x - 1.0)), row), 0).r;
  float soft = mix(0.5, 0.14, uFocus);
  return pow(mix(a, b, smoothstep(0.5 - soft, 0.5 + soft, cx - c0)), 1.25);
}

float beam(vec2 uv) {
  float ly = uv.y * uLines - 0.5;
  float r0 = floor(ly);
  float f = ly - r0;
  float a = lineValue(uv.x, (r0 + 0.5) / uLines);
  float b = lineValue(uv.x, (r0 + 1.5) / uLines);
  float nearest = f < 0.5 ? a : b;
  float sa = mix(0.16, 0.34, sqrt(a));
  float sb = mix(0.16, 0.34, sqrt(b));
  float lit = a * exp(-0.5 * f * f / (sa * sa)) + b * exp(-0.5 * (1.0 - f) * (1.0 - f) / (sb * sb));
  return mix(nearest, lit * 1.18, uScanline * mix(0.3, 1.0, uFocus));
}

vec3 maskAt(vec2 px) {
  if (uMaskType == 0 || uMask <= 0.0) return vec3(1.0);
  float size = max(1.0, floor(uPixel + 0.5));
  vec2 q = floor(px / size);
  float low = 1.0 - uMask;
  vec3 m = vec3(low);
  float column = q.x;
  if (uMaskType == 2) column += mod(floor(q.y / 2.0), 2.0) * 1.5;
  int stripe = int(mod(floor(column), 3.0));
  if (stripe == 0) m.r = 1.0;
  else if (stripe == 1) m.g = 1.0;
  else m.b = 1.0;
  if (uMaskType == 2 && mod(q.y, 2.0) > 0.5) m *= mix(1.0, 0.72, uMask);
  if (uMaskType == 3) {
    float slot = mod(q.y + mod(floor(q.x / 3.0), 2.0) * 2.0, 4.0);
    if (slot < 1.0) m *= mix(1.0, 0.45, uMask);
  }
  return m / sqrt((1.0 + 2.0 * low) / 3.0);
}

vec3 phosphor(vec3 cov) {
  float peak = max(max(uColor.r, uColor.g), max(uColor.b, 0.001));
  vec3 weight = 1.0 - uColor / peak;
  return uColor * cov * pow(max(cov, vec3(0.0001)), 0.7 * weight);
}

void main() {
  vec2 frag = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = curve(frag);
  float shape = 1.0;
  if (uCorners > 0.0) {
    float margin = uCorners * 0.035;
    float radius = uCorners * 0.1;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 box = (0.5 - margin) * vec2(aspect, 1.0);
    vec2 q = abs(p) - box + radius;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float aa = max(fwidth(sd), 0.0005);
    shape = (1.0 - smoothstep(-aa, aa, sd)) * mix(1.0, smoothstep(0.0, 0.06, -sd), 0.35);
    uv = (uv - 0.5) / (1.0 - 2.0 * margin) + 0.5;
  }
  float rolling = step(0.0001, abs(uRoll));
  uv.y += uRoll;
  float wrapped = fract(uv.y);
  uv.y = mix(uv.y, wrapped, rolling);
  float offset = fract(uRoll);
  float reach = smoothstep(0.0, 0.08, min(offset, 1.0 - offset));
  float blank = mix(1.0, smoothstep(0.0, 0.05, wrapped) * smoothstep(1.0, 0.95, wrapped), rolling * reach);

  float line = floor(uv.y * uLines);
  float tick = floor(uTime * 30.0);
  uv.x += uTear * (sin(uv.y * 21.0 + uTime * 37.0) * 0.6 + hash(vec2(line, tick)) - 0.5) * 0.05;
  uv.x += uInterference * 0.003 * (hash(vec2(line * 0.37, floor(uTime * 24.0))) - 0.5);

  vec2 dp = (frag - uMagnet.xy) * vec2(aspect, 1.0);
  float fall = exp(-dot(dp, dp) / max(uMagnet.w * uMagnet.w, 0.0001));
  vec2 swirl = vec2(-dp.y, dp.x) / vec2(aspect, 1.0) * fall * uMagnet.z * 0.5;
  vec3 spread = mix(vec3(0.85), vec3(1.0, 0.6, 0.2), uPurity);

  vec3 level = vec3(
    beam(uv + swirl * spread.r + vec2(uShift, 0.0)),
    beam(uv + swirl * spread.g),
    beam(uv + swirl * spread.b - vec2(uShift, 0.0))
  );

  float turn = uTime * 0.35;
  vec2 axis = vec2(cos(turn), sin(turn));
  float lobe = dot(dp, axis) / max(uMagnet.w, 0.0001);
  float side = dot(dp, vec2(-axis.y, axis.x)) / max(uMagnet.w, 0.0001);
  vec3 purity = vec3(lobe, -0.35 * lobe + 0.6 * side, -lobe);
  level *= 1.0 + uPurity * fall * uMagnet.z * 0.9 * purity;

  float glow = texture(uGlow, uv).r * uBloom;
  float hum = 1.0 - uInterference * 0.24 * smoothstep(0.2, 1.0, 0.5 + 0.5 * sin((frag.y - uTime * 0.09) * 6.2831853));
  float flick = 1.0 + uFlicker * 0.1 * (hash(vec2(floor(uTime * 60.0), 7.3)) - 0.5);
  float grain = hash(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
  vec2 v = frag - 0.5;
  float vignette = mix(1.0, smoothstep(0.0, 1.0, clamp(1.0 - dot(v, v) * 2.0, 0.0, 1.0)), uVignette);
  float gain = uBrightness * hum * flick * vignette * blank * uGain * uWarm;

  float noise = hash(floor(gl_FragCoord.xy / (uPixel * 1.5)) + fract(uTime * 13.7) * 91.0);
  level = mix(level, vec3(noise * noise * 1.15), uStatic);
  level *= gain * (1.0 + grain * uNoise * 2.0);
  level *= maskAt(gl_FragCoord.xy);
  glow *= gain * shape * (1.0 + 0.6 * (1.0 - uFocus));
  level *= shape;

  vec3 color;
  float alpha;
  if (uLight < 0.5) {
    vec3 cov = clamp(level, 0.0, 1.0);
    vec3 light = phosphor(cov) + uColor * glow * 0.5 * (1.0 - cov);
    vec3 excess = max(level - 1.1, 0.0);
    light += (1.0 - light) * (1.0 - exp(-excess * 0.6));
    light = clamp(light, 0.0, 1.0);
    color = uBackground + light * (1.0 - uBackground);
    alpha = max(max(light.r, light.g), light.b);
    if (uOpaque < 0.5) color = light;
  } else {
    vec3 cov = clamp(level * 0.86, 0.0, 0.88);
    cov += clamp(glow * 0.12, 0.0, 0.2) * (1.0 - cov);
    color = mix(uBackground, uColor, cov);
    alpha = max(max(cov.r, cov.g), cov.b);
    if (uOpaque < 0.5) color = uColor * cov;
  }
  outColor = uOpaque > 0.5 ? vec4(color, 1.0) : vec4(color, alpha);
}`

const PATTERN_PASSVERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const PATTERN_FIELDFRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uOrigin;
uniform vec2 uPitch;
uniform int uWave;
uniform float uTime;
uniform float uUnit;
uniform vec2 uHeading;
uniform float uAmp;
uniform float uDepth;
uniform vec3 uLight;
uniform float uShine;
uniform float uContrast;
uniform float uInk;
uniform float uOpacity;
uniform int uFade;
uniform float uFadeSize;
uniform float uAppear;
uniform sampler2D tRipple;
uniform float uRipple;
out vec4 fragColor;

const float FOLDS = 5.5;

uvec3 scramble(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

vec3 lattice(vec3 corner) {
  uvec3 h = scramble(uvec3(ivec3(corner) + 4096));
  return vec3(h & 65535u) / 32767.5 - 1.0;
}

float gradientNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(lattice(i), f);
  float n100 = dot(lattice(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(lattice(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(lattice(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(lattice(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(lattice(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(lattice(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(lattice(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

vec2 turn(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

float surface(vec2 p, float t) {
  if (uWave == 0) {
    vec2 side = vec2(-uHeading.y, uHeading.x);
    float u = dot(p, uHeading);
    float v = dot(p, side);
    float bend = gradientNoise(vec3(v * 0.85, u * 0.3, t * 0.05)) * 1.7 + 0.4 * sin(v * 1.6 + t * 0.2);
    float phase = u * FOLDS + bend - t * 0.45;
    float swell = 0.6 + 0.4 * gradientNoise(vec3(u * 0.55 + 3.0, v * 0.45, t * 0.04));
    float fold = sin(phase) + 0.32 * sin(2.0 * phase + 1.3);
    float ripple = 0.16 * sin(u * FOLDS * 2.5 + bend * 1.9 - t * 0.9 + 2.1);
    return (fold + ripple) * swell;
  }
  if (uWave == 1) {
    float bend = gradientNoise(vec3(p * 0.6, t * 0.05)) * 0.6;
    float phase = dot(p, uHeading) * 15.0 + bend * 2.2 - t * 1.4;
    float swell = sin(phase) + 0.3 * sin(2.0 * phase - 0.8);
    float roll = 0.75 + 0.25 * gradientNoise(vec3(p * 0.9 + 11.0, t * 0.05));
    return 0.8 * swell * roll;
  }
  float r = length(p + uHeading * 1.2);
  float bend = gradientNoise(vec3(p * 1.2, t * 0.05)) * 0.1;
  return sin((r + bend) * 9.0 - t * 1.8) * (0.45 + 0.55 * exp(-(r - 0.6) * 0.8));
}

float heightAt(vec2 css) {
  float h = surface((css - 0.5 * uSize) / uUnit, uTime) * uAmp;
  if (uRipple > 0.0) h += texture(tRipple, css / uSize).r * uRipple;
  return h;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 center = uOrigin + (cell + 0.5) * uPitch;
  vec2 css = center / uDpr;
  vec2 uv = css / uSize;
  float e = max(uPitch.y / uDpr, 4.0);
  float h = heightAt(css);
  float hx = (heightAt(css + vec2(e, 0.0)) - heightAt(css - vec2(e, 0.0))) / (2.0 * e);
  float hy = (heightAt(css + vec2(0.0, e)) - heightAt(css - vec2(0.0, e))) / (2.0 * e);
  vec2 grad = vec2(hx, hy) * uUnit * uDepth * 0.4;
  vec3 n = normalize(vec3(-grad, 1.0));

  float diffuse = clamp(dot(n, uLight), 0.0, 1.0);
  vec3 halfway = normalize(uLight + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, halfway), 0.0, 1.0), 160.0) * uShine * 1.15;
  float hollow = 0.7 + 0.3 * clamp(h * 0.5 + 0.5, 0.0, 1.0);
  float tone = clamp(diffuse * hollow * 0.78 + spec, 0.0, 1.0);
  tone = clamp((tone - 0.42) * uContrast + 0.42, 0.0, 1.0);

  float level = uInk > 0.5 ? pow(clamp(1.0 - tone / 0.46, 0.0, 1.0), 2.4) * 0.72 : pow(tone, 2.2);
  float emphasis = uInk > 0.5 ? smoothstep(0.55, 0.95, level) : clamp(spec * 1.6, 0.0, 1.0);

  float fade = 1.0;
  vec2 c = uv * 2.0 - 1.0;
  if (uFade == 1) {
    fade = 1.0 - smoothstep(1.0 - uFadeSize, 1.18, length(c));
  } else if (uFade == 2) {
    fade = mix(0.05, 1.0, smoothstep(0.08, 0.08 + uFadeSize, length(c * vec2(1.0, 1.35))));
  } else if (uFade == 3) {
    fade = smoothstep(0.0, uFadeSize, uv.y);
  } else if (uFade == 4) {
    fade = smoothstep(0.0, uFadeSize, 1.0 - uv.y);
  }

  float reach = length(css - 0.5 * uSize) / max(0.5 * length(uSize), 1.0);
  float appear = smoothstep(reach - 0.05, reach + 0.3, uAppear * 1.35);

  float alpha = uOpacity * fade * appear * (0.22 + 0.78 * level);
  float lift = clamp(h * uDepth * 0.42, -0.48, 0.48);
  fragColor = vec4(level, alpha, emphasis, lift + 0.5);
}
`

const PATTERN_MARKFRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D tField;
uniform sampler2D tAtlas;
uniform vec2 uOrigin;
uniform vec2 uPitch;
uniform vec2 uGrid;
uniform int uPattern;
uniform float uMarkSize;
uniform float uStroke;
uniform vec3 uColor;
uniform vec3 uAccent;
uniform vec4 uBackground;
uniform vec3 uAtlas;
out vec4 fragColor;

float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float coverage(vec2 local, float level) {
  float span = uPitch.y * uMarkSize;
  float area = max(sqrt(level), 0.14);
  if (uPattern == 0) {
    return clamp(0.5 - (length(local) - 0.5 * span * area), 0.0, 1.0);
  }
  if (uPattern == 1) {
    float extent = 0.5 * span * area;
    return clamp(0.5 - box(local, vec2(extent), extent * 0.3), 0.0, 1.0);
  }
  if (uPattern == 2) {
    float arm = 0.5 * span * mix(0.3, 1.0, level);
    float width = 0.5 * uStroke;
    return clamp(0.5 - min(box(local, vec2(arm, width), width), box(local, vec2(width, arm), width)), 0.0, 1.0);
  }
  if (uAtlas.z < 1.0) return 0.0;
  vec2 g = local / span + 0.5;
  if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) return 0.0;
  float index = min(floor(level * uAtlas.z), uAtlas.z - 1.0);
  vec2 tile = vec2(mod(index, uAtlas.x), floor(index / uAtlas.x));
  vec2 atlasUv = (tile + vec2(g.x, 1.0 - g.y)) / uAtlas.xy;
  vec2 texel = 1.0 / (span * uAtlas.xy);
  return textureGrad(tAtlas, atlasUv, vec2(texel.x, 0.0), vec2(0.0, texel.y)).a;
}

vec4 lineInk(vec2 rel) {
  float fx = rel.x / uPitch.x - 0.5;
  float c0 = clamp(floor(fx), 0.0, uGrid.x - 1.0);
  float c1 = min(c0 + 1.0, uGrid.x - 1.0);
  float t = clamp(fx - c0, 0.0, 1.0);
  float row = floor(rel.y / uPitch.y);
  vec4 ink = vec4(0.0);
  for (int k = -1; k <= 1; k++) {
    float cy = row + float(k);
    if (cy < 0.0 || cy >= uGrid.y) continue;
    vec4 a = texelFetch(tField, ivec2(int(c0), int(cy)), 0);
    vec4 b = texelFetch(tField, ivec2(int(c1), int(cy)), 0);
    vec4 f = mix(a, b, t);
    if (f.g < 0.002) continue;
    float y = (cy + 0.5 + f.a - 0.5) * uPitch.y;
    float slope = (b.a - a.a) * uPitch.y / uPitch.x;
    float thickness = max(uStroke, uPitch.y * uMarkSize * f.r);
    float d = abs(rel.y - y) / sqrt(1.0 + slope * slope) - 0.5 * thickness;
    float alpha = clamp(0.5 - d, 0.0, 1.0) * f.g;
    if (alpha > ink.a) ink = vec4(mix(uColor, uAccent, f.b) * alpha, alpha);
  }
  return ink;
}

void main() {
  vec2 rel = gl_FragCoord.xy - uOrigin;
  vec4 background = vec4(uBackground.rgb * uBackground.a, uBackground.a);
  vec4 ink = vec4(0.0);
  if (uPattern == 3) {
    ink = lineInk(rel);
  } else {
    float cx = floor(rel.x / uPitch.x);
    float row = floor(rel.y / uPitch.y);
    if (cx >= 0.0 && cx < uGrid.x) {
      for (int k = -1; k <= 1; k++) {
        float cy = row + float(k);
        if (cy < 0.0 || cy >= uGrid.y) continue;
        vec4 f = texelFetch(tField, ivec2(int(cx), int(cy)), 0);
        if (f.g < 0.002) continue;
        vec2 center = (vec2(cx, cy) + 0.5) * uPitch + vec2(0.0, (f.a - 0.5) * uPitch.y);
        float alpha = coverage(rel - center, f.r) * f.g;
        if (alpha > ink.a) ink = vec4(mix(uColor, uAccent, f.b) * alpha, alpha);
      }
    }
  }
  fragColor = ink + background * (1.0 - ink.a);
}
`

const MAX_PIXELS = 2_400_000
const LIGHT_PAPER: [number, number, number] = [247 / 255, 248 / 255, 252 / 255]
const CRT_INK: [number, number, number] = [188 / 255, 188 / 255, 188 / 255]
const DEMO_DARK_PAPER: [number, number, number] = [18 / 255, 15 / 255, 23 / 255]
const PATTERN_LIGHT_INK: [number, number, number] = [25 / 255, 32 / 255, 42 / 255]
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
type UniformName =
    'tAtlas' | 'tField' | 'tRipple' | 'uAccent' | 'uAmp' | 'uAmplitude'
  | 'uAppear' | 'uAtlas' | 'uBackground' | 'uBloom' | 'uBrightness' | 'uColor'
  | 'uContent' | 'uContrast' | 'uCorners' | 'uCurve' | 'uDecay' | 'uDepth'
  | 'uDirection' | 'uDpr' | 'uFade' | 'uFadeSize' | 'uFlicker' | 'uFocus'
  | 'uFrequency' | 'uGain' | 'uGlow' | 'uGrid' | 'uHeading' | 'uInk'
  | 'uInterference' | 'uLevels' | 'uLight' | 'uLines' | 'uMagnet' | 'uMarkSize'
  | 'uMask' | 'uMaskType' | 'uNoise' | 'uOpacity' | 'uOpaque' | 'uOrigin'
  | 'uPattern' | 'uPitch' | 'uPixel' | 'uPrevious' | 'uPurity' | 'uResolution'
  | 'uReveal' | 'uRipple' | 'uRise' | 'uRoll' | 'uScanline' | 'uSeed'
  | 'uShift' | 'uShine' | 'uSigma' | 'uSize' | 'uSource' | 'uStatic'
  | 'uStroke' | 'uTear' | 'uTime' | 'uUnit' | 'uVignette' | 'uWarm'
  | 'uWave' | 'x' | 'y' | 'z'
type Uniforms = Record<UniformName, WebGLUniformLocation | null>
type Program = { program: WebGLProgram; uniforms: Uniforms }
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number }

/** All allocations belong to one canvas, including allocations that fail midway. */
function createSurface(canvas: HTMLCanvasElement, options: Options) {
  let gl: WebGL2RenderingContext | null
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'default', preserveDrawingBuffer: options.thumbnail === true
    })
  } catch { return null }
  if (!gl) return null
  const context = gl
  const programs = new Set<WebGLProgram>()
  const shaders = new Set<WebGLShader>()
  const targets = new Set<Target>()
  const textures = new Set<WebGLTexture>()
  let vao: WebGLVertexArrayObject | null = null
  let buffer: WebGLBuffer | null = null
  let disposed = false, lost = false, failed = false
  let cssWidth = 1, cssHeight = 1, dpr = 1, sized = false
  const maxDimension = Math.min(4096, context.getParameter(context.MAX_TEXTURE_SIZE), context.getParameter(context.MAX_RENDERBUFFER_SIZE))
  const onLost = (event: Event) => { event.preventDefault(); lost = true }
  canvas.addEventListener('webglcontextlost', onLost)

  const deleteTarget = (target: Target | null) => {
    if (!target) return
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    context.deleteFramebuffer(target.framebuffer)
    context.deleteTexture(target.texture)
    targets.delete(target)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    canvas.removeEventListener('webglcontextlost', onLost)
    context.useProgram(null)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    for (let i = 0; i < 2; i++) {
      context.activeTexture(context.TEXTURE0 + i)
      context.bindTexture(context.TEXTURE_2D, null)
    }
    context.activeTexture(context.TEXTURE0)
    context.bindVertexArray(null)
    context.bindBuffer(context.ARRAY_BUFFER, null)
    for (const target of targets) deleteTarget(target)
    for (const texture of textures) context.deleteTexture(texture)
    for (const program of programs) context.deleteProgram(program)
    for (const shader of shaders) context.deleteShader(shader)
    if (buffer) context.deleteBuffer(buffer)
    if (vao) context.deleteVertexArray(vao)
    programs.clear(); shaders.clear(); targets.clear(); textures.clear()
    buffer = null; vao = null
    if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext()
  }
  const compile = (kind: number, source: string) => {
    const shader = context.createShader(kind)
    if (!shader) throw new Error('Cannot allocate React Bits shader')
    shaders.add(shader)
    context.shaderSource(shader, source)
    context.compileShader(shader)
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      throw new Error(context.getShaderInfoLog(shader) || 'Cannot compile React Bits shader')
    }
    return shader
  }
  const program = (vertex: string, fragment: string, attribute: string, names: UniformName[]): Program => {
    const result = context.createProgram()
    if (!result) throw new Error('Cannot allocate React Bits program')
    programs.add(result)
    const v = compile(context.VERTEX_SHADER, vertex)
    const f = compile(context.FRAGMENT_SHADER, fragment)
    context.attachShader(result, v)
    context.attachShader(result, f)
    context.bindAttribLocation(result, 0, attribute)
    context.linkProgram(result)
    if (!context.getProgramParameter(result, context.LINK_STATUS)) {
      throw new Error(context.getProgramInfoLog(result) || 'Cannot link React Bits program')
    }
    context.detachShader(result, v); context.detachShader(result, f)
    context.deleteShader(v); context.deleteShader(f)
    shaders.delete(v); shaders.delete(f)
    return { program: result, uniforms: Object.fromEntries(names.map(name => [name, context.getUniformLocation(result, name)])) as Uniforms }
  }
  const createTarget = (width: number, height: number, nearest = false): Target => {
    const texture = context.createTexture()
    const framebuffer = context.createFramebuffer()
    if (!texture || !framebuffer) {
      if (texture) context.deleteTexture(texture)
      if (framebuffer) context.deleteFramebuffer(framebuffer)
      throw new Error('Cannot allocate React Bits target')
    }
    const target = { texture, framebuffer, width, height }
    targets.add(target)
    context.activeTexture(context.TEXTURE0)
    context.bindTexture(context.TEXTURE_2D, texture)
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, nearest ? context.NEAREST : context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, nearest ? context.NEAREST : context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    context.bindFramebuffer(context.FRAMEBUFFER, framebuffer)
    context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, texture, 0)
    if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
      throw new Error('Incomplete React Bits framebuffer')
    }
    context.clearColor(0, 0, 0, 1)
    context.clear(context.COLOR_BUFFER_BIT)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    return target
  }
  const blankTexture = () => {
    const texture = context.createTexture()
    if (!texture) throw new Error('Cannot allocate React Bits neutral texture')
    textures.add(texture)
    context.activeTexture(context.TEXTURE0)
    context.bindTexture(context.TEXTURE_2D, texture)
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE, new Uint8Array(4))
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
    return texture
  }
  const bindTexture = (unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null) => {
    context.activeTexture(context.TEXTURE0 + unit)
    context.bindTexture(context.TEXTURE_2D, texture)
    context.uniform1i(location, unit)
  }
  const draw = (target: Target | null) => {
    context.bindFramebuffer(context.FRAMEBUFFER, target?.framebuffer || null)
    context.viewport(0, 0, target?.width || canvas.width, target?.height || canvas.height)
    context.drawArrays(context.TRIANGLES, 0, 3)
  }
  const resize = (width: number, height: number) => {
    if (disposed || lost || failed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
    cssWidth = width; cssHeight = height
    const ratio = Math.max(.5, canvas.ownerDocument.defaultView?.devicePixelRatio || 1)
    const dimension = options.thumbnail ? Math.min(320, maxDimension) : maxDimension
    const scale = Math.min(ratio, 2, Math.sqrt(MAX_PIXELS / (width * height)), dimension / width, dimension / height)
    const w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    dpr = w / width
    sized = true
  }
  try {
    vao = context.createVertexArray(); buffer = context.createBuffer()
    if (!vao || !buffer) throw new Error('Cannot allocate React Bits geometry')
    context.bindVertexArray(vao)
    context.bindBuffer(context.ARRAY_BUFFER, buffer)
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW)
    context.enableVertexAttribArray(0)
    context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0)
    context.disable(context.BLEND); context.disable(context.DEPTH_TEST); context.disable(context.CULL_FACE)
  } catch { dispose(); return null }
  return {
    gl: context, program, createTarget, deleteTarget, blankTexture, bindTexture, draw, resize, dispose,
    get width() { return canvas.width }, get height() { return canvas.height },
    get cssWidth() { return cssWidth }, get cssHeight() { return cssHeight }, get dpr() { return dpr },
    begin() {
      if (disposed || lost || failed || context.isContextLost()) return false
      if (!sized) resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight))
      context.bindVertexArray(vao)
      context.disable(context.BLEND)
      return true
    },
    finish() { failed = context.getError() !== context.NO_ERROR; return !failed },
    fail() { failed = true; return false }
  }
}

/** Native CRT defaults, including its cell persistence and original phosphor display. */
export function createCrtWarpRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  const surface = createSurface(canvas, options)
  if (!surface) return null
  const gl = surface.gl
  let cells: [Target, Target] | null = null, glows: [Target, Target] | null = null
  let flip: 0 | 1 = 0
  let previousTime: number | null = null
  try {
    const content = surface.program(CRT_VERTEX, CRT_CONTENT, 'aPosition', ['uGrid', 'uTime', 'uAmplitude', 'uFrequency', 'uLevels', 'uDecay', 'uReveal', 'uRise', 'uSeed', 'uPrevious'])
    const glow = surface.program(CRT_VERTEX, CRT_GLOW, 'aPosition', ['uContent', 'uSize'])
    const blur = surface.program(CRT_VERTEX, CRT_BLUR, 'aPosition', ['uSource', 'uSize', 'uDirection', 'uSigma'])
    const display = surface.program(CRT_VERTEX, CRT_DISPLAY, 'aPosition', ['uContent', 'uGlow', 'uGrid', 'uResolution', 'uPixel', 'uTime', 'uColor', 'uBackground', 'uOpaque', 'uLight', 'uLines', 'uScanline', 'uCurve', 'uCorners', 'uMaskType', 'uMask', 'uBloom', 'uBrightness', 'uNoise', 'uFlicker', 'uInterference', 'uVignette', 'uShift', 'uWarm', 'uFocus', 'uStatic', 'uRoll', 'uTear', 'uGain', 'uMagnet', 'uPurity'])
    const ensureTargets = () => {
      const columns = 80
      const rows = clamp(Math.round(columns * .56 * surface.height / surface.width), 4, 300)
      if (!cells || cells[0].height !== rows) {
        if (cells) cells.forEach(surface.deleteTarget)
        cells = [surface.createTarget(columns, rows), surface.createTarget(columns, rows)]
        flip = 0
      }
      const width = Math.max(1, Math.round(surface.width / 4)), height = Math.max(1, Math.round(surface.height / 4))
      if (!glows || glows[0].width !== width || glows[0].height !== height) {
        if (glows) glows.forEach(surface.deleteTarget)
        glows = [surface.createTarget(width, height), surface.createTarget(width, height)]
      }
      return { columns, rows, cells, glows }
    }
    const render = (seconds: number, dark = options.dark) => {
      if (!surface.begin()) return false
      try {
        const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
        const dt = previousTime === null ? 1 / 24 : clamp(elapsed - previousTime, 0, .1)
        previousTime = elapsed
        // Begin after the native warm-up so an unscheduled thumbnail/reduced-motion
        // first frame already contains the reviewed CRT texture.
        const clock = (options.thumbnail ? 0 : elapsed) + 4
        const { columns, rows, cells: c, glows: g } = ensureTargets()
        const previous = c[flip], next = c[flip === 0 ? 1 : 0], [glowA, glowB] = g
        gl.useProgram(content.program)
        let u = content.uniforms
        gl.uniform2f(u.uGrid, columns, rows); gl.uniform1f(u.uTime, clock * .5)
        gl.uniform1f(u.uAmplitude, .3 / .28); gl.uniform1f(u.uFrequency, 2.5 / 2.2)
        gl.uniform1f(u.uLevels, 3); gl.uniform1f(u.uDecay, .4 ** (dt * 60))
        gl.uniform1f(u.uReveal, 1); gl.uniform1f(u.uRise, 1); gl.uniform4f(u.uSeed, 0, 0, 0, 0)
        surface.bindTexture(0, previous.texture, u.uPrevious); surface.draw(next); flip = flip === 0 ? 1 : 0

        gl.useProgram(glow.program); u = glow.uniforms
        gl.uniform2f(u.uSize, glowA.width, glowA.height)
        surface.bindTexture(0, next.texture, u.uContent); surface.draw(glowA)
        gl.useProgram(blur.program); u = blur.uniforms
        gl.uniform2f(u.uSize, glowA.width, glowA.height); gl.uniform1f(u.uSigma, Math.max(.6, glowA.height / 48))
        gl.uniform2f(u.uDirection, 1, 0); surface.bindTexture(0, glowA.texture, u.uSource); surface.draw(glowB)
        gl.uniform2f(u.uDirection, 0, 1); surface.bindTexture(0, glowB.texture, u.uSource); surface.draw(glowA)

        gl.useProgram(display.program); u = display.uniforms
        surface.bindTexture(0, next.texture, u.uContent); surface.bindTexture(1, glowA.texture, u.uGlow)
        gl.uniform2f(u.uGrid, columns, rows); gl.uniform2f(u.uResolution, surface.width, surface.height)
        gl.uniform1f(u.uPixel, surface.dpr); gl.uniform1f(u.uTime, clock)
        gl.uniform3fv(u.uColor, CRT_INK); gl.uniform3fv(u.uBackground, dark ? DEMO_DARK_PAPER : LIGHT_PAPER)
        gl.uniform1f(u.uOpaque, 1); gl.uniform1f(u.uLight, dark ? 0 : 1)
        gl.uniform1f(u.uLines, 200); gl.uniform1f(u.uScanline, .6); gl.uniform1f(u.uCurve, 1.1 + .42 / .25)
        gl.uniform1f(u.uCorners, 0); gl.uniform1i(u.uMaskType, 1); gl.uniform1f(u.uMask, .3)
        gl.uniform1f(u.uBloom, 1.5); gl.uniform1f(u.uBrightness, 1); gl.uniform1f(u.uNoise, .1)
        gl.uniform1f(u.uFlicker, .15); gl.uniform1f(u.uInterference, .2); gl.uniform1f(u.uVignette, .3)
        gl.uniform1f(u.uShift, .003); gl.uniform1f(u.uWarm, 1); gl.uniform1f(u.uFocus, 1)
        gl.uniform1f(u.uStatic, 0); gl.uniform1f(u.uRoll, 0); gl.uniform1f(u.uTear, 0); gl.uniform1f(u.uGain, 1)
        gl.uniform4f(u.uMagnet, .5, .5, 0, .24); gl.uniform1f(u.uPurity, 1)
        surface.draw(null)
        return surface.finish()
      } catch { return surface.fail() }
    }
    return { backend: 'webgl2', resize: surface.resize, render, dispose: surface.dispose }
  } catch { surface.dispose(); return null }
}

/** Default demo silk/dot preset, including its #120f17 dark page background. */
export function createPatternWavesRenderer(canvas: HTMLCanvasElement, options: Options): HomeThemeRenderer | null {
  const surface = createSurface(canvas, options)
  if (!surface) return null
  const gl = surface.gl
  let field: Target | null = null
  try {
    const fieldProgram = surface.program(PATTERN_PASSVERTEX, PATTERN_FIELDFRAGMENT, 'position', ['uSize', 'uDpr', 'uOrigin', 'uPitch', 'uWave', 'uTime', 'uUnit', 'uHeading', 'uAmp', 'uDepth', 'uLight', 'uShine', 'uContrast', 'uInk', 'uOpacity', 'uFade', 'uFadeSize', 'uAppear', 'tRipple', 'uRipple'])
    const mark = surface.program(PATTERN_PASSVERTEX, PATTERN_MARKFRAGMENT, 'position', ['tField', 'tAtlas', 'uOrigin', 'uPitch', 'uGrid', 'uPattern', 'uMarkSize', 'uStroke', 'uColor', 'uAccent', 'uBackground', 'uAtlas'])
    const blank = surface.blankTexture()
    const heading = 20 * Math.PI / 180, lightAngle = 200 * Math.PI / 180
    const render = (seconds: number, dark = options.dark) => {
      if (!surface.begin()) return false
      try {
        const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
        const time = ((options.thumbnail ? 0 : elapsed) + 4) * .35
        const pitch = Math.max(4, Math.round(9 * surface.dpr))
        const columns = Math.min(4096, Math.ceil(surface.width / pitch) + 1)
        const rows = Math.min(4096, Math.ceil(surface.height / pitch) + 2)
        const ox = Math.floor((surface.width - columns * pitch) / 2), oy = Math.floor((surface.height - rows * pitch) / 2)
        if (!field || field.width !== columns || field.height !== rows) {
          surface.deleteTarget(field); field = surface.createTarget(columns, rows, true)
        }
        gl.useProgram(fieldProgram.program)
        let u = fieldProgram.uniforms
        gl.uniform2f(u.uSize, surface.cssWidth, surface.cssHeight); gl.uniform1f(u.uDpr, surface.dpr)
        gl.uniform2f(u.uOrigin, ox, oy); gl.uniform2f(u.uPitch, pitch, pitch); gl.uniform1i(u.uWave, 0)
        gl.uniform1f(u.uTime, time); gl.uniform1f(u.uUnit, 520); gl.uniform2f(u.uHeading, Math.cos(heading), Math.sin(heading))
        gl.uniform1f(u.uAmp, 1); gl.uniform1f(u.uDepth, .95)
        gl.uniform3f(u.uLight, Math.cos(lightAngle) * .78, Math.sin(lightAngle) * .78, .62)
        gl.uniform1f(u.uShine, .8); gl.uniform1f(u.uContrast, 1.2); gl.uniform1f(u.uInk, dark ? 0 : 1)
        gl.uniform1f(u.uOpacity, 1); gl.uniform1i(u.uFade, 1); gl.uniform1f(u.uFadeSize, .5); gl.uniform1f(u.uAppear, 1)
        surface.bindTexture(0, blank, u.tRipple); gl.uniform1f(u.uRipple, 0); surface.draw(field)
        gl.useProgram(mark.program); u = mark.uniforms
        surface.bindTexture(0, field.texture, u.tField); surface.bindTexture(1, blank, u.tAtlas)
        gl.uniform2f(u.uOrigin, ox, oy); gl.uniform2f(u.uPitch, pitch, pitch); gl.uniform2f(u.uGrid, columns, rows)
        gl.uniform1i(u.uPattern, 0); gl.uniform1f(u.uMarkSize, .95); gl.uniform1f(u.uStroke, Math.max(1.1 * surface.dpr, pitch * .08))
        const ink = dark ? [1, 1, 1] : PATTERN_LIGHT_INK
        gl.uniform3fv(u.uColor, ink)
        gl.uniform3fv(u.uAccent, dark ? ink : ink.map(channel => channel * .65))
        const paper = dark ? DEMO_DARK_PAPER : LIGHT_PAPER
        gl.uniform4f(u.uBackground, paper[0], paper[1], paper[2], 1)
        gl.uniform3f(u.uAtlas, 1, 1, 0); surface.draw(null)
        return surface.finish()
      } catch { return surface.fail() }
    }
    return { backend: 'webgl2', resize: surface.resize, render, dispose: surface.dispose }
  } catch { surface.dispose(); return null }
}
