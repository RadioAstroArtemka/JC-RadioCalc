/* JCJENSON: WebGL2 и GLSL.
   1) Объёмная диаграмма направленности во вкладке «Конструктор антенн».
   2) Фон боковой панели: интерференция волн от двух источников.
   Подключается после основного скрипта. Без WebGL2 сайт работает как раньше. */
(function () {
  if (typeof T === 'undefined') return;
  const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const rgb = h => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
  };
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

  function prog(gl, vs, fs) {
    const mk = (t, s) => {
      const x = gl.createShader(t);
      gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.bindAttribLocation(p, 1, 'g');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function fit(c) {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * d), h = Math.round(c.clientHeight * d);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return d;
  }

  const st = document.createElement('style');
  st.textContent =
    '.glbox{position:relative;height:420px;background:var(--panel);border:1px solid var(--bd);margin-bottom:12px}' +
    '.glbox canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}' +
    '.wave{position:absolute;left:0;bottom:0;width:100%;height:240px;pointer-events:none;z-index:0}' +
    'aside>.logo,aside>nav{position:relative;z-index:1}' +
    '@media (min-width:821px){aside{position:sticky;top:0;height:100vh;align-self:start;overflow:hidden}}' +
    '@media (max-width:820px){.wave{display:none}}';
  document.head.appendChild(st);

  /* ---------- Фон боковой панели ---------- */
  let bg, bgGl, bgP, bgU = {};
  try {
    bg = document.createElement('canvas');
    bg.className = 'wave';
    document.querySelector('aside').appendChild(bg);
    bgGl = bg.getContext('webgl2', { premultipliedAlpha: true, alpha: true });
    const VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = `#version 300 es
precision highp float;
uniform vec2 res;uniform float t,dpr;uniform vec3 c1,c2;out vec4 o;
float ring(float d,float P,float ph){
  float f=fract(d/P-ph);
  float w=abs(f-.5)*P;
  return 1.-smoothstep(.4*dpr,1.2*dpr,w);
}
void main(){
  vec2 q=gl_FragCoord.xy;
  vec2 A=vec2(res.x*.18,10.*dpr),B=vec2(res.x*.9,-10.*dpr);
  float dA=length(q-A),dB=length(q-B),P=26.*dpr;
  float aA=ring(dA,P,t*.22)*max(.12,.95-.2*floor(dA/(90.*dpr)));
  float aB=ring(dB,P*1.18,t*.18)*max(.1,.7-.16*floor(dB/(90.*dpr)));
  vec3 col=c1*aA+c2*aB;
  o=vec4(col,min(1.,aA+aB));
}`;
    bgP = prog(bgGl, VS, FS);
    const b = bgGl.createBuffer();
    bgGl.bindBuffer(bgGl.ARRAY_BUFFER, b);
    bgGl.bufferData(bgGl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), bgGl.STATIC_DRAW);
    bgGl.enableVertexAttribArray(0);
    bgGl.vertexAttribPointer(0, 2, bgGl.FLOAT, false, 0, 0);
    ['res', 't', 'dpr', 'c1', 'c2'].forEach(k => bgU[k] = bgGl.getUniformLocation(bgP, k));
  } catch (e) { bgGl = null; if (bg) bg.remove(); }

  function drawBg(t) {
    if (!bgGl || !bg.clientWidth) return;
    const d = fit(bg), g = bgGl;
    g.viewport(0, 0, bg.width, bg.height);
    g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
    g.useProgram(bgP);
    g.uniform2f(bgU.res, bg.width, bg.height);
    g.uniform1f(bgU.t, t); g.uniform1f(bgU.dpr, d);
    g.uniform3fv(bgU.c1, rgb(css('--red')).map(x => Math.min(1, x * 1.25)));
    g.uniform3f(bgU.c2, .55, .55, .55);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- Объёмная диаграмма ---------- */
  const NT = 64, NP = 128, NV = (NT + 1) * (NP + 1);
  let cv3, gl, pm, pl, U = {}, vT, vW, vA, vbo, nT = 0, nW = 0, nA = 0, ready = false;
  let yaw = .6, el = .45, drag = null, lastInt = -1e9;
  const dirs = new Float32Array(NV * 3);
  for (let i = 0; i <= NT; i++) for (let j = 0; j <= NP; j++) {
    const th = Math.PI * i / NT, ph = 2 * Math.PI * j / NP, o = (i * (NP + 1) + j) * 3;
    dirs[o] = Math.sin(th) * Math.cos(ph); dirs[o + 1] = Math.sin(th) * Math.sin(ph); dirs[o + 2] = Math.cos(th);
  }

  const VS3 = `#version 300 es
in vec3 p;in float g;
uniform float yaw,el,sc,asp;
out float vg;out vec3 vp;
void main(){
  float c=cos(yaw),s=sin(yaw);
  vec3 a=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);
  float ce=cos(el),se=sin(el);
  vec3 v=vec3(a.x,a.y*se+a.z*ce,-a.y*ce+a.z*se);
  vg=g;vp=v;
  gl_Position=vec4(v.x*sc/asp,v.y*sc,-v.z*.3,1.-v.z*.1);
}`;
  const FM = `#version 300 es
precision highp float;
in float vg;in vec3 vp;uniform vec3 red;out vec4 o;
void main(){
  vec3 n=normalize(cross(dFdx(vp),dFdy(vp)));
  float d=max(dot(n,normalize(vec3(-.35,.55,.75))),0.);
  float sh=min(.62+.13*floor(min(d,.999)*3.),1.);
  float i=floor(min(vg,.999)*5.);
  vec3 base=i>3.5?vec3(.96):red*(.32+.2*i);
  o=vec4(base*sh,1.);
}`;
  const FL = `#version 300 es
precision highp float;
uniform vec4 lc;out vec4 o;
void main(){o=vec4(lc.rgb*lc.a,lc.a);}`;

  try {
    cv3 = document.createElement('canvas');
    gl = cv3.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true });
    pm = prog(gl, VS3, FM); pl = prog(gl, VS3, FL);
    [pm, pl].forEach((p, k) => ['yaw', 'el', 'sc', 'asp', 'red', 'lc'].forEach(n_ => (U[k + n_] = gl.getUniformLocation(p, n_))));

    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, NV * 16, gl.DYNAMIC_DRAW);
    const attrib = () => {
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    };
    const tri = [], wire = [];
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      const a = i * (NP + 1) + j, b = a + 1, c = a + NP + 1, d = c + 1;
      tri.push(a, c, b, b, c, d);
    }
    for (let i = 0; i <= NT; i += 4) for (let j = 0; j < NP; j++) wire.push(i * (NP + 1) + j, i * (NP + 1) + j + 1);
    for (let j = 0; j <= NP; j += 4) for (let i = 0; i < NT; i++) wire.push(i * (NP + 1) + j, (i + 1) * (NP + 1) + j);
    const ibo = a => { const b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(a), gl.STATIC_DRAW); };
    vT = gl.createVertexArray(); gl.bindVertexArray(vT); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); attrib(); ibo(tri); nT = tri.length;
    vW = gl.createVertexArray(); gl.bindVertexArray(vW); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); attrib(); ibo(wire); nW = wire.length;

    const ring = [];
    for (let k = 0; k < 96; k++) {
      const a = 2 * Math.PI * k / 96, b = 2 * Math.PI * (k + 1) / 96;
      ring.push(Math.cos(a), Math.sin(a), 0, 0, Math.cos(b), Math.sin(b), 0, 0);
    }
    const line = [];
    for (let k = 0; k < 3; k++) {
      const s = [0, 0, 0], e = [0, 0, 0]; s[k] = -1.25; e[k] = 1.25;
      line.push(...s, 0, ...e, 0);
    }
    line.push(...ring);
    nA = line.length / 4;
    vA = gl.createVertexArray(); gl.bindVertexArray(vA);
    const ab = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ab);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(line), gl.STATIC_DRAW); attrib();
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    cv3.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; lastInt = performance.now(); cv3.setPointerCapture(e.pointerId); cv3.style.cursor = 'grabbing'; });
    cv3.addEventListener('pointermove', e => {
      if (!drag) return;
      yaw += (e.clientX - drag[0]) * .01;
      el = Math.max(-.2, Math.min(1.5, el + (e.clientY - drag[1]) * .01));
      drag = [e.clientX, e.clientY]; lastInt = performance.now();
    });
    const up = () => { drag = null; cv3.style.cursor = 'grab'; };
    cv3.addEventListener('pointerup', up); cv3.addEventListener('pointercancel', up);
  } catch (e) { gl = null; cv3 = null; }

  function buildMesh() {
    if (!gl) return;
    const f = n('g_f'), g = $('g_g').value === 'g', els = readEls().filter(e => e.a > 0);
    ready = false;
    if (!els.length || !(f > 0)) return;
    const k = 2 * Math.PI * f / 299.792458, us = new Float32Array(NV), v = [0, 0, 0];
    let mx = 0;
    for (let i = 0; i < NV; i++) {
      v[0] = dirs[i * 3]; v[1] = dirs[i * 3 + 1]; v[2] = dirs[i * 3 + 2];
      const u = (g && v[2] < -1e-9) ? 0 : Ufn(v, els, k, g);
      us[i] = u; if (u > mx) mx = u;
    }
    if (!(mx > 0)) return;
    const arr = new Float32Array(NV * 4);
    for (let i = 0; i < NV; i++) {
      const r = Math.sqrt(us[i] / mx);
      arr[i * 4] = dirs[i * 3] * r; arr[i * 4 + 1] = dirs[i * 3 + 1] * r; arr[i * 4 + 2] = dirs[i * 3 + 2] * r; arr[i * 4 + 3] = r;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    ready = true;
  }
  function ensureWrap() {
    const o = document.getElementById('out');
    if (!o || !cv3) return;
    let w = document.getElementById('cw_gl');
    if (!w) {
      w = document.createElement('div'); w.id = 'cw_gl';
      w.innerHTML = '<h2 class="sub">Объёмная диаграмма направленности</h2><div class="glbox"></div>' +
        '<p class="note">Перетащите, чтобы повернуть. Форма показывает напряжённость поля, цвет — уровень, белый — максимум.</p>';
      o.before(w);
      w.querySelector('.glbox').appendChild(cv3);
    }
  }
  function drawMesh() {
    if (!gl || !cv3.isConnected || !ready || !cv3.clientWidth) return;
    fit(cv3);
    const asp = cv3.width / cv3.height, red = rgb(css('--red')), fg = rgb(css('--fg')), mut = rgb(css('--mut'));
    gl.viewport(0, 0, cv3.width, cv3.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const set = (p, k) => { gl.useProgram(p); gl.uniform1f(U[k + 'yaw'], yaw); gl.uniform1f(U[k + 'el'], el); gl.uniform1f(U[k + 'sc'], .62); gl.uniform1f(U[k + 'asp'], asp); };
    set(pm, 0); gl.uniform3fv(U['0red'], red);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    gl.bindVertexArray(vT); gl.drawElements(gl.TRIANGLES, nT, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    set(pl, 1);
    gl.uniform4f(U['1lc'], fg[0], fg[1], fg[2], .18);
    gl.bindVertexArray(vW); gl.drawElements(gl.LINES, nW, gl.UNSIGNED_SHORT, 0);
    gl.uniform4f(U['1lc'], mut[0], mut[1], mut[2], .6);
    gl.bindVertexArray(vA); gl.drawArrays(gl.LINES, 0, nA);
    gl.bindVertexArray(null);
  }

  T.forEach(p => {
    if (p.t !== 'Конструктор антенн') return;
    const base = p.c;
    p.c = () => { base(); try { ensureWrap(); buildMesh(); } catch (e) { console.error(e); } };
  });

  let last = performance.now(), t = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (!reduce) t += dt;
    try {
      drawBg(t);
      if (!drag && !reduce && now - lastInt > 2500) yaw += dt * .3;
      drawMesh();
    } catch (e) { console.error(e); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  T[cur].c();
})();
