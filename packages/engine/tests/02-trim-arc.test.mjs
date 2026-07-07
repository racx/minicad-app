/* Smoke test for Step 1: intersection module, arc entity, TRIM command. */
function makeCtx(){ return new Proxy({}, { get(t,p){ if (p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } }); }
function makeEl(tag){
  const el = { tag, style:{}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'',
    classList:{ toggle(){}, add(){}, remove(){} }, addEventListener(){},
    appendChild(c){ el.children.push(c); return c; }, removeChild(){},
    get firstChild(){ return el.children[0]; }, scrollTop:0, scrollHeight:0,
    focus(){}, click(){}, getBoundingClientRect(){ return {width:800,height:600,left:0,top:0}; },
    getContext(){ return makeCtx(); } };
  return el;
}
const els = new Map();
globalThis.document = { getElementById(id){ if(!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement(t){ return makeEl(t); }, querySelectorAll(){ return []; }, activeElement:null };
globalThis.window = { devicePixelRatio:1, addEventListener(){} };
const logLines = [];
document.getElementById('history').appendChild = d => { logLines.push(d.textContent); };

await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const E = await import('../js/core/entities.js');
const G = await import('../js/core/geometry.js');
const X = await import('../js/core/intersect.js');

let fails = 0;
const check = (name, cond) => { console.log((cond?'PASS':'FAIL')+'  '+name); if(!cond) fails++; };
const near = (a,b,eps=1e-6)=>Math.abs(a-b)<eps;

/* ===== intersection module unit tests ===== */
let q = X.segSeg({x:0,y:0},{x:10,y:0},{x:5,y:-5},{x:5,y:5});
check('segSeg crossing', q && near(q.x,5) && near(q.y,0));
check('segSeg miss (u out of range)', X.segSeg({x:0,y:0},{x:10,y:0},{x:20,y:-5},{x:20,y:5})===null);
check('segSeg parallel', X.segSeg({x:0,y:0},{x:10,y:0},{x:0,y:1},{x:10,y:1})===null);

let qs = X.segCircle({x:-10,y:0},{x:10,y:0},{x:0,y:0},5);
check('segCircle secant 2 pts', qs.length===2 && qs.every(p=>near(Math.abs(p.x),5)&&near(p.y,0)));
qs = X.segCircle({x:-10,y:5},{x:10,y:5},{x:0,y:0},5);
check('segCircle tangent 1 pt', qs.length===1 && near(qs[0].x,0) && near(qs[0].y,5));
check('segCircle miss', X.segCircle({x:-10,y:9},{x:10,y:9},{x:0,y:0},5).length===0);

qs = X.circleCircle({x:0,y:0},5,{x:8,y:0},5);
check('circleCircle 2 pts', qs.length===2 && qs.every(p=>near(p.x,4)&&near(Math.abs(p.y),3)));
check('circleCircle apart', X.circleCircle({x:0,y:0},5,{x:20,y:0},5).length===0);

// pline as segments
const plE = {type:'pline', closed:false, pts:[{x:0,y:-5},{x:0,y:5},{x:10,y:5}]};
const lnE = {type:'line', x1:-5,y1:0,x2:5,y2:0};
qs = X.entIntersections(lnE, plE);
check('entIntersections line×pline', qs.length===1 && near(qs[0].x,0) && near(qs[0].y,0));

// arc filtering: right half-circle arc vs horizontal line through center
const arcE = {type:'arc', cx:0, cy:0, r:5, a0:-Math.PI/2, a1:Math.PI/2};
qs = X.entIntersections({type:'line', x1:-10,y1:0,x2:10,y2:0}, arcE);
check('entIntersections line×arc filters off-arc point', qs.length===1 && near(qs[0].x,5));

/* ===== arc entity ops ===== */
check('arc hit on curve', near(E.entHitDist(arcE, {x:5.5,y:0}), 0.5));
check('arc no hit off sweep', E.entHitDist(arcE, {x:-5.5,y:0}) > 4);
const bb = E.entBBox(arcE);
check('arc bbox', near(bb[0],0)&&near(bb[1],-5)&&near(bb[2],5)&&near(bb[3],5));
const snaps = E.snapCandidates.call ? (()=>{ S.entities.push({...arcE, id:999, layer:'0'}); const s=E.snapCandidates(); S.entities.pop(); return s; })() : [];
check('arc snaps end/mid/cen', ['end','mid','cen'].every(k=>snaps.some(c=>c.k===k)) &&
      snaps.some(c=>c.k==='mid' && near(c.p.x,5) && near(c.p.y,0)));

/* ===== TRIM: line target, one edge, pick left side ===== */
function addLine(x1,y1,x2,y2){ C.startCommand('L'); C.handleEnter(`${x1},${y1}`); C.handleEnter(`${x2},${y2}`); C.handleEnter(''); return S.entities[S.entities.length-1]; }
S.T.osnap=false; S.T.ortho=false;

const target1 = addLine(0,0,100,0);
const edge1 = addLine(50,-10,50,10);
C.startCommand('TR');
S.cmd.sel=[edge1.id];
C.handleEnter('');                       // done selecting edges
check('TRIM entered trim step', S.cmd && S.cmd.step==='trim');
const undoDepth = S.undoStack.length;
C.onPoint({x:25, y:0});                  // pick left portion
const kept1 = S.entities.filter(e=>e.type==='line' && e.y1===0 && e.y2===0);
check('TRIM line→one piece', kept1.length===1 && near(kept1[0].x1,50) && near(kept1[0].x2,100));
check('TRIM one undo step', S.undoStack.length===undoDepth+1);
C.doUndo();
check('undo restores full line', S.entities.some(e=>e.type==='line'&&near(e.x1,0)&&near(e.x2,100)&&e.y1===0));
C.handleEnter('');                       // undo cancelled the command; harmless

/* ===== TRIM: line with two edges, pick middle → 2 pieces ===== */
S.setEntities([]); S.undoStack.length=0; S.selection.clear();
const t2 = addLine(0,0,100,0);
const e2a = addLine(30,-10,30,10), e2b = addLine(70,-10,70,10);
C.startCommand('TR');
S.cmd.sel=[e2a.id, e2b.id];
C.handleEnter('');
C.onPoint({x:50, y:0});
const horiz = S.entities.filter(e=>e.type==='line' && e.y1===0 && e.y2===0);
check('TRIM middle → 2 pieces', horiz.length===2 &&
      horiz.some(e=>near(e.x1,0)&&near(e.x2,30)) && horiz.some(e=>near(e.x1,70)&&near(e.x2,100)));
C.handleEnter('');                       // end TRIM
check('TRIM ended on Enter', S.cmd===null);

/* ===== TRIM: empty Enter = all edges ===== */
S.setEntities([]); S.undoStack.length=0; S.selection.clear();
const t3 = addLine(0,0,100,0);
addLine(40,-10,40,10);
C.startCommand('TRIM');
C.handleEnter('');                       // no selection → all objects are edges
check('all-edges mode logged', logLines.some(l=>l.includes('All objects are cutting edges')));
C.onPoint({x:80, y:0});
check('TRIM all-edges trimmed right side', S.entities.some(e=>e.type==='line'&&e.y1===0&&near(e.x2,40)) &&
      !S.entities.some(e=>e.type==='line'&&e.y1===0&&near(e.x2,100)));
C.handleEnter('');

/* ===== TRIM: circle → arc ===== */
S.setEntities([]); S.undoStack.length=0; S.selection.clear();
C.startCommand('C'); C.handleEnter('0,0'); C.handleEnter('50');
const edgeV = addLine(0,-60,0,60);       // cuts circle at 90° and 270°
C.startCommand('TR');
S.cmd.sel=[edgeV.id];
C.handleEnter('');
C.onPoint({x:50, y:0});                  // pick right side → keep left arc
const arc1 = S.entities.find(e=>e.type==='arc');
check('circle→arc', !!arc1 && near(arc1.r,50) && near(arc1.a0, Math.PI/2) && near(arc1.a1, 3*Math.PI/2));
check('circle gone', !S.entities.some(e=>e.type==='circle'));
check('arc sweep is half', near(G.arcSweep(arc1), Math.PI));

/* ===== TRIM: circle with 1 intersection refused ===== */
C.handleEnter('');
S.setEntities([]); S.selection.clear();
C.startCommand('C'); C.handleEnter('0,0'); C.handleEnter('50');
const tang = addLine(-60,50,60,50);      // tangent at top
C.startCommand('TR'); S.cmd.sel=[tang.id]; C.handleEnter('');
const nBefore = S.entities.length;
C.onPoint({x:-50, y:0});
check('tangent-only circle refused', logLines.some(l=>l.includes('2+ points')) && S.entities.length===nBefore);
C.handleEnter('');

/* ===== TRIM: arc target trims further ===== */
S.setEntities([]); S.selection.clear();
S.entities.push({id:S.nextId(), type:'arc', cx:0, cy:0, r:50, a0:Math.PI/2, a1:3*Math.PI/2, layer:'0'});  // left half
const edgeH = addLine(-60,0,0,0);        // cuts arc at 180°
C.startCommand('TR'); S.cmd.sel=[edgeH.id]; C.handleEnter('');
C.onPoint({x:0, y:-50});                 // pick bottom-left quarter (angle 270°)
const arcs = S.entities.filter(e=>e.type==='arc');
check('arc trimmed → top quarter kept', arcs.length===1 && near(arcs[0].a0, Math.PI/2) && near(arcs[0].a1, Math.PI));
C.handleEnter('');

/* ===== TRIM: no intersection message ===== */
S.setEntities([]); S.selection.clear();
const iso = addLine(0,0,10,0);
const far = addLine(0,50,10,50);
C.startCommand('TR'); S.cmd.sel=[far.id]; C.handleEnter('');
C.onPoint({x:5,y:0});
check('no-intersection message', logLines.some(l=>l.includes('does not intersect')));
C.handleEnter('');

/* ===== TRIM unsupported type message ===== */
S.setEntities([]); S.selection.clear();
C.startCommand('REC'); C.handleEnter('0,0'); C.handleEnter('50,50');
addLine(-10,25,60,25);
C.startCommand('TR'); C.handleEnter('');           // all edges
C.onPoint({x:0, y:10});                            // pick rectangle (pline), away from the line
check('pline target refused with message', logLines.some(l=>l.includes('supports lines, circles and arcs')));
C.handleEnter('');

/* ===== DXF ARC export ===== */
S.setEntities([{id:1, type:'arc', cx:10, cy:20, r:5, a0:Math.PI/2, a1:Math.PI, layer:'0'}]);
let dxfData=null;
globalThis.Blob = class { constructor(parts){ this.data = parts.join(''); } };
globalThis.URL = { createObjectURL(b){ dxfData=b.data; return 'blob:x'; }, revokeObjectURL(){} };
const IO = await import('../js/adapters/dom/io.js');
IO.dxfExport();
const lines = dxfData.split('\n');
const ai = lines.indexOf('ARC');
check('DXF ARC entity present', ai>0);
const grp = {}; for (let i=ai+1; i<lines.length-1 && lines[i]!=='0'; i+=2) grp[lines[i]] = lines[i+1];
check('DXF ARC group codes', grp['10']==='10' && grp['20']==='20' && grp['40']==='5' && near(parseFloat(grp['50']),90) && near(parseFloat(grp['51']),180));

/* ===== move/rotate/scale arc ===== */
const A = {id:2, type:'arc', cx:0, cy:0, r:10, a0:0, a1:Math.PI/2, layer:'0'};
E.translateEnt(A, 5, 5);
check('arc translate', A.cx===5 && A.cy===5);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails?1:0);
