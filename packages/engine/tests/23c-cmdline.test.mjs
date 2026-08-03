/* The command line is a contenteditable div, not an <input>.
   Safari offers saved credit cards on a lone text field that takes "100,50",
   and no attribute stops it — autocomplete="off", a non-payment name, the
   password-manager opt-outs, type="search" and readonly-until-focus were all
   tried on a real machine and ignored. A contenteditable element is not a form
   field, so nothing offers to fill it. The whole engine still reads and writes
   `.value`, which is shimmed over textContent — this suite locks both halves:
   the markup must stay a non-field, and the shim must behave like an input.
   ADAPTER-INTEGRATION suite. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const UI = await import('../js/adapters/dom/ui.js');

const cmdInput = document.getElementById('cmdInput');

/* ===== 1. the markup: nothing a browser would try to autofill ===== */
const html = await (await import('node:fs')).promises.readFile(
  new URL('../index.html', import.meta.url), 'utf8');
const i = html.indexOf('id="cmdInput"');
const tagStart = html.lastIndexOf('<', i);
const tag = html.slice(tagStart, html.indexOf('>', i) + 1);

check('command line is NOT an <input> — the whole point', !/^<input/i.test(tag));
check('command line is a div', /^<div/i.test(tag));
check('contenteditable, plaintext only (no pasted markup, no rich text)',
      /contenteditable="plaintext-only"/.test(tag));
check('exposed to assistive tech as a textbox',
      /role="textbox"/.test(tag) && /aria-label="Command input"/.test(tag));
check('no name/type/autocomplete — there is no form field to describe',
      !/\bname=/.test(tag) && !/\btype=/.test(tag) && !/autocomplete=/.test(tag));
check('no autocorrect or autocapitalise on a command line',
      /autocorrect="off"/.test(tag) && /autocapitalize="off"/.test(tag) &&
      /spellcheck="false"/.test(tag));
// an editable div with no content collapses to zero height and the command row
// jumps every time you clear it
check('CSS gives the empty field a line box', /#cmdInput\{[^}]*min-height:/.test(html));
check('…and keeps it to one non-wrapping line', /#cmdInput\{[^}]*white-space:pre/.test(html));

/* ===== 2. the shim: .value behaves like an input's ===== */
cmdInput.textContent = 'REC';
check('value reads textContent', cmdInput.value === 'REC');
cmdInput.value = 'CIRCLE';
check('value writes textContent', cmdInput.textContent === 'CIRCLE');
cmdInput.value = '';
check('cleared to empty string, not "undefined"', cmdInput.value === '' && cmdInput.textContent === '');
cmdInput.value = null;
check('null clears rather than writing "null"', cmdInput.value === '');
cmdInput.value = 100;
check('a number is stringified, as an input would', cmdInput.value === '100');
cmdInput.value = '';

// view.js reaches for the element by id rather than importing it; the shim
// lives on the element, so that path must see it too
check('getElementById(...).value works — view.js reads the field that way',
      document.getElementById('cmdInput').value === '');

// asTextField must survive an element that has no defineProperty target
check('asTextField tolerates a missing element', UI.asTextField(null) === null);
check('caretToEnd is a no-op without a Selection (test stubs, jsdom-less hosts)',
      (()=>{ try { UI.caretToEnd(cmdInput); return true; } catch { return false; } })());

/* ===== 3. end to end: typing into the div still drives commands ===== */
const key = (k, ev={}) => cmdInput.listeners.keydown.forEach(fn=>fn({preventDefault(){}, key:k, ...ev}));

cmdInput.value = 'L';
key('Enter');
check('Enter runs the typed command from the div', S.cmd && S.cmd.name === 'LINE');
check('…and the field is cleared afterwards', cmdInput.value === '' && cmdInput.textContent === '');

cmdInput.value = '0,0';
key('Enter');
cmdInput.value = '10,0';
key(' ');                                    // space = Enter outside a TEXT string
check('typed coordinates land through the div', S.entities.length === 1);
C.cancelCmd(true);

/* TEXT's string step keeps spaces — the div must not swallow them either */
C.startCommand('T');
C.onPoint({x:0, y:0});
cmdInput.value = '2.5';
key('Enter');
cmdInput.value = 'living room';
key(' ');
check('space inside a TEXT string types a space, not Enter', cmdInput.value === 'living room');
key('Enter');
const txt = S.entities.find(e=>e.type==='text');
check('…and the whole string is committed', txt && txt.str === 'living room');

/* ===== 4. type-anywhere still reaches the field ===== */
document.activeElement = null;
cmdInput.value = '';
dom.fireWin('keydown', { key:'r' });
dom.fireWin('keydown', { key:'e' });
dom.fireWin('keydown', { key:'c' });
check('a character typed on the board is replayed into the field, in order',
      cmdInput.value === 'rec');
cmdInput.value = '';
dom.fireWin('keydown', { key:' ' });
check('space on the board arms the pan instead of typing a space', cmdInput.value === '');

/* ===== 5. paste: a command line is one line ===== */
const paste = txtIn => cmdInput.listeners.paste.forEach(fn=>fn({
  preventDefault(){}, clipboardData: { getData: ()=>txtIn },
}));
cmdInput.value = '';
paste('100,50\n200,75\n');
check('a multi-line paste is flattened to one line',
      cmdInput.value === '100,50 200,75 ' && !cmdInput.value.includes('\n'));
cmdInput.value = '';

finish();
