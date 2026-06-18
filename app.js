/* F2L Trainer — UI: 3D cube rendering, animation, controls, responsive layout. */
(function () {
  "use strict";
  const F = window.F2L;
  const { COLORS, HOMES, outerDirs, LAYER, vkey, isTracked } = F;
  const $ = id => document.getElementById(id);

  /* ---------- Cube DOM ---------- */
  const S = 60, H = S / 2;
  const cubeEl = $('cube');
  const faceCSS = {
    '+x': `translateX(${H}px) rotateY(90deg)`,
    '-x': `translateX(${-H}px) rotateY(-90deg)`,
    '+y': `translateY(${-H}px) rotateX(90deg)`,
    '-y': `translateY(${H}px) rotateX(-90deg)`,
    '+z': `translateZ(${H}px)`,
    '-z': `translateZ(${-H}px) rotateY(180deg)`,
  };
  const baseT = p => `translate3d(${p[0]*S}px, ${-p[1]*S}px, ${p[2]*S}px)`;

  // solid dark core so the gaps between stickerless pieces aren't see-through
  const CH = (3 * S - 8) / 2;
  const coreFaceCSS = {
    '+x': `translateX(${CH}px) rotateY(90deg)`,  '-x': `translateX(${-CH}px) rotateY(-90deg)`,
    '+y': `translateY(${-CH}px) rotateX(90deg)`, '-y': `translateY(${CH}px) rotateX(-90deg)`,
    '+z': `translateZ(${CH}px)`,                 '-z': `translateZ(${-CH}px) rotateY(180deg)`,
  };
  const core = document.createElement('div');
  core.className = 'core';
  for (const d in coreFaceCSS){
    const f = document.createElement('div');
    f.className = 'core-face';
    f.style.transform = coreFaceCSS[d];
    core.appendChild(f);
  }
  cubeEl.appendChild(core);

  const cubies = HOMES.map(p => {
    const el = document.createElement('div');
    el.className = 'cubie';
    el.style.transform = baseT(p);
    const faces = {};
    outerDirs(p).forEach(d => {
      const f = document.createElement('div');
      f.className = 'face';
      f.style.transform = faceCSS[d];
      el.appendChild(f);
      faces[d] = f;
    });
    cubeEl.appendChild(el);
    return { pos: p, key: vkey(p), el, faces };
  });

  function render(state){
    for (const c of cubies){
      const f = state[c.key];
      const shown = isTracked(f);
      for (const d in c.faces)
        c.faces[d].style.background = shown ? COLORS[f[d]] : 'var(--dim-piece)';
    }
  }

  /* ---------- View (rotate + responsive scale) ---------- */
  const scene = $('scene');
  let viewX = -30, viewY = -38, viewScale = 1, mirror = false;
  const VIEWS = { topfront:[-30,-38], cross:[34,-38] };
  function applyView(){
    cubeEl.style.transform =
      `${mirror ? 'scaleX(-1) ' : ''}scale(${viewScale}) rotateX(${viewX}deg) rotateY(${viewY}deg)`;
  }
  function fitCube(){
    // cube footprint ~3*S; leave margin so corners don't clip
    viewScale = Math.max(0.55, Math.min(2.0, scene.clientWidth / 230));
    applyView();
  }
  window.addEventListener('resize', fitCube);

  document.querySelectorAll('[data-view]').forEach(b =>
    b.onclick = () => { [viewX, viewY] = VIEWS[b.dataset.view]; applyView(); });

  let drag = null;
  scene.addEventListener('pointerdown', e => {
    drag = { x:e.clientX, y:e.clientY, vx:viewX, vy:viewY };
    scene.setPointerCapture(e.pointerId);
    cubeEl.style.transition = 'none';
  });
  scene.addEventListener('pointermove', e => {
    if (!drag) return;
    viewY = drag.vy + (e.clientX - drag.x) * 0.5 * (mirror ? -1 : 1);
    viewX = Math.max(-89, Math.min(89, drag.vx - (e.clientY - drag.y) * 0.5));
    applyView();
  });
  const endDrag = () => { drag = null; cubeEl.style.transition = ''; };
  scene.addEventListener('pointerup', endDrag);
  scene.addEventListener('pointercancel', endDrag);
  // Keep touch drags from scrolling the page.
  scene.addEventListener('touchmove', e => e.preventDefault(), { passive:false });

  /* ---------- Move animation ---------- */
  const animSpec = tok => {
    const base = {R:['X',90],L:['X',-90],U:['Y',-90],D:['Y',90],F:['Z',90],B:['Z',-90]}[tok[0]];
    let [axis, ang] = base;
    if (tok.endsWith("'")) ang = -ang;
    else if (tok.endsWith("2")) ang = 180;
    return { axis, ang, letter: tok[0] };
  };
  let animDur = 620;
  // Rotate the 9 turning cubies as one rigid group so they share a single
  // transform (no per-piece drift / scrunching during the turn).
  function animateMove(tok, dur = animDur){
    const { axis, ang, letter } = animSpec(tok);
    const group = document.createElement('div');
    group.className = 'turn-group';
    cubeEl.appendChild(group);
    const moving = cubies.filter(c => LAYER[letter](c.pos));
    moving.forEach(c => group.appendChild(c.el));   // identity transform: visuals unchanged
    void group.offsetWidth;                          // flush before transition
    group.style.transition = `transform ${dur}ms ease-in-out`;
    group.style.transform = `rotate${axis}(${ang}deg)`;
    return new Promise(res => setTimeout(() => {
      moving.forEach(c => cubeEl.appendChild(c.el));  // back to base; render() recolors
      group.remove();
      res();
    }, dur + 10));
  }

  /* ---------- Trainer state ---------- */
  let current = null, state = null, idx = 0, busy = false, playing = false;

  // Left-right mirror of a move (for display only; the engine is unchanged —
  // the cube is flipped with scaleX(-1) so an R turn reads as the mirrored move).
  const LRMAP = { R:'L', L:'R', U:'U', D:'D', F:'F', B:'B' };
  const mirrorTok = t => LRMAP[t[0]] + (t.slice(1)==='2' ? '2' : t.slice(1)==="'" ? '' : "'");
  const swapLR = s => s.replace(/\b(right|left)\b/g, m => m === 'right' ? 'left' : 'right');
  function refreshCaseText(){
    $('caseDesc').textContent = mirror ? swapLR(current.desc) : current.desc;
    renderAlgline();
  }

  function loadCase(c){
    stopPlay();
    current = c;
    state = F.solvedState();
    F.invertAlg(c.toks).forEach(t => state = F.applyToken(state, t));
    idx = 0;
    render(state);
    $('caseTitle').textContent = `Case ${c.num} · ${c.group}`;
    $('casesLabel').textContent = `Case ${c.num}`;
    refreshCaseText();
    updateProgress();
    document.querySelectorAll('.case').forEach(el =>
      el.classList.toggle('active', +el.dataset.num === c.num));
  }
  function renderAlgline(){
    const line = $('algline'); line.innerHTML = '';
    current.toks.forEach((t, i) => {
      const s = document.createElement('span');
      s.className = 'mv' + (i < idx ? ' done' : '') + (i === idx ? ' next' : '');
      s.textContent = mirror ? mirrorTok(t) : t;
      line.appendChild(s);
    });
  }
  function updateProgress(){
    $('progress').textContent = `${idx} / ${current.toks.length}`;
    $('back').disabled = busy || idx === 0;
    $('fwd').disabled  = busy || idx === current.toks.length;
    $('play').innerHTML = playing
      ? '<i class="ph-fill ph-pause"></i>'
      : '<i class="ph-fill ph-play"></i>';
  }

  async function stepForward(){
    if (busy || idx >= current.toks.length) return false;
    busy = true; updateProgress();
    const tok = current.toks[idx];
    await animateMove(tok);
    state = F.applyToken(state, tok); idx++;
    render(state); renderAlgline();
    busy = false; updateProgress();
    return true;
  }
  async function stepBack(){
    if (busy || idx <= 0) return;
    stopPlay();
    busy = true; updateProgress();
    const inv = F.invertTok(current.toks[idx - 1]);
    await animateMove(inv);
    state = F.applyToken(state, inv); idx--;
    render(state); renderAlgline();
    busy = false; updateProgress();
  }
  // Rewind: run the algorithm backwards quickly to the start position.
  async function reset(){
    if (busy) return;
    stopPlay();
    const fast = 150;
    while (idx > 0){
      busy = true; updateProgress();
      const inv = F.invertTok(current.toks[idx - 1]);
      await animateMove(inv, fast);
      state = F.applyToken(state, inv); idx--;
      render(state); renderAlgline();
      busy = false; updateProgress();
    }
  }
  async function play(){
    if (playing){ stopPlay(); return; }
    if (idx >= current.toks.length) loadCase(current);
    playing = true; updateProgress();
    while (playing && idx < current.toks.length){
      if (!await stepForward()) break;
      await new Promise(r => setTimeout(r, Math.max(80, animDur * 0.35)));
    }
    playing = false; updateProgress();
  }
  function stopPlay(){ playing = false; if (current) updateProgress(); }

  /* ---------- Case drawer ---------- */
  function buildList(filter=''){
    const list = $('caselist'); list.innerHTML = '';
    const f = filter.trim().toLowerCase();
    let lastGroup = null;
    F.CASES.forEach(c => {
      const hay = (c.alg+' '+c.desc+' '+c.group+' case '+c.num).toLowerCase();
      if (f && !hay.includes(f)) return;
      if (c.group !== lastGroup){
        const h = document.createElement('div');
        h.className = 'grouphdr'; h.textContent = c.group;
        list.appendChild(h); lastGroup = c.group;
      }
      const el = document.createElement('div');
      el.className = 'case' + (current && current.num === c.num ? ' active' : '');
      el.dataset.num = c.num;
      el.innerHTML =
        `<div class="name"><span>Case ${c.num}</span><span>${c.toks.length} moves</span></div>`
        + `<div class="alg">${c.alg}</div>`
        + `<div class="cdesc">${c.desc}</div>`;
      el.onclick = () => { loadCase(c); closeDrawer(); };
      list.appendChild(el);
    });
  }
  const drawer = $('drawer'), backdrop = $('backdrop');
  function openDrawer(){ drawer.classList.add('open'); backdrop.classList.add('show'); }
  function closeDrawer(){ drawer.classList.remove('open'); backdrop.classList.remove('show'); }
  function toggleDrawer(){ drawer.classList.contains('open') ? closeDrawer() : openDrawer(); }

  /* ---------- Settings popover ---------- */
  const settings = $('settings'), settingsBtn = $('settingsBtn');
  const closeSettings = () => settings.classList.remove('open');
  settingsBtn.onclick = e => { e.stopPropagation(); settings.classList.toggle('open'); };
  document.addEventListener('pointerdown', e => {
    if (settings.classList.contains('open') &&
        !settings.contains(e.target) && !settingsBtn.contains(e.target))
      closeSettings();
  });

  /* ---------- Wire up ---------- */
  $('casesBtn').onclick   = toggleDrawer;
  $('drawerClose').onclick = closeDrawer;
  backdrop.onclick        = closeDrawer;
  $('fwd').onclick        = () => { stopPlay(); stepForward(); };
  $('back').onclick       = stepBack;
  $('reset').onclick      = reset;
  $('play').onclick       = play;
  $('speed').oninput      = e => { animDur = 1480 - (+e.target.value); };
  $('search').oninput     = e => buildList(e.target.value);
  animDur = 1480 - (+$('speed').value);

  $('mirrorBtn').onclick = () => {
    mirror = !mirror;
    $('mirrorBtn').classList.toggle('on', mirror);
    applyView();
    if (current) refreshCaseText();
  };

  /* ---------- Theme ---------- */
  const THEME_KEY = 'f2l-theme';
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const resolveTheme = pref => pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
  function applyTheme(){
    const pref = localStorage.getItem(THEME_KEY) || 'system';
    document.documentElement.dataset.theme = resolveTheme(pref);
    document.querySelectorAll('#themeSeg button').forEach(b =>
      b.classList.toggle('on', b.dataset.themeChoice === pref));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }
  document.querySelectorAll('#themeSeg button').forEach(b =>
    b.onclick = () => { localStorage.setItem(THEME_KEY, b.dataset.themeChoice); applyTheme(); });
  mq.addEventListener('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') applyTheme();
  });
  applyTheme();

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') {
      if (e.key === 'Escape'){ closeDrawer(); closeSettings(); }
      return;
    }
    if (e.key === 'ArrowRight'){ e.preventDefault(); stopPlay(); stepForward(); }
    else if (e.key === 'ArrowLeft'){ e.preventDefault(); stepBack(); }
    else if (e.key === ' '){ e.preventDefault(); play(); }
    else if (e.key === 'Escape'){ closeDrawer(); closeSettings(); }
  });

  buildList();
  fitCube();
  if (F.CASES.length) loadCase(F.CASES[0]);
  else $('caseTitle').textContent = 'No cases generated — check console.';
})();
