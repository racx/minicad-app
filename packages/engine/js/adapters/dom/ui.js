/* =========================================================
   MiniCAD — command line, history, help, layer widgets
   ========================================================= */
import { layers, currentLayer, layerOf, entities } from '../../core/state.js';
import { connectUI } from '../../core/bus.js';

/* ---- the command line is a contenteditable div, not an <input> ----
   Safari offers saved credit cards on a lone text field that takes "100,50";
   no attribute stops it, and a contenteditable element is not a form field so
   nothing tries. The cost is that it has no `value`, which the whole engine
   reads and writes — so define one over textContent, on the element itself, so
   `document.getElementById('cmdInput').value` works too (view.js does that).
   Setting it while focused destroys the caret, hence the restore. */
export function asTextField(el){
  if (!el || typeof Object.defineProperty !== 'function') return el;
  Object.defineProperty(el, 'value', {
    configurable: true,
    get(){ return el.textContent || ''; },
    set(v){
      el.textContent = v == null ? '' : String(v);
      if (document.activeElement === el) caretToEnd(el);
    },
  });
  return el;
}

/* put the caret after the last character — a plain focus() on a div leaves it
   wherever the browser feels like, which for typed input means "at the start" */
export function caretToEnd(el){
  const sel = typeof window !== 'undefined' && window.getSelection && window.getSelection();
  if (!sel || typeof document.createRange !== 'function') return;   // test stubs
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

export const cmdInput = asTextField(document.getElementById('cmdInput'));
export const promptEl = document.getElementById('prompt');
export const historyEl = document.getElementById('history');
export const coordRead = document.getElementById('coordRead');
export const layerSel = document.getElementById('layerSel');
export const layerColor = document.getElementById('layerColor');
export const btnLayerOff = document.getElementById('btnLayerOff');
export const btnLayerLock = document.getElementById('btnLayerLock');
export const layersPanel = document.getElementById('layers');
export const layerList   = document.getElementById('layerList');
export const layerFind   = document.getElementById('layerFind');
export const layerCount  = document.getElementById('layerCount');

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

/* The dropdown is fine for the four layers you draw with; a client DWG brings
   130 and needs a list you can filter. Both stay in sync. */
export function renderLayerPanel(){
  if (!layerList) return;
  const q = (layerFind && layerFind.value || '').trim().toLowerCase();
  // a bare word matches anywhere; * is an explicit wildcard
  const rx = q ? new RegExp('^' + q.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*') + '$', 'i') : null;
  const match = l => !q || (rx.test(l.name) || l.name.toLowerCase().includes(q));

  const counts = new Map();
  for (const e of entities) counts.set(e.layer, (counts.get(e.layer)||0) + 1);

  const shown = layers.filter(match);
  layerCount.textContent = shown.length===layers.length
    ? `${layers.length}` : `${shown.length}/${layers.length}`;

  layerList.innerHTML = '';
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;   // never inject a layer name as markup
    return n;
  };
  for (const l of shown){
    const row = el('div', 'row' + (l.name===currentLayer ? ' cur' : '') + (l.off ? ' off' : ''));
    row.title = `${l.name} — ${counts.get(l.name)||0} objects`;
    row.dataset.layer = l.name;

    const sw = el('span', 'sw');
    sw.style.background = l.color;
    row.appendChild(sw);
    row.appendChild(el('span', 'nm', l.name));
    row.appendChild(el('span', 'n', String(counts.get(l.name)||0)));

    for (const [act, txt, tip] of [
      ['off',  l.off ? '🚫' : '👁',  'Show / hide'],
      ['lock', l.locked ? '🔒' : '🔓', 'Lock / unlock'],
      ['del',  '🗑', 'Delete this layer and everything on it'],
    ]){
      const b = el('button', 't', txt);
      b.dataset.act = act;
      b.title = tip;
      row.appendChild(b);
    }
    layerList.appendChild(row);
  }
}

export function refreshLayers(){
  renderLayerPanel();
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
