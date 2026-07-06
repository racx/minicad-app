/* =========================================================
   MiniCAD — intersection module (shared by TRIM/EXTEND/FILLET)
   seg-seg, seg-circle, circle-circle; plines as segments,
   arcs as angle-filtered circles.
   ========================================================= */
import { dist, angleOnArc, plineParts } from './geometry.js';

const EPS = 1e-9;

export function segSeg(a, b, c, d){
  const d1x=b.x-a.x, d1y=b.y-a.y, d2x=d.x-c.x, d2y=d.y-c.y;
  const den = d1x*d2y - d1y*d2x;
  if (Math.abs(den) < EPS) return null;               // parallel/collinear: no single point
  const t = ((c.x-a.x)*d2y - (c.y-a.y)*d2x)/den;
  const u = ((c.x-a.x)*d1y - (c.y-a.y)*d1x)/den;
  if (t<-EPS || t>1+EPS || u<-EPS || u>1+EPS) return null;
  return {x:a.x+t*d1x, y:a.y+t*d1y};
}

export function segCircle(a, b, c, r){
  const dx=b.x-a.x, dy=b.y-a.y;
  const fx=a.x-c.x, fy=a.y-c.y;
  const A=dx*dx+dy*dy, B=2*(fx*dx+fy*dy), C=fx*fx+fy*fy-r*r;
  if (!A) return [];
  let disc=B*B-4*A*C;
  if (disc<0) return [];
  disc=Math.sqrt(disc);
  const out=[];
  for (const t of [(-B-disc)/(2*A), (-B+disc)/(2*A)]){
    if (t>=-EPS && t<=1+EPS) out.push({x:a.x+t*dx, y:a.y+t*dy});
  }
  if (out.length===2 && dist(out[0],out[1])<1e-9) out.pop();   // tangent
  return out;
}

export function circleCircle(c1, r1, c2, r2){
  const d=dist(c1,c2);
  if (d<EPS) return [];                                // concentric
  if (d>r1+r2+EPS || d<Math.abs(r1-r2)-EPS) return [];
  const a=(r1*r1-r2*r2+d*d)/(2*d);
  let h2=r1*r1-a*a; if (h2<0) h2=0;
  const h=Math.sqrt(h2);
  const mx=c1.x+a*(c2.x-c1.x)/d, my=c1.y+a*(c2.y-c1.y)/d;
  const ox=-(c2.y-c1.y)/d*h, oy=(c2.x-c1.x)/d*h;
  const out=[{x:mx+ox,y:my+oy}];
  if (h>EPS) out.push({x:mx-ox,y:my-oy});
  return out;
}

/* ---------- infinite-line queries (EXTEND / FILLET) ---------- */
// infinite line a + t·d vs segment [c,e] → t along the line, or null
export function lineSegT(a, d, c, e){
  const ex=e.x-c.x, ey=e.y-c.y;
  const den = d.x*ey - d.y*ex;
  if (Math.abs(den) < EPS) return null;
  const t = ((c.x-a.x)*ey - (c.y-a.y)*ex)/den;
  const u = ((c.x-a.x)*d.y - (c.y-a.y)*d.x)/den;
  if (u<-EPS || u>1+EPS) return null;
  return t;
}
// infinite line a + t·d vs circle → array of t
export function lineCircleT(a, d, c, r){
  const fx=a.x-c.x, fy=a.y-c.y;
  const A=d.x*d.x+d.y*d.y, B=2*(fx*d.x+fy*d.y), C=fx*fx+fy*fy-r*r;
  if (!A) return [];
  let disc=B*B-4*A*C;
  if (disc<0) return [];
  disc=Math.sqrt(disc);
  const out=[(-B-disc)/(2*A)];
  if (disc>EPS) out.push((-B+disc)/(2*A));
  return out;
}
// intersection point of two infinite lines a1+t·d1 / a2+t·d2, or null if parallel
export function lineLine(a1, d1, a2, d2){
  const den = d1.x*d2.y - d1.y*d2.x;
  if (Math.abs(den) < EPS) return null;
  const t = ((a2.x-a1.x)*d2.y - (a2.y-a1.y)*d2.x)/den;
  return {x:a1.x+t*d1.x, y:a1.y+t*d1.y};
}

/* ---------- entity-level ----------
   Every entity decomposes into PARTS: straight segments and (pseudo-)arcs.
   line → 1 seg · circle/arc → 1 curve · pline → its segments, bulged ones as arcs.
   Text/dim decompose to nothing. This is the single geometry model TRIM/EXTEND/
   FILLET/osnap queries share, so curved polylines behave like their pieces. */
function partsOf(e){
  if (e.type==='line') return [{seg:[{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}]}];
  if (e.type==='circle') return [{arc:e, full:true}];
  if (e.type==='arc') return [{arc:e}];
  if (e.type==='pline')
    return plineParts(e).map(p=> p.arc ? {arc:p.arc} : {seg:[p.a, p.b]});
  return null;
}
function onPart(part, q){   // full circle: always; arcs: only within their sweep
  if (part.full || !part.arc) return true;
  return angleOnArc(part.arc, Math.atan2(q.y-part.arc.cy, q.x-part.arc.cx));
}

// All t along infinite line a + t·d where it crosses entity e (arc-filtered).
export function lineEntT(a, d, e){
  const out=[];
  for (const part of partsOf(e) || []){
    if (part.seg){
      const t=lineSegT(a, d, part.seg[0], part.seg[1]);
      if (t!==null) out.push(t);
    } else {
      for (const t of lineCircleT(a, d, {x:part.arc.cx,y:part.arc.cy}, part.arc.r)){
        const q={x:a.x+t*d.x, y:a.y+t*d.y};
        if (onPart(part, q)) out.push(t);
      }
    }
  }
  return out;
}

// Feet of perpendiculars dropped from `base` onto entity e (for PERP osnap).
export function perpFoot(base, e){
  const out=[];
  for (const part of partsOf(e) || []){
    if (part.seg){
      const [a,b]=part.seg;
      const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
      if (!L2) continue;
      const t=((base.x-a.x)*dx+(base.y-a.y)*dy)/L2;
      if (t>-EPS && t<1+EPS) out.push({x:a.x+t*dx, y:a.y+t*dy});
    } else {
      const A=part.arc, d=Math.hypot(base.x-A.cx, base.y-A.cy);
      if (d>EPS){
        const ux=(base.x-A.cx)/d, uy=(base.y-A.cy)/d;
        for (const s of [1,-1]){
          const q={x:A.cx+ux*A.r*s, y:A.cy+uy*A.r*s};
          if (onPart(part, q)) out.push(q);
        }
      }
    }
  }
  return out;
}

// Tangent points on curved parts of e for a line drawn from `base` (TAN osnap).
export function tangentPts(base, e){
  const out=[];
  for (const part of partsOf(e) || []){
    if (!part.arc) continue;
    const A=part.arc;
    const dx=base.x-A.cx, dy=base.y-A.cy, d=Math.hypot(dx,dy);
    if (d<=A.r+EPS) continue;                   // base inside or on the circle: no tangent
    const phi=Math.atan2(dy,dx), alpha=Math.acos(A.r/d);
    for (const s of [1,-1]){
      const th=phi+s*alpha;
      const q={x:A.cx+A.r*Math.cos(th), y:A.cy+A.r*Math.sin(th)};
      if (onPart(part, q)) out.push(q);
    }
  }
  return out;
}

// Closest point ON entity e to p (NEA osnap). Null for text/dim.
export function nearestOnEnt(e, p){
  let best=null, bd=Infinity;
  const take=q=>{ const d=Math.hypot(p.x-q.x, p.y-q.y); if (d<bd){ bd=d; best=q; } };
  for (const part of partsOf(e) || []){
    if (part.seg){
      const [a,b]=part.seg;
      const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
      let t=L2 ? ((p.x-a.x)*dx+(p.y-a.y)*dy)/L2 : 0;
      t=Math.max(0, Math.min(1, t));
      take({x:a.x+t*dx, y:a.y+t*dy});
    } else {
      const A=part.arc;
      const dx=p.x-A.cx, dy=p.y-A.cy, d=Math.hypot(dx,dy);
      if (d<EPS) continue;
      const q={x:A.cx+dx/d*A.r, y:A.cy+dy/d*A.r};
      if (onPart(part, q)) take(q);
    }
  }
  return best;
}

// All intersection points between two entities (text has none).
export function entIntersections(A, B){
  const aP=partsOf(A), bP=partsOf(B);
  const out=[];
  if (!aP || !bP) return out;
  for (const pa of aP) for (const pb of bP){
    if (pa.seg && pb.seg){
      const q=segSeg(pa.seg[0],pa.seg[1],pb.seg[0],pb.seg[1]); if (q) out.push(q);
    } else if (pa.seg && pb.arc){
      for (const q of segCircle(pa.seg[0],pa.seg[1],{x:pb.arc.cx,y:pb.arc.cy},pb.arc.r)) if (onPart(pb,q)) out.push(q);
    } else if (pa.arc && pb.seg){
      for (const q of segCircle(pb.seg[0],pb.seg[1],{x:pa.arc.cx,y:pa.arc.cy},pa.arc.r)) if (onPart(pa,q)) out.push(q);
    } else {
      for (const q of circleCircle({x:pa.arc.cx,y:pa.arc.cy},pa.arc.r,{x:pb.arc.cx,y:pb.arc.cy},pb.arc.r))
        if (onPart(pa,q) && onPart(pb,q)) out.push(q);
    }
  }
  return out;
}
