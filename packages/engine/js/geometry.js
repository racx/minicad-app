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
