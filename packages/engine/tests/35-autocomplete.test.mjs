/* Command autocomplete: suggestCommands (core) and the keyboard wiring —
   ↑/↓ choose, Tab completes, Enter runs the highlighted suggestion. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

const cmdInput = document.getElementById('cmdInput');
const key = (k, ev={}) => cmdInput.listeners.keydown.forEach(fn=>fn({preventDefault(){}, key:k, ...ev}));
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);cmdInput.value='';S.setSugSel(0);};

/* ===== suggestCommands: pure ranking ===== */
let s = C.suggestCommands('PL');
check('exact alias ranks first', s[0].alias==='PL' && s[0].name==='PLINE');
check('longer matches follow', s.some(r=>r.name==='PLOT'));
check('one row per command (PLINE not repeated for PL + PLINE)',
      s.filter(r=>r.name==='PLINE').length===1);
s = C.suggestCommands('pl');
check('case-insensitive', s[0] && s[0].name==='PLINE');
s = C.suggestCommands('REC');
check('REC suggests RECTANG', s[0].alias==='REC' && s[0].name==='RECTANG');
s = C.suggestCommands('PRIN');
check('secondary aliases match too (PRINT → PLOT)', s.length===1 && s[0].alias==='PRINT' && s[0].name==='PLOT');
check('empty text: no suggestions', C.suggestCommands('').length===0);
check('coordinates never suggest', C.suggestCommands('100,50').length===0 && C.suggestCommands('12').length===0);
check('at most 8 rows', C.suggestCommands('P').length<=8 && C.suggestCommands('P').length>1);
check('P exact = PAN first', C.suggestCommands('P')[0].name==='PAN');
check('? suggests HELP', C.suggestCommands('?')[0].name==='HELP');

/* ===== Enter runs the highlighted suggestion (idle) ===== */
reset();
cmdInput.value = 'PLI';                          // no exact alias — top suggestion is PLINE
key('Enter');
check('PLI + Enter starts PLINE, not an error', S.cmd && S.cmd.name==='PLINE');
C.cancelCmd(true);

/* ===== ArrowDown moves the highlight; Enter runs the chosen row ===== */
reset();
cmdInput.value = 'DI';
const rows = C.suggestCommands('DI');
check('DI rows: DIST exact first, DIM second', rows[0].name==='DIST' && rows[1].alias==='DIM');
key('ArrowDown');
check('ArrowDown advances the highlight', S.sugSel===1);
key('ArrowUp');
check('ArrowUp returns', S.sugSel===0);
key('ArrowDown');
key('Enter');
check('Enter runs the highlighted row', S.cmd && S.cmd.name==='DIM');
C.cancelCmd(true);

/* ===== Tab completes into the field without running ===== */
reset();
cmdInput.value = 'RE';
key('Tab');
check('Tab completes the alias', cmdInput.value==='REC' && S.cmd===null);
cmdInput.value = '';

/* ===== suggestions never hijack input during a command ===== */
reset();
C.startCommand('PL');
C.handleEnter('0,0'); C.handleEnter('50,0'); C.handleEnter('50,50');
cmdInput.value = 'C';
key('Enter');                                    // C during PLINE = close, not CIRCLE
const e = S.entities[S.entities.length-1];
check('typed C inside PLINE still closes it', S.cmd===null && e && e.type==='pline' && e.closed===true);

/* ===== typed-anywhere keys reset the highlight ===== */
reset();
cmdInput.value='PL'; S.setSugSel(1);
dom.fireWin('keydown', { key:'i' });             // board-level typing lands in the command line
check('typing resets the highlight to the top row', S.sugSel===0 && cmdInput.value.toUpperCase().endsWith('PLI'));

finish();
