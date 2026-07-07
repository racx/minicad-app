/* =========================================================
   @minicad/engine/dom — the DOM adapter entry.
   Import AFTER the engine markup (index.html's #app) is in the
   document: importing boots the engine and wires every event,
   dialog and the canvas renderer.
   ========================================================= */
import './main.js';                                   // boot + wiring (side-effectful)

export { log, refreshLayers } from './ui.js';
export { draw, zoomExtents, ctx } from './view.js';
export { restoreAutosave, clearAutosave } from './io.js';
export { w2s, s2w } from '../../core/viewport.js';    // overlay convenience
