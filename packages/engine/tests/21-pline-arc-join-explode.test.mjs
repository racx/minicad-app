/* Arc segments in polylines (bulge vertices), PLINE A/L modes, JOIN, EXPLODE. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const G = await import('../js/core/geometry.js');
const E = await import('../js/core/entities.js');
const X = await import('../js/core/intersect.js');
const IO = await import('../js/adapters/dom/io.js');

S.T.osnap=false; S.T.ortho=false; S.T.snap=false;
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};
const last=()=>S.entities[S.entities.length-1];

/* ===== bulge math ===== */
let apex = G.bulgeApex({x:0,y:0},{x:10,y:0},1);
check('bulge 1 (CCW semicircle) apex below the +x chord', near(apex.x,5)&&near(apex.y,-5));
let A = G.bulgeArc({x:0,y:0},{x:10,y:0},1);
check('bulgeArc semicircle: center on chord, r=5', near(A.cx,5)&&near(A.cy,0)&&near(A.r,5));
check('bulgeFromApex inverts bulgeApex', near(G.bulgeFromApex({x:0,y:0},{x:10,y:0},apex),1));
let t0 = G.tangentBulge({x:0,y:0},{x:0,y:-1},{x:10,y:0});
check('tangentBulge: down-tangent to (10,0) = semicircle bulge 1', near(t0,1));
let te = G.bulgeEndTangent({x:0,y:0},{x:10,y:0},1);
check('end tangent of that semicircle points up', near(te.x,0,1e-9)&&near(te.y,1,1e-9));
check('bulgeFrom3 quarter arc: tan(22.5°)',
      near(G.bulgeFrom3({x:0,y:0},{x:5,y:-2.0710678},{x:10,y:0}), Math.tan(Math.PI/8), 1e-6));

/* ===== PLINE arc mode: tangent continuation ===== */
reset();
C.startCommand('PL');
C.handleEnter('0,10');
C.handleEnter('0,0');            // straight down: tangent (0,-1)
C.handleEnter('A');              // switch to arc mode
C.handleEnter('10,0');           // tangent arc → semicircle, bulge 1
C.handleEnter('L');              // back to straight
C.handleEnter('20,0');
C.handleEnter('');               // finish
let pl = last();
check('pline built: 4 points', pl.type==='pline' && pl.pts.length===4);
check('arc segment carries bulge 1 on its lead vertex', near(pl.pts[1].bulge,1,1e-9));
check('straight segments carry no bulge', !pl.pts[0].bulge && !pl.pts[2].bulge);

/* ===== PLINE arc as FIRST segment: 3-point flow ===== */
reset();
C.startCommand('PL');
C.handleEnter('0,0');
C.handleEnter('A');              // no tangent yet → asks for a point ON the arc
C.handleEnter('5,-5');           // on-arc point
C.handleEnter('10,0');           // end point
C.handleEnter('');
pl = last();
check('first-segment arc via 3 points: bulge 1', pl.pts.length===2 && near(pl.pts[0].bulge,1,1e-6));

/* ===== geometry queries see the curve ===== */
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0,bulge:1},{x:10,y:0}]});   // semicircle through (5,-5)
const seg = S.entities[0];
check('hit distance ~0 at the arc apex', E.entHitDist(seg,{x:5,y:-5}) < 1e-6);
check('hit distance ~5 at the chord midpoint', near(E.entHitDist(seg,{x:5,y:0}), 5, 1e-6));
const bb = E.entBBox(seg);
check('bbox includes the bow (y down to −5)', near(bb[1],-5,1e-6) && near(bb[3],0,1e-6));
const mids = E.snapCandidates().filter(c=>c.k==='mid');
check('mid snap of the arc segment sits at the apex', mids.some(c=>near(c.p.x,5,1e-6)&&near(c.p.y,-5,1e-6)));
check('cen snap exposed for the arc segment', E.snapCandidates().some(c=>c.k==='cen'&&near(c.p.x,5)&&near(c.p.y,0)));
const hits = X.entIntersections(seg, {type:'line', x1:5, y1:5, x2:5, y2:-10});
check('vertical line intersects the bulged segment at the apex', hits.length===1 && near(hits[0].y,-5,1e-6));

/* ===== transforms ===== */
const m = S.entities[0];
E.mirrorEnt(m, {x:0,y:0}, {x:1,y:0});           // mirror across the x axis
check('mirror flips the bulge sign', near(m.pts[0].bulge,-1,1e-9));
E.mirrorEnt(m, {x:0,y:0}, {x:1,y:0});           // back
E.translateEnt(m, 3, 4);
check('move keeps the bulge', near(m.pts[0].bulge,1,1e-9) && near(m.pts[0].x,3));
E.translateEnt(m, -3, -4);

/* ===== apex grip reshapes the bulge ===== */
E.applyGrip(m, 'b0', {x:5, y:-2.5});             // drag apex halfway in
check('apex grip: bulge becomes 0.5', near(m.pts[0].bulge, 0.5, 1e-9));
E.applyGrip(m, 'b0', {x:5, y:-5});

/* ===== DXF export carries group 42 ===== */
{
  const box = dom.captureDownload();
  IO.dxfExport();
  check('DXF POLYLINE vertex exports bulge 42', /42\n1\n/.test(box.data.replace(/\r/g,'')));
}

/* ===== JOIN: line + arc + line chain into one pline ===== */
reset();
S.entities.push({id:S.nextId(), type:'line', x1:0, y1:10, x2:0, y2:0, layer:'0'});
S.entities.push({id:S.nextId(), type:'arc', cx:5, cy:0, r:5, a0:Math.PI, a1:0, layer:'0'}); // (0,0)→(10,0) CCW
S.entities.push({id:S.nextId(), type:'line', x1:10, y1:0, x2:10, y2:10, layer:'0'});
S.entities.forEach(e=>S.selection.add(e.id));
C.startCommand('J');
check('JOIN merged 3 into 1 pline', S.entities.length===1 && S.entities[0].type==='pline');
check('joined pline has 4 points, arc as bulge', S.entities[0].pts.length===4 &&
      near(Math.abs(S.entities[0].pts[1].bulge||0), 1, 1e-6));

/* ===== JOIN closes a loop ===== */
reset();
S.entities.push({id:S.nextId(), type:'line', x1:0, y1:0, x2:10, y2:0, layer:'0'});
S.entities.push({id:S.nextId(), type:'line', x1:10, y1:0, x2:10, y2:10, layer:'0'});
S.entities.push({id:S.nextId(), type:'line', x1:10, y1:10, x2:0, y2:0, layer:'0'});
S.entities.forEach(e=>S.selection.add(e.id));
C.startCommand('JOIN');
check('JOIN detects the closed loop', S.entities.length===1 && S.entities[0].closed===true &&
      S.entities[0].pts.length===3);

/* ===== JOIN refuses non-touching ===== */
reset();
S.entities.push({id:S.nextId(), type:'line', x1:0, y1:0, x2:10, y2:0, layer:'0'});
S.entities.push({id:S.nextId(), type:'line', x1:20, y1:0, x2:30, y2:0, layer:'0'});
S.entities.forEach(e=>S.selection.add(e.id));
C.startCommand('J');
check('JOIN leaves non-touching lines alone', S.entities.length===2 &&
      dom.logs.some(l=>l.includes('Nothing joined')));

/* ===== EXPLODE: curved pline → line + arc entities ===== */
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:10},{x:0,y:0,bulge:1},{x:10,y:0}]});
S.selection.add(S.entities[0].id);
C.startCommand('X');
check('EXPLODE yields 2 entities', S.entities.length===2);
check('one line + one arc', S.entities.some(e=>e.type==='line') && S.entities.some(e=>e.type==='arc'));
const xa = S.entities.find(e=>e.type==='arc');
check('exploded arc matches the bulge geometry', xa && near(xa.cx,5,1e-6)&&near(xa.cy,0,1e-6)&&near(xa.r,5,1e-6));

/* ===== EXPLODE a rectangle (closed pline) ===== */
reset();
C.startCommand('REC');
C.handleEnter('0,0');
C.handleEnter('20,10');
S.selection.add(last().id);
C.startCommand('EXPLODE');
check('rectangle explodes into 4 lines', S.entities.length===4 && S.entities.every(e=>e.type==='line'));

/* ===== PEDIT muscle memory lands on JOIN ===== */
reset();
S.entities.push({id:S.nextId(), type:'line', x1:0, y1:0, x2:10, y2:0, layer:'0'});
S.entities.push({id:S.nextId(), type:'line', x1:10, y1:0, x2:10, y2:10, layer:'0'});
S.entities.forEach(e=>S.selection.add(e.id));
C.startCommand('PEDIT');
check('PEDIT joins like JOIN', S.entities.length===1 && S.entities[0].type==='pline');

/* ===== curved plines refused by OFFSET with a way forward ===== */
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0,bulge:0.5},{x:10,y:0},{x:20,y:0}]});
C.startCommand('O');
C.handleEnter('2');
C.startCommand;  // no-op
const curvedTarget = S.entities[0];
// drive OFFSET pick via onPoint on top of the entity
C.onPoint({x:10, y:0});   // pick object
C.onPoint({x:10, y:5});   // pick side
check('OFFSET refuses curved pline and mentions EXPLODE',
      S.entities.length===1 && dom.logs.some(l=>l.includes('EXPLODE it, offset the pieces')));

finish();
