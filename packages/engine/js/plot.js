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
