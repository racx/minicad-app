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

/* ===== curved polylines: arcs keep centre and orientation, radius ±d ===== */
const G = await import('../js/core/geometry.js');

// a semicircle (bulge 1, centre (5,0), r 5) offset 2 outward → r 7, same bulge
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0,bulge:1},{x:10,y:0}]});     // CCW: bulges below the chord
C.startCommand('O'); C.handleEnter('2');
C.onPoint({x:5,y:-5});                   // pick on the curve (its apex)
C.onPoint({x:5,y:-8});                   // side: outside the circle
let cur = S.entities[1];
check('semicircle offset stays one bulged segment', cur.pts.length===2 && near(cur.pts[0].bulge,1,1e-9));
let g = G.bulgeArc(cur.pts[0], cur.pts[1], cur.pts[0].bulge);
check('outward: r 5 → 7, same centre', near(g.r,7,1e-9) && near(g.cx,5,1e-9) && near(g.cy,0,1e-9));
check('endpoints moved radially', near(cur.pts[0].x,-2,1e-9) && near(cur.pts[1].x,12,1e-9));
// inward past the centre refused
C.onPoint({x:5,y:-5});
C.onPoint({x:5,y:-1});                   // inside: r 5 - 6 would collapse
C.handleEnter('');
C.startCommand('O'); C.handleEnter('6');
C.onPoint({x:5,y:-5});
C.onPoint({x:5,y:-1});
check('collapse through the centre refused',
      dom.logs.some(l=>l.includes('collapse the polyline')));
C.handleEnter('');

// a true S-curve — CCW quarter about (0,10) then a tangent CW quarter about
// (20,10) — offsets to r 12 and r 8 with the joint still one tangent vertex
reset();
const qb = Math.tan(Math.PI/8);
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0,bulge:qb},{x:10,y:10,bulge:-qb},{x:20,y:20}]});
C.startCommand('O'); C.handleEnter('2');
C.onPoint({x:0,y:0});                    // pick near the first arc
C.onPoint({x:2,y:-1});                   // side: right of travel at the start
cur = S.entities[1];
check('S-curve offset keeps 3 vertices (tangent joint, no corner arc)', cur.pts.length===3);
check('both bulges keep their signs', cur.pts[0].bulge>0 && cur.pts[1].bulge<0);
g = G.bulgeArc(cur.pts[0], cur.pts[1], cur.pts[0].bulge);
let g2 = G.bulgeArc(cur.pts[1], cur.pts[2], cur.pts[1].bulge);
check('CCW arc grew to r 12 about its own centre', near(g.r,12,1e-6) && near(g.cx,0,1e-6) && near(g.cy,10,1e-6));
check('CW arc shrank to r 8 about its own centre', near(g2.r,8,1e-6) && near(g2.cx,20,1e-6) && near(g2.cy,10,1e-6));
check('tangent joint is a single vertex on the line of centres',
      near(cur.pts[1].x,12,1e-6) && near(cur.pts[1].y,10,1e-6));
C.handleEnter('');

// an arc-arc CORNER (two quarters meeting at 90°) miters onto both offset
// circles — the joint vertex lies on each
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0,bulge:qb},{x:10,y:10,bulge:-qb},{x:20,y:0}]});
C.startCommand('O'); C.handleEnter('2');
C.onPoint({x:0,y:0});
C.onPoint({x:2,y:-1});
cur = S.entities[1];
check('arc-arc corner keeps 3 vertices (mitered on the circles)', cur.pts.length===3);
check('joint sits on BOTH offset circles',
      near(Math.hypot(cur.pts[1].x-0,  cur.pts[1].y-10), 12, 1e-6) &&
      near(Math.hypot(cur.pts[1].x-10, cur.pts[1].y-0),   8, 1e-6));
C.handleEnter('');

// line meeting an arc mid-circle: the joint is trimmed onto the offset circle
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0},{x:10,y:0,bulge:-1},{x:20,y:0}]});   // CW semicircle above
C.startCommand('O'); C.handleEnter('2');
C.onPoint({x:5,y:0});                    // pick the straight leg
C.onPoint({x:5,y:-2});                   // offset below
cur = S.entities[1];
g = G.bulgeArc(cur.pts[1], cur.pts[2], cur.pts[1].bulge);
check('arc leg offset below: r 5 → 3, centre kept', near(g.r,3,1e-6) && near(g.cx,15,1e-6) && near(g.cy,0,1e-6));
check('line/arc joint lands ON the offset circle',
      near(Math.hypot(cur.pts[1].x-15, cur.pts[1].y-0), 3, 1e-6) && near(cur.pts[1].y,-2,1e-6));
C.handleEnter('');

// convex corner whose offset circle can't reach the offset line: bridged
// with a corner arc of radius d centred on the original vertex
reset();
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0',
                 pts:[{x:0,y:0},{x:10,y:0,bulge:-1},{x:6,y:4}]});   // CW semicircle turning up-left
C.startCommand('O'); C.handleEnter('2');
C.onPoint({x:5,y:0});
C.onPoint({x:5,y:-2});                   // outside the corner
cur = S.entities[1];
check('unreachable joint grows a corner arc (4 vertices)', cur.pts.length===4);
check('corner-arc endpoints sit at distance d from the original vertex',
      near(Math.hypot(cur.pts[1].x-10, cur.pts[1].y-0), 2, 1e-6) &&
      near(Math.hypot(cur.pts[2].x-10, cur.pts[2].y-0), 2, 1e-6));
check('the bridge is an arc, not a straight kink', Math.abs(cur.pts[1].bulge||0) > 1e-9);
C.handleEnter('');

// dims/text still politely refused
reset();
C.startCommand('DIM'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('50,20');
C.startCommand('O'); C.handleEnter('10');
C.onPoint({x:50,y:20});                  // pick the dim line
check('dim refused with message', dom.logs.some(l=>l.includes('supports lines, circles, arcs and polylines')));
C.handleEnter('');

finish();
