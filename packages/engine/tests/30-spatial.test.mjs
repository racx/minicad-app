/* Spatial index: correctness first, speed second.
   A hit-test that is fast and wrong is worse than one that is slow and right,
   so most of this suite checks that the index never changes an ANSWER. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S  = await import('../js/core/state.js');
const C  = await import('../js/core/commands.js');
const E  = await import('../js/core/entities.js');
const SP = await import('../js/core/spatial.js');

S.T.osnap=false; S.T.ortho=false;
const line=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};

/* ===== the index must agree with a brute-force scan ===== */
S.setEntities([]); S.setIdSeq(1);
const grid=[];
for (let i=0;i<40;i++) for (let j=0;j<10;j++) grid.push(line(i*10, j*10, i*10+6, j*10));
S.view.scale = 4;

const brute = p => {
  const tol = 8/S.view.scale;
  let best=null, bd=tol;
  for (const e of S.entities){
    if (!S.layerVisible(e.layer) || !S.layerUnlocked(e.layer) || e.frozen) continue;
    const d = E.entHitDist(e,p); if (d<=bd){ bd=d; best=e; }
  }
  return best;
};
let agree = 0, tested = 0;
for (let i=0;i<200;i++){
  const p = {x:(i*7)%400, y:(i*13)%100};
  tested++;
  const a = E.findEntityAt(p), b = brute(p);
  if ((a&&a.id) === (b&&b.id)) agree++;
}
check(`indexed hit-test agrees with brute force on every probe (${agree}/${tested})`, agree===tested);

/* ===== queries are a superset of the truth, never a subset ===== */
const rect = [15, 15, 65, 45];
const q = SP.query(...rect).map(e=>e.id).sort((a,b)=>a-b);
const truth = S.entities.filter(e=>{
  const b = E.entBBox(e);
  return !(b[2]<rect[0]||b[0]>rect[2]||b[3]<rect[1]||b[1]>rect[3]);
}).map(e=>e.id).sort((a,b)=>a-b);
check('query returns every entity that really overlaps', truth.every(id=>q.includes(id)));
check('…and does not run away with extras', q.length <= truth.length + 4);

/* ===== it must notice change ===== */
const far = line(9000, 9000, 9006, 9000);
check('a new entity is found immediately', E.findEntityAt({x:9003, y:9000})?.id===far.id);

S.selection.clear(); S.selection.add(far.id);
// move it into genuinely empty space, so nothing else can answer the probe
E.translateEnt(far, -9500, -9500);             // in-place, no snapshot: index is stale
check('an entity moved mid-drag is still found (selection is always included)',
      E.findEntityAt({x:-497, y:-500})?.id===far.id);
S.selection.clear();
S.bumpGeom();
check('…and after the epoch bumps too', E.findEntityAt({x:-497, y:-500})?.id===far.id);
check('…and is gone from where it used to be', E.findEntityAt({x:9003, y:9000})===null);

S.selection.clear(); S.selection.add(far.id);
C.startCommand('E');                             // preselected ERASE removes it outright
check('a deleted entity stops being found', E.findEntityAt({x:-497, y:-500})===null);

/* ===== degenerate inputs ===== */
S.setEntities([]);
check('empty drawing queries cleanly', SP.query(-1,-1,1,1).length===0 && E.findEntityAt({x:0,y:0})===null);
S.setEntities([]); S.setIdSeq(1);
line(0,0,1,0);
check('a one-entity drawing still works', E.findEntityAt({x:0.5, y:0})!==null);

/* ===== snapCandidates honours its bounds ===== */
S.setEntities([]); S.setIdSeq(1);
line(0,0,10,0); line(500,500,510,500);
const all = E.snapCandidates();
const near = E.snapCandidates(null, [-1,-1,11,1]);
check('unbounded still returns everything', all.length > near.length);
check('bounded drops the far-away entity',
      near.every(c=>c.p.x < 100) && near.length > 0);

/* ===== speed: the reason this exists ===== */
S.setEntities([]); S.setIdSeq(1);
for (let i=0;i<60;i++) for (let j=0;j<60;j++) line(i*5, j*5, i*5+3, j*5);
const n = S.entities.length;
E.findEntityAt({x:0,y:0});                                   // pay the build once
const t0 = Number(process.hrtime.bigint());
for (let i=0;i<300;i++) E.findEntityAt({x:(i*11)%300, y:(i*7)%300});
const per = (Number(process.hrtime.bigint())-t0)/1e6/300;
check(`hit-test stays sub-millisecond at ${n} entities (${per.toFixed(3)} ms)`, per < 1);

finish();
