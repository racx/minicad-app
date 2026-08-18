/* Drawing usability: ortho defaults off, RECTANG ignores ortho,
   PLINE snaps to and closes on its own first vertex. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};

/* ===== ortho starts off — free sketching by default (F8 turns it on) ===== */
check('ortho defaults OFF', S.T.ortho===false);
check('osnap defaults ON', S.T.osnap===true);

/* ===== RECTANG second corner ignores ortho (h/v = zero-area rectangle) ===== */
S.T.ortho=true; S.T.osnap=false;
C.startCommand('REC');
C.handleEnter('0,0');
let p = C.applyModifiers({x:50, y:30});
check('rect corner not collapsed by ortho', near(p.x,50) && near(p.y,30));
C.onPoint(p);
let e = S.entities[S.entities.length-1];
check('rect is a closed 4-vertex pline', e.type==='pline' && e.closed && e.pts.length===4);
check('rect has real area', Math.abs((e.pts[2].x-e.pts[0].x)*(e.pts[2].y-e.pts[0].y))===1500);
// ortho still constrains LINE (the toggle is not dead)
C.startCommand('L');
C.handleEnter('0,0');
p = C.applyModifiers({x:50, y:3});
check('ortho still constrains LINE', near(p.y,0));
C.cancelCmd(true);
S.T.ortho=false;

/* ===== PLINE in-progress vertices are endpoint snap candidates ===== */
reset();
S.T.osnap=true;
C.startCommand('PL');
C.handleEnter('0,0');
C.handleEnter('100,0');
C.handleEnter('100,80');
p = C.applyModifiers({x:1.4, y:1.0});            // tol = 11/scale(4) = 2.75
check('cursor snaps to the first vertex', S.snapMark && S.snapMark.k==='end' && near(p.x,0) && near(p.y,0));
p = C.applyModifiers({x:101, y:81});             // last vertex = rubber base
check('no END snap on the rubber-base vertex', !(S.snapMark && S.snapMark.k==='end'));

/* ===== clicking the first vertex closes the polyline ===== */
p = C.applyModifiers({x:1.4, y:1.0});
C.onPoint(p);
check('command ended on close', S.cmd===null);
e = S.entities[S.entities.length-1];
check('closed pline, no duplicate vertex', e.type==='pline' && e.closed===true && e.pts.length===3);

/* ===== typed coordinates close too ===== */
reset();
C.startCommand('PL');
C.handleEnter('0,0'); C.handleEnter('40,0'); C.handleEnter('40,40'); C.handleEnter('0,0');
e = S.entities[S.entities.length-1];
check('typed first point closes', S.cmd===null && e.closed===true && e.pts.length===3);

/* ===== two points never auto-close (a doubled-back line is legitimate) ===== */
reset();
C.startCommand('PL');
C.handleEnter('0,0'); C.handleEnter('40,0'); C.handleEnter('0,0');
check('two segments back to start stays open', S.cmd && S.cmd.name==='PLINE' && S.cmd.pts.length===3);
C.cancelCmd(true);

/* ===== arc mode closes on the first vertex, bulge spans the closing segment ===== */
reset();
C.startCommand('PL');
C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('100,100');
C.handleEnter('A');                              // tangent arc back to the start
C.handleEnter('0,0');
e = S.entities[S.entities.length-1];
check('arc close: closed 3-vertex pline', S.cmd===null && e.closed===true && e.pts.length===3);
check('closing segment is an arc', typeof e.pts[2].bulge==='number' && Math.abs(e.pts[2].bulge)>1e-9);

finish();
