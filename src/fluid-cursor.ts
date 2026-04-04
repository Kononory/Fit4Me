// WebGL Navier-Stokes fluid cursor
// Based on Pavel Dobryakov's WebGL-Fluid-Simulation (MIT)
// Adapted for use as a transparent cursor overlay (fires on mousemove, not drag)

export default function fluidCursor() {
  const canvas = document.createElement('canvas');
  canvas.id = 'fluid';
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);

  const config = {
    SIM_RESOLUTION:       128,
    DYE_RESOLUTION:       1440,
    DENSITY_DISSIPATION:  3.5,
    VELOCITY_DISSIPATION: 2,
    PRESSURE:             0.1,
    PRESSURE_ITERATIONS:  20,
    CURL:                 3,
    SPLAT_RADIUS:         0.2,
    SPLAT_FORCE:          6000,
    SHADING:              true,
    COLORFUL:             true,
    COLOR_UPDATE_SPEED:   10,
    TRANSPARENT:          true,
  };

  function pointerPrototype(this: any) {
    this.id           = -1;
    this.texcoordX    = 0;
    this.texcoordY    = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX       = 0;
    this.deltaY       = 0;
    this.down         = false;
    this.moved        = false;
    this.color        = [30, 0, 300];
  }

  let pointers: any[]    = [];
  let splatStack: any[]  = [];
  pointers.push(new (pointerPrototype as any)());

  const { gl, ext } = getWebGLContext(canvas);

  if (isMobile()) (config as any).DYE_RESOLUTION = 512;
  if (!ext.supportLinearFiltering) {
    (config as any).DYE_RESOLUTION = 512;
    config.SHADING = false;
  }

  // ── WebGL context ──────────────────────────────────────────────────────────

  function getWebGLContext(c: HTMLCanvasElement) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl: any = c.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = c.getContext('webgl', params) || c.getContext('experimental-webgl', params);

    let halfFloat: any, supportLinearFiltering: any;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat              = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0, 0, 0, 1);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

    const getSupportedFormat = (internalFormat: any, format: any, type: any): any => {
      if (!supportRenderTextureFormat(internalFormat, format, type)) {
        if (internalFormat === gl.R16F)  return getSupportedFormat(gl.RG16F, gl.RG, type);
        if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
        return null;
      }
      return { internalFormat, format };
    };

    const formatRGBA = isWebGL2
      ? getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType)
      : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
    const formatRG   = isWebGL2
      ? getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType)
      : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
    const formatR    = isWebGL2
      ? getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType)
      : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);

    return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
  }

  function supportRenderTextureFormat(internalFormat: any, format: any, type: any) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  // ── Shaders ────────────────────────────────────────────────────────────────

  function compileShader(type: any, source: string, keywords?: string[] | null) {
    if (keywords) source = keywords.map(k => `#define ${k}`).join('\n') + '\n' + source;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function createProgram(vs: any, fs: any) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
    return p;
  }

  function getUniforms(program: any) {
    const u: any = [];
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(program, i).name;
      u[name] = gl.getUniformLocation(program, name);
    }
    return u;
  }

  class Program {
    program: any; uniforms: any;
    constructor(vs: any, fs: any) {
      this.program  = createProgram(vs, fs);
      this.uniforms = getUniforms(this.program);
    }
    bind() { gl.useProgram(this.program); }
  }

  class Material {
    vs: any; fsSource: string; programs: any[]; active: any; uniforms: any;
    constructor(vs: any, fsSource: string) {
      this.vs = vs; this.fsSource = fsSource;
      this.programs = []; this.active = null; this.uniforms = [];
    }
    setKeywords(kw: string[]) {
      let hash = kw.reduce((h, k) => { for (let i = 0; i < k.length; i++) h = (h << 5) - h + k.charCodeAt(i) | 0; return h; }, 0);
      if (!this.programs[hash]) {
        const fs = compileShader(gl.FRAGMENT_SHADER, this.fsSource, kw);
        this.programs[hash] = createProgram(this.vs, fs);
      }
      if (this.programs[hash] === this.active) return;
      this.uniforms = getUniforms(this.programs[hash]);
      this.active   = this.programs[hash];
    }
    bind() { gl.useProgram(this.active); }
  }

  const baseVS = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0);
      vR = vUv + vec2(texelSize.x, 0);
      vT = vUv + vec2(0, texelSize.y);
      vB = vUv - vec2(0, texelSize.y);
      gl_Position = vec4(aPosition, 0, 1);
    }
  `);

  const copyProgram       = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }
  `));
  const clearProgram      = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `));
  const splatProgram      = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uTarget;
    uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () {
      vec2 p = vUv - point.xy; p.x *= aspectRatio;
      vec3 splat = exp(-dot(p,p)/radius)*color;
      gl_FragColor = vec4(texture2D(uTarget,vUv).xyz + splat, 1);
    }
  `));
  const advectionProgram  = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uVelocity, uSource;
    uniform vec2 texelSize, dyeTexelSize; uniform float dt, dissipation;
    vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv/tsize - 0.5, iuv = floor(st), fuv = fract(st);
      vec4 a = texture2D(sam,(iuv+vec2(.5,.5))*tsize), b = texture2D(sam,(iuv+vec2(1.5,.5))*tsize);
      vec4 c = texture2D(sam,(iuv+vec2(.5,1.5))*tsize), d = texture2D(sam,(iuv+vec2(1.5,1.5))*tsize);
      return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y);
    }
    void main () {
      #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;
        vec4 result = bilerp(uSource,coord,dyeTexelSize);
      #else
        vec2 coord = vUv - dt*texture2D(uVelocity,vUv).xy*texelSize;
        vec4 result = texture2D(uSource,coord);
      #endif
      gl_FragColor = result / (1.0 + dissipation*dt);
    }
  `, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']));
  const divergenceProgram = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
    void main () {
      float L=texture2D(uVelocity,vL).x, R=texture2D(uVelocity,vR).x,
            T=texture2D(uVelocity,vT).y, B=texture2D(uVelocity,vB).y;
      vec2 C=texture2D(uVelocity,vUv).xy;
      if(vL.x<0.0)L=-C.x; if(vR.x>1.0)R=-C.x;
      if(vT.y>1.0)T=-C.y; if(vB.y<0.0)B=-C.y;
      gl_FragColor = vec4(0.5*(R-L+T-B), 0, 0, 1);
    }
  `));
  const curlProgram       = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
    void main () {
      float L=texture2D(uVelocity,vL).y, R=texture2D(uVelocity,vR).y,
            T=texture2D(uVelocity,vT).x, B=texture2D(uVelocity,vB).x;
      gl_FragColor = vec4(0.5*(R-L-T+B), 0, 0, 1);
    }
  `));
  const vorticityProgram  = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity, uCurl;
    uniform float curl, dt;
    void main () {
      float L=texture2D(uCurl,vL).x, R=texture2D(uCurl,vR).x,
            T=texture2D(uCurl,vT).x, B=texture2D(uCurl,vB).x, C=texture2D(uCurl,vUv).x;
      vec2 force = 0.5*vec2(abs(T)-abs(B), abs(R)-abs(L));
      force /= length(force)+0.0001;
      force *= curl*C; force.y *= -1.0;
      vec2 vel = texture2D(uVelocity,vUv).xy + force*dt;
      gl_FragColor = vec4(clamp(vel,-1000.0,1000.0), 0, 1);
    }
  `));
  const pressureProgram   = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uPressure, uDivergence;
    void main () {
      float L=texture2D(uPressure,vL).x, R=texture2D(uPressure,vR).x,
            T=texture2D(uPressure,vT).x, B=texture2D(uPressure,vB).x;
      float div=texture2D(uDivergence,vUv).x;
      gl_FragColor = vec4((L+R+B+T-div)*0.25, 0, 0, 1);
    }
  `));
  const gradSubProgram    = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uPressure, uVelocity;
    void main () {
      float L=texture2D(uPressure,vL).x, R=texture2D(uPressure,vR).x,
            T=texture2D(uPressure,vT).x, B=texture2D(uPressure,vB).x;
      vec2 vel=texture2D(uVelocity,vUv).xy;
      vel -= vec2(R-L, T-B);
      gl_FragColor = vec4(vel, 0, 1);
    }
  `));

  const displayMaterial = new Material(baseVS, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uTexture; uniform vec2 texelSize;
    vec3 linearToGamma(vec3 c) {
      c = max(c, vec3(0));
      return max(1.055*pow(c,vec3(0.4166667))-0.055, vec3(0));
    }
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      #ifdef SHADING
        vec3 lc=texture2D(uTexture,vL).rgb, rc=texture2D(uTexture,vR).rgb,
             tc=texture2D(uTexture,vT).rgb, bc=texture2D(uTexture,vB).rgb;
        float dx=length(rc)-length(lc), dy=length(tc)-length(bc);
        vec3 n=normalize(vec3(dx,dy,length(texelSize)));
        c *= clamp(dot(n,vec3(0,0,1))+0.7, 0.7, 1.0);
      #endif
      float a=max(c.r,max(c.g,c.b));
      gl_FragColor = vec4(c, a);
    }
  `);
  displayMaterial.setKeywords(config.SHADING ? ['SHADING'] : []);

  // ── Blit quad ──────────────────────────────────────────────────────────────

  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (target: any, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      if (clear) { gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  // ── FBOs ───────────────────────────────────────────────────────────────────

  function createFBO(w: number, h: number, internalFormat: any, format: any, type: any, param: any) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1/w, texelSizeY: 1/h,
      attach(id: number) { gl.activeTexture(gl.TEXTURE0+id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; }
    };
  }

  function createDoubleFBO(w: number, h: number, iF: any, f: any, t: any, p: any) {
    let fbo1 = createFBO(w,h,iF,f,t,p), fbo2 = createFBO(w,h,iF,f,t,p);
    return {
      width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
      get read()  { return fbo1; }, set read(v)  { fbo1 = v; },
      get write() { return fbo2; }, set write(v) { fbo2 = v; },
      swap() { const tmp = fbo1; fbo1 = fbo2; fbo2 = tmp; }
    };
  }

  function resizeFBO(target: any, w: number, h: number, iF: any, f: any, t: any, p: any) {
    const nf = createFBO(w,h,iF,f,t,p);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(nf); return nf;
  }

  function resizeDoubleFBO(target: any, w: number, h: number, iF: any, f: any, t: any, p: any) {
    if (target.width===w && target.height===h) return target;
    target.read  = resizeFBO(target.read,  w, h, iF, f, t, p);
    target.write = createFBO(w, h, iF, f, t, p);
    target.width = w; target.height = h;
    target.texelSizeX = 1/w; target.texelSizeY = 1/h;
    return target;
  }

  function getResolution(res: number) {
    let ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (ar < 1) ar = 1/ar;
    const min = Math.round(res), max = Math.round(res * ar);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  let dye: any, velocity: any, divergence: any, curl: any, pressure: any;

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION);
    const dyeRes = getResolution(config.DYE_RESOLUTION);
    const tt = ext.halfFloatTexType;
    const rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
    const filt = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);
    dye       = dye       ? resizeDoubleFBO(dye,      dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, tt, filt)
                          : createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, tt, filt);
    velocity  = velocity  ? resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, tt, filt)
                          : createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, tt, filt);
    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, tt, gl.NEAREST);
    curl       = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, tt, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, tt, gl.NEAREST);
  }

  // ── Simulation ─────────────────────────────────────────────────────────────

  function step(dt: number) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl,     curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt,   dt);
    blit(velocity.write); velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write); pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    gradSubProgram.bind();
    gl.uniform2f(gradSubProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradSubProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradSubProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const vid = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, vid);
    gl.uniform1i(advectionProgram.uniforms.uSource,   vid);
    gl.uniform1f(advectionProgram.uniforms.dt,           dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation,  config.VELOCITY_DISSIPATION);
    blit(velocity.write); velocity.swap();

    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource,   dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write); dye.swap();
  }

  function render(target: any) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    const w = target == null ? gl.drawingBufferWidth  : target.width;
    const h = target == null ? gl.drawingBufferHeight : target.height;
    displayMaterial.bind();
    if (config.SHADING) gl.uniform2f(displayMaterial.uniforms.texelSize, 1/w, 1/h);
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    blit(target);
  }

  function splat(x: number, y: number, dx: number, dy: number, color: any) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget,     velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point,       x, y);
    gl.uniform3f(splatProgram.uniforms.color,       dx, dy, 0);
    gl.uniform1f(splatProgram.uniforms.radius,      correctRadius(config.SPLAT_RADIUS / 100));
    blit(velocity.write); velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color,   color.r, color.g, color.b);
    blit(dye.write); dye.swap();
  }

  function correctRadius(r: number) {
    const ar = canvas.width / canvas.height;
    return ar > 1 ? r * ar : r;
  }

  function splatPointer(p: any) {
    splat(p.texcoordX, p.texcoordY,
      p.deltaX * config.SPLAT_FORCE,
      p.deltaY * config.SPLAT_FORCE,
      p.color);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function HSVtoRGB(h: number, s: number, v: number) {
    const i = Math.floor(h*6), f = h*6-i, p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
    let r=0,g=0,b=0;
    switch (i%6) {
      case 0: r=v;g=t;b=p; break; case 1: r=q;g=v;b=p; break;
      case 2: r=p;g=v;b=t; break; case 3: r=p;g=q;b=v; break;
      case 4: r=t;g=p;b=v; break; case 5: r=v;g=p;b=q; break;
    }
    return { r: r*0.15, g: g*0.15, b: b*0.15 };
  }

  function generateColor() { return HSVtoRGB(Math.random(), 1, 1); }

  function isMobile() { return /Mobi|Android/i.test(navigator.userAgent); }

  function scaleByPixelRatio(v: number) { return Math.floor(v * (window.devicePixelRatio || 1)); }

  function correctDeltaX(d: number) {
    const ar = canvas.width / canvas.height;
    return ar < 1 ? d * ar : d;
  }
  function correctDeltaY(d: number) {
    const ar = canvas.width / canvas.height;
    return ar > 1 ? d / ar : d;
  }

  function resizeCanvas() {
    const w = scaleByPixelRatio(canvas.clientWidth);
    const h = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  function updatePointerMoveData(p: any, posX: number, posY: number) {
    p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
    p.texcoordX = posX / canvas.width;
    p.texcoordY = 1 - posY / canvas.height;
    p.deltaX = correctDeltaX(p.texcoordX - p.prevTexcoordX);
    p.deltaY = correctDeltaY(p.texcoordY - p.prevTexcoordY);
    p.moved  = Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0;
  }

  // ── Mouse → splat on every mousemove (cursor behaviour) ───────────────────

  window.addEventListener('mousemove', e => {
    const p = pointers[0];
    updatePointerMoveData(p, scaleByPixelRatio(e.clientX), scaleByPixelRatio(e.clientY));
    if (!p.color || !p.colorTimer || --p.colorTimer <= 0) {
      p.color = generateColor(); p.colorTimer = 8;
    }
  });

  // ── Main loop ──────────────────────────────────────────────────────────────

  initFramebuffers();

  let lastUpdateTime = Date.now(), colorUpdateTimer = 0;

  function update() {
    const now = Date.now();
    const dt  = Math.min((now - lastUpdateTime) / 1000, 0.016666);
    lastUpdateTime = now;

    if (resizeCanvas()) initFramebuffers();

    if (config.COLORFUL) {
      colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
      if (colorUpdateTimer >= 1) {
        colorUpdateTimer = 0;
        pointers.forEach(p => { p.color = generateColor(); });
      }
    }

    if (splatStack.length > 0) {
      const n = splatStack.pop();
      for (let i = 0; i < n; i++) {
        const c = generateColor(); c.r *= 10; c.g *= 10; c.b *= 10;
        splat(Math.random(), Math.random(), 1000*(Math.random()-.5), 1000*(Math.random()-.5), c);
      }
    }

    pointers.forEach(p => { if (p.moved) { p.moved = false; splatPointer(p); } });

    step(dt);
    render(null);
    requestAnimationFrame(update);
  }

  update();
}
