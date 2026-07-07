/* TAN + NEA osnap, and SNAP_PRIORITY ordering semantics. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const X = await import('../js/core/intersect.js');

S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();};

/* ===== SNAP_PRIORITY ranks every kind; SNAP_ACTIVE gates them; nea inactive by default ===== */
check('SNAP_PRIORITY ranks 9 kinds, nea last',
      Array.isArray(C.SNAP_PRIORITY) && C.SNAP_PRIORITY.length===9 &&
      C.SNAP_PRIORITY[8]==='nea' &&
      ['end','int','mid','cen','quad','perp','tan','xint'].every(k=>C.SNAP_PRIORITY.includes(k)));
check('SNAP_ACTIVE default: 8 kinds on, nea off',
      C.SNAP_ACTIVE.size===8 && !C.SNAP_ACTIVE.has('nea'));

/* ===== tangentPts math ===== */
let ts = X.tangentPts({x:100,y:0}, {type:'circle', cx:0, cy:0, r:50});
check('two tangent points from outside', ts.length===2);
ts.sort((a,b)=>a.y-b.y);
check('tangent points at (25, ±43.30)', near(ts[1].x,25,1e-6) && near(ts[1].y,50*Math.sin(Math.PI/3),1e-6));
check('tangency: radius ⊥ line-to-base',
      Math.abs((ts[1].x-0)*(ts[1].x-100)+(ts[1].y-0)*(ts[1].y-0)) < 1e-6);
check('no tangent from inside', X.tangentPts({x:10,y:0}, {type:'circle',cx:0,cy:0,r:50}).length===0);
// arc filtering: left half-arc excludes both right-side tangent points
check('arc sweep filters tangent points',
      X.tangentPts({x:100,y:0}, {type:'arc',cx:0,cy:0,r:50,a0:Math.PI/2,a1:3*Math.PI/2}).length===0);

/* ===== nearestOnEnt ===== */
let q = X.nearestOnEnt({type:'line',x1:0,y1:0,x2:100,y2:0}, {x:37.3,y:5});
check('nearest on line = foot', near(q.x,37.3)&&near(q.y,0));
q = X.nearestOnEnt({type:'line',x1:0,y1:0,x2:100,y2:0}, {x:120,y:5});
check('nearest clamps to segment end', near(q.x,100)&&near(q.y,0));
q = X.nearestOnEnt({type:'circle',cx:0,cy:0,r:50}, {x:30,y:40});
check('nearest on circle = radial point', near(Math.hypot(q.x,q.y),50) && near(q.x,30)&&near(q.y,40));
check('nearest null for text', X.nearestOnEnt({type:'text',x:0,y:0,h:2,str:'x'}, {x:0,y:0})===null);

/* ===== TAN fires during a command (needs a base) ===== */
reset();
S.entities.push({id:S.nextId(), type:'circle', cx:0, cy:0, r:50, layer:'0'});
S.T.osnap=true;
C.startCommand('L');
C.handleEnter('100,0');                          // base point
const tanY = 50*Math.sin(Math.PI/3);             // 43.30
let p = C.applyModifiers({x:25.5, y:tanY-0.5});  // hover near upper tangent point
check('TAN snap fires', S.snapMark && S.snapMark.k==='tan' && near(p.x,25,1e-6) && near(p.y,tanY,1e-6));
C.cancelCmd();
// idle (no base): same hover produces NOTHING by default (nea is opt-in)
p = C.applyModifiers({x:25.5, y:tanY-0.5});
check('no TAN without a base; default does NOT fall back to nearest', S.snapMark===null);

/* ===== NEA is opt-in: default off, push('nea') enables, stays lowest priority ===== */
reset();
add(0,0,100,0);
p = C.applyModifiers({x:37.3, y:0.9});           // mid-span, nothing else within tol
check('default: bare geometry does not snap', S.snapMark===null && near(p.x,37.3)&&near(p.y,0.9));
C.SNAP_ACTIVE.add('nea');                        // opt in
p = C.applyModifiers({x:37.3, y:0.9});
check('opted-in: NEA fires on bare geometry', S.snapMark && S.snapMark.k==='nea' && near(p.x,37.3)&&near(p.y,0));
p = C.applyModifiers({x:99, y:1});               // near the endpoint
check('opted-in: END still beats NEA', S.snapMark && S.snapMark.k==='end' && near(p.x,100)&&near(p.y,0));
C.SNAP_ACTIVE.delete('nea');                     // back to default for the rest

/* ===== priority beats raw distance ===== */
reset();
add(0,0,4,0);                                     // tiny line: end (4,0), mid (2,0) both in tol
p = C.applyModifiers({x:2.6, y:0.5});             // mid is CLOSER (0.78) than end (1.49)
check('END outranks closer MID (priority, not distance)',
      S.snapMark && S.snapMark.k==='end' && near(p.x,4)&&near(p.y,0));

/* ===== hidden layers still excluded (incl. opted-in NEA) ===== */
reset();
S.setCurrentLayer('walls');
add(0,20,100,20);
S.layerOf('walls').off = true;
C.SNAP_ACTIVE.add('nea');
p = C.applyModifiers({x:50, y:20.5});
check('NEA (opted in) ignores hidden layers', S.snapMark===null);
C.SNAP_ACTIVE.delete('nea');
S.layerOf('walls').off = false;
S.setCurrentLayer('0');

finish();
