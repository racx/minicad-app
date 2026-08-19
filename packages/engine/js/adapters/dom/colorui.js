/* =========================================================
   MiniCAD — layer color palette (the AutoCAD Color Index)
   Architects call colors by their index number — "color 1", "color 253"
   — so the layer color picker IS the numbered ACI palette, laid out the
   way AutoCAD's dialog lays it out: the 24×10 hue grid (10–249), then
   the classic row (1–9) and the grayscale run (250–255). Clicking
   applies to the current layer immediately; the readout names the
   number (and the name, where the color has one). True color stays one
   input away for anything outside the index.
   Typed COLOR / COL opens it too.
   ========================================================= */
import { currentLayer, layerOf } from '../../core/state.js';
import { ACI, aciHex, aciOf, aciName } from '../../core/aci.js';
import { registerColorDialog } from '../../core/commands.js';
import { draw } from './view.js';
import { refreshLayers, log } from './ui.js';

const $ = id => document.getElementById(id);
const dlg = $('colorDlg');

// grid order: 24 hue columns × 10 shade rows → index 10 + col·10 + row,
// exactly how AutoCAD arranges the chromatic block
const GRID = [];
for (let row = 0; row < 10; row++)
  for (let col = 0; col < 24; col++) GRID.push(10 + col*10 + row);
const CLASSIC = [1,2,3,4,5,6,7,8,9, 250,251,252,253,254,255];

const label = i => `Color: <b>${i}</b>${aciName(i) ? ` (${aciName(i)})` : ''} — ${aciHex(i)}`;

const swatches = [];                 // [{el, i}] — our own list, no DOM queries
let built = false;
function build(){
  if (built) return; built = true;
  const make = (host, indices) => {
    for (const i of indices){
      const s = document.createElement('div');
      s.className = 'sw';
      s.style.background = aciHex(i);
      s.title = `${i}${aciName(i) ? ' · ' + aciName(i) : ''}`;
      s.addEventListener('mouseenter', ()=>{ $('colorRead').innerHTML = label(i); });
      s.addEventListener('click', ()=>apply(aciHex(i), i));
      host.appendChild(s);
      swatches.push({el: s, i});
    }
  };
  make($('colorGrid'), GRID);
  make($('colorClassic'), CLASSIC);
  $('colorTrue').addEventListener('input', ()=>apply($('colorTrue').value, null));
  $('colorClose').addEventListener('click', closeColor);
}

function markCurrent(){
  const cur = layerOf(currentLayer);
  const hex = (cur.color || '').toLowerCase();
  const exact = ACI.findIndex((c, i) => i > 0 && c === hex);
  for (const s of swatches) s.el.classList.toggle('cur', s.i === exact);
  $('colorRead').innerHTML = exact > 0
    ? label(exact)
    : `Color: <b>true color</b> — ${cur.color} (nearest index ${aciOf(cur.color)})`;
  $('colorTrue').value = cur.color || '#ffffff';
}

function apply(hex, i){
  layerOf(currentLayer).color = hex;
  log(i ? `Layer "${currentLayer}" is now color ${i}${aciName(i) ? ` (${aciName(i)})` : ''}.`
        : `Layer "${currentLayer}" is now ${hex} (true color).`, 'r');
  markCurrent();
  refreshLayers();
  draw();
}

export function openColor(){
  build();
  $('colorDlgTitle').textContent = `Color palette — layer "${currentLayer}"`;
  markCurrent();
  dlg.style.display = 'block';
}
export function closeColor(){ dlg.style.display = 'none'; }

$('layerColor').addEventListener('click', openColor);
registerColorDialog(openColor);
