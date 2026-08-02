/* =========================================================
   MiniCAD — save / open / DXF export
   ========================================================= */
import { normAng, fmt } from '../../core/geometry.js';
import { dimGeom, dimH } from '../../core/entities.js';
import { entities, setEntities, layers, setLayers, getIdSeq, setIdSeq,
         setCurrentLayer, snapshot, selection, units, setUnits } from '../../core/state.js';
import { zoomExtents } from './view.js';
import { log, refreshLayers } from './ui.js';
import { connectUI } from '../../core/bus.js';
import { parseDXF, DxfError } from '../../core/dxf.js';
import { importDoc, reportLines } from '../../core/cadimport.js';
import { buildDXF } from '../../core/dxfwrite.js';
import { dwgToDxf, looksLikeDWG, DwgError } from '../../core/dwg.js';
import { dwgDocToIR, DwgDbError } from '../../core/dwgdb.js';

export function download(name, data, mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:mime}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

export function saveJSON(){
  download('drawing.json', JSON.stringify({layers, entities, idSeq:getIdSeq(), units}, null, 1), 'application/json');
  log('Saved drawing.json', 'r');
}

export function openJSON(f){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      snapshot();
      setLayers(d.layers||layers); setEntities(d.entities||[]); setIdSeq(d.idSeq||entities.length+1);
      setUnits(d.units||'cm');
      setCurrentLayer(layers[0].name); refreshLayers(); selection.clear(); zoomExtents();
      log(`Opened ${f.name} (${entities.length} objects).`, 'r');
    }catch(e){ log('Could not read that file.', 'e'); }
  };
  r.readAsText(f);
}

/* Shared tail of every CAD import: an IR doc → the drawing on screen. */
function loadDoc(doc, name, what){
  const res = importDoc(doc);
  if (!res.entities.length){ log(`That ${what} has nothing MiniCAD can draw in it.`, 'e'); return false; }
  snapshot();
  setLayers(res.layers); setEntities(res.entities); setIdSeq(res.idSeq);
  if (res.units) setUnits(res.units);
  setCurrentLayer((res.layers.find(l=>!l.locked && !l.off) || res.layers[0]).name);
  refreshLayers(); selection.clear(); zoomExtents();
  for (const line of reportLines(res.report, name)) log(line, 'r');
  return true;
}

export function openDXF(f){
  const r=new FileReader();
  r.onload=()=>{
    let doc;
    try{ doc = parseDXF(String(r.result)); }
    catch(e){ log(e instanceof DxfError ? e.message : 'Could not read that DXF file.', 'e'); return; }
    loadDoc(doc, f.name, 'DXF');
  };
  r.readAsText(f);
}

/* DWG: converted to DXF server-side, then down the same path.
   See core/dwg.js — the engine never loads the GPL reader itself. */
export function openDWG(f){
  const r=new FileReader();
  r.onload=async ()=>{
    const bytes = new Uint8Array(r.result);
    if (!looksLikeDWG(bytes)){ log('That does not look like a DWG file.', 'e'); return; }
    log(`Converting ${f.name}…`, 'r');
    // Rails-style hosts want their CSRF token echoed back; core is DOM-free,
    // so reading the meta tag happens here in the adapter.
    const meta = document.querySelector('meta[name="csrf-token"]');
    const headers = meta && meta.content ? {'X-CSRF-Token': meta.content} : {};
    let text;
    try{ text = await dwgToDxf(bytes, {headers}); }
    catch(e){ log(e instanceof DwgError ? e.message : 'Could not convert that DWG.', 'e'); return; }
    // The converter returns the parsed DWG database as JSON, not DXF:
    // libredwg's DXF writer crashes on real drawings. See packages/dwg/README.md.
    let doc;
    try{ doc = dwgDocToIR(JSON.parse(text)); }
    catch(e){ log(e instanceof DwgDbError ? e.message : 'Could not read that DWG.', 'e'); return; }
    loadDoc(doc, f.name, 'DWG');
  };
  r.readAsArrayBuffer(f);
}

/* ---------- autosave (localStorage) ---------- */
const AUTOSAVE_KEY = 'minicad.autosave';
let lastAutosave = '';

export function autosaveTick(){
  if (typeof localStorage === 'undefined') return;
  const data = JSON.stringify({layers, entities, idSeq:getIdSeq(), units});
  if (data !== lastAutosave){
    try{ localStorage.setItem(AUTOSAVE_KEY, data); lastAutosave = data; }catch(e){ /* storage full/blocked */ }
  }
}
export function restoreAutosave(){
  if (typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try{
    const d = JSON.parse(raw);
    if (!d.entities || !d.entities.length) return false;
    setLayers(d.layers||layers); setEntities(d.entities); setIdSeq(d.idSeq||d.entities.length+1);
    setUnits(d.units||'cm');
    setCurrentLayer(layers[0].name);
    lastAutosave = raw;
    return true;
  }catch(e){ return false; }
}
export function clearAutosave(){
  if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTOSAVE_KEY);
  lastAutosave = '';
}

export function dxfExport(){
  const dxf = buildDXF({entities, layers, units});
  download('drawing.dxf', dxf, 'application/dxf');
  const n = entities.filter(e=>e.type==='hatch').length;
  log(`Exported drawing.dxf (${entities.length} objects${n?`, ${n} hatches`:''}) — ` +
      `R2000 with layer colours, lineweights and real dimensions. Opens in AutoCAD, LibreCAD, QCAD…`, 'r');
}

connectUI({ clearAutosave });
