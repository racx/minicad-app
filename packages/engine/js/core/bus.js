/* =========================================================
   MiniCAD core — UI sink (the only door from core to the outside)
   Core modules never touch the DOM. They report through this sink;
   adapters (js/ui.js, js/view.js, js/io.js …) register the real
   implementations at import time via connectUI(). Headless use
   (tests, node embedding) works with the silent defaults.
   ========================================================= */
export const sink = {
  log: () => {},           // (text, cls) — command history line
  setPrompt: () => {},     // (text) — the active prompt
  changed: () => {},       // state changed — adapter should redraw
  zoomExtents: () => {},   // fit-view request (ZOOM E, open, restore…)
  toggled: () => {},       // (key, on) — toggle chip sync (grid/snap/ortho/osnap/dyn)
  toggleHelp: () => {},    // (force?) — help panel
  editText: () => {},      // (str) — seed the command input for in-place text editing
  clearAutosave: () => {}, // NEW command wipes the crash-net copy
  layersChanged: () => {}, // layer list/props changed — adapter refreshes the layer widget
  prefsChanged: () => {},  // editor preferences (osnap config, toggles) changed — hosts may persist
};

/* prefs.js mutes emission while it APPLIES preferences, so a host pushing
   saved settings into the engine doesn't get them echoed straight back. */
export const prefsGate = { muted: false };
export function emitPrefs(){ if (!prefsGate.muted) sink.prefsChanged(); }

export function connectUI(impl){ Object.assign(sink, impl); }
