/* =========================================================
   @minicad/engine — the package face (DOM-free)
   Everything a host imports from the core goes through here.
   The DOM adapter (canvas, dialogs, event wiring) is the separate
   `@minicad/engine/dom` entry — import it only in a browser, after
   the engine markup is on the page.
   ========================================================= */
import * as state from './state.js';
import { executeScript, parseScript, previewScript } from './mscript.js';
import { buildPlotSVG, buildTestPageSVG } from './plot.js';
import { MATERIALS, materialByKey } from './materials.js';
import { entityArea } from './geometry.js';
import { connectUI } from './bus.js';

export { executeScript, parseScript, previewScript, connectUI, MATERIALS };
export const renderPlotSVG = buildPlotSVG;
export { buildTestPageSVG };

/* One engine per JS realm (module state is the document). createEngine
   returns the handle bundle; calling it twice returns the same engine. */
export function createEngine(){
  return {
    state,                       // live-binding namespace: entities, layers, units, set*()…
    executeScript, parseScript, previewScript,
    serializeContext,
    renderPlotSVG,
    connectUI,
    MATERIALS,
  };
}

/* ---------- serializeContext: the drawing as an AI/context payload ----------
   Entity table capped (default 150), selected entities first, every number
   rounded to 2 decimals. Hatch rows carry material + computed area. */
const r2 = n => Math.round(n * 100) / 100;
function roundDeep(v){
  if (typeof v === 'number') return r2(v);
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object'){
    const o = {};
    for (const k of Object.keys(v)) o[k] = roundDeep(v[k]);
    return o;
  }
  return v;
}
function row(e){
  const { id, type, layer, ...geom } = e;
  const out = { id, type, layer, ...roundDeep(geom) };
  if (type === 'hatch'){
    const b = state.entities.find(z => z.id === e.ref);
    const mat = materialByKey(e.mat);
    out.material = mat ? mat.name : e.mat;
    const a = b && entityArea(b);
    if (a){ out.area = r2(a.area); out.perimeter = r2(a.perim); }
  }
  return out;
}

export function serializeContext({ cap = 150 } = {}){
  const selectedFirst = [
    ...state.entities.filter(e => state.selection.has(e.id)),
    ...state.entities.filter(e => !state.selection.has(e.id)),
  ];
  const byType = {};
  for (const e of state.entities) byType[e.type] = (byType[e.type] || 0) + 1;
  return {
    units: state.units,
    currentLayer: state.currentLayer,
    layers: state.layers.map(l => ({ name: l.name, color: l.color,
      ...(l.off ? { off: true } : {}), ...(l.locked ? { locked: true } : {}) })),
    counts: { total: state.entities.length, byType },
    selection: [...state.selection],
    truncated: state.entities.length > cap,
    entities: selectedFirst.slice(0, cap).map(row),
  };
}
