/* Smoke test for Step 2: EXTEND and FILLET. */
function makeCtx(){ return new Proxy({}, { get(t,p){ if (p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } }); }
function makeEl(){
  const el = { style:{}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'', listeners:{},
    classList:{ toggle(){}, add(){}, remove(){} }, addEventListener(){},
    appendChild(c){ el.children.push(c); return c; }, removeChild(){},
    get firstChild(){ return el.children[0]; }, scrollTop:0, scrollHeight:0,
    focus(){}, click(){}, getBoundingClientRect(){ return {width:800,height:600,left:0,top:0}; },
    getContext(){ return makeCtx(); } };
  return el;
}
const els = new Map();
globalThis.document = { getElementById(id){ if(!els.has(id)) els.set(id, makeEl()); return els.get(id); },
  createElement(){ return makeEl(); }, querySelectorAll(){ return []; }, activeElement:null };
globalThis.window = { devicePixelRatio:1, addEventListener(){} };
const logLines = [];
document.getElementById('history').appendChild = d => { logLines.push(d.textContent); };
const promptEl = document.getElementById('prompt');

await import('../js/main.js');
const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const G = await import('../js/geometry.js');

let fails = 0;
const check = (n,c)=>{ console.log((c?'PASS':'FAIL')+'  '+n); if(!c) fails++; };
const near = (a,b,eps=1e-6)=>Math.abs(a-b)<eps;
S.T.osnap=false; S.T.ortho=false;
function addLine(x1,y1,x2,y2){ C.startCommand('L'); C.handleEnter(`${x1},${y1}`); C.handleEnter(`${x2},${y2}`); C.handleEnter(''); return S.entities[S.entities.length-1]; }
function reset(){ S.setEntities([]); S.undoStack.length=0; S.selection.clear(); }

/* ===== EXTEND: line to a boundary, near end ===== */
reset();
const t1 = addLine(0,0,50,0);
const b1 = addLine(100,-20,100,20);
C.startCommand('EX');
S.cmd.sel=[b1.id]; C.handleEnter('');
check('EXTEND entered extend step', S.cmd && S.cmd.step==='extend');
const u0 = S.undoStack.length;
C.onPoint({x:45,y:0});                    // near the (50,0) end
check('line extended to x2=100', near(t1.x2,100) && near(t1.y2,0) && near(t1.x1,0));
check('one undo step', S.undoStack.length===u0+1);
C.doUndo();
check('undo restores x2=50', near(S.entities[0].x2,50));

/* ===== EXTEND: other end ===== */
reset();
const t2 = addLine(0,0,50,0);
const b2 = addLine(-30,-20,-30,20);
C.startCommand('EX'); S.cmd.sel=[b2.id]; C.handleEnter('');
C.onPoint({x:5,y:0});                     // near the (0,0) end
check('extends the picked end only', near(t2.x1,-30) && near(t2.x2,50));
C.handleEnter('');
check('EXTEND ends on Enter', S.cmd===null);

/* ===== EXTEND: nearest of several boundaries wins ===== */
reset();
const t3 = addLine(0,0,50,0);
addLine(80,-20,80,20); addLine(120,-20,120,20);
C.startCommand('EX'); C.handleEnter('');  // all objects are boundaries
check('all-boundaries logged', logLines.some(l=>l.includes('All objects are boundary edges')));
C.onPoint({x:48,y:0});
check('stops at nearest boundary (80)', near(t3.x2,80));
C.onPoint({x:78,y:0});                    // extend again from new end
check('second extend reaches 120', near(t3.x2,120));
C.handleEnter('');

/* ===== EXTEND: boundary behind the line → refused ===== */
reset();
const t4 = addLine(0,0,50,0);
const b4 = addLine(25,-20,25,20);         // crosses the middle — nothing beyond either end
C.startCommand('EX'); S.cmd.sel=[b4.id]; C.handleEnter('');
C.onPoint({x:49,y:0});
check('no boundary beyond end → message', logLines.some(l=>l.includes('No boundary edge to extend to')) && near(t4.x2,50));
C.handleEnter('');

/* ===== EXTEND: arc to a boundary ===== */
reset();
S.entities.push({id:S.nextId(), type:'arc', cx:0, cy:0, r:50, a0:0, a1:Math.PI/2, layer:'0'});  // quarter, (50,0)→(0,50)
const arcT = S.entities[0];
const bl = addLine(-60,0,-10,0);          // hits circle at (-50,0) = 180°
C.startCommand('EX'); S.cmd.sel=[bl.id]; C.handleEnter('');
C.onPoint({x:0,y:50});                    // pick near the a1 end
check('arc extended a1 to 180°', near(arcT.a1, Math.PI) && near(arcT.a0, 0));
C.handleEnter('');

/* ===== FILLET r=0: trim + extend to corner ===== */
reset();
const f1 = addLine(0,0,100,0);            // pick right side
const f2 = addLine(50,10,50,50);          // pick top side; corner should be (50,0)
C.startCommand('F');
check('radius prompt shows remembered 0', promptEl.textContent.includes('<0>'));
C.handleEnter('');                        // keep r=0
check('now asking first line', promptEl.textContent.includes('first line'));
const uf = S.undoStack.length;
C.onPoint({x:80,y:0});                    // first line, right side
C.onPoint({x:50,y:40});                   // second line, top side
check('corner: f1 trimmed to (50,0)-(100,0)', near(f1.x1,50) && near(f1.y1,0) && near(f1.x2,100));
check('corner: f2 extended to (50,0)-(50,50)', near(f2.x1,50) && near(f2.y1,0) && near(f2.y2,50));
check('fillet r=0 is one undo step', S.undoStack.length===uf+1 && S.cmd===null);

/* ===== FILLET r=10: tangent arc, exact geometry ===== */
reset();
const g1 = addLine(0,0,100,0);
const g2 = addLine(50,10,50,50);
C.startCommand('F');
C.handleEnter('10');                      // set radius
C.onPoint({x:80,y:0});
C.onPoint({x:50,y:40});
const farc = S.entities.find(e=>e.type==='arc');
check('fillet arc created r=10 center (60,10)', !!farc && near(farc.r,10) && near(farc.cx,60) && near(farc.cy,10));
check('lines trimmed to tangent points', near(g1.x1,60) && near(g1.y1,0) && near(g2.x1,50) && near(g2.y1,10));
// arc spans 180°→270°, endpoints (50,10) and (60,0)
const e0 = G.arcPt(farc, farc.a0), e1 = G.arcPt(farc, farc.a1);
const ends = [e0,e1].sort((a,b)=>a.x-b.x);
check('arc endpoints are the tangent points', near(ends[0].x,50)&&near(ends[0].y,10)&&near(ends[1].x,60)&&near(ends[1].y,0));
check('arc sweep 90°', near(G.arcSweep(farc), Math.PI/2));
const ug = S.undoStack.length;
C.doUndo();
check('undo removes arc and restores both lines', !S.entities.some(e=>e.type==='arc') &&
      near(S.entities[0].x1,0) && near(S.entities[1].y1,10));

/* ===== FILLET remembers radius ===== */
C.startCommand('F');
check('radius remembered <10>', promptEl.textContent.includes('<10>'));
C.cancelCmd();

/* ===== FILLET refusals ===== */
reset();
const h1 = addLine(0,0,30,0);
const h2 = addLine(0,20,30,20);           // parallel
C.startCommand('F'); C.handleEnter('0');
C.onPoint({x:15,y:0}); C.onPoint({x:15,y:20});
check('parallel refused', logLines.some(l=>l.includes('parallel')) && near(h1.x2,30) && near(h2.y1,20));
C.cancelCmd();

reset();
const k1 = addLine(0,0,20,0);
const k2 = addLine(10,5,10,20);
C.startCommand('F'); C.handleEnter('500');   // absurd radius
C.onPoint({x:18,y:0}); C.onPoint({x:10,y:18});
check('radius too large refused, lines untouched', logLines.some(l=>l.includes('too large')) && near(k1.x1,0) && near(k2.y2,20));
C.cancelCmd();
C.startCommand('F'); C.handleEnter('0'); C.cancelCmd();   // reset remembered radius for cleanliness

/* ===== FILLET picks the correct quadrant (sides matter) ===== */
reset();
const m1 = addLine(0,0,100,0);
const m2 = addLine(50,-50,50,50);
C.startCommand('F'); C.handleEnter('10');
C.onPoint({x:20,y:0});                    // left side this time
C.onPoint({x:50,y:-40});                  // bottom side
const marc = S.entities.find(e=>e.type==='arc');
check('quadrant follows picks: center (40,-10)', !!marc && near(marc.cx,40) && near(marc.cy,-10));
check('m1 keeps left, trimmed at (40,0)', near(m1.x1,0) && near(m1.x2,40));
check('m2 keeps bottom, trimmed at (50,-10)', near(m2.y1,-50) && near(m2.y2,-10));

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails?1:0);
