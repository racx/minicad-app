/* =========================================================
   MiniCAD — neutral CAD IR → MiniCAD document

   Backend-agnostic: dxf.js produces the IR today, a DWG reader can
   produce the same IR later and reuse everything below.

   Two outcomes per shape:
     • representable exactly  → native entity on its own layer, fully editable
     • only approximable      → tessellated onto the locked FROZEN layer,
                                visible and snappable but not editable
   ========================================================= */
import { TAU, normAng, dist, arcPt, bulgeArc } from './geometry.js';

/* Geometry we could only approximate is marked `frozen` ON THE ENTITY and
   KEEPS ITS OWN LAYER. An earlier version moved it all to one shared FROZEN
   layer, which quietly broke the most important tool an architect has: in a
   real house plan that swallowed 49% of the drawing — every object of
   "RED-Mobiliário hatch" and "EXCLUIR 13" among them — so switching those
   layers off hid nothing. Frozen is a property of the object, not a place. */
export const FROZEN_LAYER = 'FROZEN';   // kept only for older saved drawings

/* ---------- tessellation ---------- */
const steps = sweep => Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI/16)));

// Arc segment of a polyline, given the DXF bulge. Built on the engine's own
// bulgeArc so imported curves and drawn ones use one definition of "bulge".
// Returns the intermediate points, exclusive of p and q.
export function bulgePts(p, q, b){
  if (!b || Math.abs(b) < 1e-9) return [];
  const A = bulgeArc(p, q, b);
  if (!A) return [];
  const a0 = Math.atan2(p.y-A.cy, p.x-A.cx);
  const th = 4*Math.atan(b);                       // signed travel sweep
  const n = steps(th), out = [];
  for (let i=1; i<n; i++) out.push(arcPt(A, a0 + th*i/n));
  return out;
}

export function polyPts(pts, closed){
  const out = [];
  const n = pts.length;
  const last = closed ? n : n-1;
  for (let i=0; i<last; i++){
    const p = pts[i], q = pts[(i+1)%n];
    out.push({x:p.x, y:p.y});
    out.push(...bulgePts(p, q, p.bulge));
  }
  if (!closed) out.push({x:pts[n-1].x, y:pts[n-1].y});
  return out;
}

export function ellipsePts(s){
  const min = {x:-s.maj.y*s.ratio, y:s.maj.x*s.ratio};
  let t0 = s.t0, t1 = s.t1;
  let sweep = t1 - t0;
  if (sweep <= 1e-9) sweep += TAU;
  const n = steps(sweep), out = [];
  for (let i=0; i<=n; i++){
    const t = t0 + sweep*i/n;
    out.push({x:s.c.x + s.maj.x*Math.cos(t) + min.x*Math.sin(t),
              y:s.c.y + s.maj.y*Math.cos(t) + min.y*Math.sin(t)});
  }
  return {pts:out, closed:Math.abs(sweep - TAU) < 1e-6};
}

// de Boor evaluation of a (rational) B-spline
function deBoor(ctrl, knots, deg, u){
  const n = ctrl.length;
  let k = deg;
  while (k < n-1 && knots[k+1] <= u) k++;
  const d = [];
  for (let j=0; j<=deg; j++){
    const c = ctrl[k-deg+j] || ctrl[n-1];
    const w = c.w ?? 1;
    d.push({x:c.x*w, y:c.y*w, w});
  }
  for (let r=1; r<=deg; r++){
    for (let j=deg; j>=r; j--){
      const i = k-deg+j;
      const den = knots[i+deg-r+1] - knots[i];
      const a = den ? (u - knots[i])/den : 0;
      d[j] = {x:(1-a)*d[j-1].x + a*d[j].x,
              y:(1-a)*d[j-1].y + a*d[j].y,
              w:(1-a)*d[j-1].w + a*d[j].w};
    }
  }
  const p = d[deg];
  return {x:p.x/(p.w||1), y:p.y/(p.w||1)};
}

export function splinePts(s){
  const {ctrl, knots, deg} = s;
  const ok = ctrl.length > deg && knots.length === ctrl.length + deg + 1;
  if (!ok) return (s.fit && s.fit.length>=2) ? s.fit.map(p=>({x:p.x, y:p.y}))
                                             : ctrl.map(p=>({x:p.x, y:p.y}));
  const u0 = knots[deg], u1 = knots[ctrl.length];
  const n = Math.min(400, Math.max(24, ctrl.length*12));
  const out = [];
  try {
    for (let i=0; i<=n; i++) out.push(deBoor(ctrl, knots, deg, u0 + (u1-u0)*i/n));
  } catch { return ctrl.map(p=>({x:p.x, y:p.y})); }
  return out;
}

/* ---------- edge-path hatch boundaries ----------
   AutoCAD usually writes a hatch boundary as a *chain of separate edges*
   (line, arc, elliptic arc, spline) rather than one polyline. Those edges are
   emitted in file order, which is not necessarily travel order, and any edge
   may run backwards. Walking them into one closed loop is what lets a real
   architectural poché come in filled instead of as grey outlines. */

// polyline approximation of a single IR shape, in travel order
function shapeRun(s){
  if (s.k==='line')    return [{x:s.a.x, y:s.a.y}, {x:s.b.x, y:s.b.y}];
  if (s.k==='arc'){
    const sweep = normAng(s.a1 - s.a0) || TAU;
    const n = steps(sweep), out = [];
    for (let i=0; i<=n; i++) out.push(arcPt({cx:s.c.x, cy:s.c.y, r:s.r}, s.a0 + sweep*i/n));
    return out;
  }
  if (s.k==='ellipse') return ellipsePts(s).pts;
  if (s.k==='poly')    return polyPts(s.pts, s.closed);
  if (s.k==='spline')  return splinePts(s);
  return null;
}

// Chain runs head-to-tail into one closed loop, reversing edges as needed.
// Returns the loop's points (open — the closing segment is implicit), or null
// if the edges don't form exactly one closed ring.
export function chainLoop(runs){
  if (!runs.length || runs.some(r => !r || r.length < 2)) return null;

  let lo = Infinity, hi = -Infinity;
  for (const r of runs) for (const p of r){
    lo = Math.min(lo, p.x, p.y); hi = Math.max(hi, p.x, p.y);
  }
  const tol = Math.max((hi - lo) * 1e-6, 1e-9);
  const near = (a, b) => Math.abs(a.x-b.x) <= tol && Math.abs(a.y-b.y) <= tol;

  const used = runs.map(() => false);
  used[0] = true;
  const loop = runs[0].slice();

  for (let placed = 1; placed < runs.length; placed++){
    const tail = loop[loop.length-1];
    let hit = -1;
    for (let i=0; i<runs.length && hit<0; i++){
      if (used[i]) continue;
      const r = runs[i];
      if (near(tail, r[0]))               { loop.push(...r.slice(1)); hit = i; }
      else if (near(tail, r[r.length-1])) { loop.push(...r.slice(0,-1).reverse()); hit = i; }
    }
    if (hit < 0) return null;             // a gap: not one continuous ring
    used[hit] = true;
  }

  if (!near(loop[0], loop[loop.length-1])) return null;   // ring never closed
  loop.pop();                                             // closing segment is implicit
  return loop.length >= 3 ? loop : null;
}

/* ---------- AutoCAD pattern name → one of our materials ----------
   Deliberately conservative: architects name patterns for the material, so the
   obvious ones map well and everything else falls back to concrete (the neutral
   grey) rather than guessing something colourful and wrong. */
const PATTERN_MAT = [
  // SOLID is a flat colour wash, not a hatch pattern. It is also the single
  // most common fill in a real drawing (1044 of 1121 in one house plan), so
  // mapping it to a line pattern blankets the whole sheet in diagonals.
  [/^SOLID\b|^SOLID,/i,                             'solid'],
  [/GRASS|GRAVEL|EARTH|SWAMP|AR-SAND|GARDEN|LAND/i, 'green'],
  [/BRICK|AR-B\d|AR-BRSTD|AR-BRELM|MASON|BLOCK/i,   'brick'],
  [/GLASS|AR-RSHKE|WINDOW/i,                        'glass'],
  [/WOOD|AR-PARQ|PLAST|TIMBER|DOLMIT/i,             'wood'],
  [/WATER|AR-HBONE|LIQUID/i,                        'water'],
  [/CONC|AR-CONC|ANSI3[123]|STEEL|NET|CROSS/i,      'concrete'],
];
export function materialFor(s){
  if (s.solid) return 'solid';                       // the flag beats the name
  const name = s.pattern || '';
  for (const [re, mat] of PATTERN_MAT) if (re.test(name)) return mat;
  return 'concrete';
}

/* ---------- IR → MiniCAD ---------- */
export function importDoc(doc){
  const entities = [];
  const seen = new Map();                          // layer name → layer object
  let id = 1;
  const report = {native:0, frozen:0, skipped:{...doc.skipped}, layers:0,
                  hatch:doc.hatch || 0, filled:0, foreignUnit:doc.foreignUnit || null,
                  missingRefs:doc.missingRefs || []};

  for (const l of doc.layers) if (!seen.has(l.name)) seen.set(l.name, {...l});

  const layerFor = name => {
    if (!seen.has(name)) seen.set(name, {name, color:'#e8e8e8'});
    return name;
  };

  const add = (e, frozen, src) => {
    e.id = id++;
    if (src && src.lw) e.lw = src.lw;              // author's own lineweight, in mm
    if (frozen) e.frozen = true;                   // non-editable, but keeps its layer
    entities.push(e);
    if (frozen) report.frozen++; else report.native++;
    return e;
  };
  // A shape can be exactly representable and still be frozen — a HATCH boundary
  // is perfectly good geometry the user must not be able to drag by accident.
  const place = s => layerFor(s.layer);
  const freezePoly = (pts, closed, layer) => {
    const p = dedupe(pts, closed);
    if (p.length < 2) return;
    add({type:'pline', layer:layerFor(layer), pts:p, closed:!!closed && p.length>2}, true);
  };

  // ---- hatches ----
  // This engine has a real filled `hatch` entity, so a DXF hatch made of ONE
  // closed loop becomes a genuine fill on an editable boundary. Multi-loop
  // hatches (islands) can't be expressed that way and stay frozen outlines.
  const byHatch = new Map();
  for (const s of doc.shapes) if (s.hatchId){
    if (!byHatch.has(s.hatchId)) byHatch.set(s.hatchId, []);
    byHatch.get(s.hatchId).push(s);
  }
  const fillable = new Map();                      // hatchId → the single shape to fill
  const chained  = new Map();                      // hatchId → {pts, seed, mat} assembled from edges
  const consumed = new Set();                      // edge shapes replaced by their assembled loop
  for (const [hid, group] of byHatch){
    const only = group.length===1 ? group[0] : null;
    if (only && only.k==='poly' && only.closed && only.pts.length>=3){
      fillable.set(hid, only);
      only.frozen = false;                         // it becomes ordinary editable geometry
      continue;
    }
    // several edges: walk them into one ring if we can
    const loop = chainLoop(group.map(shapeRun));
    if (!loop) continue;                           // islands / gaps stay frozen outlines
    chained.set(hid, {pts:loop, seed:group[0], mat:materialFor(group[0])});
    for (const s of group) consumed.add(s);
  }

  for (const s of doc.shapes){
    // this edge was absorbed into an assembled hatch ring — emit the ring once,
    // at the position of its first edge, and skip the rest
    if (consumed.has(s)){
      const plan = chained.get(s.hatchId);
      if (plan && plan.seed===s){
        const b = add({type:'pline', layer:layerFor(s.layer), pts:plan.pts, closed:true});
        add({type:'hatch', layer:b.layer, ref:b.id, mat:plan.mat});
        report.filled++;
      }
      continue;
    }

    if (s.k==='line'){
      if (dist(s.a, s.b) < 1e-12) continue;
      add({type:'line', layer:place(s), x1:s.a.x, y1:s.a.y, x2:s.b.x, y2:s.b.y}, s.frozen, s);
    }
    else if (s.k==='circle'){
      if (s.r <= 1e-12) continue;
      add({type:'circle', layer:place(s), cx:s.c.x, cy:s.c.y, r:s.r}, s.frozen, s);
    }
    else if (s.k==='arc'){
      if (s.r <= 1e-12) continue;
      add({type:'arc', layer:place(s), cx:s.c.x, cy:s.c.y, r:s.r,
           a0:normAng(s.a0), a1:normAng(s.a1)}, s.frozen, s);
    }
    else if (s.k==='poly'){
      const straight = s.pts.every(p=>!p.bulge);
      const pts = dedupe(straight ? s.pts.map(p=>({x:p.x, y:p.y})) : polyPts(s.pts, s.closed), s.closed);
      if (pts.length < 2) continue;
      const fill = s.hatchId && fillable.get(s.hatchId)===s;
      if (straight || fill){
        // a fillable hatch boundary keeps its curves tessellated but stays editable
        const b = add({type:'pline', layer:place(s), pts, closed:!!s.closed && pts.length>2}, s.frozen, s);
        if (fill && b.closed){
          add({type:'hatch', layer:b.layer, ref:b.id, mat:materialFor(s)});
          report.filled++;
        }
      }
      else freezePoly(pts, s.closed, s.layer);
    }
    else if (s.k==='text'){
      const e = {type:'text', layer:place(s), x:s.p.x, y:s.p.y, h:s.h || 2.5, str:s.s};
      const rot = normAng(s.rot || 0);
      if (rot > 1e-9 && Math.abs(rot - TAU) > 1e-9) e.rot = rot;
      add(e, s.frozen);
    }
    else if (s.k==='dim'){
      const L = dist(s.p1, s.p2);
      if (s.kind!=='aligned' || L < 1e-9){ bumpSkip(report, 'DIMENSION (rotated/angular)'); continue; }
      const dx = s.p2.x-s.p1.x, dy = s.p2.y-s.p1.y;
      const off = ((s.dp.x-s.p1.x)*(-dy) + (s.dp.y-s.p1.y)*dx)/L;
      add({type:'dim', layer:layerFor(s.layer), x1:s.p1.x, y1:s.p1.y, x2:s.p2.x, y2:s.p2.y, off});
    }
    else if (s.k==='ellipse'){
      const e = ellipsePts(s);
      freezePoly(e.pts, e.closed, s.layer);
    }
    else if (s.k==='spline'){
      freezePoly(splinePts(s), s.closed, s.layer);
    }
    else if (s.k==='solid'){
      freezePoly(s.pts, true, s.layer);
    }
    // POINT: no MiniCAD equivalent and nothing visible to lose — most are
    // AutoCAD's invisible dimension "Defpoints". Dropped without a fuss.
  }

  const layers = [...seen.values()];
  const used = new Set(entities.map(e=>e.layer));

  // A file whose every drawn-on layer is off opens as a blank canvas, which
  // reads as "the importer is broken". Show it and say so instead.
  const drawn = layers.filter(l=>used.has(l.name));
  if (drawn.length && drawn.every(l=>l.off)){
    for (const l of drawn) l.off = false;
    report.turnedOn = true;
  }

  // always leave somewhere to draw: a file of nothing but frozen/locked layers
  // would otherwise strand the user on a layer they cannot draw on
  if (!layers.some(l=>!l.locked && !l.off)){
    const zero = layers.find(l=>l.name==='0');
    if (zero){ zero.off = false; zero.locked = false; }
    else layers.unshift({name:'0', color:'#e8e8e8'});
  }
  report.layers = layers.length;
  return {entities, layers, units:doc.units, idSeq:id, report};
}

function bumpSkip(report, t){ report.skipped[t] = (report.skipped[t]||0) + 1; }

// Drop consecutive duplicates — tessellation and sloppy files both produce them.
// On a closed shape the repeated first point is the closing segment MiniCAD
// draws itself, so it goes too.
function dedupe(pts, closed){
  const out = [];
  for (const p of pts){
    const q = out[out.length-1];
    if (!q || Math.abs(q.x-p.x) > 1e-9 || Math.abs(q.y-p.y) > 1e-9) out.push({x:p.x, y:p.y});
  }
  const a = out[0], b = out[out.length-1];
  if (closed && out.length > 2 && Math.abs(a.x-b.x) < 1e-9 && Math.abs(a.y-b.y) < 1e-9) out.pop();
  return out;
}

/* ---------- human-readable summary ---------- */
export function reportLines(r, name){
  const out = [`Opened ${name} — ${r.native + r.frozen} objects on ${r.layers} layers.`];
  // First, because it explains why the drawing looks empty: a CAD file can be
  // just the annotation sheet, with the building itself in a separate file.
  if (r.missingRefs && r.missingRefs.length){
    const names = r.missingRefs.map(n=>`"${n}"`).join(', ');
    out.push(`⚠ This looks like only the annotation layer — the walls and furniture live in ` +
             `${r.missingRefs.length>1?'other files':'another file'} (${names}) that wasn't included. ` +
             `Ask whoever sent it to "bind" the references, or to send those files too.`);
  }
  if (r.frozen)
    out.push(`${r.frozen} curved/complex objects came in as approximations — they stay on their own layers and you can see, hide and snap to them, ` +
             `but clicks pass through so you can't nudge them by accident. Type THAW to make them editable.`);
  if (r.foreignUnit)
    out.push(`That file says it is drawn in ${r.foreignUnit}, which MiniCAD doesn't have — ` +
             `the numbers were kept exactly as they are. Type UNITS to say what 1 unit means.`)
  if (r.turnedOn)
    out.push('Every layer in that file was switched off — turned them back on so you can see the drawing.');
  if (r.filled)
    out.push(`${r.filled} hatched area${r.filled>1?'s':''} came in filled — the material is a best guess from the drawing, ` +
             `so type HATCH on one to change it.`);
  const outlined = (r.hatch||0) - (r.filled||0);
  if (outlined > 0)
    out.push(`${outlined} more hatched area${outlined>1?'s were':' was'} too complex to fill (shapes with holes), ` +
             `so only the outline came through.`);
  const skipped = Object.entries(r.skipped).sort((a,b)=>b[1]-a[1]);
  if (skipped.length){
    const total = skipped.reduce((n,[,c])=>n+c, 0);
    const top = skipped.slice(0,4).map(([t,c])=>`${c}× ${t}`).join(', ');
    out.push(`${total} object${total>1?'s':''} could not be read: ${top}${skipped.length>4?', …':''}.`);
  }
  return out;
}
