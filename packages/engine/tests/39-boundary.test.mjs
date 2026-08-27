/* BOUNDARY (BO/BPOLY): trace the loop enclosing a picked point out of loose
   linework — split at crossings, stubs pruned, leftmost-turn walk — and drop
   a closed polyline on it. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const G = await import('../js/core/geometry.js');
const B = await import('../js/core/boundary.js');

S.T.osnap=false; S.T.ortho=false; S.T.snap=false;
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};
const line=(x1,y1,x2,y2)=>{ const e={id:S.nextId(), type:'line', x1,y1,x2,y2, layer:'0'};
  S.entities.push(e); return e; };
const plines=()=>S.entities.filter(e=>e.type==='pline');

/* ===== tracer: four loose lines forming a square (the classic use) ===== */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,0);
let r = B.traceBoundary({x:5,y:5}, S.entities);
check('four loose lines trace to a loop', !r.err && r.pts && r.pts.length===4);
check('loop area is the square', near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, 100));
check('loop is CCW and contains the pick',
      G.pointInPoly({x:5,y:5}, G.tessellateBoundary({type:'pline',closed:true,pts:r.pts})));

/* pick OUTSIDE the square: the walk finds the outside world and refuses */
r = B.traceBoundary({x:50,y:50}, S.entities);
check('outside point refused with a human message', !!r.err && /enclos|closed outline/i.test(r.err));

/* ===== crossing lines: a # shape — stubs pruned, center cell traced ===== */
reset();
line(-5,2,15,2); line(-5,8,15,8); line(2,-5,2,15); line(8,-5,8,15);
r = B.traceBoundary({x:5,y:5}, S.entities);
check('# center cell traces despite overshooting ends', !r.err && r.pts.length===4);
check('# center cell is 6×6', near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, 36));

/* ===== two overlapping rectangles: pick in the overlap ===== */
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:true, layer:'0',
  pts:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:0,y:10}]});
S.entities.push({id:S.nextId(), type:'pline', closed:true, layer:'0',
  pts:[{x:15,y:5},{x:30,y:5},{x:30,y:20},{x:15,y:20}]});
r = B.traceBoundary({x:17,y:7}, S.entities);
check('overlap region of two rectangles', !r.err && near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, 25));
r = B.traceBoundary({x:5,y:5}, S.entities);
check('rest of the first rectangle (L-shape) measures rect minus overlap',
      !r.err && near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, 200-25));

/* ===== circles: alone, and crossing a rectangle ===== */
reset();
S.entities.push({id:S.nextId(), type:'circle', cx:0, cy:0, r:5, layer:'0'});
r = B.traceBoundary({x:1,y:1}, S.entities);
check('inside a lone circle → circular loop, right area',
      !r.err && near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, Math.PI*25, 1e-3));
check('circular loop is all bulges', r.pts.every(q=>q.bulge));

reset();
// unit-ish test: circle at (10,5) r=4 crossing the right edge of a 0..12 rect
S.entities.push({id:S.nextId(), type:'pline', closed:true, layer:'0',
  pts:[{x:0,y:0},{x:12,y:0},{x:12,y:10},{x:0,y:10}]});
S.entities.push({id:S.nextId(), type:'circle', cx:12, cy:5, r:3, layer:'0'});
r = B.traceBoundary({x:13,y:5}, S.entities);   // inside the circle, outside the rect
check('region bounded part by circle, part by rect edge', !r.err &&
      r.pts.some(q=>q.bulge) && r.pts.some(q=>!q.bulge));
// half-disc outside the rectangle: πr²/2
check('mixed region area = half disc', near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, Math.PI*9/2, 1e-3));

/* ===== a gap in the outline refuses politely ===== */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,2);  // 2-unit gap
r = B.traceBoundary({x:5,y:5}, S.entities);
check('gappy outline refused', !!r.err);

/* ===== the command itself ===== */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,0);
C.startCommand('BO');
check('BO starts BOUNDARY at the pick step', S.cmd && S.cmd.name==='BOUNDARY' && S.cmd.step==='pick');
C.onPoint({x:5,y:5});
check('pick creates a closed pline', plines().length===1 && plines()[0].closed);
check('creation logs vertices + area', dom.logs.some(l=>l.includes('Boundary traced') && l.includes('100')));
C.onPoint({x:5,y:5});
check('picking again duplicates (like AutoCAD)', plines().length===2);
C.handleEnter('');
check('Enter ends the command', S.cmd===null);
C.startCommand('U');
C.startCommand('U');
check('each boundary is one undo step', plines().length===0);

/* the traced pline is real geometry: HATCH accepts it */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,0);
C.startCommand('BPOLY');
C.onPoint({x:5,y:5});
C.handleEnter('');
C.startCommand('H');
C.chooseHatchMaterial('concrete');
C.onPoint({x:5,y:5});
check('hatching the traced boundary works',
      S.entities.some(e=>e.type==='hatch' && e.ref===plines()[0].id));
C.cancelCmd(true);

/* ===== HATCH pick-points fallback: loose lines → traced outline + hatch ===== */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,0);
C.startCommand('H');
C.chooseHatchMaterial('concrete');
C.onPoint({x:5,y:5});
const tracedPl = plines()[0];
check('HATCH on loose lines traces the outline and fills it',
      !!tracedPl && tracedPl.closed &&
      S.entities.some(e=>e.type==='hatch' && e.ref===tracedPl.id && e.mat==='concrete'));
check('the trace is announced', dom.logs.some(l=>l.includes('traced for you')));
C.handleEnter('');
C.startCommand('U');
check('traced outline + hatch undo as ONE step', plines().length===0 &&
      !S.entities.some(e=>e.type==='hatch') && S.entities.length===4);

/* AREA fallback: measures the enclosed region, creates nothing */
C.startCommand('AA');
C.onPoint({x:5,y:5});
check('AREA measures loose-line region without creating anything',
      dom.logs.some(l=>l.includes('Enclosed region') && l.includes('100')) &&
      plines().length===0 && S.entities.length===4);
C.handleEnter('');

/* hidden layers don't take part */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10);
const gate = line(0,10,0,0); gate.layer='walls';
S.setLayers(S.layers.map(l=>l.name==='walls' ? {...l, off:true} : l));
C.startCommand('BOUNDARY');
C.onPoint({x:5,y:5});
check('a hidden closing edge means not enclosed', plines().length===0 &&
      dom.logs.some(l=>/enclos|closed outline/i.test(l)));
S.setLayers(S.layers.map(l=>({name:l.name, color:l.color})));
C.cancelCmd(true);

/* a hair-thin arc sliver (two cuts almost coinciding on a big drawing) must
   refuse politely, not crash — bulgeArc collapses to null on it */
reset();
S.entities.push({id:S.nextId(), type:'arc', cx:0, cy:0, r:1, a0:0, a1:Math.PI, layer:'0'});
line(0,-2,0,2); line(1.2e-4,-2,1.2e-4,2); line(100,0,100,1);   // last line blows the extent → coarse tol
r = (()=>{ try { return B.traceBoundary({x:0.5,y:0.5}, S.entities); } catch(e){ return {crash:e.message}; } })();
check('degenerate arc sliver never throws', !r.crash && !!r.err);

/* scale: thousands of scattered parts stay interactive (grid-bucketed pairs) */
reset();
for (let i=0;i<3000;i++){ const x=(i*97)%5000, y=(i*61)%5000;
  line(x, y, x+((i%7)-3)*8, y+((i%5)-2)*8); }
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,0);
const t0 = Date.now();
r = B.traceBoundary({x:5,y:5}, S.entities);
check('3000-part drawing traces correctly', !r.err && r.pts.length===4);
check('…and fast enough for a click handler', Date.now()-t0 < 2000);

/* a block insert fences like the geometry it stands for */
reset();
S.setBlocks({ gate: { base:{x:0,y:0}, ents:[{id:1, type:'line', layer:'0', x1:0,y1:10,x2:0,y2:0}] }});
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10);
S.entities.push({id:S.nextId(), type:'insert', name:'gate', x:0, y:0, layer:'0'});   // the 4th wall
r = B.traceBoundary({x:5,y:5}, S.entities);
check('a block closes the loop for the tracer', !r.err &&
      near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, 100));

/* text/dims never fence a region in */
reset();
line(0,0,10,0); line(10,0,10,10); line(10,10,0,10); line(0,10,0,0);
S.entities.push({id:S.nextId(), type:'text', x:2, y:4, h:2, str:'sala', layer:'0'});
r = B.traceBoundary({x:5,y:5}, S.entities);
check('text inside is ignored by the tracer', !r.err && near(G.plineArea({type:'pline',closed:true,pts:r.pts}).area, 100));

finish();
