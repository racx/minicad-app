/* =========================================================
   MiniCAD — geometry helpers (pure functions)
   ========================================================= */
export const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
export const fmt = n => (Math.round(n*100)/100).toString();
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
