/* =========================================================
   MiniCAD — plot math + sheet rendering (PURE module)
   No DOM, no engine state: everything comes in as arguments.
   Stage 1: paper/scale math.  Stage 2 adds buildPlotSVG.
   ========================================================= */

export const PAPERS = {
  A4:     {w:210,   h:297},
  A3:     {w:297,   h:420},
  Letter: {w:215.9, h:279.4},
};
export const UNIT_MM = { mm:1, cm:10, m:1000 };   // real mm per drawing unit
export const MARGIN_MM = 10;                      // sheet margin all round
export const FOOTER_MM = 8;                       // footer strip height above bottom margin

export function paperSize(name, landscape){
  const p = PAPERS[name] || PAPERS.A4;
  return landscape ? {w:p.h, h:p.w} : {w:p.w, h:p.h};
}

// usable content area (mm) on a given sheet
export function contentArea(name, landscape){
  const p = paperSize(name, landscape);
  return { x:MARGIN_MM, y:MARGIN_MM, w:p.w-2*MARGIN_MM, h:p.h-2*MARGIN_MM-FOOTER_MM };
}

// smallest integer N so the window fits the content area at 1:N
export function computeFitScale(win, paper, landscape, units){
  const a = contentArea(paper, landscape);
  const mm = UNIT_MM[units] || 10;
  const N = Math.max(((win[2]-win[0])*mm)/a.w, ((win[3]-win[1])*mm)/a.h);
  return Math.max(1, Math.ceil(N));
}

/* =========================================================
   Stage 2 — mm-true sheet renderer.
   buildPlotSVG({entities, layers, settings, filename, date}) → SVG string.
   The SVG's width/height are real millimetres; 1 viewBox unit = 1 mm.
   ========================================================= */
import { arcPt, arcSweep, formatLen, plineParts } from './geometry.js';
import { dimGeom, dimH } from './entities.js';

const f = v => Math.round(v*1000)/1000;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export function buildPlotSVG({entities, layers=[], settings, filename='drawing', date=''}){
  const {paper='A4', landscape=true, scaleN=50, win, weight=0.35, colors=false, units='cm'} = settings;
  const p = paperSize(paper, landscape);
  const a = contentArea(paper, landscape);
  const mmu = (UNIT_MM[units]||10)/scaleN;               // paper mm per drawing unit
  const wcx=(win[0]+win[2])/2, wcy=(win[1]+win[3])/2;
  const cx=a.x+a.w/2, cy=a.y+a.h/2;
  const X = x => f(cx + (x-wcx)*mmu);
  const Y = y => f(cy - (y-wcy)*mmu);                    // world Y-up → paper Y-down
  const layerOf = name => layers.find(z=>z.name===name);
  const col = e => { if (!colors) return '#000'; const l=layerOf(e.layer); return l ? l.color : '#000'; };
  const out = [];

  for (const e of entities){
    const l = layerOf(e.layer);
    if (l && l.off) continue;                            // hidden layers don't print
    const st = `stroke="${col(e)}" stroke-width="${weight}" fill="none"`;
    if (e.type==='line')
      out.push(`<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" ${st}/>`);
    else if (e.type==='circle')
      out.push(`<circle cx="${X(e.cx)}" cy="${Y(e.cy)}" r="${f(e.r*mmu)}" ${st}/>`);
    else if (e.type==='arc'){
      const s0=arcPt(e,e.a0), s1=arcPt(e,e.a1), r=f(e.r*mmu);
      const large = arcSweep(e) > Math.PI ? 1 : 0;       // sweep-flag 0: world CCW is paper CCW (Y flip)
      out.push(`<path d="M ${X(s0.x)} ${Y(s0.y)} A ${r} ${r} 0 ${large} 0 ${X(s1.x)} ${Y(s1.y)}" ${st}/>`);
    }
    else if (e.type==='pline'){
      let d = `M ${X(e.pts[0].x)} ${Y(e.pts[0].y)}`;
      for (const part of plineParts(e)){
        if (part.arc){
          const r=f(part.arc.r*mmu);
          const large = Math.abs(4*Math.atan(part.bulge)) > Math.PI ? 1 : 0;
          const sweep = part.bulge>0 ? 0 : 1;          // Y flip: world CCW = paper sweep 0
          d += ` A ${r} ${r} 0 ${large} ${sweep} ${X(part.b.x)} ${Y(part.b.y)}`;
        } else d += ` L ${X(part.b.x)} ${Y(part.b.y)}`;
      }
      if (e.closed) d += ' Z';
      out.push(`<path d="${d}" ${st}/>`);
    }
    else if (e.type==='text'){
      out.push(`<text x="${X(e.x)}" y="${Y(e.y)}" font-size="${f(e.h*mmu)}" font-family="monospace" fill="${col(e)}">${esc(e.str)}</text>`);
    }
    else if (e.type==='dim'){
      const g=dimGeom(e), hmm=f(dimH(e)*mmu);
      const P1=[X(e.x1),Y(e.y1)], P2=[X(e.x2),Y(e.y2)], A=[X(g.a.x),Y(g.a.y)], B=[X(g.b.x),Y(g.b.y)];
      out.push(`<line x1="${P1[0]}" y1="${P1[1]}" x2="${A[0]}" y2="${A[1]}" ${st}/>`);
      out.push(`<line x1="${P2[0]}" y1="${P2[1]}" x2="${B[0]}" y2="${B[1]}" ${st}/>`);
      out.push(`<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" ${st}/>`);
      // 45° architectural ticks, sized from the text height (matches screen)
      const ux=B[0]-A[0], uy=B[1]-A[1], UL=Math.hypot(ux,uy)||1;
      const t=0.4*hmm, sx=f((ux-uy)/UL*0.707*t), sy=f((ux+uy)/UL*0.707*t);
      for (const [px,py] of [A,B])
        out.push(`<line x1="${f(px-sx)}" y1="${f(py-sy)}" x2="${f(px+sx)}" y2="${f(py+sy)}" ${st}/>`);
      // value text: true paper height, centered above the line, readable rotation
      let deg = Math.atan2(uy, ux)*180/Math.PI;
      if (deg>90 || deg<=-90) deg += 180;
      const mx=f((A[0]+B[0])/2), my=f((A[1]+B[1])/2);
      out.push(`<g transform="translate(${mx} ${my}) rotate(${f(deg)})">`+
        `<text y="${f(-0.25*hmm)}" text-anchor="middle" font-size="${hmm}" font-family="monospace" fill="${col(e)}">${esc(formatLen(g.L, units))}</text></g>`);
    }
  }

  const fy = p.h - MARGIN_MM - FOOTER_MM;                // footer band top
  const footer =
    `<line x1="${MARGIN_MM}" y1="${f(fy)}" x2="${f(p.w-MARGIN_MM)}" y2="${f(fy)}" stroke="#000" stroke-width="0.1"/>`+
    `<text x="${MARGIN_MM}" y="${f(fy+5.5)}" font-size="3" font-family="monospace" fill="#000">`+
    esc(`${filename} · 1:${scaleN} · ${paper} ${landscape?'landscape':'portrait'} · ${date} · units: ${units}`)+`</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}mm" height="${p.h}mm" viewBox="0 0 ${p.w} ${p.h}">`+
    `<rect width="100%" height="100%" fill="#fff"/>`+
    `<clipPath id="pwin"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/></clipPath>`+
    `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="#000" stroke-width="0.1"/>`+
    `<g clip-path="url(#pwin)">${out.join('')}</g>`+
    footer+`</svg>`;
}

/* Calibration test page: fixed A4 portrait with real-mm rulers. */
export function buildTestPageSVG(){
  const bar = (x1,y1,x2,y2)=>{
    const vert = x1===x2;
    const t=3;
    const ticks = vert
      ? `<line x1="${x1-t}" y1="${y1}" x2="${x1+t}" y2="${y1}" stroke="#000" stroke-width="0.35"/><line x1="${x2-t}" y1="${y2}" x2="${x2+t}" y2="${y2}" stroke="#000" stroke-width="0.35"/>`
      : `<line x1="${x1}" y1="${y1-t}" x2="${x1}" y2="${y1+t}" stroke="#000" stroke-width="0.35"/><line x1="${x2}" y1="${y2-t}" x2="${x2}" y2="${y2+t}" stroke="#000" stroke-width="0.35"/>`;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="0.35"/>${ticks}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">`+
    `<rect width="100%" height="100%" fill="#fff"/>`+
    `<text x="105" y="40" text-anchor="middle" font-size="6" font-family="monospace" fill="#000">MiniCAD print calibration</text>`+
    `<text x="105" y="52" text-anchor="middle" font-size="4" font-family="monospace" fill="#000">Print at 100% (actual size, no scaling).</text>`+
    `<text x="105" y="58" text-anchor="middle" font-size="4" font-family="monospace" fill="#000">Then measure the bars with a real ruler.</text>`+
    bar(55,110,155,110)+
    `<text x="105" y="105" text-anchor="middle" font-size="4" font-family="monospace" fill="#000">100 mm</text>`+
    bar(55,140,105,140)+
    `<text x="80" y="135" text-anchor="middle" font-size="4" font-family="monospace" fill="#000">50 mm</text>`+
    bar(170,100,170,200)+
    `<text x="176" y="150" font-size="4" font-family="monospace" fill="#000" transform="rotate(90 176 150)" text-anchor="middle">100 mm</text>`+
    `</svg>`;
}
