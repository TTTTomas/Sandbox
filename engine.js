/* F2L Trainer — cube model, move engine, and case generation.
   Exposes everything the UI needs on window.F2L. */
(function () {
  "use strict";

  /* ---------- Colours ---------- */
  const COLORS = {
    W:'#f5f5f5', Y:'#ffd500', G:'#00a651', B:'#0051ba',
    R:'#d0021b', O:'#ff6219',
    X:'#3a4250'                       // dimmed / "off" pieces (kept visible)
  };

  /* ---------- Geometry / move engine ----------
     Model space: +x right, +y up, +z front (right-handed).
     A move (R,L,U,D,F,B) is a clockwise quarter turn seen from outside. */
  const DV = { '+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1] };
  const vkey = v => v.join(',');
  const dirFromVec = v => {
    for (const d in DV){ const u=DV[d]; if(u[0]===v[0]&&u[1]===v[1]&&u[2]===v[2]) return d; }
  };
  const ROT = {
    R: v => [ v[0],  v[2], -v[1] ],
    L: v => [ v[0], -v[2],  v[1] ],
    U: v => [-v[2],  v[1],  v[0] ],
    D: v => [ v[2],  v[1], -v[0] ],
    F: v => [ v[1], -v[0],  v[2] ],
    B: v => [-v[1],  v[0],  v[2] ],
  };
  const LAYER = {
    R: p=>p[0]===1, L: p=>p[0]===-1,
    U: p=>p[1]===1, D: p=>p[1]===-1,
    F: p=>p[2]===1, B: p=>p[2]===-1,
  };

  const HOMES = [];
  for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++)
    if (!(x===0&&y===0&&z===0)) HOMES.push([x,y,z]);

  const outerDirs = p => {
    const d=[];
    if(p[0]===1)d.push('+x'); if(p[0]===-1)d.push('-x');
    if(p[1]===1)d.push('+y'); if(p[1]===-1)d.push('-y');
    if(p[2]===1)d.push('+z'); if(p[2]===-1)d.push('-z');
    return d;
  };

  // state = { posKey : { dir : colorLetter } }
  function solvedState(){
    const s = {};
    for (const p of HOMES){
      const f = {};
      if(p[0]===1)f['+x']='R'; if(p[0]===-1)f['-x']='O';
      if(p[1]===1)f['+y']='Y'; if(p[1]===-1)f['-y']='W';
      if(p[2]===1)f['+z']='G'; if(p[2]===-1)f['-z']='B';
      s[vkey(p)] = f;
    }
    return s;
  }
  function applyOnce(state, letter){
    const rot = ROT[letter], inLayer = LAYER[letter], ns = {};
    for (const k in state){
      const p = k.split(',').map(Number);
      if (inLayer(p)){
        const np = rot(p), nf = {}, f = state[k];
        for (const d in f) nf[ dirFromVec(rot(DV[d])) ] = f[d];
        ns[vkey(np)] = nf;
      } else ns[k] = state[k];
    }
    return ns;
  }
  function applyToken(state, tok){
    const letter = tok[0], mod = tok.slice(1);
    const n = mod==="'" ? 3 : mod==="2" ? 2 : 1;
    for (let i=0;i<n;i++) state = applyOnce(state, letter);
    return state;
  }
  const parseAlg = s => s.trim().split(/\s+/).filter(Boolean);
  const invertTok = t => t.endsWith("'") ? t[0] : t.endsWith("2") ? t : t+"'";
  const invertAlg = toks => toks.slice().reverse().map(invertTok);

  /* ---------- Tracked (coloured) pieces ----------
     White cross (edges + centre), the target corner (W/G/R) and edge (G/R),
     plus every face centre except yellow (a stable colour reference). */
  const TRACKED = new Set(['W','GW','RW','BW','OW','GRW','GR','G','R','B','O']);
  const colorKey = faces => Object.values(faces).slice().sort().join('');
  const isTracked = faces => TRACKED.has(colorKey(faces));

  /* ---------- Case generation & validation ---------- */
  const SOLVED = solvedState();
  const FR_CORNER = '1,-1,1', FR_EDGE = '1,0,1';
  const eqFaces = (a,b) => {
    const ka=Object.keys(a); if(ka.length!==Object.keys(b).length) return false;
    for(const k of ka) if(a[k]!==b[k]) return false; return true;
  };
  function isCleanF2L(state){
    let pairSolved = true;
    for (const k in state){
      const p = k.split(',').map(Number);
      if (p[1]===1) continue;                       // U layer: anything allowed
      if (k===FR_CORNER || k===FR_EDGE){            // the slot itself
        if(!eqFaces(state[k], SOLVED[k])) pairSolved = false;
        continue;
      }
      if (!eqFaces(state[k], SOLVED[k])) return false;  // some other piece disturbed
    }
    return !pairSolved;                              // reject the already-solved case
  }

  const faceText = d => ({'+y':'white up','-y':'white down','+z':'white front',
    '-z':'white back','+x':'white right','-x':'white left'}[d]);
  const edgeFaceText = d => ({'+y':'top','-y':'bottom','+z':'front',
    '-z':'back','+x':'right','-x':'left'}[d]);

  function describe(state){
    let cK, eK;
    for (const k in state){
      const ck = colorKey(state[k]);
      if (ck==='GRW') cK = k; else if (ck==='GR') eK = k;
    }
    const cf = state[cK], ef = state[eK];
    let whiteDir; for(const d in cf) if(cf[d]==='W') whiteDir=d;
    let greenDir; for(const d in ef) if(ef[d]==='G') greenDir=d;
    const cornerInU = cK.split(',')[1]==='1';
    const edgeInU   = eK.split(',')[1]==='1';

    let group;
    if (cornerInU && edgeInU) group = 'Corner & edge in top';
    else if (cornerInU && !edgeInU) group = 'Edge in slot, corner in top';
    else if (!cornerInU && edgeInU) group = 'Corner in slot, edge in top';
    else group = 'Both pieces in slot';

    const desc = `Corner ${cornerInU?'in top':'in slot'} (${faceText(whiteDir)}) · `
               + `Edge ${edgeInU?'in top':'in slot'} (${edgeFaceText(greenDir)})`;
    return { group, desc, sig: cK+'/'+whiteDir+'|'+eK+'/'+greenDir };
  }

  // Candidate algorithms (front-right slot). Validation keeps clean, unique ones.
  const CANDIDATES = [
    "U R U' R'", "U' R U R'", "R U' R'", "R U R' U' R U R'",
    "U2 R U R' U R U' R'", "U' R U' R' U R U' R'", "U R U' R' U R U' R'",
    "R U' R' U R U' R'", "R U2 R' U' R U R'", "R U' R' U2 R U' R'",
    "U' R U2 R' U R U' R'", "U R U2 R' U R U' R'", "U2 R U2 R' U R U' R'",
    "U' R U R' U R U' R'", "U R U' R' U' R U R'", "U' R U' R' U' R U R'",
    "R U' R' U' R U R'", "R U2 R' U R U' R'", "U2 R U' R' U R U' R'",
    "U2 R U' R' U' R U R'", "R U R' U' R U R' U' R U R'", "R U R' U R U' R'",
    "R U' R' U R U R'", "U R U2 R' U' R U R'", "U' R U' R' U2 R U' R'",
    "R U R' U2 R U R' U' R U R'", "U2 R U R' U' R U R'", "R U' R' U' R U' R' U R U' R'",
  ];

  const CASES = [];
  (function build(){
    const seen = new Set();
    CANDIDATES.forEach(alg => {
      const toks = parseAlg(alg);
      let st = solvedState();
      invertAlg(toks).forEach(t => st = applyToken(st, t));   // scramble = inverse(alg)
      if (!isCleanF2L(st)) return;
      const info = describe(st);
      if (seen.has(info.sig)) return;
      seen.add(info.sig);
      CASES.push({ alg, toks, ...info });
    });
    const order = ['Corner & edge in top','Corner in slot, edge in top',
                   'Edge in slot, corner in top','Both pieces in slot'];
    CASES.sort((a,b)=> order.indexOf(a.group)-order.indexOf(b.group)
                    || a.toks.length-b.toks.length);
    CASES.forEach((c,i)=>c.num=i+1);
  })();

  window.F2L = {
    COLORS, HOMES, outerDirs, LAYER, vkey,
    solvedState, applyToken, parseAlg, invertTok, invertAlg,
    isTracked, CASES,
  };
})();
