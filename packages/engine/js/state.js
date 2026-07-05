/* =========================================================
   MiniCAD — shared document & runtime state
   Exported `let` bindings are live: importers always see the
   current value.  Anything reassigned from another module
   goes through a set*() helper below.
   ========================================================= */

/* ---------- document state ---------- */
export let entities = [];
export function setEntities(a){ entities = a; }

let idSeq = 1;
export function nextId(){ return idSeq++; }
export function getIdSeq(){ return idSeq; }
export function setIdSeq(n){ idSeq = n; }

export let layers = [
  {name:'0',     color:'#e8e8e8'},
  {name:'walls', color:'#4db8ff'},
  {name:'furniture', color:'#f2b950'},
  {name:'annot', color:'#ef7b7b'},
];
export function setLayers(a){ layers = a; }
export let currentLayer = '0';
export function setCurrentLayer(n){ currentLayer = n; }
export function layerOf(name){ return layers.find(l=>l.name===name) || layers[0]; }
export function layerVisible(name){ return !layerOf(name).off; }
export function layerUnlocked(name){ return !layerOf(name).locked; }

export const undoStack = [], redoStack = [];
export function snapshot(){
  undoStack.push(JSON.stringify(entities));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}

/* ---------- view ---------- */
export const view = { scale: 4, ox: 0, oy: 0 };  // screen = world*scale + o  (y flipped)

/* ---------- toggles ---------- */
export const T = { grid:true, snap:false, ortho:true, osnap:true };

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
export let boxSel = null;            // {x0,y0,x1,y1} screen coords
export function setBoxSel(b){ boxSel = b; }
export let hoverSel = false;         // cursor is over a selected (draggable) entity
export function setHoverSel(v){ hoverSel = v; }
export let hotGrip = null;           // {id, g} — grip currently being dragged
export function setHotGrip(h){ hotGrip = h; }
export let selRect = null;           // world rect [x0,y0,x1,y1] of the last selection box (for STRETCH)
export function setSelRect(r){ selRect = r; }
