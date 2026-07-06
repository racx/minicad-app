/* =========================================================
   MiniCAD — OSNAP dialog wiring (per-mode snap configuration)
   The AutoCAD "Drafting Settings > Object Snap" analog: typed
   OSNAP/OS opens it; F3 stays the master on/off toggle.
   ========================================================= */
import { T } from './state.js';
import { SNAP_ACTIVE, SNAP_FLAGS, setSnapActive, setSnapTracking,
         registerOsnapDialog, setTog } from './commands.js';

const $ = id => document.getElementById(id);
const dlg = $('osnapDlg');

// [checkbox id suffix, snap kind] — one row per implemented mode (osMode_<kind>)
export const OSNAP_MODES = ['end','mid','cen','quad','int','perp','tan','xint','nea'];

function syncBoxes(){
  for (const k of OSNAP_MODES) $(`osMode_${k}`).checked = SNAP_ACTIVE.has(k);
  $('osMaster').checked = !!T.osnap;
  $('osTrack').checked  = !!SNAP_FLAGS.tracking;
}

export function openOsnap(){ syncBoxes(); dlg.style.display = 'block'; }
export function closeOsnap(){ dlg.style.display = 'none'; }

function applyBoxes(){
  setSnapActive(OSNAP_MODES.filter(k => $(`osMode_${k}`).checked));
}

/* wiring */
for (const k of OSNAP_MODES) $(`osMode_${k}`).addEventListener('change', applyBoxes);
$('osMaster').addEventListener('change', ()=>{ if (!!T.osnap !== !!$('osMaster').checked) setTog('osnap'); });
$('osTrack').addEventListener('change', ()=>setSnapTracking(!!$('osTrack').checked));
$('osAll').addEventListener('click', ()=>{ setSnapActive(OSNAP_MODES); syncBoxes(); });
$('osNone').addEventListener('click', ()=>{ setSnapActive([]); syncBoxes(); });
$('osClose').addEventListener('click', closeOsnap);

registerOsnapDialog(openOsnap);
