/* =========================================================
   MiniCAD — entity operations: hit-testing, bboxes,
   snap candidates, transforms
   ========================================================= */
import { dist, ptSegDist, arcPt, arcSweep, angleOnArc, normAng, mirrorPt,
         plineParts, bulgeApex, bulgeFromApex, tessellateBoundary, pointInPoly } from './geometry.js';
import { entities, view, layerVisible, layerUnlocked } from './state.js';

// text height of a dim: explicit e.h, else automatic (4% of measured length)
export function dimH(e){ return e.h || dimGeom(e).L*0.04 || 1; }

// derived geometry of a dim entity: dim line endpoints a,b + left normal + value
export function dimGeom(e){
  const dx=e.x2-e.x1, dy=e.y2-e.y1, L=Math.hypot(dx,dy)||1;
  const nx=-dy/L, ny=dx/L;
  return {
    a:{x:e.x1+nx*e.off, y:e.y1+ny*e.off},
    b:{x:e.x2+nx*e.off, y:e.y2+ny*e.off},
    nx, ny, L:Math.hypot(dx,dy)
  };
}

export function entHitDist(ent, p){
  if (ent.type==='dim'){
    const g=dimGeom(ent);
    return Math.min(
      ptSegDist(p, g.a, g.b),
      ptSegDist(p, {x:ent.x1,y:ent.y1}, g.a),
      ptSegDist(p, {x:ent.x2,y:ent.y2}, g.b));
  }
  if (ent.type==='line') return ptSegDist(p, {x:ent.x1,y:ent.y1}, {x:ent.x2,y:ent.y2});
  if (ent.type==='circle') return Math.abs(dist(p,{x:ent.cx,y:ent.cy}) - ent.r);
  if (ent.type==='arc'){
    if (angleOnArc(ent, Math.atan2(p.y-ent.cy, p.x-ent.cx)))
      return Math.abs(dist(p,{x:ent.cx,y:ent.cy}) - ent.r);
    return Math.min(dist(p, arcPt(ent, ent.a0)), dist(p, arcPt(ent, ent.a1)));
  }
  if (ent.type==='pline'){
    let m=Infinity;
    for (const part of plineParts(ent)){
      if (part.arc){
        const A=part.arc;
        m = Math.min(m, angleOnArc(A, Math.atan2(p.y-A.cy, p.x-A.cx))
          ? Math.abs(dist(p,{x:A.cx,y:A.cy}) - A.r)
          : Math.min(dist(p, part.a), dist(p, part.b)));
      } else m = Math.min(m, ptSegDist(p, part.a, part.b));
    }
    return m;
  }
  if (ent.type==='hatch'){
    const b = entities.find(z=>z.id===ent.ref);
    if (!b) return Infinity;
    return pointInPoly(p, tessellateBoundary(b)) ? 6/view.scale : Infinity;
  }
  if (ent.type==='text'){
    const w = ent.str.length * ent.h * 0.62, h = ent.h;
    if (p.x>=ent.x && p.x<=ent.x+w && p.y>=ent.y && p.y<=ent.y+h) return 0;
    return Math.min(
      ptSegDist(p,{x:ent.x,y:ent.y},{x:ent.x+w,y:ent.y}),
      ptSegDist(p,{x:ent.x,y:ent.y+h},{x:ent.x+w,y:ent.y+h}),
      ptSegDist(p,{x:ent.x,y:ent.y},{x:ent.x,y:ent.y+h}),
      ptSegDist(p,{x:ent.x+w,y:ent.y},{x:ent.x+w,y:ent.y+h}));
  }
  return Infinity;
}
export function findEntityAt(p){
  const tol = 8/view.scale;
  let best=null, bd=tol;
  for (const e of entities){
    if (!layerVisible(e.layer) || !layerUnlocked(e.layer)) continue;   // hidden/locked: hands off
    const d=entHitDist(e,p); if (d<=bd){ bd=d; best=e; }
  }
  return best;
}
export function entBBox(e){
  if (e.type==='line') return [Math.min(e.x1,e.x2),Math.min(e.y1,e.y2),Math.max(e.x1,e.x2),Math.max(e.y1,e.y2)];
  if (e.type==='circle') return [e.cx-e.r,e.cy-e.r,e.cx+e.r,e.cy+e.r];
  if (e.type==='arc'){
    const pts=[arcPt(e,e.a0), arcPt(e,e.a1)];
    for (const q of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) if (angleOnArc(e,q)) pts.push(arcPt(e,q));
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
    return [x0,y0,x1,y1];
  }
  if (e.type==='pline'){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    const eat=p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);};
    for(const p of e.pts) eat(p);
    for (const part of plineParts(e)) if (part.arc)          // arc segments can bow past their vertices
      for (const q of [0, Math.PI/2, Math.PI, 3*Math.PI/2])
        if (angleOnArc(part.arc, q)) eat(arcPt(part.arc, q));
    return [x0,y0,x1,y1];
  }
  if (e.type==='hatch'){
    const b = entities.find(z=>z.id===e.ref);
    return b ? entBBox(b) : [0,0,0,0];
  }
  if (e.type==='text'){ const w=e.str.length*e.h*0.62; return [e.x,e.y,e.x+w,e.y+e.h]; }
  if (e.type==='dim'){
    const g=dimGeom(e);
    return [Math.min(e.x1,e.x2,g.a.x,g.b.x), Math.min(e.y1,e.y2,g.a.y,g.b.y),
            Math.max(e.x1,e.x2,g.a.x,g.b.x), Math.max(e.y1,e.y2,g.a.y,g.b.y)];
  }
  return [0,0,0,0];
}
export function entInWindow(e, r, crossing){ // r = [x0,y0,x1,y1] world
  const b = entBBox(e);
  const inside = b[0]>=r[0]&&b[1]>=r[1]&&b[2]<=r[2]&&b[3]<=r[3];
  if (!crossing) return inside;
  const overlap = !(b[2]<r[0]||b[0]>r[2]||b[3]<r[1]||b[1]>r[3]);
  return overlap;
}

/* ---------- object snap candidates ---------- */
export function snapCandidates(excludeId){
  const out=[];
  for (const e of entities){
    if (e.id===excludeId) continue;              // grip drags don't snap to themselves
    if (!layerVisible(e.layer)) continue;        // hidden layers don't snap (locked ones do)
    if (e.type==='line'){
      out.push({p:{x:e.x1,y:e.y1},k:'end'}, {p:{x:e.x2,y:e.y2},k:'end'},
               {p:{x:(e.x1+e.x2)/2,y:(e.y1+e.y2)/2},k:'mid'});
    } else if (e.type==='circle'){
      out.push({p:{x:e.cx,y:e.cy},k:'cen'});
      out.push({p:{x:e.cx+e.r,y:e.cy},k:'quad'},{p:{x:e.cx-e.r,y:e.cy},k:'quad'},
               {p:{x:e.cx,y:e.cy+e.r},k:'quad'},{p:{x:e.cx,y:e.cy-e.r},k:'quad'});
    } else if (e.type==='arc'){
      out.push({p:arcPt(e,e.a0),k:'end'}, {p:arcPt(e,e.a1),k:'end'},
               {p:arcPt(e, e.a0 + arcSweep(e)/2),k:'mid'},
               {p:{x:e.cx,y:e.cy},k:'cen'});
    } else if (e.type==='pline'){
      for (const p of e.pts) out.push({p:{x:p.x,y:p.y},k:'end'});
      for (const part of plineParts(e)){
        out.push({p: part.arc ? bulgeApex(part.a, part.b, part.bulge)
                              : {x:(part.a.x+part.b.x)/2, y:(part.a.y+part.b.y)/2}, k:'mid'});
        if (part.arc) out.push({p:{x:part.arc.cx, y:part.arc.cy}, k:'cen'});
      }
    } else if (e.type==='text'){
      out.push({p:{x:e.x,y:e.y},k:'end'});
    } else if (e.type==='dim'){
      const g=dimGeom(e);
      out.push({p:{x:e.x1,y:e.y1},k:'end'}, {p:{x:e.x2,y:e.y2},k:'end'},
               {p:{x:(g.a.x+g.b.x)/2,y:(g.a.y+g.b.y)/2},k:'mid'});
    }
  }
  return out;
}

/* ---------- grips ---------- */
// Grip points shown on a selected entity. `g` names the grip for applyGrip.
export function entGrips(e){
  if (e.type==='line') return [
    {x:e.x1, y:e.y1, g:'p1'},
    {x:(e.x1+e.x2)/2, y:(e.y1+e.y2)/2, g:'mid'},
    {x:e.x2, y:e.y2, g:'p2'}];
  if (e.type==='circle') return [
    {x:e.cx, y:e.cy, g:'cen'},
    {x:e.cx+e.r, y:e.cy, g:'rad'}, {x:e.cx-e.r, y:e.cy, g:'rad'},
    {x:e.cx, y:e.cy+e.r, g:'rad'}, {x:e.cx, y:e.cy-e.r, g:'rad'}];
  if (e.type==='arc'){
    const m = arcPt(e, e.a0 + arcSweep(e)/2);
    return [{...arcPt(e,e.a0), g:'a0'}, {x:m.x, y:m.y, g:'rad'}, {...arcPt(e,e.a1), g:'a1'}];
  }
  if (e.type==='pline'){
    const out = e.pts.map((p,i)=>({x:p.x, y:p.y, g:'v'+i}));
    plineParts(e).forEach((part,i)=>{                 // arc segments: apex grip reshapes the bulge
      if (part.arc){ const q=bulgeApex(part.a, part.b, part.bulge); out.push({x:q.x, y:q.y, g:'b'+i}); }
    });
    return out;
  }
  if (e.type==='text') return [{x:e.x, y:e.y, g:'ins'}];
  if (e.type==='dim'){
    const g=dimGeom(e);
    return [{x:e.x1, y:e.y1, g:'p1'}, {x:e.x2, y:e.y2, g:'p2'},
            {x:(g.a.x+g.b.x)/2, y:(g.a.y+g.b.y)/2, g:'off'}];
  }
  return [];
}
// Move grip `g` of entity `e` to point `p`.
export function applyGrip(e, g, p){
  if (e.type==='line'){
    if (g==='p1'){ e.x1=p.x; e.y1=p.y; }
    else if (g==='p2'){ e.x2=p.x; e.y2=p.y; }
    else { const mx=(e.x1+e.x2)/2, my=(e.y1+e.y2)/2; translateEnt(e, p.x-mx, p.y-my); }
  }
  else if (e.type==='circle'){
    if (g==='cen'){ e.cx=p.x; e.cy=p.y; }
    else { const r=Math.hypot(p.x-e.cx, p.y-e.cy); if (r>1e-9) e.r=r; }
  }
  else if (e.type==='arc'){
    if (g==='a0') e.a0 = Math.atan2(p.y-e.cy, p.x-e.cx);
    else if (g==='a1') e.a1 = Math.atan2(p.y-e.cy, p.x-e.cx);
    else { const r=Math.hypot(p.x-e.cx, p.y-e.cy); if (r>1e-9) e.r=r; }
  }
  else if (e.type==='pline'){
    const i = +g.slice(1);
    if (g[0]==='v'){ if (e.pts[i]){ e.pts[i].x=p.x; e.pts[i].y=p.y; } }
    else if (g[0]==='b'){                             // apex grip: recompute the segment's bulge
      const part = plineParts(e)[i];
      if (part){
        const bl = bulgeFromApex(part.a, part.b, p);
        if (Math.abs(bl) < 1e-9) delete part.a.bulge; else part.a.bulge = bl;
      }
    }
  }
  else if (e.type==='text'){ e.x=p.x; e.y=p.y; }
  else if (e.type==='dim'){
    if (g==='p1'){ e.x1=p.x; e.y1=p.y; }
    else if (g==='p2'){ e.x2=p.x; e.y2=p.y; }
    else {                                        // 'off': slide the dimension line
      const dx=e.x2-e.x1, dy=e.y2-e.y1, L=Math.hypot(dx,dy)||1;
      e.off = ((p.x-e.x1)*(-dy)+(p.y-e.y1)*dx)/L;
    }
  }
}

/* ---------- transforms ---------- */
export function translateEnt(e,dx,dy){
  if (e.type==='line'){ e.x1+=dx;e.y1+=dy;e.x2+=dx;e.y2+=dy; }
  else if (e.type==='circle' || e.type==='arc'){ e.cx+=dx;e.cy+=dy; }
  else if (e.type==='pline'){ e.pts.forEach(p=>{p.x+=dx;p.y+=dy;}); }
  else if (e.type==='text'){ e.x+=dx;e.y+=dy; }
  else if (e.type==='dim'){ e.x1+=dx;e.y1+=dy;e.x2+=dx;e.y2+=dy; }
}
export function translateIds(ids,dx,dy){ ids.forEach(id=>{const e=entities.find(z=>z.id===id); if(e)translateEnt(e,dx,dy);}); }

// reflect entity across the line through a,b (in place)
export function mirrorEnt(e, a, b){
  if (e.type==='line'){
    const p=mirrorPt({x:e.x1,y:e.y1},a,b), q=mirrorPt({x:e.x2,y:e.y2},a,b);
    e.x1=p.x; e.y1=p.y; e.x2=q.x; e.y2=q.y;
  }
  else if (e.type==='circle'){ const c=mirrorPt({x:e.cx,y:e.cy},a,b); e.cx=c.x; e.cy=c.y; }
  else if (e.type==='arc'){
    const c=mirrorPt({x:e.cx,y:e.cy},a,b);
    const phi=Math.atan2(b.y-a.y, b.x-a.x);
    const na0=normAng(2*phi - e.a1), na1=normAng(2*phi - e.a0);   // reflect + swap keeps CCW
    e.cx=c.x; e.cy=c.y; e.a0=na0; e.a1=na1;
  }
  else if (e.type==='pline'){ e.pts=e.pts.map(p=>{ const q=mirrorPt(p,a,b);
    return p.bulge ? {x:q.x, y:q.y, bulge:-p.bulge} : q; }); }   // reflection flips arc direction
  else if (e.type==='text'){ const p=mirrorPt({x:e.x,y:e.y},a,b); e.x=p.x; e.y=p.y; }  // like MIRRTEXT=0: stays readable
  else if (e.type==='dim'){
    const g=dimGeom(e);
    const D=mirrorPt(g.a, a, b);                  // a point on the mirrored dim line
    const p1=mirrorPt({x:e.x1,y:e.y1},a,b), p2=mirrorPt({x:e.x2,y:e.y2},a,b);
    e.x1=p1.x; e.y1=p1.y; e.x2=p2.x; e.y2=p2.y;
    const dx=e.x2-e.x1, dy=e.y2-e.y1, L=Math.hypot(dx,dy)||1;
    e.off=((D.x-e.x1)*(-dy)+(D.y-e.y1)*dx)/L;     // recompute signed offset on the new side
  }
}
