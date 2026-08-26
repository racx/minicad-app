/* ALIGN (AL): source/destination point pairs → translate + rotate + optional
   uniform scale, AutoCAD-style, ending on the "Scale objects based on
   alignment points? [Y/N]" question. One snapshot per align. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

S.T.osnap=false; S.T.ortho=false; S.T.snap=false;
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};
const line=(x1,y1,x2,y2)=>{ const e={id:S.nextId(), type:'line', x1,y1,x2,y2, layer:'0'};
  S.entities.push(e); return e; };
const alignFlow=(pts, scaleAnswer)=>{      // pts = [s1,d1,s2,d2] (s2/d2 optional)
  C.startCommand('AL');
  for (const p of pts) C.onPoint(p);
  if (pts.length===2) C.handleEnter('');   // Enter at "second source" = move only
  else C.handleEnter(scaleAnswer ?? '');   // the Y/N question, <N> default
};

/* ===== two pairs + scale: rotate 90° and stretch ×2 onto the target ===== */
reset();
let e = line(0,0, 10,0);
S.selection.add(e.id);
alignFlow([{x:0,y:0},{x:100,y:100},{x:10,y:0},{x:100,y:120}], 'Y');
check('align with scale lands both points exactly',
      near(e.x1,100)&&near(e.y1,100)&&near(e.x2,100)&&near(e.y2,120));
check('align is one undo step', S.undoStack.length===1);
C.startCommand('U');
const e0 = S.entities.find(z=>z.id===e.id);        // undo swaps in fresh objects
check('undo restores the original', near(e0.x1,0)&&near(e0.y1,0)&&near(e0.x2,10)&&near(e0.y2,0));

/* ===== two pairs, no scale (the <N> default): direction only ===== */
reset();
e = line(0,0, 10,0);
S.selection.add(e.id);
alignFlow([{x:0,y:0},{x:100,y:100},{x:10,y:0},{x:100,y:120}]);   // empty Enter = No
check('align without scale keeps the length (rotates only)',
      near(e.x1,100)&&near(e.y1,100)&&near(e.x2,100)&&near(e.y2,110));

/* ===== one pair: plain move ===== */
reset();
e = line(0,0, 10,0);
S.selection.add(e.id);
alignFlow([{x:0,y:0},{x:50,y:5}]);
check('single pair aligns as a move', near(e.x1,50)&&near(e.y1,5)&&near(e.x2,60)&&near(e.y2,5));

/* ===== a rotated+scaled group stays a group ===== */
reset();
const a = line(0,0, 10,0), b = line(10,0, 10,10);
S.selection.add(a.id); S.selection.add(b.id);
alignFlow([{x:0,y:0},{x:0,y:0},{x:10,y:0},{x:0,y:20}], 'YES');
check('group transform keeps shared corners together',
      near(a.x2,b.x1)&&near(a.y2,b.y1)&&near(a.x2,0)&&near(a.y2,20));
check('perpendicularity survives (second leg lands at -20,20)',
      near(b.x2,-20)&&near(b.y2,20));

/* ===== circles scale their radius, arcs their sweep angles rotate ===== */
reset();
const c = {id:S.nextId(), type:'circle', cx:5, cy:0, r:2, layer:'0'};
S.entities.push(c);
S.selection.add(c.id);
alignFlow([{x:0,y:0},{x:0,y:0},{x:10,y:0},{x:0,y:20}], 'Y');
check('circle rides the align: center rotated+scaled, radius doubled',
      near(c.cx,0)&&near(c.cy,10)&&near(c.r,4));

/* ===== refusals ===== */
reset();
e = line(0,0, 10,0);
S.selection.add(e.id);
C.startCommand('ALIGN');
C.onPoint({x:0,y:0});                       // s1
C.onPoint({x:100,y:100});                   // d1
C.onPoint({x:0,y:0});                       // s2 — same as s1
check('coincident source points refused', dom.logs.some(l=>l.includes('must differ')) &&
      S.cmd && S.cmd.step==='s2');
C.onPoint({x:10,y:0});                      // a real s2
C.onPoint({x:100,y:100});                   // d2 — same as d1
check('coincident destination points refused', S.cmd.step==='d2');
C.onPoint({x:100,y:120});
C.handleEnter('maybe');
check('non-Y/N answer re-asks', S.cmd && S.cmd.step==='scale' &&
      dom.logs.some(l=>l.includes('Enter Y or N')));
C.handleEnter('N');
check('the align then completes', S.cmd===null && near(e.y2,110));

/* nothing selected: MODIFY flow asks for selection first */
reset();
line(0,0, 10,0);
C.startCommand('AL');
check('with no selection, ALIGN asks to select', S.cmd && S.cmd.step==='select');
C.cancelCmd(true);

finish();
