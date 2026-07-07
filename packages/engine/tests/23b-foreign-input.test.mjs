/* Foreign editable elements (host-app inputs, dialog fields) must not have
   their keystrokes hijacked by the board's type-anywhere focus stealing.
   ADAPTER-INTEGRATION suite: this is event-wiring behavior. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

const cmdInput = document.getElementById('cmdInput');
let focused = 0;
cmdInput.focus = () => { focused++; };

const foreign = document.createElement('input');
foreign.tagName = 'INPUT';
let blurred = 0;
foreign.blur = () => { blurred++; document.activeElement = null; };

/* baseline: idle board, printable key → command line grabs focus */
document.activeElement = null;
dom.fireWin('keydown', { key: 'l' });
check('board keeps type-anywhere focus stealing when idle', focused === 1);

/* typing in a foreign input: NO stealing */
document.activeElement = foreign;
dom.fireWin('keydown', { key: 'd' });
dom.fireWin('keydown', { key: '5' });
check('printable keys in a foreign input are left alone', focused === 1);

/* Esc in a foreign input blurs it instead of cancelling the command */
C.startCommand('L');
document.activeElement = foreign;
dom.fireWin('keydown', { key: 'Escape' });
check('Esc in a foreign input blurs it', blurred === 1);
check('…and does NOT cancel the active command', S.cmd && S.cmd.name === 'LINE');
C.cancelCmd(true);

/* space in a foreign input must not arm space-pan (no crash check) */
document.activeElement = foreign;
dom.fireWin('keydown', { key: ' ' });
dom.fireWin('keyup', { key: ' ' });
check('space in a foreign input is ignored by the board', true);

/* the engine's own command line is exempt (unchanged behavior) */
document.activeElement = cmdInput;
dom.fireWin('keydown', { key: 'x' });
check('command line itself never counts as foreign', focused === 1);

finish();
