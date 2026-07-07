/* Smoke test: intersection/perp osnap, MIRROR, STRETCH, DIM. */
function makeCtx(){ return new Proxy({}, { get(t,p){ if (p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } }); }
function makeEl(){ const el={ style:{},dataset:{},children:[],value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){},add(){},remove(){}},addEventListener(t,f){(el.listeners[t] ||= []).push(f);},appendChild(c){el.children.push(c);return c;},removeChild(){},get firstChild(){return el.children[0];},scrollTop:0,scrollHeight:0,focus(){},click(){},getBoundingClientRect(){return{width:800,height:600,left:0,top:0};},getContext(){return makeCtx();} }; return el; }
const els=new Map();
globalThis.document={getElementById(id){if(!els.has(id))els.set(id,makeEl());return els.get(id);},createElement(){return makeEl();},querySelectorAll(){return[];},activeElement:null};
const winL={};
globalThis.window={devicePixelRatio:1,addEventListener(t,f){(winL[t] ||= []).push(f);}};
const logs=[]; document.getElementById('history').appendChild=d=>logs.push(d.textContent);
await import('../js/adapters/dom/main.js');
const S=await import('../js/core/state.js'); const C=await import('../js/core/commands.js');
const E=await import('../js/core/entities.js'); const V=await import('../js/adapters/dom/view.js');
const G=await import('../js/core/geometry.js');
let fails=0; const check=(n,c)=>{console.log((c?'PASS':'FAIL')+'  '+n); if(!c)fails++;};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;
S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();S.setSelRect(null);};

/* ===== intersection osnap ===== */
reset();
add(0,0,100,0); add(30,-20,30,80);            // cross at (30,0), away from both midpoints
S.T.osnap=true;
let p=C.applyModifiers({x:31,y:1});
check('int osnap snaps to crossing', near(p.x,30)&&near(p.y,0)&&S.snapMark.k==='int');

/* ===== perpendicular osnap (needs a rubber base) ===== */
C.startCommand('L');
C.handleEnter('60,40');                        // base point at (60,40)
p=C.applyModifiers({x:59,y:1});                // near the horizontal line, foot = (60,0)
check('perp osnap to line foot', near(p.x,60)&&near(p.y,0)&&S.snapMark.k==='perp');
C.cancelCmd();
S.T.osnap=false;

/* ===== MIRROR keeps source by default ===== */
reset();
const ml=add(10,10,60,10);
S.selection.add(ml.id);
C.startCommand('MI');
C.handleEnter('0,0'); C.handleEnter('0,50');   // mirror line = Y axis... vertical through x=0
check('mirror asks about erasing', S.cmd && S.cmd.step==='erase');
const um=S.undoStack.length;
C.handleEnter('');                             // default N = keep source
check('mirror created copy', S.entities.length===2 && S.cmd===null);
const mc=S.entities[1];
check('mirror geometry across x=0', near(mc.x1,-10)&&near(mc.y1,10)&&near(mc.x2,-60)&&near(mc.y2,10));
check('mirror one undo step', S.undoStack.length===um+1);

/* ===== MIRROR erase source ===== */
reset();
const ml2=add(10,0,20,0);
S.selection.add(ml2.id);
C.startCommand('MIRROR');
C.handleEnter('0,-5'); C.handleEnter('0,5');
C.handleEnter('Y');
check('mirror Y erases source', S.entities.length===1 && near(S.entities[0].x1,-10));

/* ===== MIRROR arc stays CCW ===== */
reset();
S.entities.push({id:S.nextId(), type:'arc', cx:20, cy:0, r:10, a0:0, a1:Math.PI/2, layer:'0'});
const ma=S.entities[0]; S.selection.add(ma.id);
C.startCommand('MI'); C.handleEnter('0,-5'); C.handleEnter('0,5'); C.handleEnter('');
const marc=S.entities[1];
check('mirrored arc center', near(marc.cx,-20)&&near(marc.cy,0));
check('mirrored arc spans 90°..180° CCW', near(G.arcSweep(marc), Math.PI/2) && near(G.normAng(marc.a0), Math.PI/2));

/* ===== STRETCH: crossing box over right end of a rectangle-ish shape ===== */
reset();
const s1=add(0,0,100,0);                       // bottom
const s2=add(0,30,100,30);                     // top
const s3=add(100,0,100,30);                    // right wall
const s4=add(0,0,0,30);                        // left wall
C.startCommand('S');
check('stretch cleared preselection', S.selection.size===0 && S.cmd.step==='select');
// simulate a crossing box around the right side: world rect x 80..120, y -10..40
C.boxSelect({x0:V.w2s({x:120,y:-10}).x, y0:V.w2s({x:120,y:-10}).y,
             x1:V.w2s({x:80, y:40}).x,  y1:V.w2s({x:80, y:40}).y}, true);
S.cmd.sel=[...S.selection];
check('crossing box caught 3 entities', S.cmd.sel.length===3);   // bottom, top, right wall
C.handleEnter('');                             // done selecting
check('stretch asks base', S.cmd.step==='base');
C.handleEnter('0,0');                          // base
C.handleEnter('50,0');                         // dest: +50 in x
check('bottom line stretched to 150', near(s1.x2,150)&&near(s1.x1,0));
check('top line stretched to 150', near(s2.x2,150)&&near(s2.x1,0));
check('right wall moved whole (+50)', near(s3.x1,150)&&near(s3.x2,150));
check('left wall untouched', near(s4.x1,0)&&near(s4.x2,0));
check('stretch ended', S.cmd===null);
C.doUndo();
check('stretch undoes in one step', near(S.entities[0].x2,100));

/* ===== DIM: create, value, grips, stretch-follows ===== */
reset();
C.startCommand('DIM');
C.handleEnter('0,0');
C.handleEnter('100,0');
C.handleEnter('50,20');                        // place dim line 20 above
const dim=S.entities[0];
check('dim created', !!dim && dim.type==='dim' && near(dim.off,20));
let dg=E.dimGeom(dim);
check('dim value 100', near(dg.L,100) && near(dg.a.y,20) && near(dg.b.y,20));
// grips: p1, p2, off
const grips=E.entGrips(dim);
check('dim has 3 grips', grips.length===3 && grips.some(g=>g.g==='off'));
E.applyGrip(dim, 'off', {x:50, y:-15});
check('off grip slides dim line below', near(dim.off,-15));
E.applyGrip(dim, 'p2', {x:150, y:0});
check('p2 grip changes measurement to 150', near(E.dimGeom(dim).L,150));
// hit-test + bbox + osnap presence
check('dim hit-test on dim line', E.entHitDist(dim, {x:75, y:-15}) < 0.001);
const bb=E.entBBox(dim);
check('dim bbox spans points and line', near(bb[0],0)&&near(bb[2],150)&&near(bb[1],-15)&&near(bb[3],0));
S.selection.add(dim.id);
check('dim snaps include defpoints', E.snapCandidates().some(c=>near(c.p.x,150)&&near(c.p.y,0)));
// translate + scale + rotate + mirror don't corrupt
E.translateEnt(dim, 10, 5);
check('dim translate', near(dim.x1,10)&&near(dim.y1,5)&&near(dim.off,-15));
E.mirrorEnt(dim, {x:0,y:0}, {x:0,y:1});
dg=E.dimGeom(dim);
check('dim mirror keeps length', near(dg.L,150));

/* ===== DIM via STRETCH: value follows geometry ===== */
reset();
add(0,0,100,0);
C.startCommand('DIM'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('50,20');
const dim2=S.entities[1];
C.startCommand('S');
C.boxSelect({x0:V.w2s({x:120,y:-10}).x, y0:V.w2s({x:120,y:-10}).y,
             x1:V.w2s({x:80, y:40}).x,  y1:V.w2s({x:80, y:40}).y}, true);
S.cmd.sel=[...S.selection];
C.handleEnter(''); C.handleEnter('0,0'); C.handleEnter('40,0');
check('stretch moved line end and dim defpoint together',
      near(S.entities[0].x2,140) && near(E.dimGeom(dim2).L,140));

/* ===== DXF with dim decomposition ===== */
let dxf=null;
globalThis.Blob=class{constructor(p){this.data=p.join('');}};
globalThis.URL={createObjectURL(b){dxf=b.data;return 'blob:x';},revokeObjectURL(){}};
const IO=await import('../js/adapters/dom/io.js');
IO.dxfExport();
check('DXF contains dim as 3 lines + text with value', (dxf.match(/\nLINE\n/g)||[]).length>=4 && dxf.includes('140'));

console.log(fails?`\n${fails} FAILURES`:'\nALL PASS');
process.exit(fails?1:0);
