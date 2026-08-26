/* Editor preferences through the package face: getEditorPrefs/applyEditorPrefs
   bundle the osnap config + toggle row for a host to persist (the SaaS shell
   stores them per user); sink.prefsChanged fires on changes, muted during apply. */
import { setupDOM, check, finish } from './stub-dom.mjs';
setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const F = await import('../js/core/index.js');

const face = F.createEngine();
check('face exposes the prefs pair',
      typeof face.getEditorPrefs==='function' && typeof face.applyEditorPrefs==='function');

/* ===== shape ===== */
let p = F.getEditorPrefs();
check('bundle carries osnap modes + tracking', Array.isArray(p.osnap.modes) &&
      p.osnap.modes.includes('end') && typeof p.osnap.tracking==='boolean');
check('bundle carries every toggle', ['grid','snap','ortho','osnap','dyn']
      .every(k=>typeof p.toggles[k]==='boolean'));

/* ===== change notification ===== */
let fired = 0;
F.connectUI({ prefsChanged: ()=>fired++ });
C.setTog('ortho');
check('toggling fires prefsChanged', fired===1 && S.T.ortho===true);
C.setSnapActive(['end','mid']);
C.setSnapTracking(false);
check('osnap config changes fire too', fired===3);

/* ===== apply: server copy wins, silently ===== */
fired = 0;
F.applyEditorPrefs({ osnap:{ modes:['end','cen'], tracking:true },
                     toggles:{ ortho:false, grid:false, dyn:true } });
check('apply sets the osnap modes', C.SNAP_ACTIVE.size===2 &&
      C.SNAP_ACTIVE.has('end') && C.SNAP_ACTIVE.has('cen'));
check('apply sets tracking + toggles', C.SNAP_FLAGS.tracking===true &&
      S.T.ortho===false && S.T.grid===false && S.T.dyn===true);
check('apply never echoes prefsChanged back', fired===0);

/* round trip: what apply set is what get returns */
p = F.getEditorPrefs();
check('get reflects the applied bundle', p.osnap.modes.length===2 &&
      p.osnap.tracking===true && p.toggles.grid===false);

/* ===== garbage tolerance: a bad stored record must never break boot ===== */
F.applyEditorPrefs(null);
F.applyEditorPrefs('nonsense');
F.applyEditorPrefs({ osnap:{ modes:'end' }, toggles:{ ortho:'yes', bogus:true } });
p = F.getEditorPrefs();
check('garbage ignored, state intact', p.osnap.modes.length===2 && p.toggles.ortho===false &&
      !('bogus' in S.T));
check('unknown snap kinds filtered on apply', (()=>{
  F.applyEditorPrefs({ osnap:{ modes:['end','tan','teleport'] } });
  return C.SNAP_ACTIVE.size===2 && !C.SNAP_ACTIVE.has('teleport');
})());

/* after apply, a real user change speaks again */
fired = 0;
C.setTog('ortho');
check('changes after an apply still notify', fired===1);

finish();
