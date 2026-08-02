/* =========================================================
   MiniCAD — spatial index over entity bounding boxes

   Hit-testing and snapping used to walk every entity on every mouse move.
   That is fine for the fifty objects you draw by hand and hopeless for the
   22,177 that arrive in a real house plan: measured on that drawing,
   findEntityAt cost 14 ms, snapCandidates 33 ms (building a 171,557-element
   array and throwing it away), entBBox over everything 59 ms — a mouse move
   spending ~100 ms before anything is drawn.

   A uniform grid fixes it. Cells hold entity indices; a query returns only
   the neighbourhood. Entities far larger than a cell go in an `oversized`
   list that every query includes, so one site boundary can't smear itself
   across thousands of cells.

   STALENESS IS SAFE BY DESIGN. The index is rebuilt when the geometry epoch
   changes (state.bumpGeom, called from setEntities/snapshot). Between bumps —
   during a live drag — an entity may have moved out of the cell it was
   indexed in. Extra candidates are harmless (callers do exact maths on them),
   and the only entities that can be *missed* are the ones being edited, so
   every query unions in the current selection.
   ========================================================= */
import { entities, geomEpoch, selection } from './state.js';
import { entBBox } from './entities.js';

let epoch = -1;        // geomEpoch the current index was built from
let arr = null;        // the entity array it was built from (identity check)
let boxes = [];        // bbox per entity index — also the entBBox cache
let cells = new Map(); // "ix,iy" → [entity index, …]
let oversized = [];    // entities too big to bucket
let ox = 0, oy = 0, cell = 1;

const key = (ix, iy) => ix + ',' + iy;

function build(){
  boxes = new Array(entities.length);
  cells = new Map();
  oversized = [];
  if (!entities.length){ epoch = geomEpoch; arr = entities; return; }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, span = 0;
  for (let i = 0; i < entities.length; i++){
    const b = entBBox(entities[i]);
    boxes[i] = b;
    if (!b.every(Number.isFinite)) continue;
    if (b[0] < x0) x0 = b[0];
    if (b[1] < y0) y0 = b[1];
    if (b[2] > x1) x1 = b[2];
    if (b[3] > y1) y1 = b[3];
    span += (b[2]-b[0]) + (b[3]-b[1]);
  }
  if (!Number.isFinite(x0)){ epoch = geomEpoch; arr = entities; return; }

  // aim at a cell a little larger than the average object, and at a grid no
  // finer than ~800×800 so the map itself stays cheap
  const avg = span / (2 * entities.length) || 1;
  const w = Math.max(x1-x0, 1e-9), h = Math.max(y1-y0, 1e-9);
  cell = Math.max(avg * 2, Math.max(w, h) / 800) || 1;
  ox = x0; oy = y0;

  const MAX_CELLS = 64;                       // per entity, before it counts as oversized
  for (let i = 0; i < entities.length; i++){
    const b = boxes[i];
    if (!b.every(Number.isFinite)){ oversized.push(i); continue; }
    const ax = Math.floor((b[0]-ox)/cell), bx = Math.floor((b[2]-ox)/cell);
    const ay = Math.floor((b[1]-oy)/cell), by = Math.floor((b[3]-oy)/cell);
    if ((bx-ax+1) * (by-ay+1) > MAX_CELLS){ oversized.push(i); continue; }
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++){
      const k = key(x,y);
      const c = cells.get(k);
      if (c) c.push(i); else cells.set(k, [i]);
    }
  }
  epoch = geomEpoch;
  arr = entities;
}

function fresh(){
  if (epoch !== geomEpoch || arr !== entities || boxes.length !== entities.length) build();
}

/* Cached bbox for entity index i (the index owns the cache). */
export function bboxAt(i){
  fresh();
  return boxes[i] || entBBox(entities[i]);
}

/* Entities whose bbox may overlap [x0,y0,x1,y1]. Superset — callers refine. */
export function query(x0, y0, x1, y1){
  fresh();
  const out = [];
  const seen = new Set();
  // cell membership is coarse; the cached bbox makes it exact for four
  // comparisons, which turned 833 candidates into a handful on a real drawing
  const take = i => {
    if (seen.has(i)) return;
    seen.add(i);
    const b = boxes[i];
    if (b && (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1)) return;
    out.push(entities[i]);
  };
  const takeAnyway = i => { if (!seen.has(i)){ seen.add(i); out.push(entities[i]); } };

  if (cells.size){
    const ax = Math.floor((x0-ox)/cell), bx = Math.floor((x1-ox)/cell);
    const ay = Math.floor((y0-oy)/cell), by = Math.floor((y1-oy)/cell);
    // a wild query (whole-drawing rect) is cheaper served by a linear scan
    if ((bx-ax+1) * (by-ay+1) > 4096) { for (let i=0;i<entities.length;i++) take(i); return out; }
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++){
      const c = cells.get(key(x,y));
      if (c) for (const i of c) take(i);
    }
  } else {
    for (let i = 0; i < entities.length; i++) take(i);
    return out;
  }
  for (const i of oversized) take(i);
  // being edited right now: it may have moved since the last rebuild and its
  // cached bbox is the stale one, so take it without the overlap test
  if (selection.size)
    for (let i = 0; i < entities.length; i++) if (selection.has(entities[i].id)) takeAnyway(i);
  return out;
}

/* Entities whose bbox contains p, grown by tol. */
export const queryPoint = (p, tol = 0) =>
  query(p.x - tol, p.y - tol, p.x + tol, p.y + tol);
