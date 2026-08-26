/* =========================================================
   MiniCAD — BOUNDARY tracer: pick a point, get back the
   closed loop of the region around it, stitched from
   whatever linework encloses it (lines, arcs, circles,
   plines — closed or not, touching or merely crossing).

   The drawing is flattened into a planar graph: every
   entity breaks into straight/arc pieces, every piece is
   cut at every crossing, and dead-end stubs are pruned
   (they can't be part of any loop). The loop is then walked
   out of the graph with the leftmost-turn rule: enter on
   the edge a ray from the pick point hits first, oriented
   so the pick point lies on the LEFT, and at every node
   take the sharpest left turn. That traces exactly the face
   containing the point, counter-clockwise. Tracing the
   outside world instead (point not enclosed) comes out
   clockwise, so a negative signed area is the rejection.
   ========================================================= */
import { TAU, normAng, arcPt, arcSweep, bulgeArc, plineParts, pointInPoly,
         tessellateBoundary } from './geometry.js';
import { segSeg, segCircle, circleCircle, lineSegT, lineCircleT } from './intersect.js';

const ANG_EPS = 1e-9;

/* ---------- entity → parts (straight segs and CCW arcs) ---------- */
function partsOf(e){
  if (e.type==='line'){
    return [{a:{x:e.x1,y:e.y1}, b:{x:e.x2,y:e.y2}}];
  }
  if (e.type==='circle')
    return [{arc:{cx:e.cx, cy:e.cy, r:e.r, a0:0}, sweep:TAU, ring:true}];
  if (e.type==='arc')
    return [{arc:{cx:e.cx, cy:e.cy, r:e.r, a0:e.a0}, sweep:arcSweep(e)}];
  if (e.type==='pline')
    return plineParts(e).map(p => p.arc
      ? {arc:{cx:p.arc.cx, cy:p.arc.cy, r:p.arc.r, a0:p.arc.a0}, sweep:arcSweep(p.arc)}
      : {a:p.a, b:p.b});
  return [];
}
const partBBox = p => p.arc
  ? [p.arc.cx-p.arc.r, p.arc.cy-p.arc.r, p.arc.cx+p.arc.r, p.arc.cy+p.arc.r]
  : [Math.min(p.a.x,p.b.x), Math.min(p.a.y,p.b.y), Math.max(p.a.x,p.b.x), Math.max(p.a.y,p.b.y)];
const bboxTouch = (a, b, tol) =>
  a[0]<=b[2]+tol && b[0]<=a[2]+tol && a[1]<=b[3]+tol && b[1]<=a[3]+tol;

// is q on the arc part (within its sweep)?
function onArcPart(part, q){
  const th = Math.atan2(q.y-part.arc.cy, q.x-part.arc.cx);
  return normAng(th - part.arc.a0) <= part.sweep + ANG_EPS;
}
// where along the part does q sit? seg → t, arc → angular offset from a0
function arcOffset(part, q){
  return normAng(Math.atan2(q.y-part.arc.cy, q.x-part.arc.cx) - part.arc.a0);
}
function segT(part, q){
  const dx=part.b.x-part.a.x, dy=part.b.y-part.a.y, L2=dx*dx+dy*dy;
  return L2 ? ((q.x-part.a.x)*dx + (q.y-part.a.y)*dy)/L2 : 0;
}

/* ---------- cut every part at every crossing → edges ---------- */
// edge: {a, b, bulge} — bulge>0 means the piece bows CCW (DXF convention)
function buildEdges(parts, tol){
  for (const p of parts) p.cuts = [];
  for (let i=0;i<parts.length;i++){
    const A=parts[i], ab=partBBox(A);
    for (let j=i+1;j<parts.length;j++){
      const B=parts[j];
      if (!bboxTouch(ab, partBBox(B), tol)) continue;
      let qs=[];
      if (!A.arc && !B.arc){
        const q=segSeg(A.a, A.b, B.a, B.b); if (q) qs=[q];
      } else if (!A.arc){
        qs=segCircle(A.a, A.b, {x:B.arc.cx,y:B.arc.cy}, B.arc.r).filter(q=>onArcPart(B,q));
      } else if (!B.arc){
        qs=segCircle(B.a, B.b, {x:A.arc.cx,y:A.arc.cy}, A.arc.r).filter(q=>onArcPart(A,q));
      } else {
        qs=circleCircle({x:A.arc.cx,y:A.arc.cy}, A.arc.r, {x:B.arc.cx,y:B.arc.cy}, B.arc.r)
           .filter(q=>onArcPart(A,q) && onArcPart(B,q));
      }
      for (const q of qs){
        A.cuts.push(A.arc ? arcOffset(A,q) : segT(A,q));
        B.cuts.push(B.arc ? arcOffset(B,q) : segT(B,q));
      }
    }
  }
  const edges=[];
  for (const p of parts){
    if (!p.arc){
      const L=Math.hypot(p.b.x-p.a.x, p.b.y-p.a.y);
      if (L < tol) continue;
      const ts=[0,1,...p.cuts.filter(t=>t>0 && t<1)].sort((x,y)=>x-y);
      const at=t=>({x:p.a.x+(p.b.x-p.a.x)*t, y:p.a.y+(p.b.y-p.a.y)*t});
      for (let k=0;k<ts.length-1;k++)
        if ((ts[k+1]-ts[k])*L > tol) edges.push({a:at(ts[k]), b:at(ts[k+1]), bulge:0});
    } else {
      const minSweep = Math.max(tol/p.arc.r, ANG_EPS);
      // rings keep every cut (all angles are interior); open arcs drop cuts at
      // their endpoints — those are nodes already
      let ss = p.ring ? [...p.cuts] : p.cuts.filter(s=>s>minSweep && s<p.sweep-minSweep);
      ss.sort((x,y)=>x-y);
      if (p.ring){
        const dd=[];
        for (const s of ss) if (!dd.length || s-dd[dd.length-1] > minSweep) dd.push(s);
        if (dd.length>1 && dd[0]+TAU-dd[dd.length-1] <= minSweep) dd.pop();
        ss=dd;
        // a full circle needs at least two nodes or its one edge is a self-loop
        if (!ss.length) ss=[0, Math.PI];
        else if (ss.length===1) ss.push(normAng(ss[0]+Math.PI));
        ss.sort((x,y)=>x-y);
      } else ss.push(0, p.sweep), ss.sort((x,y)=>x-y);
      const spans=[];
      for (let k=0;k<ss.length-1;k++) spans.push([ss[k], ss[k+1]]);
      if (p.ring) spans.push([ss[ss.length-1], ss[0]+TAU]);   // close the ring
      for (const [sa,sb] of spans){
        const sw=sb-sa;
        if (sw < minSweep) continue;
        edges.push({a:arcPt(p.arc, p.arc.a0+sa), b:arcPt(p.arc, p.arc.a0+sb),
                    bulge:Math.tan(sw/4)});
      }
    }
  }
  return edges;
}

/* ---------- graph: nodes keyed on a tolerance grid, stubs pruned ---------- */
function buildGraph(edges, tol){
  const key = q => Math.round(q.x/tol) + ',' + Math.round(q.y/tol);
  const nodes = new Map();
  const at = q => {
    const k=key(q);
    if (!nodes.has(k)) nodes.set(k, {p:q, out:[]});
    return nodes.get(k);
  };
  for (const e of edges){
    const na=at(e.a), nb=at(e.b);
    if (na===nb && !e.bulge) continue;              // zero-length
    if (na===nb) continue;                          // self-loop can't be walked
    e.na=na; e.nb=nb;
    // tangents in the a→b travel direction (arcs bow CCW: bulge>0)
    if (!e.bulge){
      const L=Math.hypot(e.b.x-e.a.x, e.b.y-e.a.y);
      e.ta = e.tb = {x:(e.b.x-e.a.x)/L, y:(e.b.y-e.a.y)/L};
    } else {
      const A=bulgeArc(e.a, e.b, e.bulge), s=Math.sign(e.bulge);
      const dir=q=>{ const th=Math.atan2(q.y-A.cy, q.x-A.cx);
                     return {x:-Math.sin(th)*s, y:Math.cos(th)*s}; };
      e.A=A; e.ta=dir(e.a); e.tb=dir(e.b);
    }
    na.out.push({e, fwd:true});
    nb.out.push({e, fwd:false});
  }
  // prune dead ends: an edge with a degree-1 endpoint is never part of a loop
  let changed=true;
  while (changed){
    changed=false;
    for (const n of nodes.values()){
      if (n.out.length!==1) continue;
      const {e}=n.out[0];
      for (const m of [e.na, e.nb]) m.out=m.out.filter(o=>o.e!==e);
      changed=true;
    }
  }
  const live=[];
  for (const n of nodes.values()) for (const o of n.out) if (o.fwd) live.push(o.e);
  return {nodes, key, edges:live};
}

/* directed-edge accessors — points come from the node representatives, so
   vertices that quantized together emit identical coordinates */
const dStart = d => d.fwd ? d.e.na.p : d.e.nb.p;
const dEndNode = d => d.fwd ? d.e.nb : d.e.na;
// travel direction leaving the start / arriving at the end
const dOutDir = d => d.fwd ? d.e.ta : {x:-d.e.tb.x, y:-d.e.tb.y};
const dInDir  = d => d.fwd ? d.e.tb : {x:-d.e.ta.x, y:-d.e.ta.y};
const dBulge  = d => d.fwd ? d.e.bulge : -d.e.bulge;

/* ---------- find the edge a ray from p hits first ---------- */
function rayHit(p, r, edges, tol){
  let best=null;
  for (const e of edges){
    if (!e.bulge){
      const t=lineSegT(p, r, e.a, e.b);
      if (t!==null && t>tol && (!best || t<best.t)) best={t, e, d:e.ta};
    } else {
      for (const t of lineCircleT(p, r, {x:e.A.cx, y:e.A.cy}, e.A.r)){
        if (t<=tol || (best && t>=best.t)) continue;
        const q={x:p.x+t*r.x, y:p.y+t*r.y};
        if (normAng(Math.atan2(q.y-e.A.cy, q.x-e.A.cx) - e.A.a0) > arcSweep(e.A)+ANG_EPS) continue;
        const s=Math.sign(e.bulge), th=Math.atan2(q.y-e.A.cy, q.x-e.A.cx);
        best={t, e, d:{x:-Math.sin(th)*s, y:Math.cos(th)*s}};
      }
    }
  }
  if (!best) return null;
  const q={x:p.x+best.t*r.x, y:p.y+best.t*r.y};
  // hits that graze an endpoint or run tangent to the ray are ambiguous — retry
  if (Math.hypot(q.x-best.e.a.x, q.y-best.e.a.y) < tol*4) return {retry:true};
  if (Math.hypot(q.x-best.e.b.x, q.y-best.e.b.y) < tol*4) return {retry:true};
  if (Math.abs(best.d.x*r.y - best.d.y*r.x) < 1e-9) return {retry:true};
  // orient the entry so p (which lies back along -r) is on the LEFT of travel
  const pLeft = (best.d.y*r.x - best.d.x*r.y) > 0;
  return {e:best.e, fwd:pLeft};
}

/* ---------- leftmost-turn walk of the face containing the start edge ---------- */
function walkFace(start, edgeCount){
  const loop=[];
  let cur=start;
  const cap=edgeCount*2+8;
  do {
    loop.push(cur);
    if (loop.length>cap) return null;
    const inDir=dInDir(cur), inAng=Math.atan2(inDir.y, inDir.x);
    let best=null, bestTurn=-Infinity;
    for (const cand of dEndNode(cur).out){
      if (cand.e===cur.e && cand.fwd===!cur.fwd) continue;   // no U-turn on the same edge
      const od=dOutDir(cand);
      let turn=Math.atan2(od.y, od.x)-inAng;
      turn=((turn+Math.PI)%TAU+TAU)%TAU-Math.PI;             // wrap into [-π, π)
      if (turn>bestTurn){ bestTurn=turn; best=cand; }
    }
    if (!best) return null;                                   // dead end (shouldn't survive pruning)
    cur=best;
  } while (cur.e!==start.e || cur.fwd!==start.fwd);
  return loop;
}

/* ---------- loop → pline pts, with collinear/co-circular merging ---------- */
const sameCircle=(A,B,tol)=> A && B &&
  Math.abs(A.cx-B.cx)<tol && Math.abs(A.cy-B.cy)<tol && Math.abs(A.r-B.r)<tol;
function simplify(pts, tol){
  for (let pass=0; pass<8; pass++){
    let changed=false;
    for (let i=0; i<pts.length && pts.length>2; i++){
      const prev=pts[(i-1+pts.length)%pts.length], cur=pts[i],
            next=pts[(i+1)%pts.length];
      const b1=prev.bulge||0, b2=cur.bulge||0;
      let drop=false;
      if (!b1 && !b2 && pts.length>3){
        const cross=(cur.x-prev.x)*(next.y-cur.y)-(cur.y-prev.y)*(next.x-cur.x);
        const dot  =(cur.x-prev.x)*(next.x-cur.x)+(cur.y-prev.y)*(next.y-cur.y);
        drop = Math.abs(cross) < tol*Math.hypot(next.x-prev.x, next.y-prev.y) && dot > 0;
      } else if (b1 && b2 && Math.sign(b1)===Math.sign(b2)){
        const sw=4*(Math.atan(Math.abs(b1))+Math.atan(Math.abs(b2)));
        if (sw < Math.PI*0.9 &&
            sameCircle(bulgeArc(prev,cur,b1), bulgeArc(cur,next,b2), tol*8)){
          prev.bulge=Math.sign(b1)*Math.tan(sw/4);
          drop=true;
        }
      }
      if (drop){ pts.splice(i,1); i--; changed=true; }
    }
    if (!changed) break;
  }
  return pts;
}
// shoelace + circular-segment corrections, SIGNED (CCW > 0)
function signedArea(pts){
  let A2=0;
  for (let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    A2 += a.x*b.y - b.x*a.y;
    const bl=a.bulge||0;
    if (bl){
      const th=4*Math.atan(Math.abs(bl)), A=bulgeArc(a,b,bl);
      if (A) A2 += Math.sign(bl)*(th-Math.sin(th))*A.r*A.r;
    }
  }
  return A2/2;
}

/* ---------- the command's entry point ----------
   ents: pre-filtered entities (visible, unlocked, not frozen).
   Returns {pts} for a closed CCW pline, or {err} with a human message. */
export function traceBoundary(p, ents){
  const parts=[];
  for (const e of ents){
    if (e.type==='text' || e.type==='dim' || e.type==='hatch') continue;
    parts.push(...partsOf(e));
  }
  if (!parts.length) return {err:'Nothing to trace — draw some outlines first.'};

  let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  for (const q of parts){
    const bb=partBBox(q);
    x0=Math.min(x0,bb[0]); y0=Math.min(y0,bb[1]); x1=Math.max(x1,bb[2]); y1=Math.max(y1,bb[3]);
  }
  const tol=Math.max(x1-x0, y1-y0, 1)*1e-6;

  const {edges}=buildGraph(buildEdges(parts, tol), tol);
  if (!edges.length)
    return {err:"That point isn't enclosed — the surrounding lines don't join into a loop. TRIM or EXTEND the gaps, then try again."};

  // several ray angles: a ray that grazes a vertex or runs tangent gets retried
  for (const phi of [0.37, 1.91, 3.53, 5.11, 0.94, 4.31]){
    const hit=rayHit(p, {x:Math.cos(phi), y:Math.sin(phi)}, edges, tol);
    if (!hit || hit.retry) continue;
    const loop=walkFace(hit, edges.length);
    if (!loop) continue;
    const pts=loop.map(d=>{
      const s=dStart(d), bl=dBulge(d);
      return bl ? {x:s.x, y:s.y, bulge:bl} : {x:s.x, y:s.y};
    });
    simplify(pts, tol);
    if (pts.length<2 || signedArea(pts)<=0) break;            // traced the outside world: not enclosed
    if (!pointInPoly(p, tessellateBoundary({type:'pline', closed:true, pts}))) break;
    return {pts};
  }
  return {err:"That point isn't inside a closed outline — check for gaps (ZOOM in to spot them), or click further from the edges."};
}
