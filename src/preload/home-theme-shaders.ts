// OpenShaders profile Copy Code exports, retrieved 2026-10-15.
// https://openshaders.com/@berber, @vghodki306809, @jarrick, @lowfreez.
// Keep the original fold field and surface effects; only final intensity is
// composed here to match the approved Odyssey theme designs.
export const HOME_THEME_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`

export const HOME_THEME_FIELD_SHADER = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uLightMode;
uniform vec3 uDarkBackground;
uniform vec3 uLightBackground;
uniform float uP[34];
out vec4 fragColor;

#define HUE uP[0]
#define HUE_SPREAD uP[1]
#define HUE_TRAVEL uP[2]
#define CHROMA uP[3]
#define LIGHTNESS uP[4]
#define COLOUR_CYCLE uP[5]
#define THETA uP[6]
#define SHEAR uP[7]
#define SHRINK uP[8]
#define LAYERS uP[9]
#define WARP_FREQ_X uP[10]
#define WARP_FREQ_Y uP[11]
#define WARP_AMP_X uP[12]
#define WARP_AMP_Y uP[13]
#define ASPECT_X uP[14]
#define ASPECT_Y uP[15]
#define OFFSET_X uP[16]
#define OFFSET_Y uP[17]
#define TILT uP[18]
#define ZOOM uP[19]
#define CENTRE_X uP[20]
#define CENTRE_Y uP[21]
#define GLOW_SIZE uP[22]
#define FALLOFF uP[23]
#define VIGNETTE uP[24]
#define FLOW_SPEED uP[25]
#define FLOW_DIRECTION uP[26]
#define BREATH_RATE uP[27]
#define BREATH_AMOUNT uP[28]
#define PHASE uP[29]
#define ECHO uP[30]
#define ECHO_SHIFT uP[31]
#define SOFTNESS uP[32]
#define LIGHT_SWING uP[33]

const float TAU = 6.28318530718;

vec3 oklchToLinear(float L, float C, float h) {
  float a = C * cos(h), b = C * sin(h);
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  vec3 lms = vec3(l_, m_, s_);
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863,
              -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * lms;
}

// Interleaved gradient noise for a sub-visible dither against banding.
float blueNoise(vec2 p, float frame) {
  p += 5.588238 * mod(frame, 64.0);
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

void main() {
  vec2 R = iResolution.xy;
  vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float t = iTime * FLOW_SPEED * FLOW_DIRECTION + PHASE;
  float breath = (-sin(iTime * BREATH_RATE * 1.5) + sin(iTime * BREATH_RATE + 1.0)) * 0.25 + 0.5;

  // The fold's fixed point sits towards one edge of the card, so the filaments
  // it throws off sweep across the entire surface.
  vec2 u = (pos - vec2(CENTRE_X, CENTRE_Y)) * (ZOOM - breath * BREATH_AMOUNT);
  float ct = cos(TILT), st = sin(TILT);
  u = mat2(ct, st, -st, ct) * u;

  // The layer matrix: a rotation whose off-diagonal is replaced by a shear.
  // This is what turns straight filaments into flowing silk.
  mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));

  float hue0 = HUE * TAU;
  float hue1 = hue0 + HUE_SPREAD * TAU;
  vec3 color = vec3(0.0);

  for (float i = 1.0; i <= 96.0; i += 1.0) {
    if (i > LAYERS) break;
    u.x += -sin(u.y * WARP_FREQ_X + t + i * 0.007) * WARP_AMP_X;
    u.y += -sin(u.x * WARP_FREQ_Y - t + i * 0.02) * WARP_AMP_Y;
    u = fold * u * SHRINK;

    vec2 q = u - vec2(OFFSET_X + breath * 0.1, OFFSET_Y);
    vec2 s = vec2(q.x * ASPECT_X, q.y * ASPECT_Y);
    float glow = GLOW_SIZE / (dot(s, s) + SOFTNESS);
#ifndef SKIP_ECHO
    vec2 e = vec2((q.x - ECHO_SHIFT) * ASPECT_X, s.y);
    glow += ECHO * GLOW_SIZE / (dot(e, e) + SOFTNESS);
#endif
    glow *= 0.25 + breath * 0.4;

    float r = length(u);
    float k = sin(i * COLOUR_CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
    color += glow * tint * exp2(-r * FALLOFF);
  }

  // ACES filmic, then a per-channel lift that keeps the darks coloured.
  vec3 x = max(color, 0.0);
  color = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  color = pow(clamp(color, 0.0, 1.0), vec3(0.85, 0.92, 0.98));

  float edge = smoothstep(0.5, 1.6, length(pos));
  color *= 1.0 - edge * VIGNETTE;

  // Unlit pixels are exactly the page background in either mode. Dark mode
  // screens the light over the page colour; light mode keeps the very same
  // hues and sets them on the page as paper: where the light is dim the paper
  // shows through, where it is strong the hue stays what it is in dark mode.
  vec3 dark = uDarkBackground + color * (1.0 - uDarkBackground);
  float strength = max(color.r, max(color.g, color.b));
  vec3 light = uLightBackground * (1.0 - strength) + color * 0.96;
  color = mix(dark, light, uLightMode);

  color += (blueNoise(gl_FragCoord.xy, floor(iTime * 24.0)) - 0.5) / 255.0;
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

export const HOME_THEME_POST_SHADERS = {
  dither: `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform vec2 iResolution;
uniform float iTime;
uniform float uLightMode;
uniform vec3 uDarkBackground;
uniform vec3 uLightBackground;
uniform float uPixelRatio;
uniform float uStrength;
uniform float uScale;
uniform float uSeed;
uniform float uIntensity;
out vec4 fragColor;
const float TAU = 6.28318530718;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 toInk(vec3 c) { return mix(c - uDarkBackground, uLightBackground - c, uLightMode); }
vec3 fromInk(vec3 ink) { return mix(uDarkBackground + ink, uLightBackground - ink, uLightMode); }
vec3 sceneInk(vec2 uv) { return toInk(texture(tScene, clamp(uv, 0.0, 1.0)).rgb); }

const mat4 BAYER = mat4(
  0.94118, 0.29412, 0.76471, 0.05882,
  0.47059, 0.70588, 0.23529, 0.52941,
  0.82353, 0.11765, 0.88235, 0.17647,
  0.35294, 0.58824, 0.41176, 0.64706
);

// Soft ordered dither: the field is coarsened to a fine pixel grid and its tone
// held to a few levels, the remainder resolved by the Bayer matrix. The pattern
// is faded in over the smooth field rather than replacing it, and fades out in
// the darks so black stays black instead of speckling. Colour rides along with
// the tone so hues are kept.
vec3 dither(vec2 frag) {
  float cell = max(2.0, floor(uScale * 2.2 * uPixelRatio + 0.5));
  vec2 grid = floor(frag / cell);
  vec3 soft = sceneInk(frag / iResolution);
  vec3 ink = sceneInk((grid + 0.5) * cell / iResolution);
  float level = dot(ink, LUMA);
  float levels = 8.0;
  ivec2 b = ivec2(mod(grid, 4.0));
  float v = pow(max(level, 0.0), 0.8) * levels + BAYER[b.x][b.y];
  float quantised = pow(floor(v) / levels, 1.25);
  vec3 dithered = ink * (quantised / max(level, 1e-4));
  float presence = smoothstep(0.03, 0.14, level) * (0.38 + 0.2 * uStrength);
  return mix(soft, dithered, presence);
}


void main() {
  vec3 ink = dither(gl_FragCoord.xy);
  vec3 color = fromInk(clamp(ink, 0.0, 1.0));
  vec3 background = mix(uDarkBackground, uLightBackground, uLightMode);
  fragColor = vec4(mix(background, color, uIntensity), 1.0);
}
`,
  grain: `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform vec2 iResolution;
uniform float iTime;
uniform float uLightMode;
uniform vec3 uDarkBackground;
uniform vec3 uLightBackground;
uniform float uPixelRatio;
uniform float uStrength;
uniform float uScale;
uniform float uSeed;
uniform float uIntensity;
out vec4 fragColor;
const float TAU = 6.28318530718;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 toInk(vec3 c) { return mix(c - uDarkBackground, uLightBackground - c, uLightMode); }
vec3 fromInk(vec3 ink) { return mix(uDarkBackground + ink, uLightBackground - ink, uLightMode); }
vec3 sceneInk(vec2 uv) { return toInk(texture(tScene, clamp(uv, 0.0, 1.0)).rgb); }

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(vec3 p) { return vec3(pcg3d(uvec3(ivec3(floor(p)) + 0x4000))) / 4294967295.0; }
// Film grain: triangular noise per grain cell, living in the midtones.
vec3 grain(vec2 frag) {
  vec3 ink = sceneInk(frag / iResolution);
  float size = max(1.0, uPixelRatio * 1.6 * uScale);
  vec2 n = hash3(vec3(floor(frag / size), floor(iTime * 24.0))).xy;
  float g = n.x + n.y - 1.0;
  float shade = clamp(dot(ink, LUMA), 0.0, 1.0);
  float response = 4.0 * shade * (1.0 - shade);
  return ink + g * (0.035 + 0.1 * response) * uStrength;
}


void main() {
  vec3 ink = grain(gl_FragCoord.xy);
  vec3 color = fromInk(clamp(ink, 0.0, 1.0));
  vec3 background = mix(uDarkBackground, uLightBackground, uLightMode);
  fragColor = vec4(mix(background, color, uIntensity), 1.0);
}
`,
  halftone: `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform vec2 iResolution;
uniform float iTime;
uniform float uLightMode;
uniform vec3 uDarkBackground;
uniform vec3 uLightBackground;
uniform float uPixelRatio;
uniform float uStrength;
uniform float uScale;
uniform float uSeed;
uniform float uIntensity;
out vec4 fragColor;
const float TAU = 6.28318530718;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 toInk(vec3 c) { return mix(c - uDarkBackground, uLightBackground - c, uLightMode); }
vec3 fromInk(vec3 ink) { return mix(uDarkBackground + ink, uLightBackground - ink, uLightMode); }
vec3 sceneInk(vec2 uv) { return toInk(texture(tScene, clamp(uv, 0.0, 1.0)).rgb); }

// Halftone: print dots on a slightly turned grid, each sized so its area
// matches the tone under it, drawn in the field's own colour and faded over
// the smooth field so the shading still reads through the screen.
vec3 halftone(vec2 frag) {
  float cell = max(3.0, uScale * 3.6 * uPixelRatio);
  float angle = 0.26 + uSeed * 0.3;
  mat2 turn = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 rotated = turn * frag;
  vec2 grid = floor(rotated / cell);
  vec2 centre = (grid + 0.5) * cell;
  vec2 source = transpose(turn) * centre;
  vec3 soft = sceneInk(frag / iResolution);
  vec3 ink = sceneInk(source / iResolution);
  float level = clamp(dot(ink, LUMA), 0.0, 1.0);
  float radius = cell * sqrt(pow(level, 0.9) / 3.14159265);
  float dist = length(rotated - centre);
  float aa = 0.7 * uPixelRatio;
  float dot_ = 1.0 - smoothstep(radius - aa, radius + aa, dist);
  vec3 dots = ink * min(0.8 / max(level, 1e-3), 2.2) * dot_;
  float presence = smoothstep(0.03, 0.16, level) * (0.3 + 0.14 * uStrength);
  return mix(soft, dots, presence);
}


void main() {
  vec3 ink = halftone(gl_FragCoord.xy);
  vec3 color = fromInk(clamp(ink, 0.0, 1.0));
  vec3 background = mix(uDarkBackground, uLightBackground, uLightMode);
  fragColor = vec4(mix(background, color, uIntensity), 1.0);
}
`
} as const
