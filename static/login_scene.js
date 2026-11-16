/* Fixed-camera cinemagraph: move only loose hair and film, never faces/UI. */
(() => {
  'use strict';
  const shell = document.querySelector('.login-shell');
  if (!shell) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = document.createElement('canvas');
  const particles = document.createElement('canvas');
  scene.className = 'login-scene-canvas';
  particles.className = 'login-particle-canvas';
  scene.setAttribute('aria-hidden', 'true');
  particles.setAttribute('aria-hidden', 'true');
  shell.prepend(scene, particles);
  const dust = particles.getContext('2d');
  let gl;
  try { gl = scene.getContext('webgl', {alpha:false, antialias:false, powerPreference:'low-power'}); } catch (_) {}
  let width = 1, height = 1, program, texture, crop, imageReady = false;
  let frame = 0, lastPaint = 0, elapsed = 0, runningSince = 0;
  let failed = !gl;
  const image = new Image();
  const cycle = 12;
  const tau = Math.PI * 2;
  const vertex = `attribute vec2 position; varying vec2 screenUV;
    void main(){screenUV=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `precision mediump float;
    uniform sampler2D picture;
    uniform vec4 crop;
    uniform float phase;
    varying vec2 screenUV;
    float oval(vec2 p,vec2 center,vec2 radius){
      return 1.-smoothstep(.45,1.,length((p-center)/radius));
    }
    void main(){
      vec2 uv=vec2(1.-(screenUV.x-crop.x)/crop.z, (1.-screenUV.y-crop.y)/crop.w);
      // Masks are in source-image coordinates. Rooted hair, faces, arms and
      // body silhouettes are excluded; only the free trailing strands move.
      float hair=max(oval(uv,vec2(.745,.225),vec2(.105,.09)),
                 max(oval(uv,vec2(.574,.48),vec2(.075,.145)),
                 max(oval(uv,vec2(.713,.486),vec2(.054,.125)),
                     oval(uv,vec2(.883,.541),vec2(.037,.085)))));
      float face=max(oval(uv,vec2(.86,.179),vec2(.070,.110)),
                 max(oval(uv,vec2(.645,.423),vec2(.077,.117)),
                     oval(uv,vec2(.811,.518),vec2(.066,.112))));
      float arm=oval(uv,vec2(.617,.565),vec2(.059,.120));
      hair*=1.-max(face,arm);
      float wind=sin(phase+uv.y*18.)+.35*sin(phase*2.+uv.x*26.);
      vec2 flow=vec2(wind*.0055, sin(phase+uv.x*14.)*.0040)*hair;
      // Two original film ribbons gently flex in place, not a camera pan.
      float foreground=.998-.20*sin(uv.x*3.14159265);
      float middle=.69+.095*sin(uv.x*5.8-3.6);
      float film=max((1.-smoothstep(.020,.060,abs(uv.y-foreground)))*smoothstep(.24,.45,uv.x),
                     (1.-smoothstep(.009,.035,abs(uv.y-middle)))*smoothstep(.42,.52,uv.x));
      film*=1.-max(face,arm);
      flow+=film*vec2(.0035*sin(phase),.0025*sin(phase*2.+uv.x*12.));
      vec3 color=texture2D(picture,clamp(uv+flow,vec2(.001),vec2(.999))).rgb;
      // A soft travelling gold sheen makes the moving film perforations read.
      float sheen=pow(max(0.,sin(uv.x*8.-phase)),12.)*.035*film;
      gl_FragColor=vec4(color+vec3(sheen,sheen*.62,sheen*.20),1.);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Login scene shader unavailable');
    }
    return shader;
  }
  function setup() {
    if (!gl) return;
    try {
      program = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Login scene unavailable');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(program, 'picture'), 0);
      shell.classList.add('scene-ready');
      shell.dataset.sceneRenderer = 'webgl';
    } catch (_) {
      failed = true;
      scene.hidden = true;
      shell.dataset.sceneRenderer = 'particles-fallback';
    }
  }
  function resize() {
    width = shell.clientWidth; height = shell.clientHeight;
    // Cap GPU work on 4K displays; keep the original sharp static fallback.
    const density = Math.min(devicePixelRatio || 1, 1.25, 1800 / width);
    scene.width = particles.width = Math.max(1, Math.round(width*density));
    scene.height = particles.height = Math.max(1, Math.round(height*density));
    dust?.setTransform(density,0,0,density,0,0);
    if (imageReady) {
      const scale = Math.max(width*1.12/image.width, height*1.12/image.height)*1.15;
      const w = image.width*scale, h = image.height*scale;
      crop = [(width-w)/2/width+.09*1.12, (height-h)/2/height, w/width, h/height];
      paint(elapsed);
    }
  }
  function drawParticles(time) {
    if (!dust) return;
    dust.clearRect(0,0,width,height);
    if (reducedMotion.matches) return;
    const phase = time/cycle*tau;
    dust.globalCompositeOperation = 'screen';
    for (let i=0;i<48;i++) {
      const seed = (i*.61803398875)%1;
      const y = ((i*.38196601125-time/cycle)%1+1)%1;
      const x = ((seed+.026*Math.sin(phase+i*1.7))%1+1)%1;
      const fade = Math.min(1,y*12,(1-y)*12);
      const pulse = .55+.45*Math.sin(phase*2+i);
      const r = (i%7===0 ? 2.5 : .8+(i%3)*.4);
      const glow = dust.createRadialGradient(x*width,y*height,0,x*width,y*height,r*4);
      glow.addColorStop(0,`rgba(255,221,155,${fade*pulse*.8})`);
      glow.addColorStop(.22,`rgba(255,184,74,${fade*pulse*.35})`);
      glow.addColorStop(1,'rgba(255,169,58,0)');
      dust.fillStyle = glow;
      dust.beginPath(); dust.arc(x*width,y*height,r*4,0,tau); dust.fill();
    }
    dust.globalCompositeOperation = 'source-over';
  }
  function paint(time) {
    if (imageReady && !failed && crop) {
      gl.viewport(0,0,scene.width,scene.height);
      gl.uniform4fv(gl.getUniformLocation(program,'crop'),crop);
      gl.uniform1f(gl.getUniformLocation(program,'phase'),reducedMotion.matches ? 0 : time/cycle*tau);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
    drawParticles(time);
    shell.dataset.sceneFrame = String(Number(shell.dataset.sceneFrame || 0)+1);
  }
  function tick(now) {
    if (now-lastPaint>=1000/30) {
      elapsed = ((now-runningSince)/1000)%cycle;
      paint(elapsed); lastPaint=now;
    }
    frame=requestAnimationFrame(tick);
  }
  function syncPlayback() {
    cancelAnimationFrame(frame); frame=0;
    if (!imageReady) return;
    if (document.hidden || reducedMotion.matches) { paint(elapsed); return; }
    runningSince=performance.now()-elapsed*1000;
    frame=requestAnimationFrame(tick);
  }
  image.onload=() => {
    imageReady=true; setup(); resize(); syncPlayback();
  };
  image.onerror=() => { scene.remove(); particles.remove(); };
  scene.addEventListener('webglcontextlost',event => {
    event.preventDefault(); failed=true;
    shell.classList.remove('scene-ready'); scene.hidden=true;
    shell.dataset.sceneRenderer='particles-fallback';
  });
  document.addEventListener('visibilitychange',syncPlayback);
  reducedMotion.addEventListener?.('change',syncPlayback);
  new ResizeObserver(resize).observe(shell);
  window.addEventListener('pagehide',() => cancelAnimationFrame(frame),{once:true});
  if (!gl) { scene.hidden=true; shell.dataset.sceneRenderer='particles-fallback'; }
  image.src='/static/login-hero-combined.png';
})();
