/* =========================================================
   MiniCAD — command line, history, help, layer widgets
   ========================================================= */
import { layers, currentLayer, layerOf } from '../../core/state.js';
import { connectUI } from '../../core/bus.js';

export const cmdInput = document.getElementById('cmdInput');
export const promptEl = document.getElementById('prompt');
export const historyEl = document.getElementById('history');
export const coordRead = document.getElementById('coordRead');
export const layerSel = document.getElementById('layerSel');
export const layerColor = document.getElementById('layerColor');
export const btnLayerOff = document.getElementById('btnLayerOff');
export const btnLayerLock = document.getElementById('btnLayerLock');

export function log(text, cls){
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  historyEl.appendChild(d);
  while (historyEl.children.length > 60) historyEl.removeChild(historyEl.firstChild);
  historyEl.scrollTop = historyEl.scrollHeight;
}
export function setPrompt(t){ promptEl.textContent = t; }

export function toggleHelp(force){
  const h=document.getElementById('help');
  const show = force!==undefined?force:h.style.display!=='block';
  h.style.display = show?'block':'none';
}

export function refreshLayers(){
  layerSel.innerHTML='';
  for (const l of layers){
    const o=document.createElement('option'); o.value=l.name;
    o.textContent = l.name + (l.off?' ·off':'') + (l.locked?' 🔒':'');
    layerSel.appendChild(o);
  }
  layerSel.value=currentLayer;
  const cur = layerOf(currentLayer);
  layerColor.value=cur.color;
  btnLayerOff.textContent = cur.off ? '🚫' : '👁';
  btnLayerLock.textContent = cur.locked ? '🔒' : '🔓';
}

/* the command-line adapter implements the core's UI sink */
connectUI({
  log, setPrompt, toggleHelp,
  layersChanged: refreshLayers,
  editText: str => { cmdInput.value = str; },
  toggled: (k, on) => {
    const map = {grid:'tGrid', snap:'tSnap', ortho:'tOrtho', osnap:'tOsnap', dyn:'tDyn'};
    document.getElementById(map[k])?.classList.toggle('on', on);
  },
});
