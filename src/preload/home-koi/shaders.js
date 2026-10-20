export const screenVertex = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const bottomFragment = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_water;
uniform vec2 u_cover;
uniform float u_time;
uniform float u_dark;
void main() {
  vec2 uv = (v_uv - 0.5) * u_cover + 0.5;
  vec2 flow = vec2(
    sin(uv.y * 15.0 + u_time * 0.31) + sin(uv.x * 18.0 - u_time * 0.21),
    cos(uv.x * 13.0 + u_time * 0.24) + sin(uv.y * 16.0 + u_time * 0.18)
  ) * 0.0065;
  vec3 color = texture2D(u_water, uv + flow).rgb;
  color *= 0.985 + sin(uv.x * 17.0 + uv.y * 21.0 + u_time * 0.65) * 0.022;
  color += vec3(0.035, 0.035 * (v_uv.y * 2.0 - 1.0), -0.012);
  color = mix(color, vec3(0.58, 0.96, 0.96), pow(1.0-v_uv.y, 8.0) * 0.20);
  color *= vec3(0.90, 0.97, 1.025);
  // Grade only the water, before compositing the red-and-white fish. Light
  // mode keeps neutral pearl-white caustics beneath dark interface text.
  float waterLight = clamp(color.g * 0.65 + color.b * 0.35 - color.r * 0.55, 0.0, 1.0);
  vec3 dayWater = mix(vec3(0.87), vec3(0.99), pow(waterLight, 0.8));
  vec3 nightWater = mix(vec3(0.008, 0.055, 0.20), vec3(0.025, 0.31, 0.72), pow(waterLight, 1.25));
  color = mix(dayWater, nightWater, smoothstep(0.0, 0.78, u_dark));
  gl_FragColor = vec4(color, 1.0);
}`;

export const fishVertex = `
attribute vec2 a_position;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec4 u_spine[25];
uniform float u_width;
uniform float u_phase;
uniform float u_shadow;
uniform vec2 u_shadowOffset;
void main() {
  v_uv = a_position;
  float along=(1.0-a_position.x)*24.0;
  int node=int(min(floor(along),23.0));
  vec4 section=mix(u_spine[node],u_spine[node+1],along-float(node));
  vec2 normal=normalize(section.zw);
  float across=(0.5-a_position.y)*u_width;
  float fin=exp(-pow((a_position.x-0.79)*9.0,2.0))*smoothstep(0.12,0.29,abs(a_position.y-0.5));
  across*=1.0+fin*0.065*sin(u_phase*0.55+sign(a_position.y-0.5)*0.8);
  vec2 p=section.xy+normal*across+u_shadowOffset*u_shadow;
  gl_Position = vec4(p.x / u_resolution.x * 2.0 - 1.0, 1.0 - p.y / u_resolution.y * 2.0, 0.0, 1.0);
}`;

export const fishFragment = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_fish;
uniform vec2 u_texel;
uniform float u_shadow;
void main() {
  float spread = mix(1.2, 75.0, u_shadow);
  vec4 tex = texture2D(u_fish, v_uv) * 0.40;
  tex += texture2D(u_fish, v_uv + u_texel * vec2(spread, 0.0)) * 0.15;
  tex += texture2D(u_fish, v_uv - u_texel * vec2(spread, 0.0)) * 0.15;
  tex += texture2D(u_fish, v_uv + u_texel * vec2(0.0, spread)) * 0.15;
  tex += texture2D(u_fish, v_uv - u_texel * vec2(0.0, spread)) * 0.15;
  if (u_shadow > 0.5) {
    gl_FragColor = vec4(0.16, 0.23, 0.28, tex.a * 0.23);
  } else {
    vec3 color = tex.rgb;
    // The supplied video has a warm red dorsal stripe, softened by water.
    color = mix(color, vec3(color.r * 1.05, color.g * 0.92, color.b * 0.88), 0.55);
    float red = smoothstep(0.14, 0.42, tex.r - max(tex.g, tex.b));
    float body = (1.0-smoothstep(0.13,0.21,abs(v_uv.y-0.5))) * smoothstep(0.28,0.43,v_uv.x);
    float dorsal = max(red,body);
    color = mix(vec3(0.30,0.32,0.29),color,max(red,body*0.90));
    float rounded=0.88+0.12*exp(-pow((v_uv.y-0.48)*7.0,2.0));
    color*=rounded;
    gl_FragColor = vec4(color, tex.a * mix(0.28,0.98,dorsal));
  }
}`;

export const surfaceFragment = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform vec4 u_ripples[12];
uniform float u_time;
uniform float u_strength;
uniform float u_brightness;
uniform float u_softness;
uniform float u_dark;
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 gradient = vec2(0.0);
  float crests = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 ripple = u_ripples[i];
    float age = u_time - ripple.z;
    if (age >= 0.0 && age < 6.5 && ripple.w > 0.0) {
      vec2 p = (v_uv - ripple.xy) * vec2(aspect, 1.0);
      float d = length(p) + 0.0001;
      float front = age * 0.115;
      float x = d - front;
      float band = exp(-pow(x / 0.022, 2.0));
      float decay = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(3.2, 6.5, age));
      float theta = atan(p.y, p.x);
      float wave = cos(x * 94.0 + sin(theta * 3.0 + u_time * 0.30) * 0.35);
      float envelope = band * decay * ripple.w;
      gradient += p / d * wave * envelope;
      crests += pow(max(0.0, wave), 2.6) * envelope * (0.18 + 0.82 * smoothstep(-0.4, 0.75, sin(theta * 2.0 + 0.4)));
    }
  }
  gradient *= u_strength;
  vec2 drift=vec2(sin(v_uv.y*32.0+u_time*0.53),cos(v_uv.x*29.0-u_time*0.48))*0.0008;
  vec2 uv = clamp(v_uv + gradient * vec2(7.0,7.0)/u_resolution + drift, 0.001, 0.999);
  float sceneScale = min(u_resolution.x / 1150.0, u_resolution.y / 720.0);
  vec2 blur = u_softness * sceneScale / u_resolution;
  vec3 color = texture2D(u_scene, uv).rgb * 0.40;
  color += texture2D(u_scene, uv + vec2(blur.x, 0.0)).rgb * 0.15;
  color += texture2D(u_scene, uv - vec2(blur.x, 0.0)).rgb * 0.15;
  color += texture2D(u_scene, uv + vec2(0.0, blur.y)).rgb * 0.15;
  color += texture2D(u_scene, uv - vec2(0.0, blur.y)).rgb * 0.15;
  float shine = crests * u_strength;
  vec3 crestColor = mix(vec3(0.99), vec3(0.035,0.38,0.80), smoothstep(0.0,0.78,u_dark));
  color = mix(color, crestColor, clamp(shine*0.26,0.0,0.34));
  vec3 rippleShade = mix(vec3(0.035), vec3(0.025,0.05,0.06), smoothstep(0.0,0.78,u_dark));
  color -= rippleShade*max(0.0,-dot(gradient,vec2(-0.5,0.6)))*0.45;
  color *= u_brightness;
  color = mix(color, color * vec3(0.32, 0.46, 0.70), u_dark);
  gl_FragColor = vec4(color, 1.0);
}`;
