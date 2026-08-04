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


// the layer panel's filter box is an ordinary input and must be shielded too
const find = dom.els.get('layerFind');
document.activeElement = find;
const before = S.entities.length;
dom.fireWin('keydown', {key:'l'});
check('typing in the layer filter does not start a command',
      S.cmd===null && S.entities.length===before);
document.activeElement = null;


/* ===== browsers must not offer autofill on our text fields =====
   Safari offered a saved CREDIT CARD on the command line. Every attribute-level
   defence below was tried there first and ignored; the command line is now not
   a form field at all (suite 23c). The layer filter is still a real <input> —
   it needs .select() — so it keeps the attribute defences and the
   readonly-until-focus trick. The Rails editor injects this same markup, so
   guarding the HTML guards both. */
const html = await (await import('node:fs')).promises.readFile(
  new URL('../index.html', import.meta.url), 'utf8');
{
  const i = html.indexOf('id="layerFind"');
  const tag = html.slice(i, html.indexOf('>', i));
  check('layerFind: autocomplete off',        /autocomplete="off"/.test(tag));
  // Safari offers saved cards on type="text" however it is labelled; it does
  // not on type="search".
  check('layerFind: type=search, which Safari will not card-autofill', /type="search"/.test(tag));
  check('layerFind: named, and not like a payment field',
        /name="minicad-/.test(tag) && !/card|number|cc-|tel|email/i.test(tag));
  check('layerFind: password managers told to skip it',
        /data-1p-ignore/.test(tag) && /data-lpignore="true"/.test(tag));
  check('layerFind: no autocorrect or autocapitalise',
        /autocorrect="off"/.test(tag) && /autocapitalize="off"/.test(tag));
  check('layerFind: ships readonly so Safari skips it on focus',
        find.getAttribute('readonly') !== null);
}

/* ===== ⌘Z, not just Ctrl-Z =====
   This is a Mac-first tool. Undo was bound to ctrlKey alone, so the shortcut
   every Mac user reaches for first did nothing at all. */
document.activeElement = null;
S.setEntities([]); S.undoStack.length = 0; S.redoStack.length = 0;
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('10,0'); C.handleEnter('');
check('a line to undo', S.entities.length === 1);

dom.fireWin('keydown', { key: 'z', metaKey: true });
check('⌘Z undoes', S.entities.length === 0);

dom.fireWin('keydown', { key: 'z', metaKey: true, shiftKey: true });
check('⌘⇧Z redoes', S.entities.length === 1);

dom.fireWin('keydown', { key: 'z', ctrlKey: true });
check('Ctrl-Z still undoes', S.entities.length === 0);

dom.fireWin('keydown', { key: 'Z', metaKey: true, shiftKey: true });
check('the shortcut is case-insensitive — shift makes it a capital Z',
      S.entities.length === 1);

// and a foreign field keeps its own undo stack
document.activeElement = foreign;
dom.fireWin('keydown', { key: 'z', metaKey: true });
check('⌘Z inside someone else\'s input is left to the browser', S.entities.length === 1);
document.activeElement = null;

finish();
