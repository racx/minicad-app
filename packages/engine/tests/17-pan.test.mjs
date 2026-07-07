/* PAN hand tool: left-drag pans the view, Enter/Esc exits, drawing untouched. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

S.T.osnap=false; S.T.ortho=false;
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('');

/* enter pan mode via the P alias */
C.startCommand('P');
check('P starts PAN mode', S.cmd && S.cmd.name==='PAN');
check('prompt explains the hand', dom.promptEl.textContent.includes('drag to move the view'));

/* left-drag pans instead of drawing/selecting */
const ox0=S.view.ox, oy0=S.view.oy, nEnts=S.entities.length;
dom.fire('mousemove', {clientX:400, clientY:300});
dom.fire('mousedown', {button:0, clientX:400, clientY:300});
check('press does not start a selection box', S.boxSel===null);
dom.fire('mousemove', {clientX:480, clientY:250});
check('drag moved the view', near(S.view.ox, ox0+80) && near(S.view.oy, oy0-50));
dom.fireWin('mouseup', {button:0});
dom.fire('mousedown', {button:0, clientX:480, clientY:250});   // second drag in same session
dom.fire('mousemove', {clientX:500, clientY:250});
dom.fireWin('mouseup', {button:0});
check('pan mode persists across drags', S.cmd && S.cmd.name==='PAN' && near(S.view.ox, ox0+100));
check('no entities created or moved', S.entities.length===nEnts && near(S.entities[0].x1,0));

/* hand cursor while in pan mode, crosshair cursor restored after */
dom.fire('mousemove', {clientX:500, clientY:250});   // hover (button up) refreshes the cursor
check('hand cursor active', dom.els.get('cv').style.cursor==='grab');

/* Enter exits */
C.handleEnter('');
check('Enter exits PAN', S.cmd===null);
dom.fire('mousemove', {clientX:500, clientY:250});
check('cursor back to custom crosshair', dom.els.get('cv').style.cursor==='none');

/* Esc exits too */
C.startCommand('PAN');
dom.fireWin('keydown', {key:'Escape'});
check('Esc exits PAN', S.cmd===null);

/* ✋ toolbar button toggles the mode */
const btn = dom.els.get('btnPan');
const click = ()=>btn.listeners.click?.forEach(fn=>fn({preventDefault(){}}));
click();
check('✋ click enters PAN', S.cmd && S.cmd.name==='PAN');
click();
check('✋ click again exits PAN', S.cmd===null);
click(); C.startCommand('L');
check('starting another command leaves PAN cleanly', S.cmd && S.cmd.name==='LINE');
C.cancelCmd();

finish();
