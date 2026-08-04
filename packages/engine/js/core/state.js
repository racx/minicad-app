/* =========================================================
   MiniCAD — shared document & runtime state
   Exported `let` bindings are live: importers always see the
   current value.  Anything reassigned from another module
   goes through a set*() helper below.
   ========================================================= */

/* ---------- document state ---------- */
export let entities = [];
export function setEntities(a){ entities = a; bumpGeom(); }

/* Bumped whenever geometry changes shape or membership. The spatial index
   watches this to know when to rebuild — see spatial.js for why a little
   staleness between bumps is safe. */
export let geomEpoch = 0;
export function bumpGeom(){ geomEpoch++; }

let idSeq = 1;
export function nextId(){ return idSeq++; }
export function getIdSeq(){ return idSeq; }
export function setIdSeq(n){ idSeq = n; }

/* ---------- block definitions ----------
   name → {base:{x,y}, ents:[…]}. The entities are stored in the block's own
   coordinates (base point at the origin is NOT assumed — base is subtracted
   when an insert is expanded), with local ids that mean nothing outside the
   definition. Like layers, definitions live beside the undo stack rather than
   inside it: undo takes back the insert you placed, not the block you taught
   the drawing. */
export let blocks = {};
export function setBlocks(b){ blocks = b || {}; bumpGeom(); }
export function blockDef(name){ return blocks[name] || null; }
export function defineBlock(name, def){ blocks[name] = def; bumpGeom(); }

export let layers = [
  {name:'0',     color:'#e8e8e8'},
  {name:'walls', color:'#4db8ff'},
  {name:'furniture', color:'#f2b950'},
  {name:'annot', color:'#ef7b7b'},
];
export function setLayers(a){ layers = a; }

/* A layer may carry `lw` — its lineweight in real millimetres, as the author
   set it in CAD. Absent means "default", which is what MiniCAD always drew.
   Screen and paper interpret it differently: on paper it IS millimetres, on
   screen it is a fixed pixel ramp (like AutoCAD's LWDISPLAY) so heavy walls
   stay heavy at every zoom instead of ballooning. */
export const LW_DEFAULT_MM = 0.25;
export function lwOf(name){
  const v = layerOf(name).lw;
  return (typeof v === 'number' && v > 0) ? v : LW_DEFAULT_MM;
}
// mm → screen px, clamped so nothing vanishes or turns into a slab
export const lwPx = mm => Math.max(1, Math.min(6, mm / LW_DEFAULT_MM));
export let currentLayer = '0';
export function setCurrentLayer(n){ currentLayer = n; }
export function layerOf(name){ return layers.find(l=>l.name===name) || layers[0]; }
export function layerVisible(name){ return !layerOf(name).off; }
export function layerUnlocked(name){ return !layerOf(name).locked; }

export const undoStack = [], redoStack = [];
export function snapshot(){
  bumpGeom();                       // a user action is about to change geometry
  undoStack.push(JSON.stringify(entities));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}

/* ---------- units ---------- */
import { formatLen } from './geometry.js';
export let units = 'cm';                 // what 1 drawing unit means: mm | cm | m
export function setUnits(u){ units = u; }
export function unitFmt(v){ return formatLen(v, units); }

/* ---------- view ---------- */
export const view = { scale: 4, ox: 0, oy: 0 };  // screen = world*scale + o  (y flipped)

/* ---------- toggles ---------- */
export const T = { grid:true, snap:false, ortho:true, osnap:true, dyn:true };

/* ---------- runtime ---------- */
export let cmd = null;               // active command state machine
export function setCmd(c){ cmd = c; }
export let lastCmdName = null;
export function setLastCmdName(n){ lastCmdName = n; }
export const selection = new Set();  // entity ids
export const mouse = { sx:0, sy:0, inside:false };
export let curPt = {x:0, y:0};       // cursor point after snaps/ortho
export function setCurPt(p){ curPt = p; }
export let snapMark = null;          // {p, kind}
export function setSnapMark(m){ snapMark = m; }
export let trackGuides = null;       // [{from,to}] — alignment-tracking guide lines
export function setTrackGuides(g){ trackGuides = g; }
export let boxSel = null;            // {x0,y0,x1,y1} screen coords
export function setBoxSel(b){ boxSel = b; }
export let hoverSel = false;         // cursor is over a selected (draggable) entity
export function setHoverSel(v){ hoverSel = v; }
export let hotGrip = null;           // {id, g} — grip currently being dragged
export function setHotGrip(h){ hotGrip = h; }
export let selRect = null;           // world rect [x0,y0,x1,y1] of the last selection box (for STRETCH)
export function setSelRect(r){ selRect = r; }
export let plotWin = null;           // world rect [x0,y0,x1,y1] of the print window (session-remembered)
export function setPlotWin(r){ plotWin = r; }
