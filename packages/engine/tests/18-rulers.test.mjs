/* Edge rulers: inert click zone, exported width, render doesn't throw. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const V = await import('../js/adapters/dom/view.js');

S.T.osnap=false; S.T.ortho=false;

check('RULER_PX exported', V.RULER_PX===22);

/* clicks on the ruler strips do nothing */
C.startCommand('L');
dom.fire('mousemove', {clientX:10, clientY:300});      // over the left ruler
dom.fire('mousedown', {button:0, clientX:10, clientY:300});
check('press on left ruler ignored (no first point)', S.cmd && !S.cmd.base);
dom.fire('mousemove', {clientX:300, clientY:10});      // over the top ruler
dom.fire('mousedown', {button:0, clientX:300, clientY:10});
check('press on top ruler ignored', S.cmd && !S.cmd.base);
dom.fire('mousemove', {clientX:300, clientY:300});     // real canvas
dom.fire('mousedown', {button:0, clientX:300, clientY:300});
check('press on canvas still works', S.cmd && S.cmd.base!==null);
C.cancelCmd();

/* idle: ruler press neither selects nor starts a box */
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('');
dom.fire('mousemove', {clientX:10, clientY:10});
dom.fire('mousedown', {button:0, clientX:10, clientY:10});
check('idle ruler press starts no box', S.boxSel===null);
dom.fireWin('mouseup', {button:0});

/* PAN drag may start anywhere, including over a ruler */
C.startCommand('P');
dom.fire('mousemove', {clientX:10, clientY:300});
dom.fire('mousedown', {button:0, clientX:10, clientY:300});
const ox0=S.view.ox;
dom.fire('mousemove', {clientX:60, clientY:300});
check('PAN drag works from the ruler strip', near(S.view.ox, ox0+50));
dom.fireWin('mouseup', {button:0});
C.handleEnter('');

/* draw() with rulers renders without throwing across units */
for (const u of ['mm','cm','m']){ S.setUnits(u); V.draw(); }
S.setUnits('cm');
check('draw() with rulers is unit-safe', true);

finish();
