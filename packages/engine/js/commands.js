/* =========================================================
   MiniCAD — command engine: aliases, state machine,
   typed input, snap/ortho modifiers, undo/redo, selection
   ========================================================= */
import { dist, fmt, deep, rotPt, ptSegDist, TAU, normAng, arcSweep, arcPt, arcFrom3,
         tangentBulge, bulgeFrom3, plineEndTangent, plineParts, plineCurved, entityArea,
         tessellateBoundary, pointInPoly } from './geometry.js';
import { materialByKey } from './materials.js';
import { clearAutosave } from './io.js';
import { entIntersections, lineEntT, lineLine, perpFoot, tangentPts, nearestOnEnt } from './intersect.js';
import { entities, setEntities, nextId, layers, currentLayer, undoStack, redoStack, snapshot,
         view, T, cmd, setCmd, lastCmdName, setLastCmdName, selection, curPt, setSnapMark,
         selRect, setSelRect, plotWin, setPlotWin, units, setUnits,
         setTrackGuides, layerVisible, layerUnlocked } from './state.js';
import { findEntityAt, entInWindow, entBBox, snapCandidates, translateEnt, translateIds, mirrorEnt } from './entities.js';
import { draw, zoomExtents, gridStep, s2w } from './view.js';
import { log, setPrompt, toggleHelp, cmdInput } from './ui.js';

export const ALIASES = {
  L:'LINE', LINE:'LINE', PL:'PLINE', PLINE:'PLINE', REC:'RECTANG', RECT:'RECTANG', RECTANG:'RECTANG', RECTANGLE:'RECTANG',
  C:'CIRCLE', CIRCLE:'CIRCLE', A:'ARC', ARC:'ARC', T:'TEXT', TEXT:'TEXT', DT:'TEXT',
  CH:'CHLAYER', CHLAYER:'CHLAYER', NEW:'NEW',
  M:'MOVE', MOVE:'MOVE', CO:'COPY', CP:'COPY', COPY:'COPY', RO:'ROTATE', ROTATE:'ROTATE', SC:'SCALE', SCALE:'SCALE',
  O:'OFFSET', OFFSET:'OFFSET', E:'ERASE', ERASE:'ERASE', DEL:'ERASE', TR:'TRIM', TRIM:'TRIM',
  EX:'EXTEND', EXTEND:'EXTEND', F:'FILLET', FILLET:'FILLET',
  MI:'MIRROR', MIRROR:'MIRROR', S:'STRETCH', STRETCH:'STRETCH',
  J:'JOIN', JOIN:'JOIN', PEDIT:'JOIN', X:'EXPLODE', EXPLODE:'EXPLODE',
  H:'HATCH', HATCH:'HATCH', BHATCH:'HATCH', AREA:'AREA', AA:'AREA',
  DIM:'DIM', DLI:'DIM', DAL:'DIM', DIMLINEAR:'DIM', DIMTXT:'DIMTXT', DTX:'DIMTXT',
  DI:'DIST', DIST:'DIST', Z:'ZOOM', ZOOM:'ZOOM', ZOOMEXT:'ZOOMEXT', P:'PAN', PAN:'PAN',
  U:'UNDO', UNDO:'UNDO', REDO:'REDO', ORTHO:'TOGORTHO', GRID:'TOGGRID', HELP:'HELP', '?':'HELP',
  OSNAP:'OSNAPDLG', OS:'OSNAPDLG',   // AutoCAD-style: typed OSNAP opens the mode picker (F3 = quick toggle)
  UNITS:'UNITS', PLOT:'PLOT', PRINT:'PLOT', PLOTWIN:'PLOTWIN'
};
const MODIFY = new Set(['MOVE','COPY','ROTATE','SCALE','ERASE','MIRROR','JOIN','EXPLODE']);
let filletRadius = 0;   // remembered across FILLET invocations
let dimTextHeight = 0;  // remembered dim text height; 0 = automatic (4% of length)

/* ---------- undo / redo ---------- */
export function doUndo(){
  if (!undoStack.length){ log('Nothing to undo','e'); return; }
  redoStack.push(JSON.stringify(entities));
  setEntities(JSON.parse(undoStack.pop()));
  selection.clear(); cancelCmd(true); draw();
  log('Undo','r');
}
export function doRedo(){
  if (!redoStack.length){ log('Nothing to redo','e'); return; }
  undoStack.push(JSON.stringify(entities));
  setEntities(JSON.parse(redoStack.pop()));
  selection.clear(); cancelCmd(true); draw();
  log('Redo','r');
}

/* ---------- dialog hooks (UI registers itself; avoids commands→UI import cycles) ---------- */
let plotOpener = null;
export function registerPlotDialog(fn){ plotOpener = fn; }
let osnapOpener = null;
export function registerOsnapDialog(fn){ osnapOpener = fn; }
let hatchOpener = null;
export function registerHatchDialog(fn){ hatchOpener = fn; }

/* ---------- toggles ---------- */
export function setTog(k){
  T[k]=!T[k];
  const map={grid:'tGrid',snap:'tSnap',ortho:'tOrtho',osnap:'tOsnap'};
  document.getElementById(map[k]).classList.toggle('on', T[k]);
  log(`${k.toUpperCase()} ${T[k]?'on':'off'}`);
  draw();
}

/* ---------- snap / ortho / grid modifiers ---------- */
// Osnap priority, highest first — the fixed RANKING of every implemented kind.
// 'xint' = where the rubber line crosses nearby geometry — a fallback suggestion,
// ranked below perp/tan so it can't shadow them. 'nea' (nearest-on-object) must
// stay last: it is computed lazily, only when nothing else fired.
export const SNAP_PRIORITY = ['end','int','mid','cen','quad','perp','tan','xint','nea'];
// Which kinds actually RUN — configurable via the OSNAP dialog (osnapui.js).
// 'nea' ships off: always-on nearest makes every hover sticky.
export const SNAP_DEFAULTS = ['end','int','mid','cen','quad','perp','tan','xint'];
export const SNAP_ACTIVE = new Set(SNAP_DEFAULTS);
// Alignment tracking (dashed guides off snap points) — the F11 analog.
export const SNAP_FLAGS = { tracking: true };

const OSNAP_STORE_KEY = 'minicad.osnap';
export function setSnapActive(kinds, persist=true){
  SNAP_ACTIVE.clear();
  for (const k of kinds) if (SNAP_PRIORITY.includes(k)) SNAP_ACTIVE.add(k);
  if (persist) saveSnapConfig();
  draw();
}
export function setSnapTracking(on, persist=true){
  SNAP_FLAGS.tracking = !!on;
  if (persist) saveSnapConfig();
  draw();
}
function saveSnapConfig(){
  if (typeof localStorage === 'undefined') return;
  try{ localStorage.setItem(OSNAP_STORE_KEY,
    JSON.stringify({modes:[...SNAP_ACTIVE], tracking:SNAP_FLAGS.tracking})); }catch(e){ /* full/blocked */ }
}
export function loadSnapConfig(){
  if (typeof localStorage === 'undefined') return;
  try{
    const raw = localStorage.getItem(OSNAP_STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.modes)){
      SNAP_ACTIVE.clear();
      for (const k of d.modes) if (SNAP_PRIORITY.includes(k)) SNAP_ACTIVE.add(k);
    }
    if (typeof d.tracking === 'boolean') SNAP_FLAGS.tracking = d.tracking;
  }catch(e){ /* bad JSON — keep defaults */ }
}
loadSnapConfig();

export function applyModifiers(rawW, excludeId){
  setSnapMark(null);
  setTrackGuides(null);
  let p = {x:rawW.x, y:rawW.y};
  if (T.osnap){
    const tol = 11/view.scale;
    // best candidate per kind; the winner is decided by SNAP_PRIORITY, not raw distance
    const buckets = {};
    const consider = c => {
      if (!SNAP_ACTIVE.has(c.k)) return;
      const d = dist(c.p, rawW);
      if (d >= tol) return;
      if (!buckets[c.k] || d < buckets[c.k].d) buckets[c.k] = {c, d};
    };
    for (const c of snapCandidates(excludeId)) consider(c);
    // dynamic snaps near the cursor
    const nearEnts = entities.filter(e=>{
      if (e.id===excludeId || e.type==='text' || !layerVisible(e.layer)) return false;
      const b = entBBox(e);
      return rawW.x>=b[0]-tol && rawW.x<=b[2]+tol && rawW.y>=b[1]-tol && rawW.y<=b[3]+tol;
    });
    if (SNAP_ACTIVE.has('int'))
      for (let i=0;i<nearEnts.length;i++)
        for (let j=i+1;j<nearEnts.length;j++)
          for (const q of entIntersections(nearEnts[i], nearEnts[j])) consider({p:q, k:'int'});
    const pbase = rubberBase();
    if (pbase) for (const e of nearEnts){
      if (SNAP_ACTIVE.has('perp')) for (const q of perpFoot(pbase, e)) consider({p:q, k:'perp'});
      if (SNAP_ACTIVE.has('tan'))  for (const q of tangentPts(pbase, e)) consider({p:q, k:'tan'});
    }
    // "meet the edge": where the rubber line (extended a touch past the cursor)
    // crosses nearby geometry, suggest that exact point
    if (pbase && SNAP_ACTIVE.has('xint')){
      const dx=rawW.x-pbase.x, dy=rawW.y-pbase.y, L=Math.hypot(dx,dy);
      if (L>1e-9){
        const rub={type:'line', x1:pbase.x, y1:pbase.y,
                   x2:rawW.x+dx/L*tol*2, y2:rawW.y+dy/L*tol*2};
        for (const e of nearEnts) for (const q of entIntersections(rub, e)) consider({p:q, k:'xint'});
      }
    }
    let best = null;
    for (const k of SNAP_PRIORITY){
      if (k==='nea' && !best && SNAP_ACTIVE.has('nea')){ // lowest priority: computed only if nothing fired
        for (const e of nearEnts){ const q = nearestOnEnt(e, rawW); if (q) consider({p:q, k:'nea'}); }
      }
      if (buckets[k]){ best = buckets[k].c; break; }
    }
    if (best){ setSnapMark(best); return {x:best.p.x, y:best.p.y}; }
    // alignment tracking: cursor lined up (h/v) with an existing snap point →
    // dashed guide + snap onto the alignment (both axes can engage at once)
    if (cmd && SNAP_FLAGS.tracking){
      let tx=null, txd=tol, txs=null, ty=null, tyd=tol, tys=null;
      for (const c of snapCandidates(excludeId)){
        if (!SNAP_ACTIVE.has(c.k)) continue;      // track off active snap points only
        const ddx=Math.abs(c.p.x-rawW.x), ddy=Math.abs(c.p.y-rawW.y);
        if (ddx<txd){ txd=ddx; tx=c.p.x; txs=c.p; }
        if (ddy<tyd){ tyd=ddy; ty=c.p.y; tys=c.p; }
      }
      if (tx!==null || ty!==null){
        const q={x:(tx!==null?tx:rawW.x), y:(ty!==null?ty:rawW.y)};
        const guides=[];
        if (txs) guides.push({from:txs, to:q});
        if (tys) guides.push({from:tys, to:q});
        setTrackGuides(guides);
        setSnapMark({p:q, k:'trk'});
        return q;
      }
    }
  }
  const base = rubberBase();
  if (T.ortho && base){
    if (Math.abs(p.x-base.x) >= Math.abs(p.y-base.y)) p = {x:p.x, y:base.y};
    else p = {x:base.x, y:p.y};
  }
  if (T.snap){
    const s = gridStep();
    p = {x:Math.round(p.x/s)*s, y:Math.round(p.y/s)*s};
  }
  return p;
}
export function rubberBase(){
  if (!cmd) return null;
  if (cmd.name==='LINE' && cmd.base) return cmd.base;
  if (cmd.name==='PLINE' && cmd.pts.length) return cmd.pts[cmd.pts.length-1];
  if (cmd.name==='ARC' && cmd.pts.length===1) return cmd.pts[0];
  if (cmd.name==='RECTANG' && cmd.p1) return cmd.p1;
  if (cmd.name==='CIRCLE' && cmd.center) return cmd.center;
  if ((cmd.name==='MOVE'||cmd.name==='COPY') && cmd.step==='dest') return cmd.base;
  if (cmd.name==='ROTATE' && cmd.step==='angle') return cmd.base;
  if (cmd.name==='SCALE' && cmd.step==='factor') return cmd.base;
  if (cmd.name==='DIST' && cmd.p1) return cmd.p1;
  if (cmd.name==='MIRROR' && cmd.step==='p2') return cmd.p1;
  if (cmd.name==='STRETCH' && cmd.step==='dest') return cmd.base;
  if (cmd.name==='DIM' && cmd.step==='p2') return cmd.p1;
  return null;
}

/* ---------- command lifecycle ---------- */
export function startCommand(raw){
  const name = ALIASES[raw.toUpperCase()];
  if (!name){ log(`Unknown command: ${raw}  (type ? for help)`, 'e'); return; }
  // instant commands
  if (name==='UNDO'){ doUndo(); return; }
  if (name==='REDO'){ doRedo(); return; }
  if (name==='ZOOMEXT'){ zoomExtents(); return; }
  if (name==='TOGORTHO'){ setTog('ortho'); return; }
  if (name==='TOGOSNAP'){ setTog('osnap'); return; }
  if (name==='TOGGRID'){ setTog('grid'); return; }
  if (name==='HELP'){ toggleHelp(); return; }
  if (name==='PLOT'){
    if (plotOpener) plotOpener(); else log('Print dialog unavailable.', 'e');
    return;
  }
  if (name==='OSNAPDLG'){
    if (osnapOpener) osnapOpener(); else log('Object snap picker unavailable.', 'e');
    return;
  }

  cancelCmd(true);
  setLastCmdName(raw.toUpperCase());
  setCmd({ name, step:0, pts:[], sel:[] });
  log(`Command: ${name}`, 'p');

  if (name==='LINE'){ cmd.base=null; setPrompt('LINE — Specify first point:'); }
  else if (name==='ARC') setPrompt('ARC — Specify start point:');
  else if (name==='NEW'){ cmd.step='confirm'; setPrompt('NEW — Start a new drawing? Unsaved work is lost [Y/N] <N>:'); }
  else if (name==='CHLAYER'){
    if (!selection.size){ log('Select objects first, then CHLAYER.', 'e'); cancelCmd(true); return; }
    cmd.step='layer';
    setPrompt(`CHLAYER — New layer name <${currentLayer}>:`);
  }
  else if (name==='PLINE'){ cmd.plMode='line'; cmd.arcMid=null; setPrompt('PLINE — Specify first point:'); }
  else if (name==='HATCH'){
    cmd.step='mat';
    setPrompt('HATCH — Choose a material:');
    if (hatchOpener) hatchOpener(); else log('Material picker unavailable.', 'e');
  }
  else if (name==='AREA'){ cmd.step='pick'; setPrompt('AREA — Click a hatch or closed shape (Enter to end):'); }
  else if (name==='RECTANG') setPrompt('RECTANG — Specify first corner:');
  else if (name==='CIRCLE') setPrompt('CIRCLE — Specify center point:');
  else if (name==='TEXT'){ cmd.step='point'; setPrompt('TEXT — Specify insertion point:'); }
  else if (name==='DIST') setPrompt('DIST — Specify first point:');
  else if (name==='ZOOM') setPrompt('ZOOM — [E]xtents / [A]ll:');
  else if (name==='OFFSET'){ cmd.step='dist'; setPrompt('OFFSET — Specify offset distance:'); }
  else if (name==='TRIM'){
    cmd.step='select'; selection.clear();      // fresh slate: leftover selection must not become edges
    setPrompt('TRIM — Select cutting edges, Enter when done:');
  }
  else if (name==='EXTEND'){
    cmd.step='select'; selection.clear();
    setPrompt('EXTEND — Select boundary edges, Enter when done:');
  }
  else if (name==='FILLET'){
    cmd.step='radius';
    setPrompt(`FILLET — Specify radius <${fmt(filletRadius)}>:`);
  }
  else if (name==='STRETCH'){
    cmd.step='select'; selection.clear(); setSelRect(null);
    setPrompt('STRETCH — Select objects with a crossing box, Enter when done:');
  }
  else if (name==='DIM'){ cmd.step='p1'; setPrompt('DIM — Specify first extension line origin:'); }
  else if (name==='UNITS'){ cmd.step='u'; setPrompt(`UNITS — mm / cm / m <${units}>:`); }
  else if (name==='PLOTWIN') setPrompt('PLOT — Specify first corner of the print window:');
  else if (name==='PAN') setPrompt('PAN — drag to move the view, Enter or Esc to exit:');
  else if (name==='DIMTXT'){
    cmd.step='h';
    setPrompt(`DIMTXT — Dimension text height <${dimTextHeight>0?fmt(dimTextHeight):'auto'}> (A = auto):`);
  }
  else if (MODIFY.has(name)){
    if (selection.size){ cmd.sel=[...selection]; afterSelect(); }
    else { cmd.step='select'; setPrompt(`${name} — Select objects (click or drag box), Enter when done:`); }
  }
  draw();
}
export function afterSelect(){
  if (cmd.name==='TRIM' || cmd.name==='EXTEND'){
    cmd.allEdges = !cmd.sel.length;               // empty Enter = all objects are edges
    cmd.edges = cmd.sel.slice();
    const what = cmd.name==='TRIM' ? 'cutting edge' : 'boundary edge';
    cmd.step = cmd.name==='TRIM' ? 'trim' : 'extend';
    log(cmd.allEdges ? `All objects are ${what}s.`
                     : `${cmd.edges.length} ${what}${cmd.edges.length>1?'s':''} selected.`);
    setPrompt(`${cmd.name} — Select object to ${cmd.name.toLowerCase()} (Enter to end):`);
    return;
  }
  const n = cmd.sel.length;
  if (!n){ log('Nothing selected.', 'e'); cancelCmd(); return; }
  log(`${n} object${n>1?'s':''} selected.`);
  if (cmd.name==='JOIN'){ performJoin(cmd.sel); return; }
  if (cmd.name==='EXPLODE'){ performExplode(cmd.sel); return; }
  if (cmd.name==='ERASE'){
    snapshot();
    const gone = eraseWithDependents(cmd.sel);
    selection.clear();
    log(`Erased ${gone}.`, 'r'); endCmd();
    return;
  }
  if (cmd.name==='MIRROR'){
    cmd.step='p1';
    setPrompt('MIRROR — Specify first point of mirror line:');
    return;
  }
  if (cmd.name==='STRETCH'){
    cmd.rect = selRect;                       // world rect of the crossing box (null = move whole)
    cmd.step='base';
    setPrompt('STRETCH — Specify base point:');
    return;
  }
  cmd.step='base';
  setPrompt(`${cmd.name} — Specify base point:`);
}
export function endCmd(){ setCmd(null); setPrompt('Command:'); draw(); }
export function cancelCmd(silent){
  if (cmd && !silent) log('*Cancel*');
  setCmd(null); setPrompt('Command:'); draw();
}

export function onPoint(p){
  if (!cmd) return;
  const n = cmd.name;
  if (n==='LINE'){
    if (!cmd.base){ cmd.base=p; setPrompt('LINE — Specify next point:'); }
    else {
      snapshot();
      entities.push({id:nextId(), type:'line', x1:cmd.base.x, y1:cmd.base.y, x2:p.x, y2:p.y, layer:currentLayer});
      cmd.base=p;
    }
  }
  else if (n==='PLINE'){
    if (cmd.plMode==='arc' && cmd.pts.length){
      const last = cmd.pts[cmd.pts.length-1];
      if (cmd.arcMid){                              // 3-point arc (no tangent to continue from)
        const bl = bulgeFrom3(last, cmd.arcMid, p);
        if (bl) last.bulge = bl;
        cmd.arcMid = null;
        cmd.pts.push(p);
        setPrompt('PLINE arc — Specify arc end point [L = straight, C to close]:');
      } else {
        const t = plineEndTangent(cmd.pts);
        if (!t){                                    // arc as first segment: need a point on it
          cmd.arcMid = p;
          setPrompt('PLINE arc — Specify the arc end point:');
        } else {                                    // tangent continuation: endpoint is enough
          const bl = tangentBulge(last, t, p);
          if (!isFinite(bl) || Math.abs(bl) > 1e6){
            log("Can't reach that point with a tangent arc — pick a point more to the side.", 'e'); return;
          }
          if (Math.abs(bl) > 1e-9) last.bulge = bl;
          cmd.pts.push(p);
          setPrompt('PLINE arc — Specify arc end point [L = straight, C to close]:');
        }
      }
    } else {
      cmd.pts.push(p);
      setPrompt('PLINE — Specify next point [A = arc, C to close, Enter to end]:');
    }
  }
  else if (n==='ARC'){
    cmd.pts.push(p);
    if (cmd.pts.length===1) setPrompt('ARC — Specify second point (on the arc):');
    else if (cmd.pts.length===2) setPrompt('ARC — Specify end point:');
    else {
      const a3 = arcFrom3(cmd.pts[0], cmd.pts[1], cmd.pts[2]);
      if (!a3){ log('Points are in a straight line — no arc through them.', 'e'); cmd.pts.pop(); return; }
      snapshot();
      entities.push({id:nextId(), type:'arc', cx:a3.cx, cy:a3.cy, r:a3.r, a0:a3.a0, a1:a3.a1, layer:currentLayer});
      endCmd(); return;
    }
  }
  else if (n==='RECTANG'){
    if (!cmd.p1){ cmd.p1=p; setPrompt('RECTANG — Specify other corner:'); }
    else {
      snapshot();
      entities.push({id:nextId(), type:'pline', closed:true, layer:currentLayer,
        pts:[{x:cmd.p1.x,y:cmd.p1.y},{x:p.x,y:cmd.p1.y},{x:p.x,y:p.y},{x:cmd.p1.x,y:p.y}]});
      endCmd(); return;
    }
  }
  else if (n==='CIRCLE'){
    if (!cmd.center){ cmd.center=p; setPrompt('CIRCLE — Specify radius (click or type):'); }
    else { makeCircle(dist(cmd.center,p)); return; }
  }
  else if (n==='TEXT' && cmd.step==='point'){
    cmd.pt=p; cmd.step='height';
    setPrompt('TEXT — Specify height <2.5>:');
  }
  else if (n==='DIST'){
    if (!cmd.p1){ cmd.p1=p; setPrompt('DIST — Specify second point:'); }
    else {
      const dx=p.x-cmd.p1.x, dy=p.y-cmd.p1.y;
      const ang=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
      log(`Distance = ${fmt(Math.hypot(dx,dy))},  ΔX = ${fmt(dx)},  ΔY = ${fmt(dy)},  Angle = ${fmt(ang)}°`, 'r');
      endCmd(); return;
    }
  }
  else if ((n==='MOVE'||n==='COPY') ){
    if (cmd.step==='base'){ cmd.base=p; cmd.step='dest'; setPrompt(`${n} — Specify second point:`); }
    else if (cmd.step==='dest'){
      const dx=p.x-cmd.base.x, dy=p.y-cmd.base.y;
      snapshot();
      if (n==='MOVE'){ translateIds(cmd.sel, dx, dy); log(`Moved ${cmd.sel.length}.`, 'r'); endCmd(); return; }
      else {
        const idMap = new Map();
        const clones = cmd.sel.map(id=>{ const e=deep(entities.find(z=>z.id===id)); const nid=nextId(); idMap.set(id, nid); e.id=nid; return e; });
        clones.forEach(e=>{ if (e.type==='hatch' && idMap.has(e.ref)) e.ref = idMap.get(e.ref); });
        clones.forEach(e=>translateEnt(e,dx,dy));
        entities.push(...clones);
        log(`Copied ${clones.length}.`, 'r');
        setPrompt('COPY — Specify second point (Enter to end):');
      }
    }
  }
  else if (n==='MIRROR'){
    if (cmd.step==='p1'){ cmd.p1=p; cmd.step='p2'; setPrompt('MIRROR — Specify second point of mirror line:'); }
    else if (cmd.step==='p2'){
      if (dist(p, cmd.p1) < 1e-9){ log('Points must differ.', 'e'); return; }
      cmd.p2=p; cmd.step='erase';
      setPrompt('MIRROR — Erase source objects? [Y/N] <N>:');
    }
  }
  else if (n==='STRETCH'){
    if (cmd.step==='base'){ cmd.base=p; cmd.step='dest'; setPrompt('STRETCH — Specify second point:'); }
    else if (cmd.step==='dest'){
      snapshot();
      const dx=p.x-cmd.base.x, dy=p.y-cmd.base.y;
      for (const id of cmd.sel){
        const e=entities.find(z=>z.id===id); if (e) stretchEnt(e, cmd.rect, dx, dy);
      }
      log(`Stretched ${cmd.sel.length}.`, 'r');
      endCmd(); return;
    }
  }
  else if (n==='PLOTWIN'){
    cmd.pts.push(p);
    if (cmd.pts.length===1) setPrompt('PLOT — Specify opposite corner:');
    else {
      const [a,b]=cmd.pts;
      setPlotWin([Math.min(a.x,b.x), Math.min(a.y,b.y), Math.max(a.x,b.x), Math.max(a.y,b.y)]);
      log('Print window set.', 'r');
      endCmd();
      if (plotOpener) plotOpener();
      return;
    }
  }
  else if (n==='DIM'){
    if (cmd.step==='p1'){ cmd.p1=p; cmd.step='p2'; setPrompt('DIM — Specify second extension line origin:'); }
    else if (cmd.step==='p2'){
      if (dist(p, cmd.p1) < 1e-9){ log('Points must differ.', 'e'); return; }
      cmd.p2=p; cmd.step='pos';
      setPrompt('DIM — Specify dimension line location:');
    }
    else if (cmd.step==='pos'){
      const dxl=cmd.p2.x-cmd.p1.x, dyl=cmd.p2.y-cmd.p1.y, L=Math.hypot(dxl,dyl);
      const off=((p.x-cmd.p1.x)*(-dyl)+(p.y-cmd.p1.y)*dxl)/L;
      snapshot();
      const d={id:nextId(), type:'dim', x1:cmd.p1.x, y1:cmd.p1.y, x2:cmd.p2.x, y2:cmd.p2.y,
               off, layer:currentLayer};
      if (dimTextHeight>0) d.h=dimTextHeight;
      entities.push(d);
      endCmd(); return;
    }
  }
  else if (n==='ROTATE'){
    if (cmd.step==='base'){ cmd.base=p; cmd.step='angle'; setPrompt('ROTATE — Specify rotation angle (type degrees or click):'); }
    else if (cmd.step==='angle'){
      const ang = Math.atan2(p.y-cmd.base.y, p.x-cmd.base.x);
      applyRotate(ang); return;
    }
  }
  else if (n==='SCALE'){
    if (cmd.step==='base'){ cmd.base=p; cmd.step='factor'; setPrompt('SCALE — Specify scale factor (type a number):'); }
    else log('Type a numeric scale factor (e.g. 2 or 0.5).', 'e');
  }
  else if (n==='TRIM'){
    if (cmd.step==='trim'){
      const e = findEntityAt(p);
      if (!e){ log('No object there.', 'e'); return; }
      trimEntity(e, p);
    }
  }
  else if (n==='EXTEND'){
    if (cmd.step==='extend'){
      const e = findEntityAt(p);
      if (!e){ log('No object there.', 'e'); return; }
      extendEntity(e, p);
    }
  }
  else if (n==='FILLET'){
    if (cmd.step==='first' || cmd.step==='second'){
      const e = findEntityAt(p);
      if (!e){ log('No object there.', 'e'); return; }
      if (e.type!=='line'){ log('FILLET supports lines only in this version.', 'e'); return; }
      if (cmd.step==='first'){
        cmd.e1=e; cmd.p1=p; cmd.step='second';
        setPrompt('FILLET — Select second line:');
      } else {
        if (e.id===cmd.e1.id){ log('Pick two different lines.', 'e'); return; }
        filletLines(cmd.e1, cmd.p1, e, p);
      }
    }
  }
  else if (n==='HATCH'){
    if (cmd.step==='mat'){ if (hatchOpener) hatchOpener(); }
    else if (cmd.step==='pick') placeHatch(p);
  }
  else if (n==='AREA'){
    if (cmd.step==='pick') reportArea(p);
  }
  else if (n==='OFFSET'){
    if (cmd.step==='pick'){
      const e = findEntityAt(p);
      if (!e){ log('No object there.', 'e'); return; }
      if (e.type==='text' || e.type==='dim'){ log('Offset supports lines, circles, arcs and polylines.', 'e'); return; }
      cmd.target=e; cmd.step='side';
      setPrompt('OFFSET — Specify point on side to offset:');
    }
    else if (cmd.step==='side'){
      offsetEntity(cmd.target, cmd.dist, p);
      cmd.step='pick'; cmd.target=null;
      setPrompt('OFFSET — Select object to offset (Enter to end):');
    }
  }
  draw();
}

export function areaLabel(a){
  return `${fmt(a.area)} ${units}² (perimeter ${fmt(a.perim)} ${units})`;
}
// material picked in the hatch dialog (or by tests) — advances the command
export function chooseHatchMaterial(key){
  if (!cmd || cmd.name!=='HATCH' || !materialByKey(key)) return;
  cmd.mat = key; cmd.step='pick';
  setPrompt(`HATCH (${materialByKey(key).name.toLowerCase()}) — Click a closed shape (closed polyline or circle):`);
  draw();
}
function boundaryFor(e){                  // resolve what a click means for HATCH/AREA
  if (!e) return {err:'No shape there.'};
  if (e.type==='hatch'){
    const b = entities.find(z=>z.id===e.ref);
    return b ? {b, hatch:e} : {err:'That hatch lost its outline.'};
  }
  if (e.type==='circle') return {b:e};
  if (e.type==='pline'){
    if (e.closed) return {b:e};
    return {err:"That polyline isn't closed — JOIN it into a loop first."};
  }
  return {err:'Pick a closed shape — a closed polyline or a circle.'};
}
// what a HATCH/AREA click means: an edge under the cursor, else the smallest
// closed shape CONTAINING the point (the pick-inside-the-room gesture)
function boundaryAt(p){
  const hit = findEntityAt(p);
  if (hit) return boundaryFor(hit);
  let best=null, bestArea=Infinity;
  for (const e of entities){
    if (!layerVisible(e.layer) || !layerUnlocked(e.layer)) continue;
    const a = entityArea(e);
    if (!a || a.area>=bestArea) continue;
    if (pointInPoly(p, tessellateBoundary(e))){ best=e; bestArea=a.area; }
  }
  return best ? {b:best} : {err:'No closed shape there — click inside a room or on its outline.'};
}
function placeHatch(p){
  const {b, err} = boundaryAt(p);
  if (err){ log(err, 'e'); return; }
  const a = entityArea(b);
  if (!a){ log('Could not measure that shape.', 'e'); return; }
  snapshot();
  const existing = entities.find(z=>z.type==='hatch' && z.ref===b.id);
  const matName = materialByKey(cmd.mat).name;
  if (existing){
    existing.mat = cmd.mat;
    log(`${matName} hatch updated — area ${areaLabel(a)}.`, 'r');
  } else {
    entities.push({id:nextId(), type:'hatch', ref:b.id, mat:cmd.mat, layer:currentLayer});
    log(`${matName} hatch created — area ${areaLabel(a)}.`, 'r');
  }
  setPrompt(`HATCH (${matName.toLowerCase()}) — Click another closed shape (Enter to end):`);
}
function reportArea(p){
  const {b, hatch, err} = boundaryAt(p);
  if (err){ log(err, 'e'); return; }
  const a = entityArea(b);
  if (!a){ log('Could not measure that shape.', 'e'); return; }
  const what = hatch ? `${materialByKey(hatch.mat)?.name || 'Hatch'}` : (b.type==='circle' ? 'Circle' : 'Polyline');
  log(`${what} — area ${areaLabel(a)}.`, 'r');
}
function makeCircle(r){
  if (!(r>0)){ log('Radius must be positive.', 'e'); return; }
  snapshot();
  entities.push({id:nextId(), type:'circle', cx:cmd.center.x, cy:cmd.center.y, r, layer:currentLayer});
  endCmd();
}
function applyRotate(ang){
  const c=Math.cos(ang), s=Math.sin(ang);
  snapshot();
  for (const id of cmd.sel){
    const e=entities.find(z=>z.id===id); if(!e) continue;
    if (e.type==='line'){ const a=rotPt({x:e.x1,y:e.y1},cmd.base,c,s), b=rotPt({x:e.x2,y:e.y2},cmd.base,c,s); e.x1=a.x;e.y1=a.y;e.x2=b.x;e.y2=b.y; }
    else if (e.type==='circle'){ const p=rotPt({x:e.cx,y:e.cy},cmd.base,c,s); e.cx=p.x;e.cy=p.y; }
    else if (e.type==='arc'){ const p=rotPt({x:e.cx,y:e.cy},cmd.base,c,s); e.cx=p.x;e.cy=p.y; e.a0=normAng(e.a0+ang); e.a1=normAng(e.a1+ang); }
    else if (e.type==='pline'){ e.pts=e.pts.map(p=>{ const q=rotPt(p,cmd.base,c,s); return p.bulge?{...q,bulge:p.bulge}:q; }); }
    else if (e.type==='text'){ const p=rotPt({x:e.x,y:e.y},cmd.base,c,s); e.x=p.x;e.y=p.y; }
    else if (e.type==='dim'){ const a=rotPt({x:e.x1,y:e.y1},cmd.base,c,s), b=rotPt({x:e.x2,y:e.y2},cmd.base,c,s); e.x1=a.x;e.y1=a.y;e.x2=b.x;e.y2=b.y; }
  }
  log(`Rotated ${cmd.sel.length} by ${fmt(ang*180/Math.PI)}°.`, 'r');
  endCmd();
}
function applyScale(f){
  if (!(f>0)){ log('Factor must be positive.', 'e'); return; }
  snapshot();
  const b=cmd.base;
  const sp=p=>({x:b.x+(p.x-b.x)*f, y:b.y+(p.y-b.y)*f});
  for (const id of cmd.sel){
    const e=entities.find(z=>z.id===id); if(!e) continue;
    if (e.type==='line'){ const a=sp({x:e.x1,y:e.y1}), q=sp({x:e.x2,y:e.y2}); e.x1=a.x;e.y1=a.y;e.x2=q.x;e.y2=q.y; }
    else if (e.type==='circle' || e.type==='arc'){ const p=sp({x:e.cx,y:e.cy}); e.cx=p.x;e.cy=p.y;e.r*=f; }
    else if (e.type==='pline'){ e.pts=e.pts.map(p=>{ const q=sp(p); return p.bulge?{...q,bulge:p.bulge}:q; }); }
    else if (e.type==='text'){ const p=sp({x:e.x,y:e.y}); e.x=p.x;e.y=p.y;e.h*=f; }
    else if (e.type==='dim'){ const a=sp({x:e.x1,y:e.y1}), q=sp({x:e.x2,y:e.y2}); e.x1=a.x;e.y1=a.y;e.x2=q.x;e.y2=q.y;e.off*=f; if (e.h) e.h*=f; }
  }
  log(`Scaled ${cmd.sel.length} by ${f}.`, 'r');
  endCmd();
}
function offsetEntity(e, d, side){
  snapshot();
  if (e.type==='circle' || e.type==='arc'){
    const inside = dist(side,{x:e.cx,y:e.cy}) < e.r;
    const r = inside ? e.r-d : e.r+d;
    if (r<=0){ log(`Offset would collapse the ${e.type}.`, 'e'); undoStack.pop(); return; }
    if (e.type==='circle') entities.push({id:nextId(), type:'circle', cx:e.cx, cy:e.cy, r, layer:e.layer});
    else entities.push({id:nextId(), type:'arc', cx:e.cx, cy:e.cy, r, a0:e.a0, a1:e.a1, layer:e.layer});
  } else if (e.type==='pline'){
    if (plineCurved(e)){
      log('OFFSET does not handle curved polylines yet — EXPLODE it, offset the pieces, then JOIN them back.', 'e');
      undoStack.pop(); return;
    }
    const pts = offsetPlinePts(e, d, side);
    if (!pts){ log('Offset would collapse the polyline.', 'e'); undoStack.pop(); return; }
    entities.push({id:nextId(), type:'pline', closed:e.closed, pts, layer:e.layer});
  } else {
    const dx=e.x2-e.x1, dy=e.y2-e.y1, L=Math.hypot(dx,dy);
    if (!L){ log('Zero-length line.', 'e'); undoStack.pop(); return; }
    let nx=-dy/L, ny=dx/L;
    const s=Math.sign((side.x-e.x1)*nx + (side.y-e.y1)*ny) || 1;
    nx*=s*d; ny*=s*d;
    entities.push({id:nextId(), type:'line', x1:e.x1+nx, y1:e.y1+ny, x2:e.x2+nx, y2:e.y2+ny, layer:e.layer});
  }
  log('Offset created.', 'r');
}
// offset a polyline: shift each segment sideways, rejoin corners with mitered intersections
function offsetPlinePts(e, d, side){
  const pts=e.pts, n=pts.length;
  const segs=[];
  for (let i=0;i<n-1;i++) segs.push([pts[i], pts[i+1]]);
  if (e.closed && n>2) segs.push([pts[n-1], pts[0]]);
  if (!segs.length) return null;
  // which side? decided by the segment nearest to the pick point
  let bi=0, bd=Infinity;
  segs.forEach((s,i)=>{ const dd=ptSegDist(side, s[0], s[1]); if (dd<bd){ bd=dd; bi=i; } });
  const [sa,sb]=segs[bi];
  const sgn = Math.sign((side.x-sa.x)*-(sb.y-sa.y) + (side.y-sa.y)*(sb.x-sa.x)) || 1;
  // every segment shifted along its left normal by sgn·d
  const off = segs.map(([a,b])=>{
    const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
    if (!L) return null;
    const nx=-dy/L*sgn*d, ny=dx/L*sgn*d;
    return {a:{x:a.x+nx, y:a.y+ny}, d:{x:dx, y:dy}};
  });
  if (off.some(o=>!o)) return null;
  const out=[];
  if (e.closed && n>2){
    for (let i=0;i<off.length;i++){
      const prev = off[(i-1+off.length)%off.length];
      out.push(lineLine(prev.a, prev.d, off[i].a, off[i].d) || {x:off[i].a.x, y:off[i].a.y});
    }
  } else {
    out.push({x:off[0].a.x, y:off[0].a.y});
    for (let i=1;i<off.length;i++)
      out.push(lineLine(off[i-1].a, off[i-1].d, off[i].a, off[i].d) || {x:off[i].a.x, y:off[i].a.y});
    const last=off[off.length-1];
    out.push({x:last.a.x+last.d.x, y:last.a.y+last.d.y});
  }
  return out;
}

/* ---------- trim ---------- */
function trimEntity(target, p){
  if (target.type!=='line' && target.type!=='circle' && target.type!=='arc'){
    log('TRIM supports lines, circles and arcs — EXPLODE a polyline to trim its pieces.', 'e'); return;
  }
  const edges = (cmd.allEdges ? entities : entities.filter(z=>cmd.edges.includes(z.id)))
                .filter(z=>z.id!==target.id && layerVisible(z.layer));
  const pts=[];
  for (const z of edges) pts.push(...entIntersections(target, z));

  let pieces;
  if (target.type==='line') pieces = trimLine(target, p, pts);
  else if (target.type==='circle') pieces = trimCircle(target, p, pts);
  else pieces = trimArc(target, p, pts);
  if (pieces==='need2'){ log('Circle must intersect cutting edges at 2+ points.', 'e'); return; }
  if (!pieces){ log('Object does not intersect a cutting edge.', 'e'); return; }

  snapshot();                                   // one undo step per trim
  const idx = entities.indexOf(target);
  entities.splice(idx, 1, ...pieces);
  selection.delete(target.id);
  if (cmd.edges && cmd.edges.includes(target.id))       // trimmed edge: pieces stay edges
    cmd.edges.push(...pieces.map(z=>z.id));
  log('Trimmed.', 'r');
  draw();
}
function trimLine(t, p, pts){
  const a={x:t.x1,y:t.y1}, b={x:t.x2,y:t.y2};
  const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
  if (!L2) return null;
  const par=q=>((q.x-a.x)*dx+(q.y-a.y)*dy)/L2;
  const at=v=>({x:a.x+v*dx, y:a.y+v*dy});
  const ts=pts.map(par).filter(v=>v>1e-6 && v<1-1e-6).sort((u,v)=>u-v);
  if (!ts.length) return null;
  const tp=Math.max(0,Math.min(1,par(p)));
  let lo=null, hi=null;
  for (const v of ts){ if (v<=tp) lo=v; else if (hi===null) hi=v; }
  const out=[];
  if (lo!==null){ const q=at(lo); out.push({id:nextId(), type:'line', x1:a.x,y1:a.y,x2:q.x,y2:q.y, layer:t.layer}); }
  if (hi!==null){ const q=at(hi); out.push({id:nextId(), type:'line', x1:q.x,y1:q.y,x2:b.x,y2:b.y, layer:t.layer}); }
  return out;
}
function trimCircle(t, p, pts){
  // 2+ intersections → keep the arc that doesn't contain the picked point
  let angs = pts.map(q=>normAng(Math.atan2(q.y-t.cy, q.x-t.cx))).sort((u,v)=>u-v);
  angs = angs.filter((a,i)=> i===0 || a-angs[i-1] > 1e-6);
  if (angs.length>1 && angs[0]+TAU-angs[angs.length-1] < 1e-6) angs.pop();
  if (!angs.length) return null;
  if (angs.length<2) return 'need2';
  const tp = normAng(Math.atan2(p.y-t.cy, p.x-t.cx));
  let i = angs.findIndex(a=>a>tp); if (i===-1) i=0;
  const hi=angs[i], lo=angs[(i-1+angs.length)%angs.length];
  return [{id:nextId(), type:'arc', cx:t.cx, cy:t.cy, r:t.r, a0:hi, a1:lo, layer:t.layer}];
}
function trimArc(t, p, pts){
  const sweep = arcSweep(t);
  const rel = q=>normAng(Math.atan2(q.y-t.cy, q.x-t.cx) - t.a0);
  const ss = pts.map(rel).filter(v=>v>1e-6 && v<sweep-1e-6).sort((u,v)=>u-v);
  if (!ss.length) return null;
  const sp = Math.min(rel(p), sweep);
  let lo=null, hi=null;
  for (const v of ss){ if (v<=sp) lo=v; else if (hi===null) hi=v; }
  const out=[];
  if (lo!==null) out.push({id:nextId(), type:'arc', cx:t.cx, cy:t.cy, r:t.r, a0:t.a0, a1:normAng(t.a0+lo), layer:t.layer});
  if (hi!==null) out.push({id:nextId(), type:'arc', cx:t.cx, cy:t.cy, r:t.r, a0:normAng(t.a0+hi), a1:t.a1, layer:t.layer});
  return out;
}

/* ---------- extend ---------- */
function extendEntity(target, p){
  if (target.type!=='line' && target.type!=='arc'){
    log('EXTEND supports lines and arcs — EXPLODE a polyline to extend its pieces.', 'e'); return;
  }
  const bounds = (cmd.allEdges ? entities : entities.filter(z=>cmd.edges.includes(z.id)))
                 .filter(z=>z.id!==target.id && layerVisible(z.layer));
  const ok = target.type==='line' ? extendLine(target, p, bounds) : extendArc(target, p, bounds);
  if (!ok){ log('No boundary edge to extend to.', 'e'); return; }
  log('Extended.', 'r');
  draw();
}
function extendLine(t, p, bounds){
  const a={x:t.x1,y:t.y1}, b={x:t.x2,y:t.y2};
  const fromEnd2 = dist(p,b) < dist(p,a);        // the end nearer the pick extends
  const org = fromEnd2 ? b : a, other = fromEnd2 ? a : b;
  const L = dist(org, other); if (!L) return false;
  const d = {x:(org.x-other.x)/L, y:(org.y-other.y)/L};
  let best=null;
  for (const z of bounds)
    for (const tv of lineEntT(org, d, z))
      if (tv>1e-9 && (best===null || tv<best)) best=tv;
  if (best===null) return false;
  snapshot();                                     // one undo step per extend
  const q={x:org.x+best*d.x, y:org.y+best*d.y};
  if (fromEnd2){ t.x2=q.x; t.y2=q.y; } else { t.x1=q.x; t.y1=q.y; }
  return true;
}
function extendArc(t, p, bounds){
  const full = {type:'circle', cx:t.cx, cy:t.cy, r:t.r};
  const angs=[];
  for (const z of bounds) for (const q of entIntersections(full, z))
    angs.push(Math.atan2(q.y-t.cy, q.x-t.cx));
  if (!angs.length) return false;
  const gap = TAU - arcSweep(t);                  // room left before the arc closes on itself
  const nearA1 = dist(p, arcPt(t,t.a1)) < dist(p, arcPt(t,t.a0));
  let best=null;
  for (const th of angs){
    const rel = nearA1 ? normAng(th - t.a1) : normAng(t.a0 - th);
    if (rel>1e-6 && rel<gap-1e-6 && (best===null || rel<best.rel)) best={rel, th};
  }
  if (!best) return false;
  snapshot();
  if (nearA1) t.a1 = normAng(best.th); else t.a0 = normAng(best.th);
  return true;
}

/* ---------- mirror / stretch ---------- */
function doMirror(eraseSrc){
  snapshot();
  const idMap = new Map();
  const clones = cmd.sel.map(id=>{ const e=entities.find(z=>z.id===id); if(!e) return null;
                                   const c=deep(e); const nid=nextId(); idMap.set(id, nid); c.id=nid; return c; }).filter(Boolean);
  clones.forEach(c=>{ if (c.type==='hatch' && idMap.has(c.ref)) c.ref = idMap.get(c.ref); });
  clones.forEach(c=>mirrorEnt(c, cmd.p1, cmd.p2));
  entities.push(...clones);
  if (eraseSrc){
    setEntities(entities.filter(e=>!cmd.sel.includes(e.id)));
    cmd.sel.forEach(id=>selection.delete(id));
  }
  log(`Mirrored ${clones.length}${eraseSrc?' (source erased)':''}.`, 'r');
  endCmd();
}
function stretchEnt(e, r, dx, dy){   // move vertices inside r; null r = move everything
  const inR = p => !r || (p.x>=r[0]-1e-9 && p.x<=r[2]+1e-9 && p.y>=r[1]-1e-9 && p.y<=r[3]+1e-9);
  if (e.type==='line'){
    if (inR({x:e.x1,y:e.y1})){ e.x1+=dx; e.y1+=dy; }
    if (inR({x:e.x2,y:e.y2})){ e.x2+=dx; e.y2+=dy; }
  }
  else if (e.type==='pline'){ e.pts.forEach(p=>{ if (inR(p)){ p.x+=dx; p.y+=dy; } }); }
  else if (e.type==='dim'){
    if (inR({x:e.x1,y:e.y1})){ e.x1+=dx; e.y1+=dy; }
    if (inR({x:e.x2,y:e.y2})){ e.x2+=dx; e.y2+=dy; }
  }
  else if (e.type==='circle' || e.type==='arc'){ if (inR({x:e.cx,y:e.cy})){ e.cx+=dx; e.cy+=dy; } }
  else if (e.type==='text'){ if (inR({x:e.x,y:e.y})){ e.x+=dx; e.y+=dy; } }
}

// erase ids + any hatches whose boundary is going away; returns the count (no snapshot)
export function eraseWithDependents(ids){
  const doomed = new Set(ids);
  for (const e of entities) if (e.type==='hatch' && doomed.has(e.ref)) doomed.add(e.id);
  setEntities(entities.filter(e=>!doomed.has(e.id)));
  return doomed.size;
}

/* ---------- join / explode ---------- */
const JTOL = 1e-6;
const samePt = (a,b)=>Math.abs(a.x-b.x)<=JTOL && Math.abs(a.y-b.y)<=JTOL;
// entity → open strand of pline-style points (bulge on the leading vertex), or null
function strandOf(e){
  if (e.type==='line') return [{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}];
  if (e.type==='arc'){
    const p0=arcPt(e,e.a0), p1=arcPt(e,e.a1);
    return [{x:p0.x, y:p0.y, bulge:Math.tan(arcSweep(e)/4)}, {x:p1.x, y:p1.y}];
  }
  if (e.type==='pline' && !e.closed) return e.pts.map(p=>({...p}));
  return null;
}
function reverseStrand(pts){
  const n=pts.length, out=[];
  for (let i=n-1;i>=0;i--){
    const q={x:pts[i].x, y:pts[i].y};
    if (i>0 && pts[i-1].bulge) q.bulge = -pts[i-1].bulge;  // segment bulge moves to its new lead vertex
    out.push(q);
  }
  return out;
}
function performJoin(ids){
  const pool=[];
  for (const id of ids){
    const e=entities.find(z=>z.id===id); if (!e) continue;
    const pts=strandOf(e);
    if (pts) pool.push({e, pts});
  }
  if (pool.length<2){
    log('JOIN needs two or more touching lines, arcs or open polylines.', 'e');
    endCmd(); return;
  }
  const used=new Set(), chains=[];
  for (let i=0;i<pool.length;i++){
    if (used.has(i)) continue;
    used.add(i);
    let chain=pool[i].pts.map(p=>({...p}));
    const members=[pool[i].e];
    const attach=(pts)=>{
      if (!samePt(chain[chain.length-1], pts[0])) return false;
      const last=chain[chain.length-1];
      if (pts[0].bulge) last.bulge=pts[0].bulge; else delete last.bulge;
      chain=chain.concat(pts.slice(1).map(p=>({...p})));
      return true;
    };
    let grew=true;
    while (grew){
      grew=false;
      for (let j=0;j<pool.length;j++){
        if (used.has(j)) continue;
        const pts=pool[j].pts;
        let ok = attach(pts) || attach(reverseStrand(pts));
        if (!ok){                                    // try the other end of the chain
          chain=reverseStrand(chain);
          ok = attach(pts) || attach(reverseStrand(pts));
          if (!ok) chain=reverseStrand(chain);       // restore
        }
        if (ok){ used.add(j); members.push(pool[j].e); grew=true; }
      }
    }
    let closed=false;
    if (chain.length>3 && samePt(chain[0], chain[chain.length-1])){
      chain.pop(); closed=true;                      // last vertex's bulge now spans the closing segment
    }
    chains.push({pts:chain, members, closed});
  }
  const merged = chains.filter(c=>c.members.length>1);
  if (!merged.length){
    log('Nothing joined — ends must meet exactly (draw with osnap ▪ so they do).', 'e');
    endCmd(); return;
  }
  snapshot();
  const consumed=new Set(merged.flatMap(c=>c.members.map(e=>e.id)));
  setEntities(entities.filter(e=>!consumed.has(e.id)));
  for (const c of merged)
    entities.push({id:nextId(), type:'pline', closed:c.closed, pts:c.pts, layer:c.members[0].layer});
  selection.clear();
  const total=merged.reduce((n,c)=>n+c.members.length,0);
  log(`Joined ${total} objects into ${merged.length} polyline${merged.length>1?'s':''}${merged.some(c=>c.closed)?' (closed)':''}.`, 'r');
  endCmd();
}
function performExplode(ids){
  const born=[], consumed=new Set();
  let plines=0, skipped=0;
  for (const id of ids){
    const e=entities.find(z=>z.id===id); if (!e) continue;
    if (e.type!=='pline'){ skipped++; continue; }
    plines++; consumed.add(e.id);
    for (const part of plineParts(e)){
      if (part.arc)
        born.push({id:nextId(), type:'arc', cx:part.arc.cx, cy:part.arc.cy, r:part.arc.r,
                   a0:part.arc.a0, a1:part.arc.a1, layer:e.layer});
      else if (!samePt(part.a, part.b))
        born.push({id:nextId(), type:'line', x1:part.a.x, y1:part.a.y, x2:part.b.x, y2:part.b.y, layer:e.layer});
    }
  }
  if (!plines){
    log('EXPLODE breaks polylines (rectangles too) into lines and arcs — select one.', 'e');
    endCmd(); return;
  }
  snapshot();
  let hatchesGone = 0;
  for (const e of entities) if (e.type==='hatch' && consumed.has(e.ref)){ consumed.add(e.id); hatchesGone++; }
  setEntities(entities.filter(e=>!consumed.has(e.id)).concat(born));
  selection.clear();
  log(`Exploded ${plines} polyline${plines>1?'s':''} into ${born.length} objects${skipped?` (${skipped} skipped)`:''}${hatchesGone?` — ${hatchesGone} hatch${hatchesGone>1?'es':''} removed with the outline`:''}.`, 'r');
  endCmd();
}

/* ---------- fillet ---------- */
function filletLines(l1, p1, l2, p2){
  const a1={x:l1.x1,y:l1.y1}, b1={x:l1.x2,y:l1.y2};
  const a2={x:l2.x1,y:l2.y1}, b2={x:l2.x2,y:l2.y2};
  const L1=dist(a1,b1), L2=dist(a2,b2);
  if (!L1 || !L2){ log('Zero-length line.', 'e'); return; }
  const v1={x:(b1.x-a1.x)/L1, y:(b1.y-a1.y)/L1};
  const v2={x:(b2.x-a2.x)/L2, y:(b2.y-a2.y)/L2};
  const P = lineLine(a1, v1, a2, v2);
  if (!P){ log('Lines are parallel — cannot fillet.', 'e'); return; }
  const par1=q=>(q.x-a1.x)*v1.x + (q.y-a1.y)*v1.y;   // distance along each line from its start
  const par2=q=>(q.x-a2.x)*v2.x + (q.y-a2.y)*v2.y;
  const ti1=par1(P), tp1=par1(p1), ti2=par2(P), tp2=par2(p2);

  if (filletRadius<=0){                            // sharp corner: trim/extend both to P
    snapshot();
    if (tp1<ti1){ l1.x2=P.x; l1.y2=P.y; } else { l1.x1=P.x; l1.y1=P.y; }
    if (tp2<ti2){ l2.x2=P.x; l2.y2=P.y; } else { l2.x1=P.x; l2.y1=P.y; }
    log('Corner created.', 'r');
    endCmd(); return;
  }

  // rounded corner: tangent arc between the picked sides
  const s1 = tp1>=ti1?1:-1, s2 = tp2>=ti2?1:-1;    // picked side of each line, seen from P
  const u1={x:v1.x*s1, y:v1.y*s1}, u2={x:v2.x*s2, y:v2.y*s2};
  const dot = Math.max(-1, Math.min(1, u1.x*u2.x + u1.y*u2.y));
  const theta = Math.acos(dot);
  if (theta<1e-6 || Math.PI-theta<1e-6){ log('Lines are parallel — cannot fillet.', 'e'); return; }
  const tanLen = filletRadius/Math.tan(theta/2);
  const reach1 = s1>0 ? L1-ti1 : ti1;              // how far the kept side reaches past P
  const reach2 = s2>0 ? L2-ti2 : ti2;
  if (tanLen > reach1+1e-9 || tanLen > reach2+1e-9){ log('Radius too large for these lines.', 'e'); return; }
  const T1={x:P.x+u1.x*tanLen, y:P.y+u1.y*tanLen};
  const T2={x:P.x+u2.x*tanLen, y:P.y+u2.y*tanLen};
  const bl=Math.hypot(u1.x+u2.x, u1.y+u2.y);
  const cd=filletRadius/Math.sin(theta/2);         // center sits on the bisector
  const C={x:P.x+(u1.x+u2.x)/bl*cd, y:P.y+(u1.y+u2.y)/bl*cd};
  const w1={x:T1.x-C.x,y:T1.y-C.y}, w2={x:T2.x-C.x,y:T2.y-C.y};
  const g1=Math.atan2(w1.y,w1.x), g2=Math.atan2(w2.y,w2.x);
  const ccw = w1.x*w2.y - w1.y*w2.x > 0;           // arc runs the short way, T1→T2

  snapshot();                                      // one undo step: both trims + the arc
  if (s1>0){ l1.x1=T1.x; l1.y1=T1.y; } else { l1.x2=T1.x; l1.y2=T1.y; }
  if (s2>0){ l2.x1=T2.x; l2.y1=T2.y; } else { l2.x2=T2.x; l2.y2=T2.y; }
  entities.push({id:nextId(), type:'arc', cx:C.x, cy:C.y, r:filletRadius,
                 a0: ccw?normAng(g1):normAng(g2), a1: ccw?normAng(g2):normAng(g1),
                 layer: l1.layer===l2.layer ? l1.layer : currentLayer});
  log(`Fillet created (r=${fmt(filletRadius)}).`, 'r');
  endCmd();
}

/* ---------- typed input during a command ---------- */
export function parsePoint(text){
  const t = text.trim();
  const base = rubberBase();
  let m;
  if ((m = t.match(/^@\s*(-?[\d.]+)\s*<\s*(-?[\d.]+)$/))){
    if (!base) return null;
    const d=parseFloat(m[1]), a=parseFloat(m[2])*Math.PI/180;
    return {x:base.x+d*Math.cos(a), y:base.y+d*Math.sin(a)};
  }
  if ((m = t.match(/^@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/))){
    if (!base) return null;
    return {x:base.x+parseFloat(m[1]), y:base.y+parseFloat(m[2])};
  }
  if ((m = t.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/)))
    return {x:parseFloat(m[1]), y:parseFloat(m[2])};
  if ((m = t.match(/^(-?[\d.]+)$/))){
    const d = parseFloat(m[1]);
    if (base){ // direct distance along cursor direction
      const L = dist(base, curPt);
      if (L < 1e-9) return null;
      return {x:base.x+(curPt.x-base.x)/L*d, y:base.y+(curPt.y-base.y)/L*d};
    }
    return null;
  }
  return null;
}

export function handleEnter(text){
  text = text.trim();
  // no command running → text is a command name (or repeat last)
  if (!cmd){
    if (!text){ if (lastCmdName) startCommand(lastCmdName); return; }
    startCommand(text); return;
  }
  const n = cmd.name;

  // --- special text-mode steps ---
  if (n==='TEXT' && cmd.step==='height'){
    const h = text ? parseFloat(text) : 2.5;
    if (!(h>0)){ log('Height must be a positive number.', 'e'); return; }
    cmd.h=h; cmd.step='string'; setPrompt('TEXT — Enter text:');
    return;
  }
  if (n==='TEXT' && cmd.step==='string'){
    if (!text){ cancelCmd(); return; }
    snapshot();
    entities.push({id:nextId(), type:'text', x:cmd.pt.x, y:cmd.pt.y, h:cmd.h, str:text, layer:currentLayer});
    endCmd(); return;
  }
  if (n==='ZOOM'){
    const c = text.toUpperCase();
    if (c==='E'||c==='A'||c==='') zoomExtents();
    else log('Zoom option not available — use E (extents).', 'e');
    endCmd(); return;
  }
  if (n==='OFFSET' && cmd.step==='dist'){
    const d = parseFloat(text);
    if (!(d>0)){ log('Enter a positive distance, e.g. 10', 'e'); return; }
    cmd.dist=d; cmd.step='pick';
    setPrompt('OFFSET — Select object to offset:');
    return;
  }
  if (n==='ROTATE' && cmd.step==='angle' && text){
    const a = parseFloat(text);
    if (isNaN(a)){ log('Enter an angle in degrees.', 'e'); return; }
    applyRotate(a*Math.PI/180); return;
  }
  if (n==='SCALE' && cmd.step==='factor'){
    if (!text) return;
    applyScale(parseFloat(text)); return;
  }
  if (n==='CIRCLE' && cmd.center && text){
    const r=parseFloat(text);
    if (isNaN(r)){ log('Enter a radius number or click.', 'e'); return; }
    makeCircle(r); return;
  }
  if (n==='PLINE' && (text.toUpperCase()==='A' || text.toUpperCase()==='ARC')){
    if (!cmd.pts.length){ log('Pick the first point, then switch to arcs.', 'e'); return; }
    cmd.plMode='arc'; cmd.arcMid=null;
    const t = plineEndTangent(cmd.pts);
    setPrompt(t ? 'PLINE arc — Specify arc end point [L = straight, C to close]:'
                : 'PLINE arc — Specify a point ON the arc:');
    draw(); return;
  }
  if (n==='PLINE' && (text.toUpperCase()==='L' || text.toUpperCase()==='LINE')){
    cmd.plMode='line'; cmd.arcMid=null;
    setPrompt('PLINE — Specify next point [A = arc, C to close, Enter to end]:');
    draw(); return;
  }
  if (n==='PLINE' && text.toUpperCase()==='C'){
    finishPline(true); return;
  }
  if (n==='UNITS' && cmd.step==='u'){
    if (!text){ endCmd(); return; }                      // Enter = keep current
    const u = text.toLowerCase();
    if (!['mm','cm','m'].includes(u)){ log('Enter mm, cm or m.', 'e'); return; }
    setUnits(u);
    log(`Units: 1 drawing unit = 1 ${u}.`, 'r');
    endCmd(); return;
  }
  if (n==='NEW' && cmd.step==='confirm'){
    if (text.toUpperCase()==='Y' || text.toUpperCase()==='YES'){
      setEntities([]); selection.clear();
      undoStack.length=0; redoStack.length=0;
      clearAutosave();
      log('New drawing.', 'r');
      endCmd(); return;
    }
    cancelCmd(); return;                                 // anything else = keep working
  }
  if (n==='CHLAYER' && cmd.step==='layer'){
    const name = text || currentLayer;
    if (!layers.some(l=>l.name===name)){
      log(`No layer "${name}". Layers: ${layers.map(l=>l.name).join(', ')}`, 'e'); return;
    }
    snapshot();
    let moved=0;
    for (const e of entities) if (selection.has(e.id)){ e.layer=name; moved++; }
    log(`Moved ${moved} object${moved>1?'s':''} to layer "${name}".`, 'r');
    endCmd(); return;
  }
  if (n==='EDITTEXT' && cmd.step==='string'){
    if (!text){ cancelCmd(); return; }                   // empty = keep the old text
    snapshot();
    cmd.target.str = text;
    log('Text updated.', 'r');
    endCmd(); return;
  }
  if (n==='DIMTXT' && cmd.step==='h'){
    if (!text){ endCmd(); return; }                     // Enter = keep current
    const t = text.toUpperCase();
    let v;
    if (t==='A' || t==='AUTO') v = 0;
    else { v = parseFloat(text); if (isNaN(v) || v<0){ log('Enter a height number, or A for automatic.', 'e'); return; } }
    dimTextHeight = v;
    const dims = [...selection].map(id=>entities.find(z=>z.id===id)).filter(z=>z && z.type==='dim');
    if (dims.length){
      snapshot();
      dims.forEach(d=>{ if (v>0) d.h=v; else delete d.h; });
      log(`Updated ${dims.length} selected dimension${dims.length>1?'s':''}.`, 'r');
    }
    log(v>0 ? `Dimension text height: ${fmt(v)}.` : 'Dimension text height: automatic.', 'r');
    endCmd(); return;
  }
  if (n==='MIRROR' && cmd.step==='erase'){
    const c = text.toUpperCase();
    if (c==='Y' || c==='YES') doMirror(true);
    else if (c==='' || c==='N' || c==='NO') doMirror(false);
    else log('Enter Y or N.', 'e');
    return;
  }
  if (n==='FILLET' && cmd.step==='radius'){
    if (text){
      const r = parseFloat(text);
      if (isNaN(r) || r<0){ log('Enter a radius ≥ 0 (0 = sharp corner).', 'e'); return; }
      filletRadius = r;
    }
    cmd.step='first';
    setPrompt(`FILLET (r=${fmt(filletRadius)}) — Select first line:`);
    return;
  }

  // --- empty Enter: confirm / finish ---
  if (!text){
    if (cmd.step==='select'){ afterSelect(); return; }
    if (n==='PLINE'){ finishPline(false); return; }
    if (n==='PAN'){ endCmd(); return; }
    if (n==='LINE' || n==='OFFSET' || n==='TRIM' || n==='EXTEND' || n==='HATCH' || n==='AREA' || (n==='COPY'&&cmd.step==='dest')){
      if (n==='TRIM' || n==='EXTEND') selection.clear();   // edge highlights are command-internal
      endCmd(); return;
    }
    cancelCmd(); return;
  }

  // --- typed coordinates ---
  const p = parsePoint(text);
  if (p){ onPoint(p); draw(); return; }
  log(`Can't interpret "${text}" here.`, 'e');
}
function finishPline(close){
  if (cmd.pts.length<2){ cancelCmd(); return; }
  snapshot();
  entities.push({id:nextId(), type:'pline', closed:!!close && cmd.pts.length>2, pts:cmd.pts, layer:currentLayer});
  endCmd();
}

/* ---------- in-place text editing (double-click) ---------- */
export function startEditText(e){
  cancelCmd(true);
  setCmd({name:'EDITTEXT', step:'string', target:e, pts:[], sel:[]});
  cmdInput.value = e.str;                                // edit in place
  setPrompt('TEXT — Edit text (Enter to apply, Esc to keep):');
  log(`Editing text: "${e.str}"`);
}

/* ---------- selection ---------- */
export function clickSelect(p, additive){
  const e = findEntityAt(p);
  if (!e){ if(!additive) selection.clear(); return; }
  if (selection.has(e.id) && additive) selection.delete(e.id);
  else selection.add(e.id);
}
export function boxSelect(r, crossing){
  const w0 = s2w(Math.min(r.x0,r.x1), Math.max(r.y0,r.y1));
  const w1 = s2w(Math.max(r.x0,r.x1), Math.min(r.y0,r.y1));
  const rect=[w0.x,w0.y,w1.x,w1.y];
  setSelRect(rect);                               // STRETCH uses the last box drawn
  for (const e of entities)
    if (layerVisible(e.layer) && layerUnlocked(e.layer) && entInWindow(e, rect, crossing)) selection.add(e.id);
}
