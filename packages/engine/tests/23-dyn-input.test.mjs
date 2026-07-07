/* Dynamic input (DYN / F12): toggle plumbing + tooltip render path. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const V = await import('../js/adapters/dom/view.js');

check('DYN on by default', S.T.dyn === true);

C.startCommand('DYN');
check('typed DYN toggles off', S.T.dyn === false);
C.startCommand('DYN');
check('…and back on', S.T.dyn === true);

dom.fireWin('keydown', { key:'F12' });
check('F12 toggles', S.T.dyn === false);
dom.fireWin('keydown', { key:'F12' });
check('F12 again restores', S.T.dyn === true);

const chip = dom.els.get('tDyn');
check('DYN chip is wired', !!chip.listeners.click);
chip.listeners.click.forEach(fn=>fn({}));
check('chip click toggles', S.T.dyn === false);
chip.listeners.click.forEach(fn=>fn({}));

/* render path: a command + typed text must not blow up headless */
S.mouse.inside = true; S.mouse.sx = 200; S.mouse.sy = 150;
C.startCommand('L');
document.getElementById('cmdInput').value = '100,50';
let ok = true;
try { V.draw(); } catch(e){ ok = false; }
check('draw() with DYN tooltip and typed text is clean', ok);
document.getElementById('cmdInput').value = '';
C.cancelCmd(true);

/* typing triggers a live redraw */
check('cmdInput input listener registered for live mirror', !!document.getElementById('cmdInput').listeners.input);

finish();
