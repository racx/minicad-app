/* =========================================================
   MiniCAD — intersection module (shared by TRIM/EXTEND/FILLET)
   seg-seg, seg-circle, circle-circle; plines as segments,
   arcs as angle-filtered circles.
   ========================================================= */
import { dist, angleOnArc } from './geometry.js';

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

/* ---------- entity-level ---------- */
function segsOf(e){
  if (e.type==='line') return [[{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}]];
  if (e.type==='pline'){
    const s=[];
    for (let i=0;i<e.pts.length-1;i++) s.push([e.pts[i], e.pts[i+1]]);
    if (e.closed && e.pts.length>2) s.push([e.pts[e.pts.length-1], e.pts[0]]);
    return s;
  }
  return null;
}
function onCurve(e, q){   // circle: always; arc: only within its sweep
  if (e.type==='arc') return angleOnArc(e, Math.atan2(q.y-e.cy, q.x-e.cx));
  return true;
}

// All t along infinite line a + t·d where it crosses entity e (arc-filtered).
export function lineEntT(a, d, e){
  const out=[];
  const segs = segsOf(e);
  if (segs){
    for (const s of segs){ const t=lineSegT(a, d, s[0], s[1]); if (t!==null) out.push(t); }
  } else if (e.type==='circle' || e.type==='arc'){
    for (const t of lineCircleT(a, d, {x:e.cx,y:e.cy}, e.r)){
      const q={x:a.x+t*d.x, y:a.y+t*d.y};
      if (onCurve(e, q)) out.push(t);
    }
  }
  return out;
}

// Feet of perpendiculars dropped from `base` onto entity e (for PERP osnap).
export function perpFoot(base, e){
  const out=[];
  const segs = segsOf(e);
  if (segs){
    for (const [a,b] of segs){
      const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
      if (!L2) continue;
      const t=((base.x-a.x)*dx+(base.y-a.y)*dy)/L2;
      if (t>-EPS && t<1+EPS) out.push({x:a.x+t*dx, y:a.y+t*dy});
    }
  } else if (e.type==='circle' || e.type==='arc'){
    const d=Math.hypot(base.x-e.cx, base.y-e.cy);
    if (d>EPS){
      const ux=(base.x-e.cx)/d, uy=(base.y-e.cy)/d;
      for (const s of [1,-1]){
        const q={x:e.cx+ux*e.r*s, y:e.cy+uy*e.r*s};
        if (onCurve(e, q)) out.push(q);
      }
    }
  }
  return out;
}

// Tangent points on circle/arc e for a line drawn from `base` (TAN osnap).
export function tangentPts(base, e){
  if (e.type!=='circle' && e.type!=='arc') return [];
  const dx=base.x-e.cx, dy=base.y-e.cy, d=Math.hypot(dx,dy);
  if (d<=e.r+EPS) return [];                    // base inside or on the circle: no tangent
  const phi=Math.atan2(dy,dx), alpha=Math.acos(e.r/d);
  const out=[];
  for (const s of [1,-1]){
    const th=phi+s*alpha;
    const q={x:e.cx+e.r*Math.cos(th), y:e.cy+e.r*Math.sin(th)};
    if (onCurve(e,q)) out.push(q);
  }
  return out;
}

// Closest point ON entity e to p (NEA osnap). Null for text/dim.
export function nearestOnEnt(e, p){
  const segs=segsOf(e);
  if (segs){
    let best=null, bd=Infinity;
    for (const [a,b] of segs){
      const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
      let t=L2 ? ((p.x-a.x)*dx+(p.y-a.y)*dy)/L2 : 0;
      t=Math.max(0, Math.min(1, t));
      const q={x:a.x+t*dx, y:a.y+t*dy};
      const d=Math.hypot(p.x-q.x, p.y-q.y);
      if (d<bd){ bd=d; best=q; }
    }
    return best;
  }
  if (e.type==='circle' || e.type==='arc'){
    const dx=p.x-e.cx, dy=p.y-e.cy, d=Math.hypot(dx,dy);
    if (d<EPS) return null;
    const q={x:e.cx+dx/d*e.r, y:e.cy+dy/d*e.r};
    return (e.type==='arc' && !onCurve(e,q)) ? null : q;
  }
  return null;
}

// All intersection points between two entities (text has none).
export function entIntersections(A, B){
  const aS=segsOf(A), bS=segsOf(B);
  const aC=(A.type==='circle'||A.type==='arc')?A:null;
  const bC=(B.type==='circle'||B.type==='arc')?B:null;
  const out=[];
  if (aS && bS){
    for (const s of aS) for (const t of bS){ const q=segSeg(s[0],s[1],t[0],t[1]); if(q) out.push(q); }
  } else if (aS && bC){
    for (const s of aS) for (const q of segCircle(s[0],s[1],{x:bC.cx,y:bC.cy},bC.r)) if (onCurve(bC,q)) out.push(q);
  } else if (aC && bS){
    for (const s of bS) for (const q of segCircle(s[0],s[1],{x:aC.cx,y:aC.cy},aC.r)) if (onCurve(aC,q)) out.push(q);
  } else if (aC && bC){
    for (const q of circleCircle({x:aC.cx,y:aC.cy},aC.r,{x:bC.cx,y:bC.cy},bC.r)) if (onCurve(aC,q)&&onCurve(bC,q)) out.push(q);
  }
  return out;
}
