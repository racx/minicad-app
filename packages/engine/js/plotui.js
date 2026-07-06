/* =========================================================
   MiniCAD — PLOT dialog wiring (DOM side of js/plot.js)
   ========================================================= */
import { paperSize, computeFitScale } from './plot.js';
import { entities, layers, units, unitFmt, plotWin, layerVisible } from './state.js';
import { entBBox } from './entities.js';
import { registerPlotDialog, startCommand } from './commands.js';
import { log } from './ui.js';

const $ = id => document.getElementById(id);
const dlg = $('plotDlg');

/* remembered per session */
let last = { paper:'A4', orient:'L', scale:'50', customN:50, weight:'0.35', colors:false };

export function openPlot(){
  $('plotPaper').value   = last.paper;
  $('plotOrient').value  = last.orient;
  $('plotScale').value   = last.scale;
  $('plotCustomN').value = last.customN;
  $('plotWeight').value  = last.weight;
  $('plotColors').checked = last.colors;
  dlg.style.display = 'block';
  refresh();
}
export function closePlot(){ rememberControls(); dlg.style.display = 'none'; }

function rememberControls(){
  last = { paper:$('plotPaper').value||'A4', orient:$('plotOrient').value||'L',
           scale:$('plotScale').value||'50', customN:parseFloat($('plotCustomN').value)||50,
           weight:$('plotWeight').value||'0.35', colors:!!$('plotColors').checked };
}

// print window: explicit pick, else extents of visible entities
export function currentWin(){
  if (plotWin) return plotWin;
  let r=null;
  for (const e of entities){
    if (!layerVisible(e.layer)) continue;
    const b=entBBox(e);
    r = r ? [Math.min(r[0],b[0]),Math.min(r[1],b[1]),Math.max(r[2],b[2]),Math.max(r[3],b[3])] : [...b];
  }
  return r;
}

// resolve dialog controls into plot settings; null if nothing to print
export function currentSettings(){
  rememberControls();
  const win = currentWin();
  if (!win) return null;
  const landscape = last.orient!=='P';
  let scaleN;
  if (last.scale==='fit') scaleN = computeFitScale(win, last.paper, landscape, units);
  else if (last.scale==='custom') scaleN = Math.max(1, last.customN);
  else scaleN = parseFloat(last.scale)||50;
  return { paper:last.paper, landscape, scaleN, win,
           weight:parseFloat(last.weight)||0.35, colors:last.colors, units };
}

function refresh(){
  $('plotCustomN').style.display = ($('plotScale').value==='custom') ? '' : 'none';
  const s = currentSettings();
  $('plotFitLabel').textContent =
    !s ? 'nothing to print' :
    ($('plotScale').value==='fit' ? `= 1:${s.scaleN}` : '');
  const w = plotWin;
  $('plotWinLabel').textContent = w
    ? `${unitFmt(w[2]-w[0])} × ${unitFmt(w[3]-w[1])} ${units}`
    : 'whole drawing';
}

/* wiring */
for (const id of ['plotPaper','plotOrient','plotScale','plotCustomN','plotWeight','plotColors'])
  $(id).addEventListener('change', refresh);
$('plotPickWin').addEventListener('click', ()=>{ closePlot(); startCommand('PLOTWIN'); });
$('plotClose').addEventListener('click', closePlot);
$('plotPrint').addEventListener('click', ()=>log('Printing arrives in Stage 3.', 'e'));
$('plotTest').addEventListener('click', ()=>log('Test page arrives in Stage 3.', 'e'));

registerPlotDialog(openPlot);
