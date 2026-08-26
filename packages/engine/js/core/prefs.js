/* =========================================================
   MiniCAD — editor preferences as a host-facing bundle.

   The engine keeps its own per-browser fallbacks (osnap config
   in localStorage, toggles as boot defaults); this module lets
   a HOST — the SaaS shell — read the whole personalization set,
   apply a server-stored copy over it, and hear about changes
   (sink.prefsChanged) so the settings can follow the user
   across devices. AutoCAD keeps these in the user profile;
   this is that profile's door.
   ========================================================= */
import { T } from './state.js';
import { SNAP_ACTIVE, SNAP_FLAGS, setSnapActive, setSnapTracking } from './commands.js';
import { sink, prefsGate } from './bus.js';

export function getEditorPrefs(){
  return {
    osnap: { modes: [...SNAP_ACTIVE], tracking: SNAP_FLAGS.tracking },
    toggles: { ...T },
  };
}

/* Apply a stored bundle. Tolerant of partial/garbage input (an old or
   hand-edited record must never break boot): unknown keys are ignored,
   wrong types skipped. Emission is muted — applying saved preferences
   is not a change worth saving again. */
export function applyEditorPrefs(p){
  if (!p || typeof p !== 'object') return;
  prefsGate.muted = true;
  try{
    if (p.osnap && typeof p.osnap === 'object'){
      if (Array.isArray(p.osnap.modes)) setSnapActive(p.osnap.modes);
      if (typeof p.osnap.tracking === 'boolean') setSnapTracking(p.osnap.tracking);
    }
    if (p.toggles && typeof p.toggles === 'object'){
      for (const k of Object.keys(T)){
        const v = p.toggles[k];
        if (typeof v === 'boolean' && T[k] !== v){
          T[k] = v;
          sink.toggled(k, v);           // keep the chip row honest
        }
      }
    }
  } finally {
    prefsGate.muted = false;
  }
  sink.changed();
}
