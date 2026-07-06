/* =========================================================
   MiniCAD — canvas, view transform, grid, rendering
   ========================================================= */
import { dist, fmt, arcFrom3 } from './geometry.js';
import { entities, view, T, cmd, curPt, snapMark, boxSel, mouse, selection, layerOf, layerVisible, hoverSel, hotGrip, unitFmt } from './state.js';
import { entBBox, entGrips, dimGeom, dimH } from './entities.js';
import { log } from './ui.js';

export const cv = document.getElementById('cv');
export const ctx = cv.getContext('2d');

export let DPR = 1, W = 0, H = 0;

export function w2s(p){ return { x: p.x*view.scale + view.ox, y: -p.y*view.scale + view.oy }; }
export function s2w(x, y){ return { x: (x - view.ox)/view.scale, y: (view.oy - y)/view.scale }; }

export function gridStep(){
  const target = 28/view.scale;                 // want ≥28 px between lines
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1,2,5,10]) if (m*pow >= target) return m*pow;
  return 10*pow;
}

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

  // entities (hidden layers skipped)
  for (const e of entities) if (layerVisible(e.layer)) drawEntity(e, 0, 0, false);

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

  // osnap marker
  if (snapMark && mouse.inside){
    const s = w2s(snapMark.p); const r=6;
    ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (snapMark.k==='end'){ ctx.rect(s.x-r,s.y-r,2*r,2*r); }
    else if (snapMark.k==='mid'){ ctx.moveTo(s.x,s.y-r); ctx.lineTo(s.x-r,s.y+r); ctx.lineTo(s.x+r,s.y+r); ctx.closePath(); }
    else if (snapMark.k==='cen'){ ctx.arc(s.x,s.y,r,0,Math.PI*2); }
    else if (snapMark.k==='int'){ ctx.moveTo(s.x-r,s.y-r); ctx.lineTo(s.x+r,s.y+r); ctx.moveTo(s.x+r,s.y-r); ctx.lineTo(s.x-r,s.y+r); }
    else if (snapMark.k==='perp'){ ctx.moveTo(s.x-r,s.y+r); ctx.lineTo(s.x+r,s.y+r); ctx.moveTo(s.x,s.y+r); ctx.lineTo(s.x,s.y-r); }
    else if (snapMark.k==='tan'){ ctx.moveTo(s.x-r,s.y-r); ctx.lineTo(s.x+r,s.y-r); ctx.moveTo(s.x+4,s.y-2); ctx.arc(s.x,s.y-2,4,0,Math.PI*2); }
    else if (snapMark.k==='nea'){ ctx.moveTo(s.x-r,s.y-r); ctx.lineTo(s.x+r,s.y-r); ctx.lineTo(s.x-r,s.y+r); ctx.lineTo(s.x+r,s.y+r); ctx.closePath(); }
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
}
function drawEntity(e, dx, dy, ghost){
  const col = ghost ? '#9fb6c9' : layerOf(e.layer).color;
  const isSel = !ghost && selection.has(e.id);
  ctx.strokeStyle = isSel ? '#4db8ff' : col;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = isSel ? 1.8 : 1.3;
  ctx.setLineDash(isSel ? [6,4] : []);
  ctx.beginPath();
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
    e.pts.forEach((p,i)=>{ const s=w2s({x:p.x+dx,y:p.y+dy}); i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); });
    if (e.closed) ctx.closePath();
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
function drawRubber(){
  if (!cmd || !mouse.inside) return;
  ctx.strokeStyle = '#7c8698'; ctx.setLineDash([6,5]);
  ctx.beginPath();
  const line = (a,b)=>{const A=w2s(a),B=w2s(b);ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);};
  if (cmd.name==='LINE' && cmd.base) line(cmd.base, curPt);
  else if (cmd.name==='PLINE' && cmd.pts.length){
    cmd.pts.forEach((p,i)=>{const s=w2s(p); i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});
    const s=w2s(curPt); ctx.lineTo(s.x,s.y);
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
