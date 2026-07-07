/* OSNAP dialog: per-mode configuration, persistence, tracking toggle. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const O = await import('../js/adapters/dom/osnapui.js');

S.T.osnap=true; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};
const $ = id => document.getElementById(id);
const fireChange = id => $(id).listeners.change?.forEach(fn=>fn({}));
const fireClick  = id => $(id).listeners.click?.forEach(fn=>fn({}));

/* ===== disabling a mode reroutes the winner ===== */
reset();
add(0,0,4,0);                                       // tiny line: end (4,0) and mid (2,0) both in tol
let p = C.applyModifiers({x:2.6, y:0.5});
check('baseline: END outranks closer MID', S.snapMark && S.snapMark.k==='end' && near(p.x,4));
C.setSnapActive(['mid','cen','quad','int','perp','tan','xint']);   // end off
p = C.applyModifiers({x:2.6, y:0.5});
check('END off: MID wins the same hover', S.snapMark && S.snapMark.k==='mid' && near(p.x,2)&&near(p.y,0));
C.setSnapActive(C.SNAP_DEFAULTS);

/* ===== all off = raw cursor even on top of geometry ===== */
C.setSnapActive([]);
p = C.applyModifiers({x:4.1, y:0.2});
check('all modes off: nothing snaps', S.snapMark===null && near(p.x,4.1)&&near(p.y,0.2));
C.setSnapActive(C.SNAP_DEFAULTS);

/* ===== persistence roundtrip ===== */
C.setSnapActive(['end','mid','nea']);
C.setSnapTracking(false);
let stored = JSON.parse(localStorage.getItem('minicad.osnap'));
check('setSnapActive persists modes', stored && stored.modes.length===3 && stored.modes.includes('nea'));
check('setSnapTracking persists flag', stored===null ? false : (JSON.parse(localStorage.getItem('minicad.osnap')).tracking===false));
C.SNAP_ACTIVE.clear(); C.SNAP_ACTIVE.add('end'); C.SNAP_FLAGS.tracking=true;   // scramble runtime state
C.loadSnapConfig();                                                            // reload from storage
check('loadSnapConfig restores modes+tracking',
      C.SNAP_ACTIVE.size===3 && C.SNAP_ACTIVE.has('nea') && C.SNAP_FLAGS.tracking===false);
localStorage.setItem('minicad.osnap', '{broken json');
C.loadSnapConfig();
check('bad JSON leaves config untouched', C.SNAP_ACTIVE.size===3);
localStorage.removeItem('minicad.osnap');
C.setSnapActive(C.SNAP_DEFAULTS); C.setSnapTracking(true);

/* ===== unknown kinds are ignored on load ===== */
localStorage.setItem('minicad.osnap', JSON.stringify({modes:['end','bogus','par'], tracking:true}));
C.loadSnapConfig();
check('unknown modes filtered out', C.SNAP_ACTIVE.size===1 && C.SNAP_ACTIVE.has('end'));
localStorage.removeItem('minicad.osnap');
C.setSnapActive(C.SNAP_DEFAULTS);

/* ===== tracking toggle gates alignment guides ===== */
reset();
add(0,0,100,0);
C.startCommand('L');
C.handleEnter('50,50');                              // base, so cmd is live
p = C.applyModifiers({x:99.7, y:30});                // vertically aligned with endpoint (100,0)
check('tracking on: alignment guide fires', S.snapMark && S.snapMark.k==='trk' && near(p.x,100));
C.setSnapTracking(false);
p = C.applyModifiers({x:99.7, y:30});
check('tracking off: no guide, raw point', (!S.snapMark || S.snapMark.k!=='trk') && near(p.x,99.7));
C.setSnapTracking(true);
C.cancelCmd(true);

/* ===== typed OSNAP / OS opens the dialog ===== */
$('osnapDlg').style.display='none';
C.startCommand('OSNAP');
check('OSNAP opens the picker', $('osnapDlg').style.display==='block');
fireClick('osClose');
check('Close hides it', $('osnapDlg').style.display==='none');
C.startCommand('OS');
check('OS alias opens it too', $('osnapDlg').style.display==='block');

/* ===== dialog wiring drives the config ===== */
C.startCommand('OSNAP');                             // sync boxes to defaults
check('boxes mirror active set (end on, nea off)', $('osMode_end').checked===true && $('osMode_nea').checked===false);
$('osMode_end').checked=false;
fireChange('osMode_end');
check('unticking a box deactivates the mode', !C.SNAP_ACTIVE.has('end'));
fireClick('osAll');
check('All on activates every mode incl nearest', C.SNAP_ACTIVE.size===9 && C.SNAP_ACTIVE.has('nea'));
fireClick('osNone');
check('All off empties the set', C.SNAP_ACTIVE.size===0);
fireClick('osAll');

/* master checkbox flips T.osnap via setTog */
$('osMaster').checked = !S.T.osnap;
fireChange('osMaster');
check('master checkbox toggles osnap as a whole', S.T.osnap===$('osMaster').checked);
$('osMaster').checked = true; if (!S.T.osnap) fireChange('osMaster');

/* tracking checkbox */
$('osTrack').checked=false;
fireChange('osTrack');
check('tracking checkbox drives SNAP_FLAGS', C.SNAP_FLAGS.tracking===false);
$('osTrack').checked=true; fireChange('osTrack');

C.setSnapActive(C.SNAP_DEFAULTS);
finish();
