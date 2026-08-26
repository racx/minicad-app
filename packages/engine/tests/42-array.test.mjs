/* ARRAY (AR): classic rectangular rows×columns and polar-about-a-center
   copies, with AutoCAD's questions (type R/P, items count includes the
   original, fill angle, rotate items Y/N). Non-associative plain copies,
   one snapshot per array. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const E = await import('../js/core/entities.js');

S.T.osnap=false; S.T.ortho=false; S.T.snap=false;
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};
const rect=(x0,y0,x1,y1)=>{ const e={id:S.nextId(), type:'pline', closed:true, layer:'0',
  pts:[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]}; S.entities.push(e); return e; };
const plines=()=>S.entities.filter(e=>e.type==='pline');

/* ===== rectangular: 3 columns × 2 rows of a 10×5 rectangle ===== */
reset();
const r0 = rect(0,0,10,5);
S.selection.add(r0.id);
C.startCommand('AR');
check('ARRAY asks for the type', S.cmd && S.cmd.name==='ARRAY' && S.cmd.step==='type');
C.handleEnter('R');
C.handleEnter('3');          // columns
C.handleEnter('2');          // rows
C.handleEnter('15');         // column spacing
C.handleEnter('10');         // row spacing
check('3×2 makes 5 new rectangles', plines().length===6);
check('grid positions land on the spacing',
      plines().some(e=>near(e.pts[0].x,30)&&near(e.pts[0].y,0)) &&    // col 2, row 0
      plines().some(e=>near(e.pts[0].x,15)&&near(e.pts[0].y,10)));    // col 1, row 1
check('one undo step per array', S.undoStack.length===1);
C.startCommand('U');
check('undo removes the whole grid', plines().length===1);

/* defaults: plain Enters = rectangular, 4 columns, 3 rows */
reset();
const r1 = rect(0,0,10,5);
S.selection.add(r1.id);
C.startCommand('ARRAY');
C.handleEnter('');           // type <R>
C.handleEnter('');           // columns <4>
C.handleEnter('');           // rows <3>
C.handleEnter('20');
C.handleEnter('10');
check('defaults give 4×3 (11 new)', plines().length===12);

/* a hatched room arrays with its fill remapped per copy */
reset();
const room = rect(0,0,10,5);
S.entities.push({id:S.nextId(), type:'hatch', ref:room.id, mat:'concrete', layer:'0'});
S.selection.add(room.id); S.selection.add(S.entities[1].id);
C.startCommand('AR');
C.handleEnter('R'); C.handleEnter('2'); C.handleEnter('1'); C.handleEnter('15');
const hatches = S.entities.filter(e=>e.type==='hatch');
check('hatch copies point at their copied outline', hatches.length===2 &&
      hatches.every(h=>S.entities.some(z=>z.id===h.ref && z.type==='pline')) &&
      hatches[0].ref!==hatches[1].ref);

/* ===== polar, rotating items (the default): 4 lines around origin ===== */
reset();
const ln = {id:S.nextId(), type:'line', x1:10, y1:0, x2:20, y2:0, layer:'0'};
S.entities.push(ln);
S.selection.add(ln.id);
C.startCommand('AR');
C.handleEnter('P');
C.onPoint({x:0, y:0});       // center
C.handleEnter('4');          // items, original included
C.handleEnter('');           // fill <360>
C.handleEnter('');           // rotate items <Y>
const lines = S.entities.filter(e=>e.type==='line');
check('4 items = original + 3 copies', lines.length===4);
check('quarter-turn copy points up the Y axis',
      lines.some(e=>near(e.x1,0)&&near(e.y1,10)&&near(e.x2,0)&&near(e.y2,20)));
check('half-turn copy mirrored through the center',
      lines.some(e=>near(e.x1,-10)&&near(e.y1,0)&&near(e.x2,-20)&&near(e.y2,0)));

/* ===== polar, NOT rotating: rectangles keep their orientation ===== */
reset();
const r2 = rect(9,-1,11,1);                 // 2×2 centered at (10,0)
S.selection.add(r2.id);
C.startCommand('AR');
C.handleEnter('PO');
C.onPoint({x:0, y:0});
C.handleEnter('4');
C.handleEnter('360');
C.handleEnter('N');
const copies = plines().filter(e=>e.id!==r2.id);
check('non-rotating copies stay axis-aligned', copies.every(e=>{
  const b=E.entBBox(e); return near(b[2]-b[0],2)&&near(b[3]-b[1],2); }));
check('their centers still orbit the array center', copies.some(e=>{
  const b=E.entBBox(e); return near((b[0]+b[2])/2,0)&&near((b[1]+b[3])/2,10); }));

/* ===== partial fill: 3 items over 90° = 45° apart ===== */
reset();
const ln2 = {id:S.nextId(), type:'line', x1:10, y1:0, x2:20, y2:0, layer:'0'};
S.entities.push(ln2);
S.selection.add(ln2.id);
C.startCommand('AR');
C.handleEnter('P');
C.onPoint({x:0, y:0});
C.handleEnter('3');
C.handleEnter('90');
C.handleEnter('Y');
check('partial fill divides by n-1 (last copy on the 90° mark)',
      S.entities.filter(e=>e.type==='line').some(e=>near(e.x1,0)&&near(e.y1,10)));

/* ===== refusals ===== */
reset();
const r3 = rect(0,0,10,5);
S.selection.add(r3.id);
C.startCommand('AR');
C.handleEnter('X');
check('bad type re-asks', S.cmd.step==='type' && dom.logs.some(l=>l.includes('R (rectangular)')));
C.handleEnter('R');
C.handleEnter('1');
C.handleEnter('1');
check('1×1 refused and re-asks', S.cmd.step==='cols' && dom.logs.some(l=>l.includes('just the original')));
C.handleEnter('99');
C.handleEnter('99');
check('runaway grid capped', S.cmd.step==='cols' && dom.logs.some(l=>l.includes('keep it under')));
C.handleEnter('2'); C.handleEnter('1');
C.handleEnter('0');
check('zero spacing refused', dom.logs.some(l=>l.includes('non-zero spacing')));
C.handleEnter('15');
check('then the array completes', S.cmd===null && plines().length===2);

finish();
