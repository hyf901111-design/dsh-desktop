import { screenVertex, bottomFragment, fishVertex, fishFragment, surfaceFragment } from './shaders.js';
import { FISH_LENGTH } from './spine.js';

function program(gl, vertex, fragment) {
  const compiled = [];
  const result = gl.createProgram();
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      compiled.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    const uniforms = {};
    const n = gl.getProgramParameter(result, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(result, i).name;
      uniforms[name.replace('[0]', '')] = gl.getUniformLocation(result, name);
    }
    return { handle: result, uniforms, position: gl.getAttribLocation(result, 'a_position') };
  } catch (error) { gl.deleteProgram(result); throw error; }
  finally { for (const shader of compiled) gl.deleteShader(shader); }
}

function texture(gl, image) {
  const result = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (image) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }
  return result;
}

function buffer(gl, values) {
  const result = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, result);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  return result;
}

/** GPU scene + water refraction; independent of React and the preview controls. */
export class PondRenderer {
  constructor(canvas, water, koi) {
    this.canvas = canvas;
    this.waterImage = water;
    this.koiImage = koi;
    this.gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: false,
    });
    if (!this.gl) throw new Error('WebGL unavailable');
    this.programs = [];
    this.textures = [];
    this.buffers = [];
    try { this.init(); } catch (error) { this.destroy(); throw error; }
  }

  init() {
    const gl = this.gl;
    this.bottom = program(gl, screenVertex, bottomFragment); this.programs.push(this.bottom);
    this.fishProgram = program(gl, fishVertex, fishFragment); this.programs.push(this.fishProgram);
    this.surface = program(gl, screenVertex, surfaceFragment); this.programs.push(this.surface);
    this.quad = buffer(gl, [-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]); this.buffers.push(this.quad);
    const mesh = [], cols = 48, rows = 10;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const a = x/cols, b = (x+1)/cols, c = y/rows, d = (y+1)/rows;
        mesh.push(a,c, b,c, a,d, a,d, b,c, b,d);
      }
    }
    this.meshCount = mesh.length / 2;
    this.mesh = buffer(gl, mesh); this.buffers.push(this.mesh);
    this.water = texture(gl, this.waterImage); this.textures.push(this.water);
    this.koi = texture(gl, this.koiImage); this.textures.push(this.koi);
    this.scene = texture(gl); this.textures.push(this.scene);
    this.framebuffer = gl.createFramebuffer();
    this.rippleData = new Float32Array(12 * 4);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  resize(width, height, dpr = 1) {
    const gl = this.gl;
    this.width = width; this.height = height;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const ratio = Math.min(dpr, max / width, max / height);
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.scene, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete water framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  use(item, geometry = this.quad) {
    const gl = this.gl;
    gl.useProgram(item.handle);
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
    gl.enableVertexAttribArray(item.position);
    gl.vertexAttribPointer(item.position, 2, gl.FLOAT, false, 0, 0);
    return item.uniforms;
  }

  draw(simulation, options) {
    const gl = this.gl, W = this.width, H = this.height;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.disable(gl.BLEND);
    let u = this.use(this.bottom);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.water);
    gl.uniform1i(u.u_water, 0);
    const imageAspect = this.waterImage.width / this.waterImage.height;
    const aspect = W / H;
    gl.uniform2f(u.u_cover, Math.min(1, aspect/imageAspect), Math.min(1, imageAspect/aspect));
    gl.uniform1f(u.u_time, simulation.time);
    gl.uniform1f(u.u_dark, options.darkness);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    u = this.use(this.fishProgram, this.mesh);
    gl.bindTexture(gl.TEXTURE_2D, this.koi);
    gl.uniform1i(u.u_fish, 0);
    gl.uniform2f(u.u_resolution, W, H);
    gl.uniform2f(u.u_texel, 1/this.koiImage.width, 1/this.koiImage.height);
    for (const fish of simulation.fish) {
      // Include transparent source margins in the mesh without cropping fins.
      const length = FISH_LENGTH * fish.size;
      gl.uniform1f(u.u_width, length * this.koiImage.height / this.koiImage.width);
      gl.uniform4fv(u.u_spine, fish.spine);
      gl.uniform2f(u.u_shadowOffset,15,27);
      gl.uniform1f(u.u_phase, fish.phase);
      gl.uniform1f(u.u_shadow, 1);
      gl.drawArrays(gl.TRIANGLES, 0, this.meshCount);
      gl.uniform1f(u.u_shadow, 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.meshCount);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    u = this.use(this.surface);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.uniform1i(u.u_scene, 0);
    gl.uniform2f(u.u_resolution, W, H);
    gl.uniform1f(u.u_time, simulation.time);
    gl.uniform1f(u.u_strength, options.rippleStrength);
    gl.uniform1f(u.u_brightness, options.brightness);
    gl.uniform1f(u.u_softness, options.softness);
    gl.uniform1f(u.u_dark, options.darkness);
    this.rippleData.fill(0);
    simulation.ripples.forEach((r, i) => {
      this.rippleData.set([r.x/W, 1-r.y/H, r.time, r.strength], i*4);
    });
    gl.uniform4fv(u.u_ripples, this.rippleData);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy() {
    const gl = this.gl;
    for (const item of this.programs) gl.deleteProgram(item.handle);
    for (const item of this.textures) gl.deleteTexture(item);
    for (const item of this.buffers) gl.deleteBuffer(item);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    this.programs.length = this.textures.length = this.buffers.length = 0;
  }
}
