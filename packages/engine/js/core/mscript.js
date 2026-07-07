/* =========================================================
   MiniCAD core — MScript: parse / validate / execute
   Line-oriented script grammar per docs/ai-commands-design.md.
   Statements drive the SAME startCommand/onPoint/handleEnter
   machinery the interactive UI and the test suites use, so every
   default and refusal is identical to typing the command.

   executeScript(lines[, state]) → { created:[ids], errors:[{line,msg}], logs:[{text,cls}] }
   - atomic: an error at line N restores the full pre-script document
     (entities, layers, idSeq, units, current layer, selection,
     undo/redo stacks, remembered prefs) — nothing mutates
   - one undo entry per successful script, no matter how many
     statements ran
   previewScript(lines) → { entities:[deep copies], errors, logs } —
     executes then rolls back completely; nothing sticks.
   parseScript(lines) → { statements, errors } — syntax only.
   ========================================================= */
import { entities, setEntities, layers, setLayers, getIdSeq, setIdSeq, units, setUnits,
         currentLayer, setCurrentLayer, selection, undoStack, redoStack,
         cmd, layerVisible, layerUnlocked, nextId } from './state.js';
import { deep } from './geometry.js';
import { entInWindow } from './entities.js';
import { nearestOnEnt } from './intersect.js';
import { findEntityAt } from './entities.js';
import { startCommand, onPoint, handleEnter, cancelCmd, startEditText,
         hatchBoundary, areaLabel, snapshotPrefs, restorePrefs } from './commands.js';
import { entityArea } from './geometry.js';
import { materialByKey, MATERIALS } from './materials.js';
import { w2s } from './viewport.js';
import { boxSelect } from './commands.js';
import { sink } from './bus.js';

/* ---------- tokens ---------- */
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const PT  = String.raw`${NUM}\s*,\s*${NUM}`;
const rx  = str => new RegExp(`^${str}$`, 'i');
const pt  = tok => { const [x, y] = tok.split(',').map(Number); return { x, y }; };
const pts = str => (str.trim().match(new RegExp(PT, 'g')) || []).map(pt);
const STR = String.raw`"([^"]*)"`;

/* ---------- selectors: LAST [n] | ALL | W(..) | C(..) | #id [#id …] ---------- */
const SEL = String.raw`(LAST(?:\s+\d+)?|ALL|[WC]\(\s*${PT}\s+${PT}\s*\)|#\d+(?:\s+#\d+)*)`;

function resolveSel(tok, line, errors){
  const t = tok.trim();
  const pool = () => entities.filter(e => layerVisible(e.layer) && layerUnlocked(e.layer));
  let ids = null;
  if (/^ALL$/i.test(t)) ids = pool().map(e => e.id);
  else if (/^LAST(\s+\d+)?$/i.test(t)){
    const n = parseInt(t.slice(4)) || 1;
    ids = entities.slice(-n).map(e => e.id);
  }
  else if (/^[WC]\(/i.test(t)){
    const crossing = t[0].toUpperCase() === 'C';
    const [a, b] = pts(t);
    const rect = [Math.min(a.x,b.x), Math.min(a.y,b.y), Math.max(a.x,b.x), Math.max(a.y,b.y)];
    ids = pool().filter(e => entInWindow(e, rect, crossing)).map(e => e.id);
  }
  else if (t.startsWith('#')){
    ids = [];
    for (const m of t.match(/#\d+/g)){
      const id = +m.slice(1);
      if (!entities.some(e => e.id === id)){ errors.push({ line, msg: `no entity ${m}` }); return null; }
      ids.push(id);
    }
  }
  if (!ids || !ids.length){ errors.push({ line, msg: `selector "${t}" selects nothing` }); return null; }
  return ids;
}
const select = ids => { selection.clear(); ids.forEach(id => selection.add(id)); };
const single = (ids, line, errors) => {
  if (ids && ids.length !== 1){ errors.push({ line, msg: 'this command takes exactly one entity' }); return null; }
  return ids && entities.find(e => e.id === ids[0]);
};

/* ---------- grammar table: pattern → {kind, build(match)} ---------- */
const GRAMMAR = [
  [rx(String.raw`LINE((?:\s+${PT}){2,})`),                       m => ({ cmd:'LINE', pts:pts(m[1]) })],
  [rx(String.raw`PLINE((?:\s+(?:${PT}|A|L))+?)(\s+CLOSE)?`),     m => ({ cmd:'PLINE',
      toks:(m[1].trim().match(new RegExp(`${PT}|A|L`, 'gi')) || []), close:!!m[2] })],
  [rx(String.raw`RECT\s+(${PT})\s+(${PT})`),                     m => ({ cmd:'RECT', p1:pt(m[1]), p2:pt(m[2]) })],
  [rx(String.raw`CIRCLE\s+(${PT})\s+r(${NUM})`),                 m => ({ cmd:'CIRCLE', c:pt(m[1]), r:+m[2] })],
  [rx(String.raw`ARC\s+(${PT})\s+(${PT})\s+(${PT})`),            m => ({ cmd:'ARC', pts:[pt(m[1]),pt(m[2]),pt(m[3])] })],
  [rx(String.raw`TEXT\s+(${PT})\s+h(${NUM})\s+${STR}`),          m => ({ cmd:'TEXT', p:pt(m[1]), h:+m[2], str:m[3] })],
  [rx(String.raw`DIM\s+(${PT})\s+(${PT})\s+off(${NUM})`),        m => ({ cmd:'DIM', p1:pt(m[1]), p2:pt(m[2]), off:+m[3] })],
  [rx(String.raw`MOVE\s+${SEL}\s+(${PT})`),                      m => ({ cmd:'MOVE', sel:m[1], d:pt(m[2]) })],
  [rx(String.raw`COPY\s+${SEL}((?:\s+${PT})+)`),                 m => ({ cmd:'COPY', sel:m[1], ds:pts(m[2]) })],
  [rx(String.raw`ROTATE\s+${SEL}\s+base(${PT})\s+ang(${NUM})`),  m => ({ cmd:'ROTATE', sel:m[1], base:pt(m[2]), ang:+m[3] })],
  [rx(String.raw`SCALE\s+${SEL}\s+base(${PT})\s+f(${NUM})`),     m => ({ cmd:'SCALE', sel:m[1], base:pt(m[2]), f:+m[3] })],
  [rx(String.raw`OFFSET\s+${SEL}\s+d(${NUM})\s+side(${PT})`),    m => ({ cmd:'OFFSET', sel:m[1], d:+m[2], side:pt(m[3]) })],
  [rx(String.raw`TRIM\s+edges\((${SEL}|ALL)\)\s+at(${PT})`),     m => ({ cmd:'TRIM', edges:m[1], at:pt(m[3]) })],
  [rx(String.raw`EXTEND\s+bounds\((${SEL}|ALL)\)\s+at(${PT})`),  m => ({ cmd:'EXTEND', edges:m[1], at:pt(m[3]) })],
  [rx(String.raw`FILLET\s+r(${NUM})\s+#(\d+)\s+at(${PT})\s+#(\d+)\s+at(${PT})`),
                                                                 m => ({ cmd:'FILLET', r:+m[1], id1:+m[2], at1:pt(m[3]), id2:+m[4], at2:pt(m[5]) })],
  [rx(String.raw`MIRROR\s+${SEL}\s+(${PT})\s+(${PT})(\s+ERASE)?`), m => ({ cmd:'MIRROR', sel:m[1], p1:pt(m[2]), p2:pt(m[3]), erase:!!m[4] })],
  [rx(String.raw`STRETCH\s+C\(\s*(${PT})\s+(${PT})\s*\)\s+(${PT})`), m => ({ cmd:'STRETCH', c0:pt(m[1]), c1:pt(m[2]), d:pt(m[3]) })],
  [rx(String.raw`ERASE\s+${SEL}`),                               m => ({ cmd:'ERASE', sel:m[1] })],
  [rx(String.raw`CHLAYER\s+${SEL}\s+${STR}`),                    m => ({ cmd:'CHLAYER', sel:m[1], name:m[2] })],
  [rx(String.raw`EDITTEXT\s+#(\d+)\s+${STR}`),                   m => ({ cmd:'EDITTEXT', id:+m[1], str:m[2] })],
  [rx(String.raw`DIMTXT\s+(?:h(${NUM})|(AUTO))`),                m => ({ cmd:'DIMTXT', h:m[2] ? 'AUTO' : +m[1] })],
  [rx(String.raw`LAYER\s+${STR}((?:\s+(?:color#[0-9a-f]{6}|OFF|ON|LOCK|UNLOCK|CURRENT))*)`),
                                                                 m => ({ cmd:'LAYER', name:m[1], opts:(m[2]||'').trim().split(/\s+/).filter(Boolean) })],
  [rx(String.raw`UNITS\s+(mm|cm|m)`),                            m => ({ cmd:'UNITS', u:m[1].toLowerCase() })],
  [rx(String.raw`NEW\s+CONFIRM`),                                () => ({ cmd:'NEW' })],
  [rx(String.raw`ZOOM\s+E`),                                     () => ({ cmd:'ZOOM' })],
  [rx(String.raw`JOIN\s+${SEL}`),                                m => ({ cmd:'JOIN', sel:m[1] })],
  [rx(String.raw`EXPLODE\s+${SEL}`),                             m => ({ cmd:'EXPLODE', sel:m[1] })],
  [rx(String.raw`HATCH\s+${SEL}\s+([a-z]+)`),                    m => ({ cmd:'HATCH', sel:m[1], mat:m[2].toLowerCase() })],
  [rx(String.raw`AREA\s+${SEL}`),                                m => ({ cmd:'AREA', sel:m[1] })],
];

export function parseScript(lines){
  const text = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
  const statements = [], errors = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    for (const [pat, build] of GRAMMAR){
      const m = line.match(pat);
      if (m){ statements.push({ line: i + 1, ...build(m) }); return; }
    }
    errors.push({ line: i + 1, msg: `can't interpret "${line.slice(0, 60)}"` });
  });
  if (!errors.length && !statements.length) errors.push({ line: 0, msg: 'script has no statements' });
  return { statements, errors };
}

/* ---------- execution ---------- */
function captureDoc(){
  return {
    entities: deep(entities), layers: deep(layers), idSeq: getIdSeq(),
    units, currentLayer, selection: [...selection],
    undo: undoStack.slice(), redo: redoStack.slice(), prefs: snapshotPrefs(),
  };
}
function restoreDoc(d){
  setEntities(d.entities); setLayers(d.layers); setIdSeq(d.idSeq);
  setUnits(d.units); setCurrentLayer(d.currentLayer);
  selection.clear(); d.selection.forEach(id => selection.add(id));
  undoStack.length = 0; undoStack.push(...d.undo);
  redoStack.length = 0; redoStack.push(...d.redo);
  restorePrefs(d.prefs);
  cancelCmd(true);
  sink.layersChanged();
}

function runStatement(st, errors){
  const err = msg => errors.push({ line: st.line, msg });
  const sel = tok => resolveSel(tok, st.line, errors);
  const preselect = tok => { const ids = sel(tok); if (!ids) return false; select(ids); return true; };

  switch (st.cmd){
    case 'LINE':   startCommand('LINE');   st.pts.forEach(onPoint); handleEnter(''); break;
    case 'PLINE': {
      // tokens mirror the interactive command: points, A = arc mode (tangent
      // arc by endpoint; right after the first point it takes on-arc + end),
      // L = straight again. Must contain at least two points.
      const nPts = st.toks.filter(t => t.includes(',')).length;
      if (nPts < 2){ err('PLINE needs at least two points'); return; }
      if (!st.toks[st.toks.length - 1].includes(',')){ err('PLINE must end with a point'); return; }
      startCommand('PLINE');
      for (const tok of st.toks){
        if (/^A$/i.test(tok)) handleEnter('A');
        else if (/^L$/i.test(tok)) handleEnter('L');
        else onPoint(pt(tok));
      }
      handleEnter(st.close ? 'C' : '');
      break;
    }
    case 'RECT':   startCommand('RECTANG'); onPoint(st.p1); onPoint(st.p2); break;
    case 'CIRCLE': startCommand('CIRCLE'); onPoint(st.c); handleEnter(String(st.r)); break;
    case 'ARC':    startCommand('ARC');    st.pts.forEach(onPoint); break;
    case 'TEXT':   startCommand('TEXT');   onPoint(st.p); handleEnter(String(st.h)); handleEnter(st.str); break;
    case 'DIM': {
      startCommand('DIM'); onPoint(st.p1); onPoint(st.p2);
      const dx = st.p2.x - st.p1.x, dy = st.p2.y - st.p1.y, L = Math.hypot(dx, dy) || 1;
      onPoint({ x: (st.p1.x + st.p2.x)/2 + (-dy/L)*st.off, y: (st.p1.y + st.p2.y)/2 + (dx/L)*st.off });
      break;
    }
    case 'MOVE':   if (!preselect(st.sel)) return; startCommand('MOVE'); onPoint({x:0,y:0}); onPoint(st.d); break;
    case 'COPY':   if (!preselect(st.sel)) return; startCommand('COPY'); onPoint({x:0,y:0});
                   st.ds.forEach(onPoint); handleEnter(''); break;
    case 'ROTATE': if (!preselect(st.sel)) return; startCommand('ROTATE'); onPoint(st.base); handleEnter(String(st.ang)); break;
    case 'SCALE':  if (!preselect(st.sel)) return; startCommand('SCALE'); onPoint(st.base); handleEnter(String(st.f)); break;
    case 'OFFSET': {
      const e = single(sel(st.sel), st.line, errors); if (!e) return;
      startCommand('OFFSET'); handleEnter(String(st.d));
      const pick = nearestOnEnt(e, st.side);
      if (!pick){ err('cannot pick a point on that entity'); cancelCmd(true); return; }
      onPoint(pick); onPoint(st.side); handleEnter('');
      break;
    }
    case 'TRIM': case 'EXTEND': {
      startCommand(st.cmd);
      if (!/^ALL$/i.test(st.edges.trim())){
        const ids = sel(st.edges); if (!ids){ cancelCmd(true); return; }
        select(ids); cmd.sel = [...ids];
      }
      handleEnter(''); onPoint(st.at); handleEnter('');
      break;
    }
    case 'FILLET': {
      for (const [id, at] of [[st.id1, st.at1], [st.id2, st.at2]]){
        const hit = findEntityAt(at);
        if (!hit || hit.id !== id){ err(`at${at.x},${at.y} does not touch #${id}`); return; }
      }
      startCommand('FILLET'); handleEnter(String(st.r)); onPoint(st.at1); onPoint(st.at2);
      break;
    }
    case 'MIRROR': if (!preselect(st.sel)) return; startCommand('MIRROR');
                   onPoint(st.p1); onPoint(st.p2); handleEnter(st.erase ? 'Y' : 'N'); break;
    case 'STRETCH': {
      startCommand('STRETCH');
      const s0 = w2s(st.c0), s1 = w2s(st.c1);
      boxSelect({ x0: s0.x, y0: s0.y, x1: s1.x, y1: s1.y }, true);
      cmd.sel = [...selection];
      handleEnter(''); onPoint({x:0,y:0}); onPoint(st.d);
      break;
    }
    case 'ERASE':  if (!preselect(st.sel)) return; startCommand('ERASE'); break;
    case 'CHLAYER': if (!preselect(st.sel)) return; startCommand('CHLAYER'); handleEnter(st.name); break;
    case 'EDITTEXT': {
      const e = entities.find(z => z.id === st.id);
      if (!e || e.type !== 'text'){ err(`#${st.id} is not a text entity`); return; }
      startEditText(e); handleEnter(st.str);
      break;
    }
    case 'DIMTXT': startCommand('DIMTXT'); handleEnter(st.h === 'AUTO' ? 'A' : String(st.h)); break;
    case 'LAYER': {
      let l = layers.find(z => z.name === st.name);          // NOT layerOf: it falls back to layers[0]
      if (!l){ l = { name: st.name, color: '#a9e04f' }; layers.push(l); }
      for (const opt of st.opts){
        const o = opt.toUpperCase();
        if (o.startsWith('COLOR')) l.color = opt.slice(5);
        else if (o === 'OFF') l.off = true;
        else if (o === 'ON') l.off = false;
        else if (o === 'LOCK') l.locked = true;
        else if (o === 'UNLOCK') l.locked = false;
        else if (o === 'CURRENT') setCurrentLayer(st.name);
      }
      sink.layersChanged(); sink.changed();
      break;
    }
    case 'UNITS':  startCommand('UNITS'); handleEnter(st.u); break;
    case 'NEW':    startCommand('NEW'); handleEnter('Y'); break;
    case 'ZOOM':   startCommand('ZOOM'); handleEnter('E'); break;
    case 'JOIN':   if (!preselect(st.sel)) return; startCommand('JOIN'); break;
    case 'EXPLODE': if (!preselect(st.sel)) return; startCommand('EXPLODE'); break;
    case 'HATCH': {
      if (!materialByKey(st.mat)){
        err(`unknown material "${st.mat}" — one of: ${MATERIALS.map(m=>m.key).join(', ')}`); return;
      }
      const e = single(sel(st.sel), st.line, errors); if (!e) return;
      if (!entityArea(e)){ err('hatch needs a closed shape (closed polyline or circle)'); return; }
      hatchBoundary(e, st.mat);
      break;
    }
    case 'AREA': {
      const e = single(sel(st.sel), st.line, errors); if (!e) return;
      const target = e.type === 'hatch' ? entities.find(z => z.id === e.ref) : e;
      const a = target && entityArea(target);
      if (!a){ err('area needs a closed shape (closed polyline, circle, or hatch)'); return; }
      const what = e.type === 'hatch' ? (materialByKey(e.mat)?.name || 'Hatch')
                 : (target.type === 'circle' ? 'Circle' : 'Polyline');
      sink.log(`${what} — area ${areaLabel(a)}.`, 'r');
      break;
    }
  }
}

export function executeScript(lines, state){
  // `state` is accepted per the design-doc signature; the engine is a
  // singleton per JS realm, so it must be (and defaults to) that one.
  const { statements, errors } = parseScript(lines);
  const logs = [];
  if (errors.length) return { created: [], errors, logs };

  const before = captureDoc();
  const beforeIds = new Set(before.entities.map(e => e.id));
  const uLen = undoStack.length;

  // every engine refusal surfaces as a 'e'-class log — capture them as errors
  const prevLog = sink.log;
  let currentLine = 0;
  sink.log = (text, cls) => {
    logs.push({ text, cls: cls || '' });
    if (cls === 'e') errors.push({ line: currentLine, msg: text });
    prevLog(text, cls);
  };

  try {
    for (const st of statements){
      currentLine = st.line;
      runStatement(st, errors);
      if (!errors.length && cmd) errors.push({ line: st.line, msg: `${st.cmd} did not complete` });
      if (errors.length) break;
    }
  } catch (e){
    errors.push({ line: currentLine, msg: `internal: ${e.message}` });
  } finally {
    sink.log = prevLog;
  }

  if (errors.length){
    restoreDoc(before);
    return { created: [], errors, logs };
  }

  // collapse to ONE undo entry: keep the first snapshot the script pushed
  if (undoStack.length > uLen + 1) undoStack.splice(uLen + 1);
  const created = entities.filter(e => !beforeIds.has(e.id)).map(e => e.id);
  sink.changed();
  return { created, errors: [], logs };
}

// execute + full rollback: shapes for a ghost preview, zero lasting change
export function previewScript(lines){
  const { errors: parseErrors } = parseScript(lines);
  if (parseErrors.length) return { entities: [], errors: parseErrors, logs: [] };

  const before = captureDoc();
  const beforeIds = new Set(before.entities.map(e => e.id));
  const prevChanged = sink.changed, prevLayers = sink.layersChanged;
  sink.changed = () => {}; sink.layersChanged = () => {};   // silent while previewing
  let result;
  try { result = executeScript(lines); }
  finally {
    const ghosts = result && !result.errors.length
      ? deep(entities.filter(e => !beforeIds.has(e.id))) : [];
    restoreDoc(before);
    sink.changed = prevChanged; sink.layersChanged = prevLayers;
    result = { entities: ghosts, errors: result ? result.errors : [], logs: result ? result.logs : [] };
  }
  return result;
}
