/* OFFSET on polylines (mitered) and arcs. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

S.T.osnap=false; S.T.ortho=false;
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();};

// closed rectangle offset INWARD by 10 → smaller rectangle with mitered corners
reset();
C.startCommand('REC'); C.handleEnter('0,0'); C.handleEnter('100,60');
C.startCommand('O');
C.handleEnter('10');                     // distance
C.onPoint({x:0,y:30});                   // pick left edge
C.onPoint({x:50,y:30});                  // side: inside
const inner = S.entities.find(e=>e.type==='pline' && e!==S.entities[0]);
check('inner pline created, closed', !!inner && inner.closed && inner.pts.length===4);
const xs = inner.pts.map(p=>p.x).sort((a,b)=>a-b);
const ys = inner.pts.map(p=>p.y).sort((a,b)=>a-b);
check('inner rect is 10..90 × 10..50', near(xs[0],10)&&near(xs[3],90)&&near(ys[0],10)&&near(ys[3],50));

// outward
C.onPoint({x:0,y:30});                   // pick original left edge again
C.onPoint({x:-40,y:30});                 // side: outside
const outer = S.entities[S.entities.length-1];
const xo = outer.pts.map(p=>p.x).sort((a,b)=>a-b);
check('outer rect is -10..110', near(xo[0],-10)&&near(xo[3],110));
C.handleEnter('');

// open pline (L-shape) offset keeps vertex count, miters the corner
reset();
C.startCommand('PL'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('100,80'); C.handleEnter('');
C.startCommand('O'); C.handleEnter('10');
C.onPoint({x:50,y:0});                   // pick the horizontal leg
C.onPoint({x:50,y:30});                  // offset toward upper-left (inside the L)
const off = S.entities[1];
check('open pline offset has 3 points', off.pts.length===3 && !off.closed);
check('first point shifted up by 10', near(off.pts[0].x,0)&&near(off.pts[0].y,10));
check('mitered corner at (90,10)', near(off.pts[1].x,90)&&near(off.pts[1].y,10));
check('last point shifted left by 10', near(off.pts[2].x,90)&&near(off.pts[2].y,80));
C.handleEnter('');

// arc offset: outward grows r, inward shrinks; collapse refused
reset();
S.entities.push({id:S.nextId(), type:'arc', cx:0, cy:0, r:50, a0:0, a1:Math.PI/2, layer:'0'});
C.startCommand('O'); C.handleEnter('10');
C.onPoint({x:35.35,y:35.35});            // pick the arc (on the curve)
C.onPoint({x:100,y:100});                // outside
const bigger = S.entities[1];
check('arc offset outward r=60', bigger.type==='arc' && near(bigger.r,60) && near(bigger.a0,0));
C.onPoint({x:35.35,y:35.35});
C.onPoint({x:5,y:5});                    // inside
check('arc offset inward r=40', near(S.entities[2].r,40));
C.handleEnter('');
reset();
S.entities.push({id:S.nextId(), type:'arc', cx:0, cy:0, r:5, a0:0, a1:Math.PI/2, layer:'0'});
C.startCommand('O'); C.handleEnter('10');
C.onPoint({x:3.53,y:3.53});
C.onPoint({x:1,y:1});                    // inward by 10 from r=5 → collapse
check('arc collapse refused', dom.logs.some(l=>l.includes('collapse the arc')) && S.entities.length===1);
C.handleEnter('');

// dims/text still politely refused
reset();
C.startCommand('DIM'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('50,20');
C.startCommand('O'); C.handleEnter('10');
C.onPoint({x:50,y:20});                  // pick the dim line
check('dim refused with message', dom.logs.some(l=>l.includes('supports lines, circles, arcs and polylines')));
C.handleEnter('');

finish();
