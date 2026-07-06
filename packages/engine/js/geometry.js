/* =========================================================
   MiniCAD — geometry helpers (pure functions)
   ========================================================= */
export const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
export const fmt = n => (Math.round(n*100)/100).toString();
// length formatting per drawing unit: mm→integer, cm→0.1, m→0.01
export function formatLen(v, u){
  if (u==='mm') return Math.round(v).toString();
  if (u==='m')  return (Math.round(v*100)/100).toFixed(2);
  return (Math.round(v*10)/10).toString();                  // cm
}
export function deep(o){ return JSON.parse(JSON.stringify(o)); }

export function ptSegDist(p, a, b){
  const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
  if (!L2) return dist(p,a);
  let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/L2; t=Math.max(0,Math.min(1,t));
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}
export function rotPt(p,b,c,s){ const x=p.x-b.x,y=p.y-b.y; return {x:b.x+x*c-y*s, y:b.y+x*s+y*c}; }

// reflect p across the infinite line through a and b
export function mirrorPt(p, a, b){
  const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
  if (!L2) return {x:p.x, y:p.y};
  const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/L2;
  return {x:2*(a.x+t*dx)-p.x, y:2*(a.y+t*dy)-p.y};
}

/* ---------- arcs (a0→a1 counter-clockwise, radians) ---------- */
export const TAU = Math.PI*2;
export const normAng = a => ((a % TAU) + TAU) % TAU;
export function arcSweep(arc){ return normAng(arc.a1 - arc.a0) || TAU; }
export function arcPt(arc, ang){ return {x:arc.cx + arc.r*Math.cos(ang), y:arc.cy + arc.r*Math.sin(ang)}; }
export function angleOnArc(arc, ang){ return normAng(ang - arc.a0) <= arcSweep(arc) + 1e-9; }
/* ---------- bulge segments (DXF group-42 convention) ----------
   A pline vertex may carry `bulge` describing the segment to the NEXT vertex:
   bulge = tan(θ/4), θ = included angle; positive = travel runs CCW (which puts
   the apex on the right of the chord a→b), negative = CW. bulge 0/absent = straight. */

// arc midpoint ("apex") of the segment a→b with the given bulge
export function bulgeApex(a, b, bulge){
  const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
  const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
  if (!L) return {x:mx, y:my};
  const s = bulge*L/2;                              // signed sagitta, along the right normal
  return {x:mx + dy/L*s, y:my - dx/L*s};
}
// pseudo-arc {cx,cy,r,a0,a1} (CCW-normalized like entity arcs) for a bulged segment
export function bulgeArc(a, b, bulge){
  if (!bulge) return null;
  return arcFrom3(a, bulgeApex(a, b, bulge), b);
}
// bulge that makes segment mid-arc pass exactly through apex point q (0 if on chord)
export function bulgeFromApex(a, b, q){
  const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
  if (!L) return 0;
  const h = (q.x-(a.x+b.x)/2)*dy/L - (q.y-(a.y+b.y)/2)*dx/L;   // signed dist along right normal
  return 2*h/L;
}
// bulge of the tangent-continuation arc: start P with unit tangent t, ending at E
export function tangentBulge(P, t, E){
  const vx=E.x-P.x, vy=E.y-P.y;
  if (Math.hypot(vx,vy) < 1e-12) return 0;
  const alpha = Math.atan2(t.x*vy - t.y*vx, t.x*vx + t.y*vy);  // signed angle tangent→chord
  return Math.tan(alpha/2);                         // +90° (semicircle): bulge = tan(45°) = 1
}
// unit tangent at the END of segment a→b with bulge (direction of travel)
export function bulgeEndTangent(a, b, bulge){
  const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
  if (!L) return null;
  const u={x:dx/L, y:dy/L};
  if (!bulge) return u;
  const alpha = 2*Math.atan(bulge);                 // tangent-chord angle, mirrored at the far end
  const c=Math.cos(alpha), s=Math.sin(alpha);
  return {x:u.x*c - u.y*s, y:u.x*s + u.y*c};
}
// bulge of the segment a→b whose arc passes through m (0 if collinear)
export function bulgeFrom3(a, m, b){
  const A = arcFrom3(a, m, b);
  if (!A) return 0;
  const angA=Math.atan2(a.y-A.cy, a.x-A.cx), angB=Math.atan2(b.y-A.cy, b.x-A.cx),
        angM=Math.atan2(m.y-A.cy, m.x-A.cx);
  const ccw = normAng(angM-angA) <= normAng(angB-angA) + 1e-9;   // does CCW travel a→b pass m?
  const half = ccw ? normAng(angB-angA)/2 : -normAng(angA-angB)/2;
  return bulgeFromApex(a, b, arcPt(A, angA+half));
}
// unit tangent at the end of a pline-in-progress (null with fewer than 2 points)
export function plineEndTangent(pts){
  if (pts.length<2) return null;
  const a=pts[pts.length-2], b=pts[pts.length-1];
  return bulgeEndTangent(a, b, a.bulge||0);
}
// segments of a pline as parts: {a, b, bulge, arc:null|pseudo-arc}, incl. the closing one
export function plineParts(e){
  const out=[], n=e.pts.length;
  const seg=(a,b)=>{ const bl=a.bulge||0; out.push({a, b, bulge:bl, arc: bl?bulgeArc(a,b,bl):null}); };
  for (let i=0;i<n-1;i++) seg(e.pts[i], e.pts[i+1]);
  if (e.closed && n>2) seg(e.pts[n-1], e.pts[0]);
  return out;
}
export const plineCurved = e => e.type==='pline' && e.pts.some(p=>p.bulge);

// arc through three points (start, on-arc, end) → {cx,cy,r,a0,a1} or null if collinear
export function arcFrom3(p1, p2, p3){
  const d = 2*(p1.x*(p2.y-p3.y) + p2.x*(p3.y-p1.y) + p3.x*(p1.y-p2.y));
  if (Math.abs(d) < 1e-12) return null;
  const s1=p1.x*p1.x+p1.y*p1.y, s2=p2.x*p2.x+p2.y*p2.y, s3=p3.x*p3.x+p3.y*p3.y;
  const cx=(s1*(p2.y-p3.y)+s2*(p3.y-p1.y)+s3*(p1.y-p2.y))/d;
  const cy=(s1*(p3.x-p2.x)+s2*(p1.x-p3.x)+s3*(p2.x-p1.x))/d;
  const r=Math.hypot(p1.x-cx, p1.y-cy);
  let a0=Math.atan2(p1.y-cy,p1.x-cx), am=Math.atan2(p2.y-cy,p2.x-cx), a1=Math.atan2(p3.y-cy,p3.x-cx);
  if (normAng(am-a0) > normAng(a1-a0)) [a0,a1]=[a1,a0];   // middle point picks the direction
  return {cx, cy, r, a0:normAng(a0), a1:normAng(a1)};
}
