/* =========================================================
   MiniCAD — canvas, view transform, grid, rendering
   ========================================================= */
import { dist, fmt, arcFrom3, bulgeArc, tangentBulge, bulgeFrom3, plineEndTangent } from './geometry.js';
import { entities, view, T, cmd, curPt, snapMark, trackGuides, boxSel, mouse, selection, layerOf, layerVisible, hoverSel, hotGrip, unitFmt, units } from './state.js';
import { entBBox, entGrips, dimGeom, dimH } from './entities.js';
import { materialByKey } from './materials.js';
import { log } from './ui.js';

export const cv = document.getElementById('cv');
export const ctx = cv.getContext('2d');

export let DPR = 1, W = 0, H = 0;

export { w2s, s2w, gridStep } from './core/viewport.js';
import { w2s, s2w, gridStep } from './core/viewport.js';
import { connectUI } from './core/bus.js';

export function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#131519'; ctx.fillRect(0,0,W,H);

  const tl = s2w(0,0), br = s2w(W,H);
  // grid
  if (T.grid){
    const s = gridStep();
    const x0 = Math.floor(tl.x/s)*s, x1 = Math.ceil(br.x/s)*s;
    const y0 = Math.floor(br.y/s)*s, y1 = Math.ceil(tl.y/s)*s;
    ctx.lineWidth = 1;
    for (let x=x0;x<=x1;x+=s){
      const sx = Math.round(x*view.scale + view.ox)+.5;
      const major = Math.round(x/s) % 5 === 0;
      ctx.strokeStyle = major ? '#232833' : '#1b1f27';
      ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
    }
    for (let y=y0;y<=y1;y+=s){
      const sy = Math.round(-y*view.scale + view.oy)+.5;
      const major = Math.round(y/s) % 5 === 0;
      ctx.strokeStyle = major ? '#232833' : '#1b1f27';
      ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(W,sy); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = '#31394a';
    const ax = w2s({x:0,y:0});
    ctx.beginPath(); ctx.moveTo(Math.round(ax.x)+.5,0); ctx.lineTo(Math.round(ax.x)+.5,H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,Math.round(ax.y)+.5); ctx.lineTo(W,Math.round(ax.y)+.5); ctx.stroke();
  }

  // entities (hidden layers skipped); hatches first, under the linework
  for (const e of entities) if (e.type==='hatch' && layerVisible(e.layer)) drawHatch(e);
  for (const e of entities) if (e.type!=='hatch' && layerVisible(e.layer)) drawEntity(e, 0, 0, false);

  // move/copy ghost preview
  if (cmd && (cmd.name==='MOVE'||cmd.name==='COPY') && cmd.step==='dest'){
    const dx = curPt.x - cmd.base.x, dy = curPt.y - cmd.base.y;
    ctx.globalAlpha = .45;
    for (const id of cmd.sel){ const e = entities.find(z=>z.id===id); if (e) drawEntity(e, dx, dy, true); }
    ctx.globalAlpha = 1;
  }

  drawRubber();

  // grips on selected entities (idle only)
  if (!cmd && selection.size){
    for (const e of entities){
      if (!selection.has(e.id)) continue;
      for (const g of entGrips(e)){
        const s = w2s(g);
        const hot = hotGrip && hotGrip.id===e.id && hotGrip.g===g.g;
        ctx.fillStyle = hot ? '#ef7b7b' : '#4db8ff';
        ctx.fillRect(s.x-3.5, s.y-3.5, 7, 7);
        ctx.strokeStyle = '#131519'; ctx.lineWidth = 1;
        ctx.strokeRect(s.x-3.5, s.y-3.5, 7, 7);
      }
    }
  }

  // box selection rectangle
  if (boxSel){
    const x=Math.min(boxSel.x0,boxSel.x1), y=Math.min(boxSel.y0,boxSel.y1);
    const w=Math.abs(boxSel.x1-boxSel.x0), h=Math.abs(boxSel.y1-boxSel.y0);
    const crossing = boxSel.x1 < boxSel.x0;
    ctx.fillStyle = crossing ? 'rgba(120,220,120,.08)' : 'rgba(80,160,255,.08)';
    ctx.strokeStyle = crossing ? '#6fce6f' : '#4db8ff';
    ctx.setLineDash(crossing ? [5,4] : []);
    ctx.fillRect(x,y,w,h); ctx.strokeRect(x+.5,y+.5,w,h);
    ctx.setLineDash([]);
  }

  // alignment-tracking guides
  if (trackGuides && mouse.inside){
    ctx.strokeStyle='rgba(67,214,181,.65)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
    for (const g of trackGuides){
      const A=w2s(g.from), B=w2s(g.to);
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      ctx.strokeRect(A.x-2.5, A.y-2.5, 5, 5);   // the point you're aligned with
    }
    ctx.setLineDash([]);
  }

  // osnap marker
  if (snapMark && mouse.inside){
    const s = w2s(snapMark.p); const r=6;
    ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (snapMark.k==='end'){ ctx.rect(s.x-r,s.y-r,2*r,2*r); }
    else if (snapMark.k==='mid'){ ctx.moveTo(s.x,s.y-r); ctx.lineTo(s.x-r,s.y+r); ctx.lineTo(s.x+r,s.y+r); ctx.closePath(); }
    else if (snapMark.k==='cen'){ ctx.arc(s.x,s.y,r,0,Math.PI*2); }
    else if (snapMark.k==='int' || snapMark.k==='xint'){ ctx.moveTo(s.x-r,s.y-r); ctx.lineTo(s.x+r,s.y+r); ctx.moveTo(s.x+r,s.y-r); ctx.lineTo(s.x-r,s.y+r); }
    else if (snapMark.k==='perp'){ ctx.moveTo(s.x-r,s.y+r); ctx.lineTo(s.x+r,s.y+r); ctx.moveTo(s.x,s.y+r); ctx.lineTo(s.x,s.y-r); }
    else if (snapMark.k==='tan'){ ctx.moveTo(s.x-r,s.y-r); ctx.lineTo(s.x+r,s.y-r); ctx.moveTo(s.x+4,s.y-2); ctx.arc(s.x,s.y-2,4,0,Math.PI*2); }
    else if (snapMark.k==='nea'){ ctx.moveTo(s.x-r,s.y-r); ctx.lineTo(s.x+r,s.y-r); ctx.lineTo(s.x-r,s.y+r); ctx.lineTo(s.x+r,s.y+r); ctx.closePath(); }
    else if (snapMark.k==='trk'){ ctx.moveTo(s.x-4,s.y); ctx.lineTo(s.x+4,s.y); ctx.moveTo(s.x,s.y-4); ctx.lineTo(s.x,s.y+4); }
    else { ctx.moveTo(s.x,s.y-r); ctx.lineTo(s.x+r,s.y); ctx.lineTo(s.x,s.y+r); ctx.lineTo(s.x-r,s.y); ctx.closePath(); }
    ctx.stroke(); ctx.lineWidth = 1;
  }

  // crosshair (hidden while the hand tool is active — the OS hand cursor takes over)
  if (mouse.inside && !(cmd && cmd.name==='PAN')){
    const s = snapMark ? w2s(snapMark.p) : w2s(curPt);
    ctx.strokeStyle = 'rgba(220,225,235,.55)';
    ctx.beginPath();
    ctx.moveTo(0, s.y+.5); ctx.lineTo(W, s.y+.5);
    ctx.moveTo(s.x+.5, 0); ctx.lineTo(s.x+.5, H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,225,235,.9)';
    ctx.strokeRect(s.x-4.5, s.y-4.5, 9, 9);
    drawDynInput(s);
    if (hoverSel){                       // "you can drag this" move glyph
      const gx=s.x+16, gy=s.y-16, a=6;
      ctx.strokeStyle = '#43d6b5'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(gx-a,gy); ctx.lineTo(gx+a,gy);
      ctx.moveTo(gx,gy-a); ctx.lineTo(gx,gy+a);
      ctx.moveTo(gx+a-3,gy-3); ctx.lineTo(gx+a,gy); ctx.lineTo(gx+a-3,gy+3);
      ctx.moveTo(gx-a+3,gy-3); ctx.lineTo(gx-a,gy); ctx.lineTo(gx-a+3,gy+3);
      ctx.moveTo(gx-3,gy-a+3); ctx.lineTo(gx,gy-a); ctx.lineTo(gx+3,gy-a+3);
      ctx.moveTo(gx-3,gy+a-3); ctx.lineTo(gx,gy+a); ctx.lineTo(gx+3,gy+a-3);
      ctx.stroke(); ctx.lineWidth = 1;
    }
  }

  drawRulers();
}

/* ---------- edge rulers (drawing units, follow pan/zoom) ---------- */
export const RULER_PX = 22;
function drawRulers(){
  const R = RULER_PX;
  const s = gridStep();
  const px = s*view.scale;
  const every = px >= 56 ? 1 : 5;                 // label density: every step, or every major
  // strips + corner
  ctx.fillStyle = '#1c1f25';
  ctx.fillRect(0,0,W,R); ctx.fillRect(0,0,R,H);
  ctx.fillStyle = '#22262e';
  ctx.fillRect(0,0,R,R);
  ctx.strokeStyle = '#2e333d';
  ctx.beginPath();
  ctx.moveTo(0,R+.5); ctx.lineTo(W,R+.5);
  ctx.moveTo(R+.5,0); ctx.lineTo(R+.5,H);
  ctx.stroke();
  ctx.font = '9px ui-monospace, monospace';
  // corner shows what a unit means
  ctx.fillStyle = '#8b93a1'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(units, R/2, R/2+1);
  ctx.textBaseline='alphabetic';
  const tl = s2w(R, R), br = s2w(W, H);
  // X ruler (top)
  ctx.strokeStyle = '#4a5261'; ctx.beginPath();
  ctx.textAlign='left';
  for (let i=Math.floor(tl.x/s); i<=Math.ceil(br.x/s); i++){
    const sx = Math.round(i*s*view.scale + view.ox)+.5;
    if (sx <= R) continue;
    const major = i % every === 0;
    ctx.moveTo(sx, R); ctx.lineTo(sx, major ? R-9 : R-4);
    if (major) ctx.fillText(fmt(i*s), sx+3, 10);
  }
  // Y ruler (left) — labels rotated, reading bottom-up
  for (let i=Math.floor(br.y/s); i<=Math.ceil(tl.y/s); i++){
    const sy = Math.round(-i*s*view.scale + view.oy)+.5;
    if (sy <= R) continue;
    const major = i % every === 0;
    ctx.moveTo(R, sy); ctx.lineTo(major ? R-9 : R-4, sy);
    if (major){
      ctx.save(); ctx.translate(10, sy-3); ctx.rotate(-Math.PI/2);
      ctx.fillText(fmt(i*s), 0, 0); ctx.restore();
    }
  }
  ctx.stroke();
  // cursor position markers
  if (mouse.inside){
    const c = snapMark ? w2s(snapMark.p) : w2s(curPt);
    ctx.strokeStyle = '#43d6b5'; ctx.beginPath();
    if (c.x > R){ ctx.moveTo(Math.round(c.x)+.5, 0); ctx.lineTo(Math.round(c.x)+.5, R); }
    if (c.y > R){ ctx.moveTo(0, Math.round(c.y)+.5); ctx.lineTo(R, Math.round(c.y)+.5); }
    ctx.stroke();
  }
}

function drawHatch(e){
  const b = entities.find(z=>z.id===e.ref);
  const mat = materialByKey(e.mat);
  if (!b || !mat || !layerVisible(b.layer)) return;     // orphaned or hidden boundary: draw nothing
  ctx.save();
  ctx.beginPath();
  if (b.type==='circle'){ const c=w2s({x:b.cx,y:b.cy}); ctx.arc(c.x, c.y, b.r*view.scale, 0, Math.PI*2); }
  else tracePline(b.pts, true, 0, 0);
  ctx.clip();
  const bb=entBBox(b), p0=w2s({x:bb[0], y:bb[3]}), p1=w2s({x:bb[2], y:bb[1]});
  const sel = selection.has(e.id);
  ctx.strokeStyle = ctx.fillStyle = sel ? '#4db8ff' : mat.color;
  ctx.globalAlpha = sel ? 0.95 : 0.6;
  ctx.lineWidth = 1;
  for (const fam of mat.pattern.lines || []) hatchLines(p0, p1, fam);
  if (mat.pattern.dots) hatchDots(p0, p1, mat.pattern.dots);
  ctx.globalAlpha = 1;
  ctx.restore();
}
function hatchLines(p0, p1, fam){
  const ang = fam.ang*Math.PI/180, gap = fam.gap || 12;
  const w=p1.x-p0.x, h=p1.y-p0.y, diag=Math.hypot(w,h)||1;
  const cx=(p0.x+p1.x)/2, cy=(p0.y+p1.y)/2;
  const ux=Math.cos(ang), uy=Math.sin(ang), nx=-uy, ny=ux;
  ctx.setLineDash(fam.dash || []);
  ctx.beginPath();
  const n = Math.ceil(diag/gap/2);
  for (let i=-n; i<=n; i++){
    const ox=cx+nx*i*gap, oy=cy+ny*i*gap;
    ctx.moveTo(ox-ux*diag/2, oy-uy*diag/2);
    ctx.lineTo(ox+ux*diag/2, oy+uy*diag/2);
  }
  ctx.stroke(); ctx.setLineDash([]);
}
function hatchDots(p0, p1, spec){
  const gap = spec.gap || 10;
  const x0=Math.min(p0.x,p1.x), x1=Math.max(p0.x,p1.x);
  const y0=Math.min(p0.y,p1.y), y1=Math.max(p0.y,p1.y);
  let row=0;
  for (let y=y0; y<=y1; y+=gap, row++)
    for (let x=x0 + (row%2 ? gap/2 : 0); x<=x1; x+=gap)
      ctx.fillRect(x-0.75, y-0.75, 1.5, 1.5);
}
// dynamic input (AutoCAD F12): prompt + what you're typing, riding the crosshair
function drawDynInput(s){
  if (!T.dyn) return;
  const typed = document.getElementById('cmdInput')?.value || '';
  let prompt = document.getElementById('prompt')?.textContent || '';
  if (!cmd && !typed) return;                       // idle and silent: keep the canvas clean
  if (prompt.length > 46) prompt = prompt.slice(0, 45) + '…';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  const lines = typed ? [prompt, typed] : [prompt];
  const tw = t => ctx.measureText(t)?.width ?? t.length*6.2;   // headless ctx stubs measureText
  const wMax = Math.max(...lines.map(tw));
  const bw = wMax + 14, bh = lines.length*15 + 8;
  let x = s.x + 16, y = s.y + 16;                   // right-below the crosshair…
  if (x + bw > W - 4) x = s.x - 16 - bw;            // …flip when the edge is near
  if (y + bh > H - 4) y = s.y - 16 - bh;
  ctx.fillStyle = 'rgba(28,31,37,.92)';
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = '#2e333d'; ctx.lineWidth = 1;
  ctx.strokeRect(x+.5, y+.5, bw-1, bh-1);
  ctx.fillStyle = '#8b93a1';
  ctx.fillText(prompt, x+7, y+15);
  if (typed){
    ctx.fillStyle = '#43d6b5';
    ctx.fillText(typed, x+7, y+30);
    const cw = tw(typed);
    ctx.fillRect(x+8+cw, y+21, 1.5, 11);            // caret
  }
}
function drawEntity(e, dx, dy, ghost){
  const col = ghost ? '#9fb6c9' : layerOf(e.layer).color;
  const isSel = !ghost && selection.has(e.id);
  ctx.strokeStyle = isSel ? '#4db8ff' : col;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = isSel ? 1.8 : 1.3;
  ctx.setLineDash(isSel ? [6,4] : []);
  ctx.beginPath();
  if (e.type==='hatch'){ ctx.setLineDash([]); return; }   // rendered by drawHatch (under linework)
  if (e.type==='line'){
    const a=w2s({x:e.x1+dx,y:e.y1+dy}), b=w2s({x:e.x2+dx,y:e.y2+dy});
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  } else if (e.type==='circle'){
    const c=w2s({x:e.cx+dx,y:e.cy+dy});
    ctx.arc(c.x,c.y,e.r*view.scale,0,Math.PI*2); ctx.stroke();
  } else if (e.type==='arc'){
    const c=w2s({x:e.cx+dx,y:e.cy+dy});
    ctx.arc(c.x,c.y,e.r*view.scale, -e.a0, -e.a1, true); ctx.stroke();   // screen y flipped → CCW world = anticlockwise
  } else if (e.type==='pline'){
    tracePline(e.pts, e.closed, dx, dy);
    ctx.stroke();
  } else if (e.type==='text'){
    const s=w2s({x:e.x+dx,y:e.y+dy});
    ctx.font = `${Math.max(2, e.h*view.scale)}px ${'ui-monospace, monospace'}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(e.str, s.x, s.y);
    if (isSel){ const b=entBBox(e); const p0=w2s({x:b[0]+dx,y:b[3]+dy}), p1=w2s({x:b[2]+dx,y:b[1]+dy}); ctx.strokeRect(p0.x,p0.y,p1.x-p0.x,p1.y-p0.y); }
  } else if (e.type==='dim'){
    const g=dimGeom(e);
    const P1=w2s({x:e.x1+dx,y:e.y1+dy}), P2=w2s({x:e.x2+dx,y:e.y2+dy});
    const A=w2s({x:g.a.x+dx,y:g.a.y+dy}), B=w2s({x:g.b.x+dx,y:g.b.y+dy});
    ctx.moveTo(P1.x,P1.y); ctx.lineTo(A.x,A.y);           // extension lines
    ctx.moveTo(P2.x,P2.y); ctx.lineTo(B.x,B.y);
    ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y);             // dimension line
    // architectural ticks: 45° slashes, sized from the dim's text height
    const hW = dimH(e), hs = Math.max(2, hW*view.scale);   // world height → screen px
    const ux=B.x-A.x, uy=B.y-A.y, UL=Math.hypot(ux,uy)||1;
    const t=Math.max(2, hs*0.4), sx=(ux-uy)/UL*0.707*t, sy=(ux+uy)/UL*0.707*t;
    ctx.moveTo(A.x-sx, A.y-sy); ctx.lineTo(A.x+sx, A.y+sy);
    ctx.moveTo(B.x-sx, B.y-sy); ctx.lineTo(B.x+sx, B.y+sy);
    ctx.stroke();
    // value text: live-computed, aligned with the dim line
    let angS=Math.atan2(uy, ux);
    if (angS>Math.PI/2 || angS<-Math.PI/2) angS+=Math.PI;  // keep readable
    ctx.save();
    ctx.translate((A.x+B.x)/2, (A.y+B.y)/2); ctx.rotate(angS);
    ctx.font=`${hs}px ui-monospace, monospace`;
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText(unitFmt(g.L), 0, -Math.max(2, hs*0.25));
    ctx.restore();
    ctx.textAlign='left';
  }
  ctx.setLineDash([]); ctx.lineWidth = 1;
}
// walk a pline path honoring bulge (arc) segments; assumes beginPath() was called
function tracePline(pts, closed, dx, dy){
  if (!pts.length) return;
  const first=w2s({x:pts[0].x+dx, y:pts[0].y+dy});
  ctx.moveTo(first.x, first.y);
  const walk=(a,b)=>{
    const bl=a.bulge||0;
    const A = bl ? bulgeArc(a,b,bl) : null;
    if (!A){ const s=w2s({x:b.x+dx, y:b.y+dy}); ctx.lineTo(s.x, s.y); return; }
    const c=w2s({x:A.cx+dx, y:A.cy+dy});
    const angA=Math.atan2(a.y-A.cy, a.x-A.cx), angB=Math.atan2(b.y-A.cy, b.x-A.cx);
    ctx.arc(c.x, c.y, A.r*view.scale, -angA, -angB, bl>0);   // screen y flip: world CCW = anticlockwise
  };
  for (let i=0;i<pts.length-1;i++) walk(pts[i], pts[i+1]);
  if (closed && pts.length>2) walk(pts[pts.length-1], pts[0]);
}
function drawRubber(){
  if (!cmd || !mouse.inside) return;
  ctx.strokeStyle = '#7c8698'; ctx.setLineDash([6,5]);
  ctx.beginPath();
  const line = (a,b)=>{const A=w2s(a),B=w2s(b);ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);};
  if (cmd.name==='LINE' && cmd.base) line(cmd.base, curPt);
  else if (cmd.name==='PLINE' && cmd.pts.length){
    const pts = cmd.pts.map(p=>({...p}));
    const last = pts[pts.length-1];
    if (cmd.plMode==='arc'){                       // live arc preview: 3-point or tangent
      if (cmd.arcMid) last.bulge = bulgeFrom3(last, cmd.arcMid, curPt);
      else { const t = plineEndTangent(pts); last.bulge = t ? tangentBulge(last, t, curPt) : 0; }
    }
    pts.push({x:curPt.x, y:curPt.y});
    tracePline(pts, false, 0, 0);
  }
  else if (cmd.name==='RECTANG' && cmd.p1){
    const a=w2s(cmd.p1), b=w2s(curPt);
    ctx.rect(Math.min(a.x,b.x), Math.min(a.y,b.y), Math.abs(b.x-a.x), Math.abs(b.y-a.y));
  }
  else if (cmd.name==='CIRCLE' && cmd.center){
    const c=w2s(cmd.center); ctx.arc(c.x,c.y, dist(cmd.center,curPt)*view.scale, 0, Math.PI*2);
  }
  else if (cmd.name==='ARC' && cmd.pts.length){
    if (cmd.pts.length===1) line(cmd.pts[0], curPt);
    else {
      const a3 = arcFrom3(cmd.pts[0], cmd.pts[1], curPt);
      if (a3){ const c=w2s({x:a3.cx,y:a3.cy}); ctx.arc(c.x, c.y, a3.r*view.scale, -a3.a0, -a3.a1, true); }
      else line(cmd.pts[0], curPt);
    }
  }
  else if (cmd.name==='DIST' && cmd.p1) line(cmd.p1, curPt);
  else if (cmd.name==='ROTATE' && cmd.step==='angle') line(cmd.base, curPt);
  else if (cmd.name==='MIRROR' && cmd.step==='p2') line(cmd.p1, curPt);
  else if (cmd.name==='STRETCH' && cmd.step==='dest') line(cmd.base, curPt);
  else if (cmd.name==='DIM'){
    if (cmd.step==='pos' && cmd.p1 && cmd.p2){
      ctx.stroke(); ctx.setLineDash([]);
      const dxl=cmd.p2.x-cmd.p1.x, dyl=cmd.p2.y-cmd.p1.y, L=Math.hypot(dxl,dyl)||1;
      const off=((curPt.x-cmd.p1.x)*(-dyl)+(curPt.y-cmd.p1.y)*dxl)/L;
      drawEntity({type:'dim', x1:cmd.p1.x, y1:cmd.p1.y, x2:cmd.p2.x, y2:cmd.p2.y, off}, 0, 0, true);
      return;
    }
    if (cmd.p1) line(cmd.p1, curPt);
  }
  ctx.stroke(); ctx.setLineDash([]);
}

/* ---------- view ops ---------- */
export function zoomExtents(){
  if (!entities.length){ view.scale=4; view.ox=W/2; view.oy=H/2; draw(); return; }
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const e of entities){ const b=entBBox(e); x0=Math.min(x0,b[0]);y0=Math.min(y0,b[1]);x1=Math.max(x1,b[2]);y1=Math.max(y1,b[3]); }
  const pad=40;
  const sx=(W-2*pad)/Math.max(1e-6,(x1-x0)), sy=(H-2*pad)/Math.max(1e-6,(y1-y0));
  view.scale=Math.min(sx,sy,200);
  const cx=(x0+x1)/2, cy=(y0+y1)/2;
  view.ox = W/2 - cx*view.scale;
  view.oy = H/2 + cy*view.scale;
  draw();
  log('Zoom extents.', 'r');
}

export function resize(){
  DPR = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  W=r.width; H=r.height;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  draw();
}

/* the view adapter answers the core's redraw / fit-view requests */
connectUI({ changed: draw, zoomExtents });
