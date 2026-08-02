/* =========================================================
   MiniCAD — DXF (ASCII, R12–R2018) → neutral CAD IR

   This file knows about group codes; nothing downstream does.
   It emits the IR consumed by cadimport.js, with BLOCK/INSERT already
   expanded into world coordinates.  A future DWG backend emits the same
   IR and reuses the whole mapper.

   IR shapes (all coords world, angles radians CCW):
     {k:'line',    layer, a, b}
     {k:'circle',  layer, c, r}
     {k:'arc',     layer, c, r, a0, a1}
     {k:'poly',    layer, pts:[{x,y,bulge}], closed}
     {k:'text',    layer, p, h, s, rot}
     {k:'dim',     layer, p1, p2, dp, kind}        // kind: 'aligned'|'other'
     {k:'ellipse', layer, c, maj:{x,y}, ratio, t0, t1}
     {k:'spline',  layer, ctrl:[{x,y,w}], knots, deg, closed, fit:[{x,y}]}
     {k:'point',   layer, p}
     {k:'solid',   layer, pts}                      // SOLID / TRACE / 3DFACE
     {k:'skip',    layer, type}                     // recognised but not representable
   ========================================================= */
import { arcFrom3, normAng, TAU } from './geometry.js';

export class DxfError extends Error {}

/* ---------- pair-level parsing ---------- */
const isNum = c =>
  (c>=10 && c<=59) || (c>=60 && c<=79) || (c>=90 && c<=99) ||
  (c>=110 && c<=149) || (c>=160 && c<=179) || (c>=210 && c<=239) ||
  (c>=270 && c<=299) || (c>=370 && c<=389) || (c>=400 && c<=409) ||
  (c>=420 && c<=429) || (c>=440 && c<=459) || (c>=1010 && c<=1059);

function pairs(text){
  const L = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let i=0; i+1<L.length; i+=2){
    const c = parseInt(L[i], 10);
    if (Number.isNaN(c)) continue;                 // tolerate stray blank lines
    let v = L[i+1];
    if (isNum(c)){ v = parseFloat(v); if (Number.isNaN(v)) v = 0; }
    else v = v.replace(/\s+$/, '');
    out.push([c, v]);
  }
  return out;
}

const g  = (r, c, d) => { for (const [k,v] of r.p) if (k===c) return v; return d; };
const ga = (r, c)    => { const o=[]; for (const [k,v] of r.p) if (k===c) o.push(v); return o; };

/* Split a pair stream into records: a code-0 pair starts a new one. */
function records(p, from, to){
  const out = [];
  let cur = null;
  for (let i=from; i<to; i++){
    const [c,v] = p[i];
    if (c===0){ cur = {t:v, p:[]}; out.push(cur); }
    else if (cur) cur.p.push([c,v]);
  }
  return out;
}

/* ---------- ACI colour index → hex ---------- */
const ACI_BASE = ['#000000','#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff','#e8e8e8','#808080','#c0c0c0'];
function hsv(h,s,v){
  const f = n => { const k=(n+h/60)%6; return Math.round(255*(v - v*s*Math.max(0,Math.min(k,4-k,1)))); };
  return '#' + [f(5),f(3),f(1)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/* ---------- lineweight ----------
   DXF group 370 is the weight in 1/100 mm; the DWG database instead hands back
   an INDEX into AutoCAD's fixed ladder of standard weights. Both funnel here.
   Negative codes mean by-block / by-layer / default — i.e. "no opinion". */
export const LW_LADDER = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35,
                          0.40, 0.50, 0.53, 0.60, 0.70, 0.80, 0.90, 1.00, 1.06,
                          1.20, 1.40, 1.58, 2.00, 2.11];
export function lwFromIndex(i){                    // DWG database
  return (Number.isInteger(i) && i >= 0 && i < LW_LADDER.length && LW_LADDER[i] > 0)
    ? LW_LADDER[i] : null;
}
export function lwFromHundredths(v){               // DXF group 370
  return (typeof v === 'number' && v > 0) ? v/100 : null;
}

export function aciColor(i){
  if (i>=0 && i<=9) return ACI_BASE[i] || '#e8e8e8';
  if (i>=250 && i<=255){ const v=Math.round(255*(0.2+0.16*(i-250))); const h=v.toString(16).padStart(2,'0'); return `#${h}${h}${h}`; }
  if (i<10 || i>249) return '#e8e8e8';
  const j = i-10, hue = Math.floor(j/10)*15, k = j%10;
  const val = [1, 1, 0.82, 0.82, 0.65, 0.65, 0.5, 0.5, 0.3, 0.3][k];
  const sat = (k%2) ? 0.5 : 1;
  return hsv(hue, sat, val);
}

/* ---------- 2×3 affine: x' = a·x + c·y + e ---------- */
const xfPt  = (m,p) => ({x: m[0]*p.x + m[2]*p.y + m[4], y: m[1]*p.x + m[3]*p.y + m[5]});
const xfMul = (m,n) => [                       // apply n, then m
  m[0]*n[0]+m[2]*n[1],       m[1]*n[0]+m[3]*n[1],
  m[0]*n[2]+m[2]*n[3],       m[1]*n[2]+m[3]*n[3],
  m[0]*n[4]+m[2]*n[5]+m[4],  m[1]*n[4]+m[3]*n[5]+m[5]];
const xfDet   = m => m[0]*m[3] - m[1]*m[2];
const xfScale = m => (Math.hypot(m[0],m[1]) + Math.hypot(m[2],m[3]))/2;
const xfUniform = m => Math.abs(Math.hypot(m[0],m[1]) - Math.hypot(m[2],m[3])) < 1e-6*(xfScale(m)||1);
const xfRot   = m => Math.atan2(m[1], m[0]);

/* Consumed with their owner, or carry no drawable geometry: never worth
   telling the user we "could not read" them. */
const SILENT = new Set(['VERTEX','SEQEND','ATTDEF','BLOCK','ENDBLK','VIEWPORT','LIGHT','SUN',
                        'IMAGEDEF','SORTENTSTABLE','DICTIONARY','XRECORD']);

/* ---------- entity → IR ---------- */
const P  = (r,cx,cy) => ({x: g(r,cx,0), y: g(r,cy,0)});
const D2R = d => d*Math.PI/180;

function lwVerts(r){                              // ordered 10/20/42 walk keeps bulges aligned
  const v = [];
  for (const [c,val] of r.p){
    if (c===10) v.push({x:val, y:0, bulge:0});
    else if (c===20 && v.length) v[v.length-1].y = val;
    else if (c===42 && v.length) v[v.length-1].bulge = val;
  }
  return v;
}

function arcShape(layer, c, r, a0, a1, m){
  // Map three points through the matrix: exact for similarity transforms,
  // a good approximation for the rare non-uniform INSERT.
  const at = a => ({x:c.x + r*Math.cos(a), y:c.y + r*Math.sin(a)});
  const sweep = normAng(a1-a0) || TAU;
  const f = arcFrom3(xfPt(m, at(a0)), xfPt(m, at(a0+sweep/2)), xfPt(m, at(a1)));
  if (!f) return null;
  return {k:'arc', layer, c:{x:f.cx, y:f.cy}, r:f.r, a0:f.a0, a1:f.a1};
}

/* ---------- HATCH boundary paths ----------
   HATCH reuses 10/20/40/50/51/72/73/93/97 between its boundary data and its
   pattern definition, so the only safe read is an ordered cursor walk that
   stops at the hatch-style code (75) which always follows the last path.
   We keep the boundary outline and drop the fill — MiniCAD has no fills. */
const EDGE_END = new Set([72, 92, 97, 75, 76, 47, 98, 450, 451, 452, 453, 460, 461, 462, 463, 470, 1001]);

function hatchLoops(r){
  const p = r.p;
  let i = p.findIndex(([c])=>c===91);
  if (i < 0) return [];
  const nPaths = p[i][1]|0;
  i++;
  const loops = [];

  for (let n=0; n<nPaths; n++){
    while (i<p.length && p[i][0]!==92) i++;
    if (i>=p.length) break;
    const flag = p[i][1]|0;
    i++;

    if (flag & 2){                                  // polyline path
      let hasBulge = 0, closed = 0;
      while (i<p.length && p[i][0]!==93){
        if (p[i][0]===72) hasBulge = p[i][1]|0;
        else if (p[i][0]===73) closed = p[i][1]|0;
        i++;
      }
      if (i>=p.length) break;
      const cnt = p[i][1]|0; i++;
      const pts = [];
      for (let v=0; v<cnt && i<p.length && p[i][0]===10; v++){
        const q = {x:p[i][1], y:0, bulge:0}; i++;
        if (i<p.length && p[i][0]===20){ q.y = p[i][1]; i++; }
        if (hasBulge && i<p.length && p[i][0]===42){ q.bulge = p[i][1]; i++; }
        pts.push(q);
      }
      if (pts.length>=2) loops.push({poly:pts, closed:!!closed});
      continue;
    }

    while (i<p.length && p[i][0]!==93) i++;         // edge path: 93 = edge count
    if (i>=p.length) break;
    const nEdges = p[i][1]|0; i++;
    const edges = [];

    for (let e=0; e<nEdges && i<p.length; e++){
      while (i<p.length && p[i][0]!==72) i++;
      if (i>=p.length) break;
      const type = p[i][1]|0; i++;

      if (type===4){                                // spline: read by its own counts
        const f = {deg:3, knots:[], ctrl:[], fit:[]};
        while (i<p.length && [94,73,74,95,96].includes(p[i][0])){
          const [c,v] = p[i];
          if (c===94) f.deg = v|0;
          else if (c===95) f.nKnots = v|0;
          else if (c===96) f.nCtrl = v|0;
          i++;
        }
        for (let k=0; k<(f.nKnots||0) && i<p.length && p[i][0]===40; k++){ f.knots.push(p[i][1]); i++; }
        for (let k=0; k<(f.nCtrl||0) && i<p.length && p[i][0]===10; k++){
          const q = {x:p[i][1], y:0, w:1}; i++;
          if (i<p.length && p[i][0]===20){ q.y = p[i][1]; i++; }
          if (i<p.length && p[i][0]===42){ q.w = p[i][1]; i++; }
          f.ctrl.push(q);
        }
        if (i<p.length && p[i][0]===97){
          const nFit = p[i][1]|0; i++;
          for (let k=0; k<nFit && i<p.length && p[i][0]===11; k++){
            const q = {x:p[i][1], y:0}; i++;
            if (i<p.length && p[i][0]===21){ q.y = p[i][1]; i++; }
            f.fit.push(q);
          }
        }
        edges.push({type, f});
        continue;
      }

      const f = {};                                 // line / arc / elliptic arc
      while (i<p.length && !EDGE_END.has(p[i][0])){
        if (!(p[i][0] in f)) f[p[i][0]] = p[i][1];
        i++;
      }
      edges.push({type, f});
    }
    if (edges.length) loops.push({edges});
  }
  return loops;
}

function toShapes(recs, blocks, m, depth, out, report){
  for (let i=0; i<recs.length; i++){
    const r = recs[i];
    const layer = g(r, 8, '0');
    const t = r.t;
    const elw = lwFromHundredths(g(r, 370, -3));   // negative = by-layer/default
    const push = s => { if (s){ if (elw) s.lw = elw; out.push(s); } };

    if (t==='LINE'){
      push({k:'line', layer, a:xfPt(m, P(r,10,20)), b:xfPt(m, P(r,11,21))});
    }
    else if (t==='CIRCLE'){
      const c = P(r,10,20), rad = g(r,40,0);
      if (xfUniform(m)) push({k:'circle', layer, c:xfPt(m,c), r:rad*xfScale(m)});
      else push({k:'ellipse', layer, c:xfPt(m,c),
                 maj:{x:m[0]*rad, y:m[1]*rad}, ratio:Math.hypot(m[2],m[3])/(Math.hypot(m[0],m[1])||1), t0:0, t1:TAU});
    }
    else if (t==='ARC'){
      push(arcShape(layer, P(r,10,20), g(r,40,0), D2R(g(r,50,0)), D2R(g(r,51,0)), m));
    }
    else if (t==='ELLIPSE'){
      const c = P(r,10,20), maj = P(r,11,21);
      push({k:'ellipse', layer, c:xfPt(m,c),
            maj:{x:m[0]*maj.x + m[2]*maj.y, y:m[1]*maj.x + m[3]*maj.y},
            ratio:g(r,40,1), t0:g(r,41,0), t1:g(r,42,TAU)});
    }
    else if (t==='LWPOLYLINE'){
      const v = lwVerts(r);
      if (v.length<2){ continue; }
      push({k:'poly', layer, closed:!!(g(r,70,0)&1),
            pts:v.map(p=>({...xfPt(m,p), bulge:p.bulge * (xfDet(m)<0 ? -1 : 1)}))});
    }
    else if (t==='POLYLINE'){
      const flag = g(r,70,0);
      const v = [];
      let j = i+1;
      for (; j<recs.length && recs[j].t!=='SEQEND'; j++){
        if (recs[j].t!=='VERTEX') continue;
        const q = P(recs[j],10,20);
        v.push({...xfPt(m,q), bulge:g(recs[j],42,0) * (xfDet(m)<0 ? -1 : 1)});
      }
      i = j;                                        // consume VERTEX…SEQEND
      if (flag & (16|64)){ report.skip('POLYLINE mesh'); continue; }
      if (v.length>=2) push({k:'poly', layer, pts:v, closed:!!(flag&1)});
    }
    else if (t==='TEXT' || t==='ATTRIB'){
      const s = g(r,1,'');
      if (!s) continue;
      const aligned = (g(r,72,0)||g(r,73,0)) && r.p.some(([c])=>c===11);
      push({k:'text', layer, p:xfPt(m, P(r, aligned?11:10, aligned?21:20)),
            h:g(r,40,2.5)*xfScale(m), s, rot:D2R(g(r,50,0)) + xfRot(m)});
    }
    else if (t==='MTEXT'){
      const raw = ga(r,3).join('') + g(r,1,'');
      const h = g(r,40,2.5)*xfScale(m);
      const rot = r.p.some(([c])=>c===11) ? Math.atan2(g(r,21,0), g(r,11,1)) : D2R(g(r,50,0));
      const at = g(r,71,1);                         // 1..3 top, 4..6 middle, 7..9 bottom
      const lines = mtextLines(raw, wrapCharsFor(g(r,41,0), g(r,40,2.5)));
      const p0 = xfPt(m, P(r,10,20));
      const dy = h*1.6, ang = rot + xfRot(m);
      const row = at<=3 ? 1 : at<=6 ? 0.5*(lines.length-1)+1 : lines.length;
      lines.forEach((s,n)=>{
        if (!s) return;
        const d = (row-1-n)*dy;                     // first line sits at the top
        push({k:'text', layer, h, s, rot:ang,
              p:{x:p0.x - Math.sin(ang)*d, y:p0.y + Math.cos(ang)*d}});
      });
    }
    else if (t==='DIMENSION'){
      const type = g(r,70,0) & 7;
      const kind = (type===0 || type===1) ? 'aligned' : 'other';
      push({k:'dim', layer, kind,
            p1:xfPt(m, P(r,13,23)), p2:xfPt(m, P(r,14,24)), dp:xfPt(m, P(r,10,20))});
    }
    else if (t==='SPLINE'){
      const xs = ga(r,10), ys = ga(r,20), ws = ga(r,41);
      const fx = ga(r,11), fy = ga(r,21);
      const ctrl = xs.map((x,n)=>({...xfPt(m,{x, y:ys[n]??0}), w:ws[n] ?? 1}));
      const fit  = fx.map((x,n)=>xfPt(m,{x, y:fy[n]??0}));
      if (!ctrl.length && !fit.length) continue;
      push({k:'spline', layer, ctrl, fit, knots:ga(r,40), deg:g(r,71,3), closed:!!(g(r,70,0)&1)});
    }
    else if (t==='POINT'){
      push({k:'point', layer, p:xfPt(m, P(r,10,20))});
    }
    else if (t==='SOLID' || t==='TRACE' || t==='3DFACE'){
      const q = [P(r,10,20), P(r,11,21), P(r,13,23), P(r,12,22)];   // DXF corner order is 1,2,4,3
      push({k:'solid', layer, pts:q.map(p=>xfPt(m,p))});
    }
    else if (t==='LEADER'){
      const xs = ga(r,10), ys = ga(r,20);
      if (xs.length>=2) push({k:'poly', layer, closed:false,
                              pts:xs.map((x,n)=>({...xfPt(m,{x, y:ys[n]??0}), bulge:0}))});
    }
    else if (t==='HATCH'){
      const loops = hatchLoops(r);
      if (!loops.length){ report.skip('HATCH'); continue; }
      // Tag every shape of this hatch with one id + its pattern name, so the
      // mapper can tell "one closed loop I can actually fill" from an outline salad.
      const hatchId = ++report.hatch;
      const pattern = g(r, 2, '');
      const solid   = g(r, 70, 0) === 1;
      const tag = s => { if (s){ Object.assign(s, {hatchId, pattern, solid, frozen:true}); push(s); } };
      for (const lp of loops){
        if (lp.poly){
          tag({k:'poly', layer, closed:true,
               pts:lp.poly.map(q=>({...xfPt(m,q), bulge:q.bulge * (xfDet(m)<0 ? -1 : 1)}))});
          continue;
        }
        for (const {type, f} of lp.edges){
          if (type===1){
            tag({k:'line', layer,
                 a:xfPt(m,{x:f[10]||0, y:f[20]||0}), b:xfPt(m,{x:f[11]||0, y:f[21]||0})});
          }
          else if (type===2){
            let a0 = D2R(f[50]||0), a1 = D2R(f[51]||0);
            if (f[73]===0) [a0,a1] = [a1,a0];          // edge runs clockwise
            tag(arcShape(layer, {x:f[10]||0, y:f[20]||0}, f[40]||0, a0, a1, m));
          }
          else if (type===3){
            let t0 = D2R(f[50]||0), t1 = D2R(f[51]||0);
            if (f[73]===0) [t0,t1] = [t1,t0];
            const maj = {x:f[11]||0, y:f[21]||0};
            tag({k:'ellipse', layer, c:xfPt(m,{x:f[10]||0, y:f[20]||0}),
                 maj:{x:m[0]*maj.x + m[2]*maj.y, y:m[1]*maj.x + m[3]*maj.y},
                 ratio:f[40] ?? 1, t0, t1});
          }
          else if (type===4){
            tag({k:'spline', layer, deg:f.deg, knots:f.knots, closed:false,
                 ctrl:f.ctrl.map(q=>({...xfPt(m,q), w:q.w})),
                 fit:f.fit.map(q=>xfPt(m,q))});
          }
        }
      }
    }
    else if (t==='INSERT'){
      const name = g(r,2,'');
      const blk = blocks[name];
      if (!blk){ report.skip(`INSERT ${name}`); continue; }
      if (depth>=8){ report.skip('INSERT (nested too deep)'); continue; }
      const sx = g(r,41,1) || 1, sy = g(r,42,1) || 1, rot = D2R(g(r,50,0));
      const cols = Math.max(1, g(r,70,1)|0), rows = Math.max(1, g(r,71,1)|0);
      const cs = g(r,44,0), rs = g(r,45,0);
      const ins = P(r,10,20);
      const co = Math.cos(rot), si = Math.sin(rot);
      for (let cx=0; cx<cols; cx++) for (let ry=0; ry<rows; ry++){
        const ox = ins.x + cx*cs, oy = ins.y + ry*rs;
        // local → block-base-relative → scale → rotate → insert point, then the parent matrix
        const local = xfMul([co,si,-si,co,ox,oy], [sx,0,0,sy, -blk.base.x*sx, -blk.base.y*sy]);
        toShapes(blk.recs, blocks, xfMul(m, local), depth+1, out, report);
      }
    }
    else if (!SILENT.has(t)) report.skip(t);
  }
}

/* MTEXT inline formatting: keep the text, drop the codes.
   `wrapChars` (optional) word-wraps to the MTEXT's reference rectangle — the
   box the author sized in CAD. Without it a long legend entry runs straight
   out of its table cell and across the drawing. */
export function mtextLines(raw, wrapChars = 0){
  let s = raw.replace(/\\P/g, '\n').replace(/\\~/g, ' ');
  s = s.replace(/\\S([^;]*);/g, (_,f)=>f.replace('^',' ').replace('/',' '));  // stacked fractions
  s = s.replace(/\\[A-Za-z][^\\;]*;/g, '');        // \fArial|b0;  \H2.5x;  \C1;  …
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\\\/g, '\\');
  const lines = s.split('\n').map(l=>l.trim());
  if (!(wrapChars >= 2)) return lines;
  return lines.flatMap(l => wrapWords(l, Math.floor(wrapChars)));
}

// greedy word wrap; a word longer than the box is hard-split rather than
// allowed to overflow (part numbers and codes do get that long)
function wrapWords(line, n){
  if (line.length <= n) return [line];
  const out = [];
  let cur = '';
  for (let word of line.split(/\s+/)){
    while (word.length > n){
      if (cur){ out.push(cur); cur = ''; }
      out.push(word.slice(0, n));
      word = word.slice(n);
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= n) cur += ' ' + word;
    else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

// characters that fit across a reference rectangle, at MiniCAD's 0.62 em advance
export const wrapCharsFor = (width, height) =>
  (width > 0 && height > 0) ? width / (height * 0.62) : 0;

/* ---------- header units ---------- */
/* ---------- $INSUNITS → MiniCAD's unit label ----------
   We NEVER rescale coordinates. A drawing's own numbers are its truth: an
   architect's 3.497 must stay 3.497, and `units` only says what "1" means.
   Rescaling on the strength of this header is actively dangerous — real files
   carry a bogus INSUNITS=1 (inches) from a template, and a real 40x60 m house
   plan came through 25.4x too big before this was fixed.
   Only the three units MiniCAD actually has are mapped; anything else leaves
   the user's current unit alone and is reported. */
const INSUNITS = {4:'mm', 5:'cm', 6:'m'};
// what the other common codes mean, so we can say so in plain language
const UNIT_NAME = {1:'inches', 2:'feet', 3:'miles', 7:'kilometres', 10:'yards',
                   14:'decimetres', 15:'decametres', 16:'hectometres'};


export function parseDXF(text){
  if (/^\s*AutoCAD Binary DXF/.test(text))
    throw new DxfError('That is a binary DXF. Re-save it as an ASCII/R12 DXF and try again.');
  const p = pairs(text);
  if (!p.length) throw new DxfError('That file has no DXF data in it.');

  const report = {
    skipped: {},
    hatch: 0,
    skip(t){ this.skipped[t] = (this.skipped[t]||0) + 1; },
  };

  // section boundaries
  const sec = {};
  for (let i=0; i<p.length; i++){
    if (p[i][0]===0 && p[i][1]==='SECTION' && p[i+1] && p[i+1][0]===2){
      const name = p[i+1][1];
      let j = i+2;
      while (j<p.length && !(p[j][0]===0 && p[j][1]==='ENDSEC')) j++;
      sec[name] = [i+2, j];
      i = j;
    }
  }
  if (!sec.ENTITIES) throw new DxfError('That DXF has no drawing entities in it.');

  // HEADER variables
  const header = {};
  if (sec.HEADER){
    for (let i=sec.HEADER[0]; i<sec.HEADER[1]; i++){
      if (p[i][0]===9 && p[i+1]) header[p[i][1]] = p[i+1][1];
    }
  }

  // LAYER table
  const layers = [];
  if (sec.TABLES){
    let inLayerTable = false;
    for (const r of records(p, sec.TABLES[0], sec.TABLES[1])){
      if (r.t==='TABLE'){ inLayerTable = g(r,2,'')==='LAYER'; continue; }
      if (r.t==='ENDTAB'){ inLayerTable = false; continue; }
      if (!inLayerTable || r.t!=='LAYER') continue;
      const name = g(r,2,''); if (!name) continue;
      const ci = g(r,62,7), flags = g(r,70,0), tc = g(r,420,null);
      const lw = lwFromHundredths(g(r,370,-3));
      layers.push({
        name,
        ...(lw ? {lw} : {}),
        color: tc!==null ? '#'+((tc|0)&0xffffff).toString(16).padStart(6,'0') : aciColor(Math.abs(ci)),
        off: ci<0 || !!(flags&1),
        locked: !!(flags&4),
      });
    }
  }

  // BLOCK definitions
  const blocks = {};
  const missingRefs = [];
  if (sec.BLOCKS){
    const recs = records(p, sec.BLOCKS[0], sec.BLOCKS[1]);
    for (let i=0; i<recs.length; i++){
      if (recs[i].t!=='BLOCK') continue;
      const name = g(recs[i],2,'');
      const base = P(recs[i],10,20);
      const body = [];
      let j = i+1;
      for (; j<recs.length && recs[j].t!=='ENDBLK'; j++) body.push(recs[j]);
      if (name && !/^\*(MODEL|PAPER)_SPACE/i.test(name)){
        blocks[name] = {base, recs:body};
        // flag bit 4 = external reference; empty means it was never resolved
        if ((g(recs[i],70,0) & 4) && !body.length) missingRefs.push(name);
      }
      i = j;
    }
  }

  const code = parseInt(header.$INSUNITS, 10);
  const shapes = [];
  toShapes(records(p, sec.ENTITIES[0], sec.ENTITIES[1]), blocks, [1,0,0,1,0,0], 0, shapes, report);

  return {
    shapes, layers, missingRefs,
    units: INSUNITS[code] || null,
    foreignUnit: (!INSUNITS[code] && UNIT_NAME[code]) || null,
    skipped: report.skipped,
    hatch: report.hatch,
  };
}
